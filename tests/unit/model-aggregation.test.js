import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/localDb", () => {
  return {
    getSettings: vi.fn(async () => ({
      modelAggregationEnabled: true,
      modelAggregationMap: {
        "deepseek-chat": "deepseek-v3",
      },
    })),
    getProviderConnections: vi.fn(async () => [
      { provider: "openrouter", priority: 1, isActive: true },
      { provider: "deepseek", priority: 2, isActive: true },
    ]),
    getMocData: vi.fn(async () => ({
      openrouter: {
        models: [{ id: "deepseek/deepseek-chat" }],
      },
      deepseek: {
        models: [{ id: "deepseek-chat" }],
      },
    })),
    getProviderNodes: vi.fn(async () => []),
    getComboByName: vi.fn(async () => null),
    getModelAliases: vi.fn(async () => ({})),
  };
});

import { getModelInfo } from "../../src/sse/services/model.js";

describe("Model aggregation", () => {
  it("resolves aggregated/deepseek-v3 to openrouter because priority 1", async () => {
    const res = await getModelInfo("aggregated/deepseek-v3");
    expect(res).toEqual({
      provider: "openrouter",
      model: "deepseek/deepseek-chat",
      priority: 1,
    });
  });
});
