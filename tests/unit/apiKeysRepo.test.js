import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

describe("apiKeysRepo", () => {
  let tempDir;
  let originalDataDir;
  let apiKeysRepo;
  let getAdapter;

  beforeEach(async () => {
    originalDataDir = process.env.DATA_DIR;
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "9router-apiKeysRepo-test-"));
    process.env.DATA_DIR = tempDir;

    try { global._dbAdapter?.instance?.close?.(); } catch {}
    delete global._dbAdapter;
    vi.resetModules();

    const dbDriver = await import("@/lib/db/driver.js");
    getAdapter = dbDriver.getAdapter;

    const db = await getAdapter();
    db.run(`
      CREATE TABLE IF NOT EXISTS apiKeys (
        id TEXT PRIMARY KEY,
        key TEXT UNIQUE NOT NULL,
        name TEXT,
        machineId TEXT,
        isActive INTEGER DEFAULT 1,
        createdAt TEXT NOT NULL
      )
    `);

    apiKeysRepo = await import("@/lib/db/repos/apiKeysRepo.js");
  });

  afterEach(() => {
    if (originalDataDir === undefined) {
      delete process.env.DATA_DIR;
    } else {
      process.env.DATA_DIR = originalDataDir;
    }
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("createApiKey: generates key bound to machineId and persists", async () => {
    const created = await apiKeysRepo.createApiKey("work", "machine-1");

    expect(created.id).toBeTruthy();
    expect(created.name).toBe("work");
    expect(created.machineId).toBe("machine-1");
    expect(created.key).toMatch(/^[A-Za-z0-9-]+/);
    expect(created.isActive).toBe(true);

    const db = await getAdapter();
    const row = db.get("SELECT * FROM apiKeys WHERE id = ?", [created.id]);
    expect(row.key).toBe(created.key);
  });

  it("createApiKey: throws without machineId", async () => {
    await expect(apiKeysRepo.createApiKey("work", null)).rejects.toThrow("machineId is required");
  });

  it("validateApiKey: true for active key, false for inactive/unknown", async () => {
    const created = await apiKeysRepo.createApiKey("work", "machine-1");

    expect(await apiKeysRepo.validateApiKey(created.key)).toBe(true);
    expect(await apiKeysRepo.validateApiKey("sk-nope")).toBe(false);

    await apiKeysRepo.updateApiKey(created.id, { isActive: false });
    expect(await apiKeysRepo.validateApiKey(created.key)).toBe(false);
  });

  it("updateApiKey: updates name and active state atomically", async () => {
    const created = await apiKeysRepo.createApiKey("work", "machine-1");

    const updated = await apiKeysRepo.updateApiKey(created.id, { name: "renamed" });
    expect(updated.name).toBe("renamed");
    expect(await apiKeysRepo.getApiKeyById(created.id)).toMatchObject({ name: "renamed" });

    // unknown id → null
    expect(await apiKeysRepo.updateApiKey("missing", { name: "x" })).toBeNull();
  });

  it("deleteApiKey: removes row", async () => {
    const created = await apiKeysRepo.createApiKey("work", "machine-1");
    expect(await apiKeysRepo.deleteApiKey(created.id)).toBe(true);
    expect(await apiKeysRepo.deleteApiKey(created.id)).toBe(false);
    expect(await apiKeysRepo.getApiKeys()).toHaveLength(0);
  });
});
