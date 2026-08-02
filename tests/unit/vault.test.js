import { describe, it, expect, vi, beforeEach } from "vitest";

vi.hoisted(() => {
  process.env.VAULT_ADDR = "http://localhost:8200";
  process.env.VAULT_TOKEN = "test-token";
});

// Import vault module
import { vaultRead, vaultWrite, vaultDelete } from "../../src/lib/vault.js";

describe("Vault client integration", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("vaultRead: returns data on success", async () => {
    const mockJson = { data: { data: { apiKey: "secret-key" } } };
    const mockFetch = vi.fn().mockResolvedValue({
      status: 200,
      ok: true,
      json: async () => mockJson,
    });
    vi.stubGlobal("fetch", mockFetch);

    const result = await vaultRead("conn-id");
    expect(mockFetch).toHaveBeenCalledWith(
      "http://localhost:8200/v1/secret/data/9router/connections/conn-id",
      expect.objectContaining({
        headers: { "X-Vault-Token": "test-token" },
      })
    );
    expect(result).toEqual({ apiKey: "secret-key" });
  });

  it("vaultRead: returns null on 404", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      status: 404,
      ok: false,
    });
    vi.stubGlobal("fetch", mockFetch);

    const result = await vaultRead("conn-id");
    expect(result).toBeNull();
  });

  it("vaultRead: returns null and logs on other error", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const mockFetch = vi.fn().mockResolvedValue({
      status: 500,
      ok: false,
      statusText: "Internal Error",
    });
    vi.stubGlobal("fetch", mockFetch);

    const result = await vaultRead("conn-id");
    expect(result).toBeNull();
    expect(consoleSpy).toHaveBeenCalled();
  });

  it("vaultWrite: performs POST request", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
    });
    vi.stubGlobal("fetch", mockFetch);

    await vaultWrite("conn-id", { apiKey: "new-secret" });
    expect(mockFetch).toHaveBeenCalledWith(
      "http://localhost:8200/v1/secret/data/9router/connections/conn-id",
      expect.objectContaining({
        method: "POST",
        headers: {
          "X-Vault-Token": "test-token",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ data: { apiKey: "new-secret" } }),
      })
    );
  });

  it("vaultDelete: deletes version and metadata", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
    });
    vi.stubGlobal("fetch", mockFetch);

    await vaultDelete("conn-id");
    expect(mockFetch).toHaveBeenCalledWith(
      "http://localhost:8200/v1/secret/data/9router/connections/conn-id",
      expect.objectContaining({ method: "DELETE" })
    );
    expect(mockFetch).toHaveBeenCalledWith(
      "http://localhost:8200/v1/secret/metadata/9router/connections/conn-id",
      expect.objectContaining({ method: "DELETE" })
    );
  });
});
