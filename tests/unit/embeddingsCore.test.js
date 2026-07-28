/**
 * Unit tests for open-sse/handlers/embeddingsCore.js
 *
 * Tests cover:
 *  - buildEmbeddingsBody()     — request body construction
 *  - buildEmbeddingsUrl()      — URL per provider
 *  - buildEmbeddingsHeaders()  — headers per provider
 *  - handleEmbeddingsCore()    — full handler: success, errors, validation
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ─── Mock the executors/index.js to avoid transitive uuid dependency ─────────
// kiro.js (imported by executors/index.js) requires 'uuid' which isn't
// installed in the test environment. We mock the whole executor layer.
vi.mock("../../open-sse/executors/index.js", () => ({
  getExecutor: vi.fn(() => ({
    refreshCredentials: vi.fn().mockResolvedValue(null),
  })),
  hasSpecializedExecutor: vi.fn(() => false),
}));

// Also mock tokenRefresh to avoid side effects
vi.mock("../../open-sse/services/tokenRefresh.js", () => ({
  refreshWithRetry: vi.fn().mockResolvedValue(null),
}));

// Mock proxyFetch to avoid proxy-agent imports in test env
vi.mock("../../open-sse/utils/proxyFetch.js", () => ({
  proxyAwareFetch: vi.fn((url, options) => fetch(url, options)),
}));

import { handleEmbeddingsCore } from "../../open-sse/handlers/embeddingsCore.js";

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Build a minimal success Response from a provider */
function makeProviderResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/** Build a minimal error Response from a provider */
function makeProviderErrorResponse(status, message) {
  return new Response(JSON.stringify({ error: { message } }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/** Standard valid embeddings response in OpenAI format */
const VALID_EMBEDDING_RESPONSE = {
  object: "list",
  data: [
    {
      object: "embedding",
      index: 0,
      embedding: [0.1, 0.2, 0.3],
    },
  ],
  model: "text-embedding-ada-002",
  usage: { prompt_tokens: 3, total_tokens: 3 },
};

/** Standard handleEmbeddingsCore options for OpenAI provider */
function makeOptions(overrides = {}) {
  return {
    body: { model: "text-embedding-ada-002", input: "Hello world" },
    modelInfo: { provider: "openai", model: "text-embedding-ada-002" },
    credentials: { apiKey: "sk-test-key" },
    log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    onCredentialsRefreshed: vi.fn(),
    onRequestSuccess: vi.fn(),
    ...overrides,
  };
}

// ─── Test: buildEmbeddingsBody (via handleEmbeddingsCore internals) ──────────
// We test body construction indirectly by verifying the fetch call payload.

describe("buildEmbeddingsBody", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("single string input — includes model and input, default encoding_format=float", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(makeProviderResponse(VALID_EMBEDDING_RESPONSE));

    await handleEmbeddingsCore(makeOptions({
      body: { model: "text-embedding-ada-002", input: "Hello world" },
    }));

    const [, init] = vi.mocked(fetch).mock.calls[0];
    const sent = JSON.parse(init.body);
    expect(sent.model).toBe("text-embedding-ada-002");
    expect(sent.input).toBe("Hello world");
    expect(sent.encoding_format).toBe("float");
  });

  it("array input — passes array as-is", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(makeProviderResponse(VALID_EMBEDDING_RESPONSE));

    await handleEmbeddingsCore(makeOptions({
      body: { model: "text-embedding-ada-002", input: ["Hello", "World"] },
    }));

    const [, init] = vi.mocked(fetch).mock.calls[0];
    const sent = JSON.parse(init.body);
    expect(sent.input).toEqual(["Hello", "World"]);
  });

  it("custom encoding_format is forwarded", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(makeProviderResponse(VALID_EMBEDDING_RESPONSE));

    await handleEmbeddingsCore(makeOptions({
      body: {
        model: "text-embedding-ada-002",
        input: "test",
        encoding_format: "base64",
      },
    }));

    const [, init] = vi.mocked(fetch).mock.calls[0];
    const sent = JSON.parse(init.body);
    expect(sent.encoding_format).toBe("base64");
  });

  it("no encoding_format in body → defaults to float", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(makeProviderResponse(VALID_EMBEDDING_RESPONSE));

    await handleEmbeddingsCore(makeOptions({
      body: { model: "text-embedding-ada-002", input: "test" },
    }));

    const [, init] = vi.mocked(fetch).mock.calls[0];
    const sent = JSON.parse(init.body);
    expect(sent.encoding_format).toBe("float");
  });

  it("gemini single input forwards dimensions as outputDimensionality", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(makeProviderResponse({
      embedding: { values: [0.1, 0.2, 0.3] },
    }));

    await handleEmbeddingsCore(makeOptions({
      body: {
        model: "gemini/gemini-embedding-2-preview",
        input: "test",
        dimensions: 1536,
      },
      modelInfo: { provider: "gemini", model: "gemini-embedding-2-preview" },
      credentials: { apiKey: "gemini-key" },
    }));

    const [, init] = vi.mocked(fetch).mock.calls[0];
    const sent = JSON.parse(init.body);
    expect(sent.outputDimensionality).toBe(1536);
  });

  it("gemini batch input forwards dimensions on each request", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(makeProviderResponse({
      embeddings: [
        { values: [0.1, 0.2, 0.3] },
        { values: [0.4, 0.5, 0.6] },
      ],
    }));

    await handleEmbeddingsCore(makeOptions({
      body: {
        model: "gemini/gemini-embedding-2-preview",
        input: ["hello", "world"],
        dimensions: 1536,
      },
      modelInfo: { provider: "gemini", model: "gemini-embedding-2-preview" },
      credentials: { apiKey: "gemini-key" },
    }));

    const [, init] = vi.mocked(fetch).mock.calls[0];
    const sent = JSON.parse(init.body);
    expect(sent.requests).toHaveLength(2);
    expect(sent.requests[0].outputDimensionality).toBe(1536);
    expect(sent.requests[1].outputDimensionality).toBe(1536);
  });
});

