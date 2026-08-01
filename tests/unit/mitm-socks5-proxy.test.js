import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { createRequire } from "module";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const require = createRequire(import.meta.url);

let tempDir;
const originalDataDir = process.env.DATA_DIR;

// Mock redis client
const redisStore = new Map();
const mockRedisGet = vi.fn(async (key) => redisStore.get(key) || null);
const mockRedisSet = vi.fn(async (key, val) => { redisStore.set(key, val); });
const mockRedisClearPrefix = vi.fn(async (prefix) => {
  for (const k of redisStore.keys()) {
    if (k.startsWith(prefix)) redisStore.delete(k);
  }
});

vi.mock("../../src/lib/redis.js", () => {
  return {
    redisGet: mockRedisGet,
    redisSet: mockRedisSet,
    redisClearPrefix: mockRedisClearPrefix,
  };
});

async function resolveMitmSocksProxy(settings) {
  if (!settings || !settings.mitmSocksProxyEnabled) return "";
  const raw = (settings.mitmSocksProxyUrl || "").trim();
  if (!raw) return "";
  try {
    const u = new URL(raw);
    if (u.protocol !== "socks5h:" && u.protocol !== "socks5:") return "";
    if (!u.hostname) return "";
    return raw;
  } catch {
    return "";
  }
}

function parseSocksProxyEnv(raw) {
  if (!raw) return null;
  try {
    const u = new URL(raw);
    return {
      host: u.hostname,
      port: parseInt(u.port || "1080", 10),
      type: 5,
      userId: u.username || undefined,
      password: u.password || undefined,
      remoteResolution: u.protocol === "socks5h:",
    };
  } catch {
    return null;
  }
}

describe("settingsRepo — SOCKS5 proxy defaults", () => {
  it("has mitmSocksProxyEnabled default false", async () => {
    const fs = require("fs");
    const src = fs.readFileSync(
      require.resolve("../../src/lib/db/repos/settingsRepo.js"),
      "utf8"
    );
    expect(src).toContain("mitmSocksProxyEnabled: false");
    expect(src).toContain('mitmSocksProxyUrl: ""');
  });
});

describe("resolveMitmSocksProxy", () => {
  it("returns empty string when feature is disabled", async () => {
    expect(await resolveMitmSocksProxy({ mitmSocksProxyEnabled: false, mitmSocksProxyUrl: "socks5h://10.0.0.1:1080" })).toBe("");
  });

  it("returns empty string when settings is null", async () => {
    expect(await resolveMitmSocksProxy(null)).toBe("");
  });

  it("returns empty string when URL is blank even if enabled", async () => {
    expect(await resolveMitmSocksProxy({ mitmSocksProxyEnabled: true, mitmSocksProxyUrl: "" })).toBe("");
    expect(await resolveMitmSocksProxy({ mitmSocksProxyEnabled: true, mitmSocksProxyUrl: "   " })).toBe("");
  });

  it("returns the URL for valid socks5h://", async () => {
    const url = "socks5h://127.0.0.1:10808";
    expect(await resolveMitmSocksProxy({ mitmSocksProxyEnabled: true, mitmSocksProxyUrl: url })).toBe(url);
  });

  it("returns the URL for valid socks5://", async () => {
    const url = "socks5://proxy.internal:1080";
    expect(await resolveMitmSocksProxy({ mitmSocksProxyEnabled: true, mitmSocksProxyUrl: url })).toBe(url);
  });

  it("rejects http:// URL (not a SOCKS protocol)", async () => {
    expect(await resolveMitmSocksProxy({
      mitmSocksProxyEnabled: true,
      mitmSocksProxyUrl: "http://proxy.example.com:8080",
    })).toBe("");
  });

  it("rejects malformed URL (prevents server crash on startup)", async () => {
    expect(await resolveMitmSocksProxy({
      mitmSocksProxyEnabled: true,
      mitmSocksProxyUrl: "not-a-url",
    })).toBe("");
    expect(await resolveMitmSocksProxy({
      mitmSocksProxyEnabled: true,
      mitmSocksProxyUrl: "://broken",
    })).toBe("");
  });
});

describe("parseSocksProxyEnv — server.js SOCKS5_PROXY parsing", () => {
  it("returns null when env is unset/empty", () => {
    expect(parseSocksProxyEnv("")).toBeNull();
    expect(parseSocksProxyEnv(undefined)).toBeNull();
    expect(parseSocksProxyEnv(null)).toBeNull();
  });

  it("parses socks5h:// — remoteResolution true", () => {
    const r = parseSocksProxyEnv("socks5h://127.0.0.1:10808");
    expect(r).not.toBeNull();
    expect(r.host).toBe("127.0.0.1");
    expect(r.port).toBe(10808);
    expect(r.type).toBe(5);
    expect(r.remoteResolution).toBe(true);
  });
});

describe("SOCKS5 proxy settings caching and dynamic updates in Redis", () => {
  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "9router-mitm-socks-"));
    process.env.DATA_DIR = tempDir;
    delete global._dbAdapter;
    redisStore.clear();
    vi.resetModules();
    mockRedisGet.mockClear();
    mockRedisSet.mockClear();
    mockRedisClearPrefix.mockClear();
  });

  afterEach(() => {
    try { global._dbAdapter?.instance?.close?.(); } catch {}
    delete global._dbAdapter;
    if (tempDir) fs.rmSync(tempDir, { recursive: true, force: true });
    if (originalDataDir === undefined) delete process.env.DATA_DIR;
    else process.env.DATA_DIR = originalDataDir;
  });

  it("caches settings in Redis and invalidates them dynamically on update", async () => {
    const { getSettings, updateSettings } = await import("../../src/lib/db/repos/settingsRepo.js");

    // 1. Initial call - Redis cache is cold, so it fetches from DB and writes to Redis
    const settings = await getSettings();
    expect(settings.mitmSocksProxyEnabled).toBe(false);
    expect(mockRedisGet).toHaveBeenCalledWith("9router:cache:settings");
    expect(mockRedisSet).toHaveBeenCalledWith("9router:cache:settings", settings, 300);

    // 2. Call again - should hit Redis cache directly without calling database
    mockRedisGet.mockClear();
    mockRedisSet.mockClear();
    const settingsCached = await getSettings();
    expect(settingsCached.mitmSocksProxyEnabled).toBe(false);
    expect(mockRedisGet).toHaveBeenCalledWith("9router:cache:settings");
    expect(mockRedisSet).not.toHaveBeenCalled();

    // 3. Update settings - should clear Redis cache
    mockRedisClearPrefix.mockClear();
    const updated = await updateSettings({
      mitmSocksProxyEnabled: true,
      mitmSocksProxyUrl: "socks5h://127.0.0.1:9050"
    });
    expect(updated.mitmSocksProxyEnabled).toBe(true);
    expect(updated.mitmSocksProxyUrl).toBe("socks5h://127.0.0.1:9050");
    expect(mockRedisClearPrefix).toHaveBeenCalledWith("9router:cache:settings");

    // 4. Fetch settings after update - should write new values to Redis
    mockRedisGet.mockClear();
    mockRedisSet.mockClear();
    const settingsNew = await getSettings();
    expect(settingsNew.mitmSocksProxyEnabled).toBe(true);
    expect(settingsNew.mitmSocksProxyUrl).toBe("socks5h://127.0.0.1:9050");
    expect(mockRedisGet).toHaveBeenCalledWith("9router:cache:settings");
    expect(mockRedisSet).toHaveBeenCalledWith("9router:cache:settings", settingsNew, 300);
  });
});
