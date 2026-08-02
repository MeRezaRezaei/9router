import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { v4 as uuidv4 } from "uuid";

// Mock redis
vi.mock("../../src/lib/redis.js", () => ({
  redisGet: vi.fn(),
  redisSet: vi.fn(),
  redisDel: vi.fn(),
  redisClearPrefix: vi.fn(),
}));

// Mock vault
vi.mock("../../src/lib/vault.js", () => ({
  vaultRead: vi.fn(),
  vaultWrite: vi.fn(),
  vaultDelete: vi.fn(),
}));

describe("connectionsRepo", () => {
  let tempDir;
  let originalDataDir;
  let connectionsRepo;
  let getAdapter;

  beforeEach(async () => {
    vi.restoreAllMocks();
    originalDataDir = process.env.DATA_DIR;
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "9router-connectionsRepo-test-"));
    process.env.DATA_DIR = tempDir;

    // Reset module cache to pick up the new DATA_DIR for sqlite DB
    vi.resetModules();

    // Import drivers & repo
    const dbDriver = await import("@/lib/db/driver.js");
    getAdapter = dbDriver.getAdapter;

    // Initialize database schema manually
    const db = await getAdapter();
    db.run(`
      CREATE TABLE IF NOT EXISTS providerConnections (
        id TEXT PRIMARY KEY,
        provider TEXT NOT NULL,
        authType TEXT NOT NULL,
        name TEXT,
        email TEXT,
        priority INTEGER,
        isActive INTEGER DEFAULT 1,
        data TEXT,
        createdAt TEXT,
        updatedAt TEXT
      )
    `);

    connectionsRepo = await import("@/lib/db/repos/connectionsRepo.js");
  });

  afterEach(() => {
    if (originalDataDir === undefined) {
      delete process.env.DATA_DIR;
    } else {
      process.env.DATA_DIR = originalDataDir;
    }
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("createProviderConnection: creates apikey connection and calls vault/redis", async () => {
    const { redisClearPrefix } = await import("../../src/lib/redis.js");
    const { vaultWrite, vaultRead } = await import("../../src/lib/vault.js");
    process.env.VAULT_ADDR = "http://localhost:8200";
    process.env.VAULT_TOKEN = "test-token";

    vaultRead.mockResolvedValue({ apiKey: "sk-test-key-12345" });

    const connectionData = {
      provider: "openai",
      authType: "apikey",
      name: "Test API Key Connection",
      apiKey: "sk-test-key-12345",
      priority: 1,
      isActive: true,
    };

    const result = await connectionsRepo.createProviderConnection(connectionData);

    expect(result).toBeDefined();
    expect(result.provider).toBe("openai");
    expect(result.authType).toBe("apikey");
    expect(result.name).toBe("Test API Key Connection");
    expect(result.apiKey).toBe("sk-test-key-12345"); // Enriched result has it
    expect(vaultWrite).toHaveBeenCalledWith(result.id, { apiKey: "sk-test-key-12345" });
    expect(redisClearPrefix).toHaveBeenCalledWith("9router:cache:connections:");

    // Verify stored row in database (should have secrets stripped in data column)
    const db = await getAdapter();
    const row = db.get("SELECT * FROM providerConnections WHERE id = ?", [result.id]);
    expect(row).toBeDefined();
    const extra = JSON.parse(row.data);
    expect(extra.apiKey).toBeUndefined(); // Secrets must be stripped from DB column
  });

  it("updateProviderConnection: updates connection and invalidates cache", async () => {
    const { redisClearPrefix } = await import("../../src/lib/redis.js");
    const { vaultWrite, vaultRead } = await import("../../src/lib/vault.js");
    process.env.VAULT_ADDR = "http://localhost:8200";
    process.env.VAULT_TOKEN = "test-token";

    // Setup vaultRead mock to return the new secrets on enrichment
    vaultRead.mockResolvedValue({ apiKey: "new-key" });

    const connectionData = {
      provider: "openai",
      authType: "apikey",
      name: "Old Connection",
      apiKey: "old-key",
      priority: 1,
      isActive: true,
    };

    const initial = await connectionsRepo.createProviderConnection(connectionData);

    const result = await connectionsRepo.updateProviderConnection(initial.id, {
      name: "Updated Connection",
      apiKey: "new-key",
    });

    expect(result).toBeDefined();
    expect(result.id).toBe(initial.id);
    expect(result.name).toBe("Updated Connection");
    expect(result.apiKey).toBe("new-key");
    expect(vaultWrite).toHaveBeenCalledWith(initial.id, { apiKey: "new-key" });
    expect(redisClearPrefix).toHaveBeenCalled();
  });

  it("deleteProviderConnection: deletes connection from db, vault, and redis", async () => {
    const { redisDel, redisClearPrefix } = await import("../../src/lib/redis.js");
    const { vaultDelete } = await import("../../src/lib/vault.js");

    const connectionData = {
      provider: "openai",
      authType: "apikey",
      name: "To Delete",
      priority: 1,
      isActive: true,
    };

    const initial = await connectionsRepo.createProviderConnection(connectionData);
    await connectionsRepo.deleteProviderConnection(initial.id);

    const db = await getAdapter();
    const row = db.get("SELECT * FROM providerConnections WHERE id = ?", [initial.id]);
    expect(row).toBeUndefined();

    expect(vaultDelete).toHaveBeenCalledWith(initial.id);
    expect(redisDel).toHaveBeenCalledWith(`9router:cache:connection:${initial.id}`);
    expect(redisClearPrefix).toHaveBeenCalledWith("9router:cache:connections:");
  });

  it("deleteProviderConnectionsByProvider: clears per-id cache keys for every deleted connection", async () => {
    const { redisDel } = await import("../../src/lib/redis.js");
    const { vaultDelete } = await import("../../src/lib/vault.js");

    const a = await connectionsRepo.createProviderConnection({ provider: "anthropic", authType: "apikey", name: "A", apiKey: "k-a" });
    const b = await connectionsRepo.createProviderConnection({ provider: "anthropic", authType: "apikey", name: "B", apiKey: "k-b" });

    const before = await connectionsRepo.deleteProviderConnectionsByProvider("anthropic");

    expect(before).toBe(2);
    expect(vaultDelete).toHaveBeenCalledWith(a.id);
    expect(vaultDelete).toHaveBeenCalledWith(b.id);
    expect(redisDel).toHaveBeenCalledWith(`9router:cache:connection:${a.id}`);
    expect(redisDel).toHaveBeenCalledWith(`9router:cache:connection:${b.id}`);

    const db = await getAdapter();
    const rows = db.all("SELECT * FROM providerConnections WHERE provider = ?", ["anthropic"]);
    expect(rows).toHaveLength(0);
  });

  it("reorderProviderConnections: invalidates per-id cache keys after priority reorder", async () => {
    const { redisDel } = await import("../../src/lib/redis.js");

    await connectionsRepo.createProviderConnection({ provider: "anthropic", authType: "apikey", name: "A", apiKey: "k-a", priority: 2 });
    await connectionsRepo.createProviderConnection({ provider: "anthropic", authType: "apikey", name: "B", apiKey: "k-b", priority: 1 });

    redisDel.mockClear();
    await connectionsRepo.reorderProviderConnections("anthropic");

    const calls = redisDel.mock.calls.map(c => c[0]).filter(k => k.startsWith("9router:cache:connection:"));
    expect(calls).toHaveLength(2);
  });

  it("cleanupProviderConnections: invalidates per-id cache key for cleaned connections", async () => {
    const { redisDel } = await import("../../src/lib/redis.js");

    const conn = await connectionsRepo.createProviderConnection({ provider: "openai", authType: "apikey", name: "C", apiKey: "k-c" });

    const db = await getAdapter();
    db.run("UPDATE providerConnections SET data = ? WHERE id = ?", [
      JSON.stringify({ apiKey: null, displayName: null, empty: true }),
      conn.id,
    ]);

    redisDel.mockClear();
    const cleaned = await connectionsRepo.cleanupProviderConnections();

    expect(cleaned).toBeGreaterThan(0);
    expect(redisDel).toHaveBeenCalledWith(`9router:cache:connection:${conn.id}`);
  });
});
