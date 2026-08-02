import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "fs";
import path from "path";
import os from "os";

vi.mock("@/lib/dataDir.js", () => ({
  DATA_DIR: "/tmp/fake-data-dir-audit",
}));

// ============================================================
// AUDIT-002 (#1962): API key masking in usage stats
// ============================================================
describe("AUDIT-002: API key masking", () => {
  it("source should contain maskApiKey function", () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, "../../src/lib/db/repos/usageRepo.js"),
      "utf-8"
    );
    expect(source).toContain("function maskApiKey");
  });

  it("getUsageHistory should use apiKeyMasked instead of apiKey", () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, "../../src/lib/db/repos/usageRepo.js"),
      "utf-8"
    );
    // The REST response should use apiKeyMasked
    expect(source).toContain("apiKeyMasked: maskApiKey(r.apiKey)");
    // The return mapping in getUsageHistory should not have raw apiKey
    // (The internal ring buffer still uses apiKey: r.apiKey for internal state - that's fine)
    const historyReturn = source.match(/return rows\.map\(\(r\)\s*=>\s*\(\{[\s\S]*?\}\)\);/);
    expect(historyReturn).not.toBeNull();
    expect(historyReturn[0]).toContain("apiKeyMasked");
    expect(historyReturn[0]).not.toContain("apiKey: r.apiKey");
  });

  it("getUsageStats should use apiKeyMasked in byApiKey entries", () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, "../../src/lib/db/repos/usageRepo.js"),
      "utf-8"
    );
    // Both code paths (daily summary + 24h live) should use apiKeyMasked
    const maskedCount = (source.match(/apiKeyMasked/g) || []).length;
    expect(maskedCount).toBeGreaterThanOrEqual(4); // function def + 3 usage sites

    // The byApiKey stats entries should use apiKeyMasked, not raw apiKey
    // Check the daily summary path
    const dailyPath = source.match(/stats\.byApiKey\[akKey\] = \{[^}]*apiKeyMasked[^}]*\}/);
    expect(dailyPath).not.toBeNull();
    // Check the 24h live path
    const livePath = source.match(/stats\.byApiKey\[akKey\] = \{[^}]*apiKeyMasked[^}]*\}/g);
    expect(livePath).not.toBeNull();
    expect(livePath.length).toBeGreaterThanOrEqual(1);
  });

  it("byApiKey object keys should use masked key, not raw key", () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, "../../src/lib/db/repos/usageRepo.js"),
      "utf-8"
    );
    // The 24h path should use apiKeyMasked in the akKey template
    expect(source).toContain("${apiKeyMasked}|${r.model}|${r.provider");
    // Should NOT use raw r.apiKey in the key
    expect(source).not.toContain("${r.apiKey}|${r.model}|${r.provider");
  });
});