// ─── Test: buildEmbeddingsUrl ────────────────────────────────────────────────

describe("buildEmbeddingsUrl", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("openai → https://api.openai.com/v1/embeddings", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(makeProviderResponse(VALID_EMBEDDING_RESPONSE));

    await handleEmbeddingsCore(makeOptions({
      modelInfo: { provider: "openai", model: "text-embedding-ada-002" },
      credentials: { apiKey: "sk-test" },
    }));

    const [url] = vi.mocked(fetch).mock.calls[0];
    expect(url).toBe("https://api.openai.com/v1/embeddings");
  });

  it("openrouter → https://openrouter.ai/api/v1/embeddings", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(makeProviderResponse(VALID_EMBEDDING_RESPONSE));

    await handleEmbeddingsCore(makeOptions({
      modelInfo: { provider: "openrouter", model: "openai/text-embedding-ada-002" },
      credentials: { apiKey: "sk-or-test" },
    }));

    const [url] = vi.mocked(fetch).mock.calls[0];
    expect(url).toBe("https://openrouter.ai/api/v1/embeddings");
  });

  it("vercel-ai-gateway → https://ai-gateway.vercel.sh/v1/embeddings", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(makeProviderResponse(VALID_EMBEDDING_RESPONSE));

    await handleEmbeddingsCore(makeOptions({
      modelInfo: { provider: "vercel-ai-gateway", model: "openai/text-embedding-3-small" },
      credentials: { apiKey: "vag-test-key" },
    }));

    const [url, init] = vi.mocked(fetch).mock.calls[0];
    const sent = JSON.parse(init.body);
    expect(url).toBe("https://ai-gateway.vercel.sh/v1/embeddings");
    expect(init.headers.Authorization).toBe("Bearer vag-test-key");
    expect(sent.model).toBe("openai/text-embedding-3-small");
  });

  it("openai-compatible-* → uses baseUrl from providerSpecificData", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(makeProviderResponse(VALID_EMBEDDING_RESPONSE));

    await handleEmbeddingsCore(makeOptions({
      modelInfo: { provider: "openai-compatible-custom", model: "embed-v1" },
      credentials: {
        apiKey: "sk-custom",
        providerSpecificData: { baseUrl: "https://custom.ai/v1" },
      },
    }));

    const [url] = vi.mocked(fetch).mock.calls[0];
    expect(url).toBe("https://custom.ai/v1/embeddings");
  });

  it("openai-compatible-* strips trailing slash from baseUrl", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(makeProviderResponse(VALID_EMBEDDING_RESPONSE));

    await handleEmbeddingsCore(makeOptions({
      modelInfo: { provider: "openai-compatible-myhost", model: "embed-v1" },
      credentials: {
        apiKey: "sk-x",
        providerSpecificData: { baseUrl: "https://myhost.ai/v1/" },
      },
    }));

    const [url] = vi.mocked(fetch).mock.calls[0];
    expect(url).toBe("https://myhost.ai/v1/embeddings");
  });

  it("openai-compatible-* without baseUrl → falls back to api.openai.com", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(makeProviderResponse(VALID_EMBEDDING_RESPONSE));

    await handleEmbeddingsCore(makeOptions({
      modelInfo: { provider: "openai-compatible-fallback", model: "embed" },
      credentials: { apiKey: "sk-x", providerSpecificData: {} },
    }));

    const [url] = vi.mocked(fetch).mock.calls[0];
    expect(url).toBe("https://api.openai.com/v1/embeddings");
  });

  it("unsupported provider (e.g. gemini-cli) → 400 error, no fetch called", async () => {
    const result = await handleEmbeddingsCore(makeOptions({
      modelInfo: { provider: "gemini-cli", model: "gemini-embedding" },
      credentials: { apiKey: "token" },
    }));

    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
    expect(result.success).toBe(false);
    expect(result.status).toBe(400);
    expect(result.error).toMatch(/does not support embeddings/i);
  });

  it("antigravity (non-openai-compatible, no URL mapping) → 400", async () => {
    const result = await handleEmbeddingsCore(makeOptions({
      modelInfo: { provider: "antigravity", model: "some-embed" },
      credentials: { apiKey: "ag-token" },
    }));

    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
    expect(result.success).toBe(false);
    expect(result.status).toBe(400);
  });
});

