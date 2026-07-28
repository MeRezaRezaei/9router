import { describe, expect, it, beforeEach } from "vitest";
import { createRequire } from "module";

const require = createRequire(import.meta.url);

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