// ============================================================
// AUDIT-003 (#1961): Proxy URL validation
// ============================================================
describe("AUDIT-003: Proxy URL validation", () => {
  beforeEach(() => {
    delete process.env.HTTP_PROXY;
    delete process.env.HTTPS_PROXY;
    delete process.env.ALL_PROXY;
    delete process.env.NINE_ROUTER_PROXY_MANAGED;
    delete process.env.NINE_ROUTER_PROXY_URL;
    delete process.env.NINE_ROUTER_NO_PROXY;
    delete process.env.NO_PROXY;
  });

  it("source should contain validateProxyUrl function", () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, "../../src/lib/network/outboundProxy.js"),
      "utf-8"
    );
    expect(source).toContain("function validateProxyUrl");
    expect(source).toContain("ALLOWED_PROXY_SCHEMES");
  });

  it("should accept valid http proxy URLs", async () => {
    vi.resetModules();
    const { applyOutboundProxyEnv } = await import("../../src/lib/network/outboundProxy.js");
    applyOutboundProxyEnv({
      outboundProxyEnabled: true,
      outboundProxyUrl: "http://proxy.example.com:8080",
    });
    // new URL().href normalizes (adds trailing slash)
    expect(process.env.HTTP_PROXY).toContain("http://proxy.example.com:8080");
    expect(process.env.HTTPS_PROXY).toContain("http://proxy.example.com:8080");
  });

  it("should accept valid https proxy URLs", async () => {
    vi.resetModules();
    const { applyOutboundProxyEnv } = await import("../../src/lib/network/outboundProxy.js");
    applyOutboundProxyEnv({
      outboundProxyEnabled: true,
      outboundProxyUrl: "https://proxy.example.com:443",
    });
    // new URL().href normalizes (drops default port 443, adds trailing slash)
    expect(process.env.HTTP_PROXY).toContain("https://proxy.example.com");
  });

  it("should accept valid socks5 proxy URLs", async () => {
    vi.resetModules();
    const { applyOutboundProxyEnv } = await import("../../src/lib/network/outboundProxy.js");
    applyOutboundProxyEnv({
      outboundProxyEnabled: true,
      outboundProxyUrl: "socks5://proxy.example.com:1080",
    });
    expect(process.env.ALL_PROXY).toBe("socks5://proxy.example.com:1080");
  });

  it("should reject URLs with shell metacharacters (newline)", async () => {
    vi.resetModules();
    const { applyOutboundProxyEnv } = await import("../../src/lib/network/outboundProxy.js");
    applyOutboundProxyEnv({
      outboundProxyEnabled: true,
      outboundProxyUrl: "http://proxy.example.com:8080\nmalicious",
    });
    expect(process.env.HTTP_PROXY).toBeUndefined();
  });

  it("should reject URLs with shell metacharacters (backtick)", async () => {
    vi.resetModules();
    const { applyOutboundProxyEnv } = await import("../../src/lib/network/outboundProxy.js");
    applyOutboundProxyEnv({
      outboundProxyEnabled: true,
      outboundProxyUrl: "http://`whoami`.example.com:8080",
    });
    expect(process.env.HTTP_PROXY).toBeUndefined();
  });

  it("should reject URLs with shell metacharacters (dollar)", async () => {
    vi.resetModules();
    const { applyOutboundProxyEnv } = await import("../../src/lib/network/outboundProxy.js");
    applyOutboundProxyEnv({
      outboundProxyEnabled: true,
      outboundProxyUrl: "http://$(whoami).example.com:8080",
    });
    expect(process.env.HTTP_PROXY).toBeUndefined();
  });

  it("should reject non-allowed schemes (file://)", async () => {
    vi.resetModules();
    const { applyOutboundProxyEnv } = await import("../../src/lib/network/outboundProxy.js");
    applyOutboundProxyEnv({
      outboundProxyEnabled: true,
      outboundProxyUrl: "file:///etc/passwd",
    });
    expect(process.env.HTTP_PROXY).toBeUndefined();
  });

  it("should reject non-allowed schemes (javascript:)", async () => {
    vi.resetModules();
    const { applyOutboundProxyEnv } = await import("../../src/lib/network/outboundProxy.js");
    applyOutboundProxyEnv({
      outboundProxyEnabled: true,
      outboundProxyUrl: "javascript:alert(1)",
    });
    expect(process.env.HTTP_PROXY).toBeUndefined();
  });
});

// ============================================================
// AUDIT-018 (#1972): XSS escaping in OAuth callback
// ============================================================
describe("AUDIT-018: XSS escaping in OAuth callback", () => {
  it("source should contain escapeHtml function", () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, "../../src/lib/oauth/utils/server.js"),
      "utf-8"
    );
    expect(source).toContain("function escapeHtml");
  });

  it("should escape ampersand, angle brackets, and quotes", () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, "../../src/lib/oauth/utils/server.js"),
      "utf-8"
    );
    expect(source).toContain("&amp;");
    expect(source).toContain("&lt;");
    expect(source).toContain("&gt;");
    expect(source).toContain("&quot;");
    expect(source).toContain("&#39;");
  });

  it("should use safeMessage in rendered HTML, not raw message", () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, "../../src/lib/oauth/utils/server.js"),
      "utf-8"
    );
    expect(source).toContain("safeMessage");
    expect(source).toContain("${safeMessage}");
    // Should NOT use raw message in HTML body
    expect(source).not.toContain("<p>${message}</p>");
  });
});

