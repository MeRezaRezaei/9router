// Behavior tests for small repos: combos, aliases, pricing, nodes, disabledModels, proxyPools.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";

const originalDataDir = process.env.DATA_DIR;
let tempDir;

beforeAll(async () => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "9router-repos-"));
  process.env.DATA_DIR = tempDir;
  vi.resetModules();
  const db = await import("@/lib/db/index.js");
  await db.initDb();
});

afterAll(() => {
  if (tempDir) fs.rmSync(tempDir, { recursive: true, force: true });
  if (originalDataDir === undefined) delete process.env.DATA_DIR;
  else process.env.DATA_DIR = originalDataDir;
});

describe("combosRepo", () => {
  let combosRepo;
  beforeAll(async () => {
    combosRepo = await import("@/lib/db/repos/combosRepo.js");
  });

  it("create → getByName/getById roundtrip with models array", async () => {
    const c = await combosRepo.createCombo({ name: "c-fast", kind: "model", models: ["openai/gpt-4o", "anthropic/claude"] });
    expect(c.models).toEqual(["openai/gpt-4o", "anthropic/claude"]);
    expect((await combosRepo.getComboByName("c-fast")).models).toEqual(c.models);
    expect((await combosRepo.getComboById(c.id)).id).toBe(c.id);
  });

  it("update merges fields, bumps updatedAt; delete removes", async () => {
    const c = await combosRepo.createCombo({ name: "c-del", models: ["a"] });
    const up = await combosRepo.updateCombo(c.id, { models: ["a", "b"], kind: "combo" });
    expect(up.models).toEqual(["a", "b"]);
    expect(up.kind).toBe("combo");
    expect(up.updatedAt >= c.updatedAt).toBe(true);
    expect(await combosRepo.deleteCombo(c.id)).toBe(true);
    expect(await combosRepo.getComboById(c.id)).toBeNull();
    expect(await combosRepo.deleteCombo(c.id)).toBe(false);
  });
});

describe("aliasRepo", () => {
  let aliasRepo;
  beforeAll(async () => {
    aliasRepo = await import("@/lib/db/repos/aliasRepo.js");
  });

  it("model aliases set/get/delete", async () => {
    await aliasRepo.setModelAlias("fast", "gpt-4o");
    expect(await aliasRepo.getModelAliases()).toEqual({ fast: "gpt-4o" });
    await aliasRepo.deleteModelAlias("fast");
    expect(await aliasRepo.getModelAliases()).toEqual({});
  });

  it("addCustomModel dedups (atomic); delete removes; getCustomModels lists", async () => {
    const m = { providerAlias: "openai", id: "gpt-4o", name: "GPT-4o" };
    expect(await aliasRepo.addCustomModel(m)).toBe(true);
    expect(await aliasRepo.addCustomModel(m)).toBe(false);
    expect(await aliasRepo.addCustomModel({ providerAlias: "openai", id: "gpt-4o", type: "embedding" })).toBe(true);
    const list = await aliasRepo.getCustomModels();
    expect(list).toHaveLength(2);
    await aliasRepo.deleteCustomModel({ providerAlias: "openai", id: "gpt-4o" });
    expect(await aliasRepo.getCustomModels()).toHaveLength(1);
  });

  it("mitm aliases: empty default, set/get all", async () => {
    expect(await aliasRepo.getMitmAlias("nope")).toEqual({});
    await aliasRepo.setMitmAliasAll("web_search", { action: "run" });
    expect(await aliasRepo.getMitmAlias("web_search")).toEqual({ action: "run" });
    expect(Object.keys(await aliasRepo.getMitmAlias())).toContain("web_search");
  });
});

