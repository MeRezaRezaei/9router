import { describe, it, expect, vi, beforeEach } from "vitest";

const localDbMock = vi.hoisted(() => ({ getSettings: vi.fn() }));
vi.mock("@/lib/localDb", () => localDbMock);

import {
  OIDC_COOKIE_NAMES,
  getPublicOrigin,
  isOidcConfigured,
  getOidcRuntimeConfig,
  fetchOidcDiscovery,
  createPkcePair,
  createOidcState,
  createOidcNonce,
  buildOidcAuthorizationUrl,
  exchangeOidcCode,
  probeOidcClientSecret,
  pickOidcDisplayName,
  pickOidcEmail,
} from "@/lib/auth/oidc";

describe("oidc", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    localDbMock.getSettings.mockReset();
  });

  it("getPublicOrigin: prefers configured BASE_URL, then forwarded headers, then request origin", () => {
    const req = (headers, url = "https://app.local/cb") => ({
      url,
      headers: { get: (k) => headers[k] ?? null },
    });

    const prev = process.env.BASE_URL;
    try {
      delete process.env.BASE_URL;
      delete process.env.NEXT_PUBLIC_BASE_URL;

      expect(getPublicOrigin(req({ "x-forwarded-proto": "https", "x-forwarded-host": "gw.example.com" }))).toBe("https://gw.example.com");
      expect(getPublicOrigin(req({ "x-forwarded-proto": "http", host: "h:3000" }))).toBe("http://h:3000");
      expect(getPublicOrigin(req({}, "https://oid.local/x"))).toBe("https://oid.local");

      process.env.BASE_URL = "https://fixed.example.com/";
      expect(getPublicOrigin(req({}))).toBe("https://fixed.example.com");
    } finally {
      delete process.env.BASE_URL;
      delete process.env.NEXT_PUBLIC_BASE_URL;
      if (prev !== undefined) process.env.BASE_URL = prev;
    }
  });

  it("isOidcConfigured: requires issuer + clientId + secret", () => {
    expect(isOidcConfigured({})).toBe(false);
    expect(isOidcConfigured({ oidcIssuerUrl: "https://x", oidcClientId: "a", oidcClientSecret: "b" })).toBe(true);
  });

  it("getOidcRuntimeConfig: null unless authMode oidc/both and configured", async () => {
    localDbMock.getSettings.mockResolvedValue({ authMode: "password", oidcIssuerUrl: "" });
    expect(await getOidcRuntimeConfig()).toBeNull();

    localDbMock.getSettings.mockResolvedValue({
      authMode: "oidc",
      oidcIssuerUrl: "https://issuer.example.com/",
      oidcClientId: "  client-id  ",
      oidcClientSecret: "secret",
      oidcLoginLabel: "",
    });
    const cfg = await getOidcRuntimeConfig();
    expect(cfg.issuerUrl).toBe("https://issuer.example.com");
    expect(cfg.clientId).toBe("client-id");
    expect(cfg.scopes).toBe("openid profile email");
    expect(cfg.loginLabel).toBe("Sign in with OIDC");
  });

  it("fetchOidcDiscovery: GETs well-known doc, throws on non-ok", async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ issuer: "https://i" }) });
    expect(await fetchOidcDiscovery("https://issuer.example.com/")).toEqual({ issuer: "https://i" });
    expect(global.fetch).toHaveBeenCalledWith("https://issuer.example.com/.well-known/openid-configuration", { cache: "no-store" });

    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 404, json: async () => ({}) });
    await expect(fetchOidcDiscovery("https://x")).rejects.toThrow("Failed to load OIDC discovery document");
  });

  it("createPkcePair/createOidcState/createOidcNonce: random and distinct", () => {
    const a = createPkcePair();
    const b = createPkcePair();
    expect(a.verifier).not.toBe(a.challenge);
    expect(b.verifier).not.toBe(a.verifier);
    expect(createOidcState()).not.toBe(createOidcState());
    expect(createOidcNonce()).not.toBe(createOidcNonce());
  });

  it("buildOidcAuthorizationUrl: encodes code/challenge params", () => {
    const url = buildOidcAuthorizationUrl({
      authorizationEndpoint: "https://issuer.example.com/authorize",
      clientId: "c1",
      redirectUri: "https://gw/cb",
      scopes: "openid email",
      state: "st",
      nonce: "nn",
      codeChallenge: "ch",
    });
    const u = new URL(url);
    expect(u.searchParams.get("response_type")).toBe("code");
    expect(u.searchParams.get("client_id")).toBe("c1");
    expect(u.searchParams.get("redirect_uri")).toBe("https://gw/cb");
    expect(u.searchParams.get("scope")).toBe("openid email");
    expect(u.searchParams.get("state")).toBe("st");
    expect(u.searchParams.get("nonce")).toBe("nn");
    expect(u.searchParams.get("code_challenge")).toBe("ch");
    expect(u.searchParams.get("code_challenge_method")).toBe("S256");
  });

  it("exchangeOidcCode: posts form body, throws on error", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ access_token: "at" }),
    });
    const data = await exchangeOidcCode({
      tokenEndpoint: "https://issuer/token",
      clientId: "c1",
      clientSecret: "s",
      code: "code1",
      redirectUri: "https://gw/cb",
      codeVerifier: "v1",
    });
    expect(data.access_token).toBe("at");

    const bodyArg = global.fetch.mock.calls[0][1].body;
    expect(bodyArg.get("grant_type")).toBe("authorization_code");
    expect(bodyArg.get("client_secret")).toBe("s");
    expect(bodyArg.get("code_verifier")).toBe("v1");

    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ error: "invalid_grant", error_description: "bad code" }),
    });
    await expect(exchangeOidcCode({ tokenEndpoint: "https://issuer/token", clientId: "c1", code: "x", redirectUri: "https://cb", codeVerifier: "v" }))
      .rejects.toThrow("bad code");
  });

  it("probeOidcClientSecret: distinguishes invalid_client vs invalid_grant", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ error: "invalid_client", error_description: "Client authentication failed" }),
    });
    const bad = await probeOidcClientSecret({ tokenEndpoint: "https://issuer/token", clientId: "c", clientSecret: "wrong", redirectUri: "https://cb" });
    expect(bad.tested).toBe(true);
    expect(bad.valid).toBe(false);

    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ error: "invalid_grant", error_description: "code is expired" }),
    });
    const ok = await probeOidcClientSecret({ tokenEndpoint: "https://issuer/token", clientId: "c", clientSecret: "right", redirectUri: "https://cb" });
    expect(ok.valid).toBe(true);

    const skipped = await probeOidcClientSecret({ tokenEndpoint: "https://issuer/token", clientId: "c", clientSecret: "", redirectUri: "https://cb" });
    expect(skipped.tested).toBe(false);
  });

  it("pickOidcDisplayName/pickOidcEmail: sensible fallbacks", () => {
    expect(pickOidcDisplayName({ preferred_username: "u", email: "e@x" })).toBe("u");
    expect(pickOidcDisplayName({ email: "e@x" })).toBe("e@x");
    expect(pickOidcDisplayName({})).toBe("OIDC user");
    expect(pickOidcEmail({ email: "e@x" })).toBe("e@x");
    expect(pickOidcEmail({})).toBe("");
  });
});