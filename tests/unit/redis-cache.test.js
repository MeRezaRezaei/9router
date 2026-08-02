import { describe, it, expect, vi, beforeEach } from "vitest";

vi.hoisted(() => {
  process.env.REDIS_URL = "redis://localhost:6379";
});

// We must define mockClient inside the vi.mock factory or use a factory variable.
// Vitest hoisting: vi.mock is hoisted, meaning the factory executes before the local file code (including local variables like let readyHandler, const mockClient).
// So inside vi.mock, we cannot reference mockClient unless it's hoisted or defined in the mock.
// Let's define the mock client in a hoisted variable!

const { mockClient, getReadyHandler, triggerReady } = vi.hoisted(() => {
  let readyHandler;
  const mockClient = {
    get: vi.fn(),
    set: vi.fn(),
    del: vi.fn(),
    keys: vi.fn(),
    connect: vi.fn(() => {
      if (readyHandler) readyHandler();
      return Promise.resolve();
    }),
    on: vi.fn((event, handler) => {
      if (event === "ready") {
        readyHandler = handler;
      }
    }),
  };
  return {
    mockClient,
    getReadyHandler: () => readyHandler,
    triggerReady: () => { if (readyHandler) readyHandler(); }
  };
});

vi.mock("redis", () => ({
  createClient: vi.fn(() => mockClient),
}));

// Import redis module after setting env var and mocking
import { redisGet, redisSet, redisDel, redisClearPrefix } from "../../src/lib/redis.js";

describe("Redis client integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    triggerReady();
  });

  it("redisGet: parses stored JSON string", async () => {
    mockClient.get.mockResolvedValueOnce(JSON.stringify({ test: "data" }));
    const result = await redisGet("test-key");
    expect(mockClient.get).toHaveBeenCalledWith("test-key");
    expect(result).toEqual({ test: "data" });
  });

  it("redisGet: handles cache miss", async () => {
    mockClient.get.mockResolvedValueOnce(null);
    const result = await redisGet("missing-key");
    expect(result).toBeNull();
  });

  it("redisGet: catches JSON parse errors gracefully", async () => {
    mockClient.get.mockResolvedValueOnce("invalid-json");
    const result = await redisGet("bad-json-key");
    expect(result).toBeNull();
  });

  it("redisSet: serializes and sets value with TTL", async () => {
    mockClient.set.mockResolvedValueOnce("OK");
    await redisSet("test-key", { test: "data" }, 120);
    expect(mockClient.set).toHaveBeenCalledWith("test-key", JSON.stringify({ test: "data" }), { EX: 120 });
  });

  it("redisDel: deletes key", async () => {
    mockClient.del.mockResolvedValueOnce(1);
    await redisDel("test-key");
    expect(mockClient.del).toHaveBeenCalledWith("test-key");
  });

  it("redisClearPrefix: deletes all keys matching prefix", async () => {
    mockClient.keys.mockResolvedValueOnce(["prefix:1", "prefix:2"]);
    mockClient.del.mockResolvedValueOnce(2);
    await redisClearPrefix("prefix:");
    expect(mockClient.keys).toHaveBeenCalledWith("prefix:*");
    expect(mockClient.del).toHaveBeenCalledWith(["prefix:1", "prefix:2"]);
  });
});