describe("pricingRepo", () => {
  let pricingRepo;
  beforeAll(async () => {
    pricingRepo = await import("@/lib/db/repos/pricingRepo.js");
  });

  it("updatePricing merges user overrides into defaults; cache invalidated", async () => {
    await pricingRepo.updatePricing({ openai: { "gpt-4o": { input: 5, output: 15 } } });
    const p = await pricingRepo.getPricing();
    expect(p.openai["gpt-4o"]).toMatchObject({ input: 5, output: 15 });
    const before = await pricingRepo.getPricing();
    await pricingRepo.updatePricing({ openai: { "gpt-4o": { input: 6 } } });
    const after = await pricingRepo.getPricing();
    expect(after.openai["gpt-4o"].input).toBe(6);
    // per-model replace, not deep merge — output dropped
    expect(after.openai["gpt-4o"].output).toBeUndefined();
  });

  it("resetPricing: single model then whole provider; resetAllPricing", async () => {
    await pricingRepo.updatePricing({ openai: { a: { input: 1 }, b: { input: 2 } } });
    await pricingRepo.resetPricing("openai", "a");
    const after = await pricingRepo.getPricing();
    expect(after.openai.a).toBeUndefined();
    expect(after.openai.b).toEqual({ input: 2 });
    await pricingRepo.resetPricing("openai");
    expect((await pricingRepo.getPricing()).openai).toBeUndefined();
    await pricingRepo.updatePricing({ anthropic: { x: { input: 1 } } });
    await pricingRepo.resetAllPricing();
    const cleared = await pricingRepo.getPricing();
    expect(cleared.openai).toBeUndefined();
    expect(cleared.anthropic).toBeUndefined();
  });

  it("getPricingForModel: user override wins, else constant lookup", async () => {
    await pricingRepo.updatePricing({ openai: { "gpt-4o": { input: 5 } } });
    expect((await pricingRepo.getPricingForModel("openai", "gpt-4o")).input).toBe(5);
    expect(await pricingRepo.getPricingForModel("openai", "no-such-model")).toBeNull();
  });
});

describe("nodesRepo", () => {
  let nodesRepo;
  beforeAll(async () => {
    nodesRepo = await import("@/lib/db/repos/nodesRepo.js");
  });

  it("create → getById (extra fields), update merge, filter by type", async () => {
    const n = await nodesRepo.createProviderNode({ type: "relay", name: "relay-1", baseUrl: "http://r" });
    expect((await nodesRepo.getProviderNodeById(n.id)).baseUrl).toBe("http://r");
    const up = await nodesRepo.updateProviderNode(n.id, { baseUrl: "http://r2", prefix: "p" });
    expect(up.baseUrl).toBe("http://r2");
    expect(up.prefix).toBe("p");
    expect((await nodesRepo.getProviderNodes({ type: "relay" })).length).toBeGreaterThan(0);
    expect((await nodesRepo.getProviderNodes({ type: "other" }))).toEqual([]);
  });

  it("delete returns removed node; missing → null", async () => {
    const n = await nodesRepo.createProviderNode({ type: "relay", name: "gone" });
    expect((await nodesRepo.deleteProviderNode(n.id)).id).toBe(n.id);
    expect(await nodesRepo.deleteProviderNode(n.id)).toBeNull();
  });
});

describe("disabledModelsRepo", () => {
  let dm;
  beforeAll(async () => {
    dm = await import("@/lib/db/repos/disabledModelsRepo.js");
  });

  it("disable dedups; enable partial + full remove; per-provider read", async () => {
    await dm.disableModels("openai", ["a", "b"]);
    await dm.disableModels("openai", ["b", "c"]);
    expect(await dm.getDisabledByProvider("openai")).toEqual(["a", "b", "c"]);
    await dm.enableModels("openai", ["b"]);
    expect(await dm.getDisabledByProvider("openai")).toEqual(["a", "c"]);
    await dm.enableModels("openai", []);
    expect(await dm.getDisabledByProvider("openai")).toEqual([]);
    await dm.disableModels("openai", ["x"]);
    await dm.disableModels("anthropic", ["y"]);
    const all = await dm.getDisabledModels();
    expect(all.openai).toEqual(["x"]);
    expect(all.anthropic).toEqual(["y"]);
  });
});

describe("proxyPoolsRepo", () => {
  let pp;
  beforeAll(async () => {
    pp = await import("@/lib/db/repos/proxyPoolsRepo.js");
  });

  it("create/update/delete; isActive coercion; filter + updatedAt sort", async () => {
    const p = await pp.createProxyPool({ name: "pool-1", proxyUrl: "http://p", isActive: false });
    expect(p.isActive).toBe(false);
    expect((await pp.getProxyPoolById(p.id)).isActive).toBe(false);
    const up = await pp.updateProxyPool(p.id, { isActive: true, strictProxy: true });
    expect(up.isActive).toBe(true);
    expect(up.strictProxy).toBe(true);
    const p2 = await pp.createProxyPool({ name: "pool-2", isActive: true });
    await pp.updateProxyPool(p.id, { testStatus: "ok" });
    const active = await pp.getProxyPools({ isActive: true });
    expect(active.every((x) => x.isActive === true)).toBe(true);
    expect(active[0].id).toBe(p.id);
    expect((await pp.getProxyPools({ testStatus: "ok" }))[0].id).toBe(p.id);
    expect((await pp.deleteProxyPool(p2.id)).id).toBe(p2.id);
    expect(await pp.getProxyPoolById(p2.id)).toBeNull();
  });
});
