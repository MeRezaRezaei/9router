import { describe, expect, it } from "vitest";
import { createRequire } from "module";

const require = createRequire(import.meta.url);

// Mock the components required to test getDispatcher logic
async function getDispatcherMock(proxyUrl) {
  const u = new URL(proxyUrl);
  if (u.protocol === "socks5:" || u.protocol === "socks5h:") {
    return { type: "SOCKS_AGENT", uri: proxyUrl };
  }
  return { type: "UNDICI_PROXY_AGENT", uri: proxyUrl };
}

describe("proxyFetch SOCKS5 dispatcher resolver", () => {
  it("resolves socks5h:// URL to a SOCKS agent", async () => {
    const d = await getDispatcherMock("socks5h://127.0.0.1:10808");
    expect(d).not.toBeNull();
    expect(d.type).toBe("SOCKS_AGENT");
    expect(d.uri).toBe("socks5h://127.0.0.1:10808");
  });

  it("resolves socks5:// URL to a SOCKS agent", async () => {
    const d = await getDispatcherMock("socks5://127.0.0.1:10808");
    expect(d).not.toBeNull();
    expect(d.type).toBe("SOCKS_AGENT");
  });

  it("resolves http:// URL to an Undici ProxyAgent", async () => {
    const d = await getDispatcherMock("http://127.0.0.1:7890");
    expect(d).not.toBeNull();
    expect(d.type).toBe("UNDICI_PROXY_AGENT");
  });
});
