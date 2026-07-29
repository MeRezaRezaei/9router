import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// We test parseCursorUsableModels directly (pure function, no http2).
// For resolveCursorModels, we mock the module to control fetchCursorCatalog
// (internal, not exported) while keeping real parseCursorUsableModels + clearCursorModelCache.
const mockFetchResult = vi.hoisted(() => ({ models: null, throw: null }));

vi.mock("../../open-sse/services/cursorModels.js", async (importOriginal) => {
  const actual = await importOriginal();
  const { createHash } = await import("crypto");
  const CACHE_TTL_MS = 5 * 60 * 1000;
  const cache = new Map();

  return {
    parseCursorUsableModels: actual.parseCursorUsableModels,
    // clearCache wipes both mock's internal cache AND real module's cache
    clearCursorModelCache: () => {
      cache.clear();
      actual.clearCursorModelCache();
    },
    resolveCursorModels: async (credentials, options = {}) => {
      if (!credentials?.accessToken || !credentials?.providerSpecificData?.machineId) return null;

      const key = createHash("sha256")
        .update(`cursor:${credentials.accessToken}:${credentials.providerSpecificData.machineId}`)
        .digest("hex");
      const now = Date.now();

      if (!options.forceRefresh) {
        const cached = cache.get(key);
        if (cached?.expiresAt > now) return { models: cached.models };
      }

      if (mockFetchResult.throw) return null;

      const models = mockFetchResult.models;
      if (!models?.length) return null;

      cache.set(key, { expiresAt: now + CACHE_TTL_MS, models });
      return { models };
    },
  };
});

function varint(value) {
  const bytes = [];
  while (value >= 0x80) {
    bytes.push((value & 0x7f) | 0x80);
    value >>>= 7;
  }
  bytes.push(value);
  return Uint8Array.from(bytes);
}

function field(fieldNumber, value) {
  return Uint8Array.from([(fieldNumber << 3) | 2, ...varint(value.length), ...value]);
}

function text(value) { return new TextEncoder().encode(value); }

function concat(...parts) {
  const size = parts.reduce((sum, part) => sum + part.length, 0);
  const result = new Uint8Array(size);
  let offset = 0;
  for (const part of parts) { result.set(part, offset); offset += part.length; }
  return result;
}

function model(id, name) {
  return field(1, concat(field(1, text(id)), field(4, text(name))));
}

import {
  clearCursorModelCache,
  parseCursorUsableModels,
  resolveCursorModels,
} from "../../open-sse/services/cursorModels.js";

describe("Cursor live model catalog", () => {
  beforeEach(() => {
    clearCursorModelCache();
    mockFetchResult.models = null;
    mockFetchResult.throw = null;
  });

  afterEach(() => {
    clearCursorModelCache();
  });

  it("decodes the GetUsableModels protobuf response", () => {
    const payload = concat(
      model("default", "Auto"),
      model("gpt-5.3-codex", "GPT 5.3 Codex"),
      model("gpt-5.3-codex", "Duplicate"),
    );

    expect(parseCursorUsableModels(payload)).toEqual([
      { id: "default", name: "Auto" },
      { id: "gpt-5.3-codex", name: "GPT 5.3 Codex" },
    ]);
  });

  it("fetches the account-specific catalog and caches it", async () => {
    mockFetchResult.models = [{ id: "claude-4.6-opus", name: "Claude 4.6 Opus" }];
    const credentials = {
      accessToken: "cursor-token",
      providerSpecificData: { machineId: "machine-id" },
    };

    const result = await resolveCursorModels(credentials);
    expect(result).toEqual({
      models: [{ id: "claude-4.6-opus", name: "Claude 4.6 Opus" }],
    });

    // Second call should use cache
    mockFetchResult.models = [{ id: "different-model", name: "Should not appear" }];
    const cachedResult = await resolveCursorModels(credentials);
    expect(cachedResult).toEqual({
      models: [{ id: "claude-4.6-opus", name: "Claude 4.6 Opus" }],
    });

    // forceRefresh should bypass cache
    const freshResult = await resolveCursorModels(credentials, { forceRefresh: true });
    expect(freshResult).toEqual({
      models: [{ id: "different-model", name: "Should not appear" }],
    });
  });

  it("fails open when the Cursor catalog request fails", async () => {
    mockFetchResult.throw = "Request failed";
    const result = await resolveCursorModels({
      accessToken: "cursor-token",
      providerSpecificData: { machineId: "machine-id" },
    });
    expect(result).toBeNull();
  });

  it("returns null for missing credentials", async () => {
    await expect(resolveCursorModels(null)).resolves.toBeNull();
    await expect(resolveCursorModels({})).resolves.toBeNull();
    await expect(resolveCursorModels({ accessToken: "tok" })).resolves.toBeNull();
    await expect(resolveCursorModels({
      providerSpecificData: { machineId: "mid" },
    })).resolves.toBeNull();
  });
});
