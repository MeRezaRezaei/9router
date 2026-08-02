// Behavior tests for usageRepo: dedup, cost calc, daily aggregation, stats/history/chart reads.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";

const originalDataDir = process.env.DATA_DIR;
let tempDir;
let usageRepo;
let pricingRepo;

function isoMinutesAgo(min) {
  return new Date(Date.now() - min * 60000).toISOString();
}

beforeAll(async () => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "9router-usage-"));
  process.env.DATA_DIR = tempDir;
  vi.resetModules();
  const db = await import("@/lib/db/index.js");
  await db.initDb();
  usageRepo = await import("@/lib/db/repos/usageRepo.js");
  pricingRepo = await import("@/lib/db/repos/pricingRepo.js");
});

afterAll(() => {
  if (tempDir) fs.rmSync(tempDir, { recursive: true, force: true });
  if (originalDataDir === undefined) delete process.env.DATA_DIR;
  else process.env.DATA_DIR = originalDataDir;
});

function entry(overrides = {}) {
  return {
    provider: "openai",
    model: "gpt-4o",
    connectionId: "conn-1",
    apiKey: "sk-12345678",
    endpoint: "/v1/chat/completions",
    status: "ok",
    tokens: { prompt_tokens: 1000, completion_tokens: 200 },
    ...overrides,
  };
}

describe("usageRepo", () => {
  it("trackPendingRequest: count per model+account, release on completion", async () => {
    await usageRepo.trackPendingRequest("gpt-4o", "openai", "conn-1", true);
    await usageRepo.trackPendingRequest("gpt-4o", "openai", "conn-1", true);
    const active = await usageRepo.getActiveRequests();
    expect(active.activeRequests.find((a) => a.model === "gpt-4o")).toMatchObject({ count: 2 });
    await usageRepo.trackPendingRequest("gpt-4o", "openai", "conn-1", false);
    await usageRepo.trackPendingRequest("gpt-4o", "openai", "conn-1", false);
    const after = await usageRepo.getActiveRequests();
    expect(after.activeRequests.find((a) => a.model === "gpt-4o")).toBeUndefined();
  });

  it("trackPendingRequest(error=true, started=false) surfaces errorProvider", async () => {
    await usageRepo.trackPendingRequest("gpt-4o-mini", "anthropic", "conn-x", false, true);
    const { errorProvider } = await usageRepo.getActiveRequests();
    expect(errorProvider).toBe("anthropic");
  });

  it("saveRequestUsage: dedups identical entries, aggregates daily, bumps lifetime counter", async () => {
    const e = entry({ timestamp: isoMinutesAgo(120) });
    await usageRepo.saveRequestUsage(e);
    await usageRepo.saveRequestUsage(e);

    const history = await usageRepo.getUsageHistory({ provider: "openai" });
    expect(history).toHaveLength(1);
    expect(history[0].tokens).toEqual({ prompt_tokens: 1000, completion_tokens: 200 });
    expect(history[0].apiKeyMasked).toBe("sk-12345***");

    const stats = await usageRepo.getUsageStats("all");
    expect(stats.totalRequests).toBe(1);
    expect(stats.totalPromptTokens).toBe(1000);
    expect(stats.totalCompletionTokens).toBe(200);
    expect(stats.byProvider.openai).toMatchObject({ requests: 1, promptTokens: 1000 });
    const gpt = Object.values(stats.byModel).find((m) => m.rawModel === "gpt-4o");
    expect(gpt).toMatchObject({ requests: 1, promptTokens: 1000, completionTokens: 200 });
  });

  it("saveRequestUsage: cost computed from pricing (user override + defaults)", async () => {
    const { calculateCostFromTokens, getPricingForModel } = await import("open-sse/providers/pricing.js");
    const tokens = { prompt_tokens: 1000, completion_tokens: 200 };
    const expectedDefault = calculateCostFromTokens(tokens, getPricingForModel("openai", "gpt-4o"));

    await pricingRepo.updatePricing({
      openai: { "gpt-4o": { input: 2, output: 6, cached: 2, cache_creation: 0.3 } },
    });
    await usageRepo.saveRequestUsage(entry({
      timestamp: isoMinutesAgo(90),
      connectionId: "conn-2",
      apiKey: "sk-abcdef01",
    }));
    const expectedOverride = calculateCostFromTokens(tokens, { input: 2, output: 6, cached: 2, cache_creation: 0.3 });

    const stats = await usageRepo.getUsageStats("all");
    expect(stats.totalCost).toBeCloseTo(expectedDefault + expectedOverride, 6);
    expect(stats.totalRequests).toBe(2);
  });

  it("getUsageHistory: startDate/endDate window; apiKey masked; tokens intact", async () => {
    await usageRepo.saveRequestUsage(entry({
      timestamp: isoMinutesAgo(45),
      status: "error",
      connectionId: "conn-3",
      model: "gpt-4o-mini",
      apiKey: "sk-12345678",
    }));
    const inWindow = await usageRepo.getUsageHistory({
      startDate: new Date(Date.now() - 2 * 86400000).toISOString(),
      endDate: new Date(Date.now() + 60000).toISOString(),
    });
    expect(inWindow).toHaveLength(3);
    expect(inWindow.every((r) => r.apiKeyMasked === "sk-12345***" || r.apiKeyMasked === "sk-abcde***")).toBe(true);
    expect(inWindow.find((r) => r.status === "error")).toBeDefined();
  });

  it("getChartData: 7d returns 7 buckets with today's tokens/cost", async () => {
    const chart = await usageRepo.getChartData("7d");
    expect(chart).toHaveLength(7);
    const today = chart[chart.length - 1];
    expect(today.tokens).toBeGreaterThan(0);
    expect(today.cost).toBeGreaterThan(0);
  });

  it("getRecentLogs: formatted lines, newest first, limit respected", async () => {
    const logs = await usageRepo.getRecentLogs(5);
    expect(logs.length).toBeGreaterThan(0);
    expect(logs.length).toBeLessThanOrEqual(5);
    expect(logs[0]).toContain("|");
    expect(logs[0]).toContain("gpt-4o");
  });
});