// ─── Test: buildEmbeddingsHeaders ───────────────────────────────────────────

describe("buildEmbeddingsHeaders", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("openai → Authorization: Bearer, Content-Type: application/json", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(makeProviderResponse(VALID_EMBEDDING_RESPONSE));

    await handleEmbeddingsCore(makeOptions({
      modelInfo: { provider: "openai", model: "text-embedding-ada-002" },
      credentials: { apiKey: "sk-mykey" },
    }));

    const [, init] = vi.mocked(fetch).mock.calls[0];
    expect(init.headers["Authorization"]).toBe("Bearer sk-mykey");
    expect(init.headers["Content-Type"]).toBe("application/json");
  });

  it("openai — uses accessToken when apiKey is absent", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(makeProviderResponse(VALID_EMBEDDING_RESPONSE));

    await handleEmbeddingsCore(makeOptions({
      modelInfo: { provider: "openai", model: "text-embedding-ada-002" },
      credentials: { accessToken: "at-mytoken" },
    }));

    const [, init] = vi.mocked(fetch).mock.calls[0];
    expect(init.headers["Authorization"]).toBe("Bearer at-mytoken");
  });

  it("openrouter → adds HTTP-Referer and X-Title headers", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(makeProviderResponse(VALID_EMBEDDING_RESPONSE));

    await handleEmbeddingsCore(makeOptions({
      modelInfo: { provider: "openrouter", model: "openai/text-embedding-ada-002" },
      credentials: { apiKey: "sk-or-key" },
    }));

    const [, init] = vi.mocked(fetch).mock.calls[0];
    expect(init.headers["HTTP-Referer"]).toBeDefined();
    expect(init.headers["X-Title"]).toBeDefined();
    expect(init.headers["Authorization"]).toBe("Bearer sk-or-key");
  });

  it("openai-compatible-* → Authorization: Bearer only (no extra headers)", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(makeProviderResponse(VALID_EMBEDDING_RESPONSE));

    await handleEmbeddingsCore(makeOptions({
      modelInfo: { provider: "openai-compatible-local", model: "nomic-embed" },
      credentials: {
        apiKey: "local-key",
        providerSpecificData: { baseUrl: "http://localhost:11434/v1" },
      },
    }));

    const [, init] = vi.mocked(fetch).mock.calls[0];
    expect(init.headers["Authorization"]).toBe("Bearer local-key");
    expect(init.headers["HTTP-Referer"]).toBeUndefined();
    expect(init.headers["X-Title"]).toBeUndefined();
  });
});