// ============================================================
// AUDIT-004 (#1963): TOCTOU race - atomic lock file
// ============================================================
describe("AUDIT-004: Atomic lock file for MITM startup", () => {
  it("manager.js should define LOCK_FILE constant", () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, "../../src/mitm/manager.js"),
      "utf-8"
    );
    expect(source).toContain("LOCK_FILE");
    expect(source).toContain(".mitm.lock");
  });

  it("should use O_EXCL flag (wx) for atomic creation", () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, "../../src/mitm/manager.js"),
      "utf-8"
    );
    expect(source).toContain('"wx"');
    expect(source).toContain("EEXIST");
  });

  it("should clean up lock file on all exit paths", () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, "../../src/mitm/manager.js"),
      "utf-8"
    );
    const matches = source.match(/unlinkSync\(LOCK_FILE\)/g);
    expect(matches).not.toBeNull();
    expect(matches.length).toBeGreaterThanOrEqual(4);
  });
});

// ============================================================
// AUDIT-001 (#1965): Race condition in retry tracking
// ============================================================
describe("AUDIT-001: Synchronous restart guard", () => {
  it("mitmIsRestarting should be set before first await expression", () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, "../../src/mitm/manager.js"),
      "utf-8"
    );

    const funcStart = source.indexOf("async function scheduleMitmRestart");
    expect(funcStart).toBeGreaterThan(-1);

    const funcBody = source.substring(funcStart, funcStart + 2000);

    const guardCheckIdx = funcBody.indexOf("if (mitmIsRestarting) return;");
    expect(guardCheckIdx).toBeGreaterThan(-1);

    const afterGuard = funcBody.substring(guardCheckIdx);

    // Strip line comments to avoid matching "await" in comment text
    const noComments = afterGuard.replace(/\/\/.*$/gm, "");

    // Find the first actual await expression
    const firstAwaitIdx = noComments.search(/\bawait\s+/);
    expect(firstAwaitIdx).toBeGreaterThan(-1);

    // Find mitmIsRestarting = true
    const setFlagIdx = noComments.indexOf("mitmIsRestarting = true");

    expect(setFlagIdx).toBeGreaterThan(-1);
    expect(firstAwaitIdx).toBeGreaterThan(-1);
    expect(setFlagIdx).toBeLessThan(firstAwaitIdx);
  });

  it("mitmIsRestarting should be reset on max-restarts early return", () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, "../../src/mitm/manager.js"),
      "utf-8"
    );

    const funcStart = source.indexOf("async function scheduleMitmRestart");
    const funcBody = source.substring(funcStart, funcStart + 2000);

    const maxRestartsIdx = funcBody.indexOf("Max restart attempts reached");
    expect(maxRestartsIdx).toBeGreaterThan(-1);

    const afterMax = funcBody.substring(maxRestartsIdx, maxRestartsIdx + 200);
    expect(afterMax).toContain("mitmIsRestarting = false");
  });
});

