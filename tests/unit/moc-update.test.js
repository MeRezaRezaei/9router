import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const originalDataDir = process.env.DATA_DIR;

describe("Dynamic MOC Update & Model Listing", () => {
  let tempDir;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "9router-moc-update-test-"));
    process.env.DATA_DIR = tempDir;
    vi.resetModules();
  });

  afterEach(() => {
    process.env.DATA_DIR = originalDataDir;
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  it("stores MOC data via setMocData and returns it via buildModelsList", async () => {
    const { setMocData, getMocData, createProviderConnection } = await import("@/lib/localDb.js");
    const { buildModelsList } = await import("@/app/api/v1/models/route.js");

    // Add active connection for openai so it enters active connection branch
    await createProviderConnection({
      provider: "openai",
      authType: "apikey",
      name: "OpenAI Test",
      apiKey: "sk-test",
    });

    const mockMoc = {
      provider: "openai",
      models: [
        { id: "gpt-mock-1", name: "GPT Mock 1", kind: "llm" },
        { id: "gpt-mock-2", name: "GPT Mock 2", kind: "llm" }
      ],
      capabilities: {
        "gpt-mock-1": { reasoning: true }
      }
    };

    await setMocData("openai", mockMoc);

    // Retrieve via getMocData
    const allMoc = await getMocData();
    expect(allMoc.openai).toBeDefined();
    expect(allMoc.openai.models[0].id).toBe("gpt-mock-1");

    // Build models list
    const list = await buildModelsList(["llm"]);
    
    // It should contain the overridden models
    const mock1 = list.find((m) => m.id === "openai/gpt-mock-1");
    const mock2 = list.find((m) => m.id === "openai/gpt-mock-2");
    expect(mock1).toBeDefined();
    expect(mock2).toBeDefined();
    expect(mock1.capabilities?.reasoning).toBe(true);

    // It should NOT contain any of the default static openai models (e.g. gpt-4o)
    const gpt4o = list.find((m) => m.id === "openai/gpt-4o");
    expect(gpt4o).toBeUndefined();
  });

  it("handles MOC drift reporting via /api/v1/moc/report", async () => {
    const { POST } = await import("@/app/api/v1/moc/report/route.js");
    const req = new Request("https://9router.local/api/v1/moc/report", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        provider: "openai",
        url: "https://api.openai.com/v1/chat/completions",
        error: "Unexpected property 'foo'",
        expected: { id: "string" },
        received: { id: "string", foo: "bar" }
      })
    });

    const response = await POST(req);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.ok).toBe(true);
    expect(body.message).toContain("AI agent will investigate");
  });
});