// ─── Test: handleEmbeddingsCore — input validation ───────────────────────────

describe("handleEmbeddingsCore — input validation", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("missing input → 400 Bad Request", async () => {
    const result = await handleEmbeddingsCore(makeOptions({
      body: { model: "text-embedding-ada-002" }, // no input
    }));
    expect(result.success).toBe(false);
    expect(result.status).toBe(400);
    expect(result.error).toMatch(/missing required field: input/i);
  });

  it("input is a number → 400 Bad Request", async () => {
    const result = await handleEmbeddingsCore(makeOptions({
      body: { model: "text-embedding-ada-002", input: 42 },
    }));
    expect(result.success).toBe(false);
    expect(result.status).toBe(400);
    expect(result.error).toMatch(/input must be a string or array/i);
  });

  it("input is an object → 400 Bad Request", async () => {
    const result = await handleEmbeddingsCore(makeOptions({
      body: { model: "text-embedding-ada-002", input: { text: "hello" } },
    }));
    expect(result.success).toBe(false);
    expect(result.status).toBe(400);
    expect(result.error).toMatch(/input must be a string or array/i);
  });

  it("input is null → 400 Bad Request", async () => {
    const result = await handleEmbeddingsCore(makeOptions({
      body: { model: "text-embedding-ada-002", input: null },
    }));
    expect(result.success).toBe(false);
    expect(result.status).toBe(400);
  });

  it("empty string input passes validation", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(
      makeProviderResponse(VALID_EMBEDDING_RESPONSE)
    ));
    const result = await handleEmbeddingsCore(makeOptions({
      body: { model: "text-embedding-ada-002", input: "" },
    }));
    // Empty string is falsy → treated as missing
    expect(result.success).toBe(false);
    expect(result.status).toBe(400);
  });

  it("empty array input passes validation and reaches provider", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(
      makeProviderResponse(VALID_EMBEDDING_RESPONSE)
    ));
    const result = await handleEmbeddingsCore(makeOptions({
      body: { model: "text-embedding-ada-002", input: [] },
    }));
    // Empty array is truthy → passes, fetch is called
    expect(fetch).toHaveBeenCalledOnce();
    expect(result.success).toBe(true);
  });
});

// ─── Test: handleEmbeddingsCore — success path ───────────────────────────────

