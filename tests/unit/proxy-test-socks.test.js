import { describe, expect, it } from "vitest";
import { testProxyUrl } from "../../src/lib/network/proxyTest.js";

describe("proxyTest SOCKS5 URL check", () => {
  it("rejects an invalid SOCKS5 URL structure", async () => {
    const res = await testProxyUrl({ proxyUrl: "socks5://:" });
    expect(res.ok).toBe(false);
    expect(res.status).toBe(400);
  });
});
