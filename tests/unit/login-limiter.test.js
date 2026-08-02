import { describe, it, expect, beforeEach, vi } from "vitest";
import { checkLock, recordFail, recordSuccess, getClientIp } from "@/lib/auth/loginLimiter";

describe("loginLimiter", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("recordFail: locks after 5 fails with escalating lock durations", async () => {
    const { recordFail, checkLock } = await import("@/lib/auth/loginLimiter");
    const nowSpy = vi.spyOn(Date, "now");
    let t = 1_000_000;
    nowSpy.mockImplementation(() => t);

    for (let i = 0; i < 5; i++) recordFail("1.2.3.4");
    expect(checkLock("1.2.3.4").locked).toBe(true);
    expect(checkLock("1.2.3.4").retryAfter).toBe(30); // first step 30s

    // second lockout escalates to 120s
    t += 31_000; // wait past first lock
    for (let i = 0; i < 5; i++) recordFail("1.2.3.4");
    expect(checkLock("1.2.3.4").retryAfter).toBe(120);
  });

  it("checkLock: not locked when no failures", async () => {
    const { checkLock } = await import("@/lib/auth/loginLimiter");
    expect(checkLock("9.9.9.9")).toEqual({ locked: false });
  });

  it("recordSuccess: clears lock state", async () => {
    const { recordFail, checkLock, recordSuccess } = await import("@/lib/auth/loginLimiter");
    const nowSpy = vi.spyOn(Date, "now");
    nowSpy.mockImplementation(() => 1_000_000);

    for (let i = 0; i < 5; i++) recordFail("1.2.3.4");
    recordSuccess("1.2.3.4");
    expect(checkLock("1.2.3.4")).toEqual({ locked: false });
  });

  it("getClientIp: trusts x-9r-real-ip first, then XFF only behind TRUST_PROXY", () => {
    const req = (headers) => ({ headers: { get: (k) => headers[k] ?? null } });
    delete process.env.TRUST_PROXY;

    expect(getClientIp(req({ "x-9r-real-ip": "10.0.0.5" }))).toBe("10.0.0.5");
    // spoofed XFF ignored without TRUST_PROXY
    expect(getClientIp(req({ "x-forwarded-for": "evil" }))).toBe("unknown");
    // no headers → single unknown bucket
    expect(getClientIp(req({}))).toBe("unknown");

    process.env.TRUST_PROXY = "true";
    expect(getClientIp(req({ "x-forwarded-for": "9.8.7.6, 1.2.3.4" }))).toBe("9.8.7.6");
    delete process.env.TRUST_PROXY;
  });
});