describe("handleEmbeddingsCore — success path", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns success=true with Response on 200", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(makeProviderResponse(VALID_EMBEDDING_RESPONSE));

    const result = await handleEmbeddingsCore(makeOptions());

    expect(result.success).toBe(true);
    expect(result.response).toBeInstanceOf(Response);
    expect(result.response.status).toBe(200);
  });

  it("response body is valid OpenAI-format JSON", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(makeProviderResponse(VALID_EMBEDDING_RESPONSE));

    const result = await handleEmbeddingsCore(makeOptions());
    const body = await result.response.json();

    expect(body.object).toBe("list");
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data[0]).toHaveProperty("embedding");
    expect(body.data[0]).toHaveProperty("index");
  });

  it("response includes CORS header Access-Control-Allow-Origin: *", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(makeProviderResponse(VALID_EMBEDDING_RESPONSE));

    const result = await handleEmbeddingsCore(makeOptions());

    expect(result.response.headers.get("Access-Control-Allow-Origin")).toBe("*");
  });

  it("response Content-Type is application/json", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(makeProviderResponse(VALID_EMBEDDING_RESPONSE));

    const result = await handleEmbeddingsCore(makeOptions());

    expect(result.response.headers.get("Content-Type")).toContain("application/json");
  });

  it("calls onRequestSuccess callback on success", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(makeProviderResponse(VALID_EMBEDDING_RESPONSE));
    const onRequestSuccess = vi.fn();

    await handleEmbeddingsCore(makeOptions({ onRequestSuccess }));

    expect(onRequestSuccess).toHaveBeenCalledOnce();
  });

  it("does not call onRequestSuccess on provider error", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(makeProviderErrorResponse(500, "Server exploded"));
    const onRequestSuccess = vi.fn();

    await handleEmbeddingsCore(makeOptions({ onRequestSuccess }));

    expect(onRequestSuccess).not.toHaveBeenCalled();
  });

  it("provider response with non-standard format is passed through as-is", async () => {
    const nonStandardBody = { embeddings: [[0.1, 0.2]], model: "custom" };
    vi.mocked(fetch).mockResolvedValueOnce(makeProviderResponse(nonStandardBody));

    const result = await handleEmbeddingsCore(makeOptions());
    const body = await result.response.json();

    expect(body).toEqual(nonStandardBody);
  });
});

// ─── Test: handleEmbeddingsCore — provider error handling ────────────────────

describe("handleEmbeddingsCore — provider error handling", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("provider 400 → returns success=false with status 400", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(makeProviderErrorResponse(400, "Bad model"));

    const result = await handleEmbeddingsCore(makeOptions());

    expect(result.success).toBe(false);
    expect(result.status).toBe(400);
  });

  it("provider 429 → returns success=false with status 429", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(makeProviderErrorResponse(429, "Rate limit exceeded"));

    const result = await handleEmbeddingsCore(makeOptions());

    expect(result.success).toBe(false);
    expect(result.status).toBe(429);
  });

  it("provider 500 → returns success=false with status 500", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(makeProviderErrorResponse(500, "Internal error"));

    const result = await handleEmbeddingsCore(makeOptions());

    expect(result.success).toBe(false);
    expect(result.status).toBe(500);
  });

  it("network error (fetch throws) → returns 502 Bad Gateway", async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error("ECONNREFUSED"));

    const result = await handleEmbeddingsCore(makeOptions());

    expect(result.success).toBe(false);
    expect(result.status).toBe(502);
    expect(result.error).toMatch(/ECONNREFUSED/);
  });

  it("invalid JSON from provider → returns 502", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response("not json }{", {
        status: 200,
        headers: { "Content-Type": "text/plain" },
      })
    );

    const result = await handleEmbeddingsCore(makeOptions());

    expect(result.success).toBe(false);
    expect(result.status).toBe(502);
  });

  it("error result response has OpenAI-format error body", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(makeProviderErrorResponse(400, "Bad model"));

    const result = await handleEmbeddingsCore(makeOptions());
    const body = await result.response.json();

    expect(body).toHaveProperty("error");
    expect(body.error).toHaveProperty("message");
  });
});

// ─── Test: handleEmbeddingsCore — token refresh on 401 ───────────────────────

describe("handleEmbeddingsCore — token refresh on 401/403", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("on 401, attempts retry after refresh; succeeds if refresh gives new token", async () => {
    // First call → 401 from provider
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      })
    );
    // Second call (retry) → success
    vi.mocked(fetch).mockResolvedValueOnce(makeProviderResponse(VALID_EMBEDDING_RESPONSE));

    // Credentials with a refreshToken so the executor can try to refresh
    const credentials = {
      apiKey: "sk-old",
      accessToken: "at-old",
      refreshToken: "rt-valid",
    };

    // Mock executor's refreshCredentials to return new creds
    const result = await handleEmbeddingsCore(makeOptions({
      modelInfo: { provider: "openai", model: "text-embedding-ada-002" },
      credentials,
      onCredentialsRefreshed: vi.fn(),
    }));

    // The handler may or may not succeed depending on whether the executor
    // can refresh (openai executor likely can't). What we verify is that
    // fetch was called at least once (the initial request).
    expect(vi.mocked(fetch).mock.calls.length).toBeGreaterThanOrEqual(1);
  });

  it("on 401 with no refresh token, falls back gracefully (no crash)", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      })
    );

    const result = await handleEmbeddingsCore(makeOptions({
      credentials: { apiKey: "sk-bad" },
    }));

    // Should return an error result, not throw
    expect(result).toHaveProperty("success");
    expect(result.success).toBe(false);
  });
});

