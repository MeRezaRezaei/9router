import { describe, it, expect } from "vitest";
import {
  generateCodeVerifier,
  generateCodeChallenge,
  generateState,
  generatePKCE,
} from "@/lib/oauth/utils/pkce";

describe("pkce", () => {
  it("generateCodeVerifier: 43+ chars, base64url charset", () => {
    const v = generateCodeVerifier();
    expect(v.length).toBeGreaterThanOrEqual(43);
    expect(v).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("generateCodeChallenge: S256 of verifier, base64url", () => {
    const v = generateCodeVerifier();
    const c = generateCodeChallenge(v);
    expect(c).toMatch(/^[A-Za-z0-9_-]+$/);
    // deterministic
    expect(generateCodeChallenge(v)).toBe(c);
  });

  it("generateState: distinct random values", () => {
    expect(generateState()).not.toBe(generateState());
  });

  it("generatePKCE: returns verifier+challenge+state with matching pair", () => {
    const { codeVerifier, codeChallenge, state } = generatePKCE();
    expect(generateCodeChallenge(codeVerifier)).toBe(codeChallenge);
    expect(state).toBeTruthy();
  });

  it("generateCodeVerifier: honors byte count (xAI uses 96)", () => {
    const v = generateCodeVerifier(96);
    expect(v.length).toBe(128); // 96 bytes → 128 base64url chars
  });
});
