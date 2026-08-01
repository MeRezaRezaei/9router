import { describe, expect, it, afterEach, vi } from "vitest";

// Mock net.Socket connect
let mockConnectCalled = false;
let lastConnectHost = null;
let lastConnectPort = null;

vi.mock("net", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    default: {
      ...actual.default,
      Socket: class MockSocket extends actual.Socket {
        connect(port, host, cb) {
          mockConnectCalled = true;
          lastConnectHost = host;
          lastConnectPort = port;
          if (typeof cb === "function") cb();
          setTimeout(() => this.emit("connect"), 5);
          return this;
        }
      }
    }
  };
});

// Mock https.request
let mockRequestCalled = false;
vi.mock("https", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    default: {
      ...actual.default,
      request: (options, callback) => {
        mockRequestCalled = true;
        
        const { Readable } = require("stream");
        const mockRes = Readable.from(["{}"]);
        mockRes.statusCode = 200;
        mockRes.headers = {};
        mockRes.statusMessage = "OK";
        
        if (typeof callback === "function") {
          setTimeout(() => callback(mockRes), 5);
        }

        const mockReq = {
          on: vi.fn(),
          write: vi.fn(),
          end: vi.fn()
        };
        return mockReq;
      }
    }
  };
});

describe("MITM Upstream Isolation & Port configs", () => {
  afterEach(() => {
    delete process.env.MITM_UPSTREAM_IP_MAP;
    delete process.env.MITM_UPSTREAM_PORT;
    delete process.env.MITM_DNS_SERVERS;
    vi.unstubAllEnvs();
    mockConnectCalled = false;
    lastConnectHost = null;
    lastConnectPort = null;
    mockRequestCalled = false;
  });

  it("respects process.env.MITM_UPSTREAM_IP_MAP and MITM_UPSTREAM_PORT", async () => {
    process.env.MITM_UPSTREAM_IP_MAP = "api2.cursor.sh:127.0.0.99";
    process.env.MITM_UPSTREAM_PORT = "8443";

    // Dynamically import to ensure fresh environment evaluation
    const { proxyAwareFetch } = await import("../../open-sse/utils/proxyFetch.js");

    try {
      await proxyAwareFetch("https://api2.cursor.sh/v1/chat/completions", {
        method: "POST",
        body: JSON.stringify({ model: "gpt-4" })
      });
    } catch {
      // Ignore response conversion errors since socket/https are mocked
    }

    expect(mockConnectCalled).toBe(true);
    expect(lastConnectHost).toBe("127.0.0.99");
    expect(lastConnectPort).toBe(8443);
  });
});