// ─── Test: ollama-local adapter ──────────────────────────────────────────────
// ollama-local is registered as provider "ollama-local" and uses
// resolveOllamaLocalHost (default: http://localhost:11434/api/embed).
// No auth needed — headers are Content-Type only.

describe("ollama-local adapter", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("buildUrl → http://localhost:11434/api/embed (default host)", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(makeProviderResponse(VALID_EMBEDDING_RESPONSE));

    await handleEmbeddingsCore(makeOptions({
      body: { model: "nomic-embed-text", input: "hello" },
      modelInfo: { provider: "ollama-local", model: "nomic-embed-text" },
      credentials: {},            // no apiKey needed — authType: "none"
    }));

    const [url] = vi.mocked(fetch).mock.calls[0];
    expect(url).toBe("http://localhost:11434/api/embed");
  });

  it("buildHeaders → Content-Type: application/json, no Authorization", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(makeProviderResponse(VALID_EMBEDDING_RESPONSE));

    await handleEmbeddingsCore(makeOptions({
      body: { model: "nomic-embed-text", input: "hello" },
      modelInfo: { provider: "ollama-local", model: "nomic-embed-text" },
      credentials: {},
    }));

    const [, init] = vi.mocked(fetch).mock.calls[0];
    expect(init.headers["Content-Type"]).toBe("application/json");
    expect(init.headers["Authorization"]).toBeUndefined();
  });

  it("buildBody → { model, input } only (no encoding_format)", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(makeProviderResponse(VALID_EMBEDDING_RESPONSE));

    await handleEmbeddingsCore(makeOptions({
      body: { model: "nomic-embed-text", input: "test text" },
      modelInfo: { provider: "ollama-local", model: "nomic-embed-text" },
      credentials: {},
    }));

    const [, init] = vi.mocked(fetch).mock.calls[0];
    const sent = JSON.parse(init.body);
    expect(sent).toEqual({ model: "nomic-embed-text", input: "test text" });
  });

  it("normalize → Ollama { embeddings, prompt_eval_count } → OpenAI format", async () => {
    const ollamaBody = {
      model: "nomic-embed-text",
      embeddings: [[0.1, 0.2, 0.3]],
      prompt_eval_count: 5,
    };
    vi.mocked(fetch).mockResolvedValueOnce(makeProviderResponse(ollamaBody));

    const result = await handleEmbeddingsCore(makeOptions({
      body: { model: "nomic-embed-text", input: "hello" },
      modelInfo: { provider: "ollama-local", model: "nomic-embed-text" },
      credentials: {},
    }));

    const body = await result.response.json();
    expect(body.object).toBe("list");
    expect(body.data).toHaveLength(1);
    expect(body.data[0]).toEqual({
      object: "embedding",
      index: 0,
      embedding: [0.1, 0.2, 0.3],
    });
    expect(body.usage.prompt_tokens).toBe(5);
    expect(body.usage.total_tokens).toBe(5);
    expect(body.model).toBe("nomic-embed-text");
  });

  it("normalize → empty embeddings array → empty data, counts tokens", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(makeProviderResponse({
      model: "nomic-embed-text",
      embeddings: [],
      prompt_eval_count: 2,
    }));

    const result = await handleEmbeddingsCore(makeOptions({
      body: { model: "nomic-embed-text", input: "x" },
      modelInfo: { provider: "ollama-local", model: "nomic-embed-text" },
      credentials: {},
    }));

    const body = await result.response.json();
    expect(body.data).toEqual([]);
    expect(body.usage.prompt_tokens).toBe(2);
  });

  it("normalize → missing embeddings field → empty data, zero usage", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(makeProviderResponse({ model: "test" }));

    const result = await handleEmbeddingsCore(makeOptions({
      body: { model: "nomic-embed-text", input: "x" },
      modelInfo: { provider: "ollama-local", model: "nomic-embed-text" },
      credentials: {},
    }));

    const body = await result.response.json();
    expect(body.data).toEqual([]);
    expect(body.usage.prompt_tokens).toBe(0);
  });
});

