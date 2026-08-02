import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// Mock redis
vi.mock("../../src/lib/redis.js", () => ({
  redisGet: vi.fn(),
  redisSet: vi.fn(),
  redisClearPrefix: vi.fn(),
}));

// Mock vault
vi.mock("../../src/lib/vault.js", () => ({
  vaultRead: vi.fn(),
  vaultWrite: vi.fn(),
}));

describe("settingsRepo", () => {
  let tempDir;
  let originalDataDir;
  let settingsRepo;
  let getAdapter;

  beforeEach(async () => {
    vi.restoreAllMocks();
    originalDataDir = process.env.DATA_DIR;
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "9router-settingsRepo-test-"));
    process.env.DATA_DIR = tempDir;

    vi.resetModules();

    const dbDriver = await import("@/lib/db/driver.js");
    getAdapter = dbDriver.getAdapter;

    // Initialize manually
    const db = await getAdapter();
    db.run(`
      CREATE TABLE IF NOT EXISTS settings (
        id INTEGER PRIMARY KEY,
        data TEXT
      )
    `);

    settingsRepo = await import("@/lib/db/repos/settingsRepo.js");
  });

  afterEach(() => {
    if (originalDataDir === undefined) {
      delete process.env.DATA_DIR;
    } else {
      process.env.DATA_DIR = originalDataDir;
    }
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("getSettings: returns default settings if db is empty", async () => {
    const { redisGet, redisSet } = await import("../../src/lib/redis.js");
    redisGet.mockResolvedValue(null);

    const settings = await settingsRepo.getSettings();
    expect(settings).toBeDefined();
    expect(settings.rtkEnabled).toBe(true);
    expect(settings.modelAggregationEnabled).toBe(false);
    expect(redisSet).toHaveBeenCalledWith("9router:cache:settings", settings, 300);
  });

  it("updateSettings: updates settings and invalidates cache", async () => {
    const { redisClearPrefix } = await import("../../src/lib/redis.js");

    const initial = await settingsRepo.getSettings();
    expect(initial.modelAggregationEnabled).toBe(false);

    const updated = await settingsRepo.updateSettings({ modelAggregationEnabled: true });
    expect(updated.modelAggregationEnabled).toBe(true);

    const check = await settingsRepo.getSettings();
    expect(check.modelAggregationEnabled).toBe(true);
    expect(redisClearPrefix).toHaveBeenCalledWith("9router:cache:settings");
  });

  it("updateSettings and getSettings: handles vault secrets for oidcClientSecret", async () => {
    const { vaultRead, vaultWrite } = await import("../../src/lib/vault.js");
    process.env.VAULT_ADDR = "http://localhost:8200";
    process.env.VAULT_TOKEN = "test-token";

    vaultRead.mockResolvedValue({ oidcClientSecret: "super-secret-oidc-key" });

    const updated = await settingsRepo.updateSettings({
      oidcIssuerUrl: "https://auth.example.com",
      oidcClientSecret: "super-secret-oidc-key",
    });

    expect(updated.oidcIssuerUrl).toBe("https://auth.example.com");
    expect(updated.oidcClientSecret).toBe("super-secret-oidc-key");
    expect(vaultWrite).toHaveBeenCalledWith("settings", { oidcClientSecret: "super-secret-oidc-key" });

    // Verify stored row in database does NOT contain oidcClientSecret
    const db = await getAdapter();
    const row = db.get("SELECT data FROM settings WHERE id = 1");
    const storedData = JSON.parse(row.data);
    expect(storedData.oidcClientSecret).toBeUndefined();
    expect(storedData.oidcIssuerUrl).toBe("https://auth.example.com");
  });
});