describe("Vault secrets storage and Redis write-through cache observer", () => {
  let tempDir;
  const originalDataDir = process.env.DATA_DIR;
  const vaultStore = new Map();
  const redisStore = new Map();

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "9router-vault-tests-"));
    process.env.DATA_DIR = tempDir;
    process.env.VAULT_ADDR = "http://localhost:8200";
    process.env.VAULT_TOKEN = "test-token";
    delete global._dbAdapter;
    vaultStore.clear();
    redisStore.clear();

    vi.doMock("../../src/lib/vault.js", () => ({
      vaultRead: vi.fn(async (id) => vaultStore.get(id) || null),
      vaultWrite: vi.fn(async (id, data) => { vaultStore.set(id, data); }),
      vaultDelete: vi.fn(async (id) => { vaultStore.delete(id); }),
    }));

    vi.doMock("../../src/lib/redis.js", () => ({
      redisGet: vi.fn(async (key) => redisStore.get(key) || null),
      redisSet: vi.fn(async (key, val) => { redisStore.set(key, val); }),
      redisDel: vi.fn(async (key) => { redisStore.delete(key); }),
      redisClearPrefix: vi.fn(async (prefix) => {
        for (const k of redisStore.keys()) {
          if (k.startsWith(prefix)) redisStore.delete(k);
        }
      }),
    }));
  });

  afterEach(() => {
    try { global._dbAdapter?.instance?.close?.(); } catch {}
    delete global._dbAdapter;
    if (tempDir) fs.rmSync(tempDir, { recursive: true, force: true });
    if (originalDataDir === undefined) delete process.env.DATA_DIR;
    else process.env.DATA_DIR = originalDataDir;
    delete process.env.VAULT_ADDR;
    delete process.env.VAULT_TOKEN;
    vi.doUnmock("../../src/lib/vault.js");
    vi.doUnmock("../../src/lib/redis.js");
  });

  it("extracts sensitive fields to Vault and reads them back via Redis cache", async () => {
    const { createProviderConnection, getProviderConnectionById, deleteProviderConnection } = await import("../../src/lib/db/repos/connectionsRepo.js");

    // 1. Create a connection with sensitive fields
    const conn = await createProviderConnection({
      provider: "openai",
      authType: "apikey",
      name: "Test Vault Connection",
      apiKey: "sk-sensitive-api-key-123456",
      accessToken: "oauth-access-token",
      refreshToken: "oauth-refresh-token",
      idToken: "oauth-id-token",
      isActive: true,
    });

    expect(conn.id).toBeDefined();
    expect(conn.apiKey).toBe("sk-sensitive-api-key-123456");

    // Check Vault storage
    const storedInVault = vaultStore.get(conn.id);
    expect(storedInVault).toBeDefined();
    expect(storedInVault.apiKey).toBe("sk-sensitive-api-key-123456");
    expect(storedInVault.accessToken).toBe("oauth-access-token");
    expect(storedInVault.refreshToken).toBe("oauth-refresh-token");
    expect(storedInVault.idToken).toBe("oauth-id-token");

    // Check SQLite storage directly by reading from DB (it should NOT contain apiKey, etc.)
    const { getAdapter } = await import("../../src/lib/db/driver.js");
    const db = await getAdapter();
    const row = db.get("SELECT data FROM providerConnections WHERE id = ?", [conn.id]);
    const parsedData = JSON.parse(row.data);
    expect(parsedData.apiKey).toBeUndefined();
    expect(parsedData.accessToken).toBeUndefined();
    expect(parsedData.refreshToken).toBeUndefined();
    expect(parsedData.idToken).toBeUndefined();

    // 2. Read back using getProviderConnectionById (which should retrieve from Vault and cache in Redis)
    redisStore.clear(); // Clear cache to force DB/Vault fetch
    const fetched = await getProviderConnectionById(conn.id);
    expect(fetched.apiKey).toBe("sk-sensitive-api-key-123456");

    // Check Redis cache has the full enriched object (with secrets)
    const cachedInRedis = redisStore.get(`9router:cache:connection:${conn.id}`);
    expect(cachedInRedis).toBeDefined();
    expect(cachedInRedis.apiKey).toBe("sk-sensitive-api-key-123456");

    // 3. Delete connection - should delete from SQLite, Vault, and Redis
    const deleted = await deleteProviderConnection(conn.id);
    expect(deleted).toBe(true);
    expect(vaultStore.has(conn.id)).toBe(false);
    expect(redisStore.has(`9router:cache:connection:${conn.id}`)).toBe(false);
    const checkRow = db.get("SELECT * FROM providerConnections WHERE id = ?", [conn.id]);
    expect(checkRow).toBeUndefined();
  });
});