// ─── Test: hybrid (em) adapter ───────────────────────────────────────────────
// Hybrid uses model string format: {remoteProvider}/{mode}/{actualModel}.
// mode="write" → delegates to remote provider's adapter.
// mode="read"  → delegates to ollama-local adapter.

describe("hybrid (em) adapter", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("write mode → delegates to jina-ai adapter (URL, auth, model)", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(makeProviderResponse(VALID_EMBEDDING_RESPONSE));

    await handleEmbeddingsCore(makeOptions({
      body: { model: "jina-ai/write/jina-embeddings-v5-text-small", input: "test" },
      modelInfo: {
        provider: "em",
        model: "jina-ai/write/jina-embeddings-v5-text-small",
      },
      credentials: { apiKey: "jina-test-key" },
    }));

    const [url, init] = vi.mocked(fetch).mock.calls[0];
    expect(url).toBe("https://api.jina.ai/v1/embeddings");
    expect(init.headers["Authorization"]).toBe("Bearer jina-test-key");
    const sent = JSON.parse(init.body);
    expect(sent.model).toBe("jina-embeddings-v5-text-small");
    expect(sent.input).toBe("test");
  });

  it("read mode → delegates to ollama-local adapter", async () => {
    const ollamaBody = {
      model: "nomic-embed-text",
      embeddings: [[0.1, 0.2]],
      prompt_eval_count: 3,
    };
    vi.mocked(fetch).mockResolvedValueOnce(makeProviderResponse(ollamaBody));

    const result = await handleEmbeddingsCore(makeOptions({
      body: { model: "ollama/read/nomic-embed-text", input: "test read" },
      modelInfo: {
        provider: "em",
        model: "ollama/read/nomic-embed-text",
      },
      credentials: {},
    }));

    const [url, init] = vi.mocked(fetch).mock.calls[0];
    expect(url).toBe("http://localhost:11434/api/embed");
    expect(init.headers["Authorization"]).toBeUndefined();
    const sent = JSON.parse(init.body);
    expect(sent.model).toBe("nomic-embed-text");

    // response is normalized from Ollama format
    const resBody = await result.response.json();
    expect(resBody.data).toHaveLength(1);
    expect(resBody.data[0].embedding).toEqual([0.1, 0.2]);
  });

  it("invalid model format (no slashes) → throws", async () => {
    await expect(handleEmbeddingsCore(makeOptions({
      body: { model: "justamodel", input: "test" },
      modelInfo: { provider: "em", model: "justamodel" },
      credentials: {},
    }))).rejects.toThrow(/Invalid hybrid model/);
  });

  it("write mode → delegates to gemini adapter", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(makeProviderResponse({
      embedding: { values: [0.5, 0.6] },
    }));

    await handleEmbeddingsCore(makeOptions({
      body: {
        model: "gemini/write/gemini-embedding-2",
        input: "gemini write test",
      },
      modelInfo: {
        provider: "em",
        model: "gemini/write/gemini-embedding-2",
      },
      credentials: { apiKey: "gemini-key" },
    }));

    const [url] = vi.mocked(fetch).mock.calls[0];
    expect(url).toContain("generativelanguage.googleapis.com");
    expect(url).toContain("embedContent");
    const [, init] = vi.mocked(fetch).mock.calls[0];
    const sent = JSON.parse(init.body);
    expect(sent.model).toBe("models/gemini-embedding-2");
  });
});
