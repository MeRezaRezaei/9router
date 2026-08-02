import { describe, it, expect } from "vitest";
import {
  isXaiModel,
  normalizeProviderId,
  normalizeProviderSpecificData,
} from "@/lib/providerNormalization";

describe("providerNormalization", () => {
  it("isXaiModel: matches grok-*/Grok_* patterns only", () => {
    expect(isXaiModel("grok-2")).toBe(true);
    expect(isXaiModel("Grok_2-mini")).toBe(true);
    expect(isXaiModel(" grok-beta ")).toBe(true);
    expect(isXaiModel("grokfast")).toBe(false);
    expect(isXaiModel("gpt-4o")).toBe(false);
    expect(isXaiModel(null)).toBe(false);
    expect(isXaiModel(123)).toBe(false);
  });

  it("normalizeProviderId: identity for known ids, slugifies variants, matches display name", () => {
    expect(normalizeProviderId("openai")).toBe("openai");
    expect(normalizeProviderId("OpenAI")).toBe("openai");
    expect(normalizeProviderId("OpenRouter")).toBe("openrouter");
    expect(normalizeProviderId("  OpenRouter  ")).toBe("openrouter");
    // unknown stays as trimmed original
    expect(normalizeProviderId("my-custom")).toBe("my-custom");
    // non-strings pass through
    expect(normalizeProviderId(null)).toBeNull();
    expect(normalizeProviderId(undefined)).toBeUndefined();
  });

  it("normalizeProviderSpecificData: ollama-local picks baseUrl variants, returns null when empty", () => {
    expect(normalizeProviderSpecificData("ollama-local", { baseURL: "http://x:11434" }))
      .toEqual({ baseUrl: "http://x:11434" });
    expect(normalizeProviderSpecificData("ollama-local", {}, { baseUrl: "http://y" }))
      .toEqual({ baseUrl: "http://y" });
    expect(normalizeProviderSpecificData("ollama-local", { ollamaHostUrl: "http://z" }))
      .toEqual({ baseUrl: "http://z" });
    // non-ollama provider keeps its data untouched
    expect(normalizeProviderSpecificData("openai", { baseURL: "http://x" }, { custom: 1 }))
      .toEqual({ custom: 1 });
    // empty → null
    expect(normalizeProviderSpecificData("ollama-local", {})).toBeNull();
    expect(normalizeProviderSpecificData("openai", {}, null)).toBeNull();
  });
});
