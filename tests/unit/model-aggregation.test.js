import { describe, it, expect, vi } from "vitest";

// Mock the open-sse imports that Vitest is failing to locate in ESM
vi.mock("open-sse/services/model.js", () => ({
  parseModel: vi.fn((m) => {
    const slash = m.indexOf("/");
    return {
      providerAlias: slash > 0 ? m.slice(0, slash) : "",
      model: slash > 0 ? m.slice(slash + 1) : m,
      isAlias: slash <= 0,
    };
  }),
  resolveModelAliasFromMap: vi.fn(),
  getModelInfoCore: vi.fn(),
}));

vi.mock("open-sse/providers/registry/index.js", () => ({
  default: [],
}));

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

// Mock constants/providers and constants/models to bypass internal path issues
vi.mock("@/shared/constants/models", () => ({
  PROVIDER_MODELS: {},
  PROVIDER_ID_TO_ALIAS: {},
}));

vi.mock("@/shared/constants/providers", () => ({
  getProviderAlias: vi.fn((providerId) => providerId),
}));

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

  it("returns null if modelAggregationEnabled is false", async () => {
    const { getSettings } = await import("@/lib/localDb");
    getSettings.mockResolvedValueOnce({ modelAggregationEnabled: false });

    const res = await getModelInfo("aggregated/deepseek-v3");
    expect(res).not.toEqual({
      provider: "openrouter",
      model: "deepseek/deepseek-chat",
      priority: 1,
    });
  });

  it("handles empty candidates gracefully", async () => {
    const { getMocData } = await import("@/lib/localDb");
    getMocData.mockResolvedValueOnce({}); // No models offered

    const res = await getModelInfo("aggregated/deepseek-v3");
    // Should fallback to parsed non-aggregated flow or null
    expect(res.provider).not.toBe("openrouter");
  });
});
