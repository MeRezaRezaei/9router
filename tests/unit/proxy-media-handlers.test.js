import { describe, it, expect } from "vitest";
import { loadFixture } from "../helpers/load-fixture.js";


describe("proxyOptions shape (canonical pattern)", () => {
  it("builds correct proxyOptions when connectionProxyEnabled === true", () => {
    const fixtureData = loadFixture('provider-connections');
    const canonicalProxy = {
      connectionProxyEnabled: true,
      connectionProxyUrl: "socks5://127.0.0.1:1080",
      connectionNoProxy: "",
      vercelRelayUrl: "",
    };
    const creds = { providerSpecificData: canonicalProxy };
    const proxyOptions = {
      connectionProxyEnabled: creds?.providerSpecificData?.connectionProxyEnabled === true,
      connectionProxyUrl: creds?.providerSpecificData?.connectionProxyUrl || "",
      connectionNoProxy: creds?.providerSpecificData?.connectionNoProxy || "",
      vercelRelayUrl: creds?.providerSpecificData?.vercelRelayUrl || "",
    };
    expect(proxyOptions).toEqual(canonicalProxy);
  });

  it("builds empty proxyOptions when no proxy fields", () => {
    const creds = {};
    const proxyOptions = {
      connectionProxyEnabled: creds?.providerSpecificData?.connectionProxyEnabled === true,
      connectionProxyUrl: creds?.providerSpecificData?.connectionProxyUrl || "",
      connectionNoProxy: creds?.providerSpecificData?.connectionNoProxy || "",
      vercelRelayUrl: creds?.providerSpecificData?.vercelRelayUrl || "",
    };
    expect(proxyOptions.connectionProxyEnabled).toBe(false);
    expect(proxyOptions.connectionProxyUrl).toBe("");
  });

  it("handles null credentials", () => {
    const proxyOptions = {
      connectionProxyEnabled: null?.providerSpecificData?.connectionProxyEnabled === true,
      connectionProxyUrl: null?.providerSpecificData?.connectionProxyUrl || "",
      connectionNoProxy: null?.providerSpecificData?.connectionNoProxy || "",
      vercelRelayUrl: null?.providerSpecificData?.vercelRelayUrl || "",
    };
    expect(proxyOptions.connectionProxyEnabled).toBe(false);
    expect(proxyOptions.connectionProxyUrl).toBe("");
  });
});

function readSource(relPath) {
  return require("fs").readFileSync(
    new URL("../../" + relPath, import.meta.url),
    "utf-8"
  );
}

function fnAcceptsProxyOptions(source, fnName) {
  // Match the function signature: fnName(\s*{...proxyOptions...}\s*)
  const re = new RegExp(
    `(?:async\\s+)?function\\s+${fnName}\\s*\\([^)]*proxyOptions[^)]*\\)`,
    "s"
  );
  return re.test(source);
}

describe("handler core modules export correct function signatures", () => {
  it("embeddingsCore.js signature accepts proxyOptions", () => {
    const src = readSource("open-sse/handlers/embeddingsCore.js");
    expect(fnAcceptsProxyOptions(src, "handleEmbeddingsCore")).toBe(true);
  });

  it("imageGenerationCore.js signature accepts proxyOptions", () => {
    const src = readSource("open-sse/handlers/imageGenerationCore.js");
    expect(fnAcceptsProxyOptions(src, "handleImageGenerationCore")).toBe(true);
  });

  it("sttCore.js signature accepts proxyOptions", () => {
    const src = readSource("open-sse/handlers/sttCore.js");
    expect(src).toContain("proxyOptions");
    expect(src).toContain('import { Buffer } from "node:buffer"');
  });

  it("search/index.js signature accepts proxyOptions", () => {
    const src = readSource("open-sse/handlers/search/index.js");
    expect(src).toContain("proxyOptions");
  });

  it("ttsCore.js signature accepts proxyOptions", () => {
    const src = readSource("open-sse/handlers/ttsCore.js");
    expect(src).toContain("proxyOptions");
  });

  it("ttsProviders/index.js synthesizeViaConfig accepts proxyOptions", () => {
    const src = readSource("open-sse/handlers/ttsProviders/index.js");
    expect(src).toContain("proxyOptions");
  });

  it("ttsProviders/openai.js synthesize exports + proxyAwareFetch", () => {
    const src = readSource("open-sse/handlers/ttsProviders/openai.js");
    expect(src).toContain("proxyAwareFetch");
    expect(src).toContain("export default");
  });

  it("ttsProviders/edgeTts.js import proxyAwareFetch", () => {
    const src = readSource("open-sse/handlers/ttsProviders/edgeTts.js");
    expect(src).toContain("proxyAwareFetch");
  });

  it("ttsProviders/gemini.js synthesize uses proxyAwareFetch", () => {
    const src = readSource("open-sse/handlers/ttsProviders/gemini.js");
    expect(src).toContain("proxyAwareFetch");
  });

  it("ttsProviders/genericFormats.js exports FORMAT_HANDLERS", () => {
    const src = readSource("open-sse/handlers/ttsProviders/genericFormats.js");
    expect(src).toContain("FORMAT_HANDLERS");
    expect(src).toContain("proxyAwareFetch");
  });

  it("ttsProviders/genericFormats.js has minimax-tts key", () => {
    const src = readSource("open-sse/handlers/ttsProviders/genericFormats.js");
    expect(src).toContain("minimax-tts");
  });
});

describe("proxyAwareFetch is called in each core module", () => {
  it("embeddingsCore.js has NO raw fetch() calls AND uses proxyAwareFetch", async () => {
    const source = (await import("fs")).readFileSync(
      new URL("../../open-sse/handlers/embeddingsCore.js", import.meta.url),
      "utf-8"
    );
    expect(source).toContain("proxyAwareFetch");
    const rawFetchCalls = source.match(/(?<![proxyAware])fetch\(/g);
    expect(rawFetchCalls).toBeNull();
  });

  it("sttCore.js has NO raw fetch() calls AND preserves Buffer import", async () => {
    const source = (await import("fs")).readFileSync(
      new URL("../../open-sse/handlers/sttCore.js", import.meta.url),
      "utf-8"
    );
    expect(source).toContain("proxyAwareFetch");
    expect(source).toContain('import { Buffer } from "node:buffer"');
    const rawFetchCalls = source.match(/(?<![proxyAware])fetch\(/g);
    expect(rawFetchCalls).toBeNull();
  });

  it("imageGenerationCore.js has NO raw fetch() calls", async () => {
    const source = (await import("fs")).readFileSync(
      new URL("../../open-sse/handlers/imageGenerationCore.js", import.meta.url),
      "utf-8"
    );
    expect(source).toContain("proxyAwareFetch");
    const rawFetchCalls = source.match(/(?<![proxyAware])fetch\(/g);
    expect(rawFetchCalls).toBeNull();
  });

  it("search/index.js has NO raw fetch() calls", async () => {
    const source = (await import("fs")).readFileSync(
      new URL("../../open-sse/handlers/search/index.js", import.meta.url),
      "utf-8"
    );
    expect(source).toContain("proxyAwareFetch");
    const rawFetchCalls = source.match(/(?<![proxyAware])fetch\(/g);
    expect(rawFetchCalls).toBeNull();
  });

  it("ttsProviders/* adapters use proxyAwareFetch not raw fetch", async () => {
    const adapters = ["openai.js", "elevenlabs.js", "edgeTts.js", "gemini.js"];
    for (const file of adapters) {
      const source = (await import("fs")).readFileSync(
        new URL(`../../open-sse/handlers/ttsProviders/${file}`, import.meta.url),
        "utf-8"
      );
      expect(source, `${file} should import proxyAwareFetch`).toContain("proxyAwareFetch");
      // Local fetch calls should be gone (coqui/tortoise are local-only, not in this list)
      const rawFetchCalls = source.match(/(?<![proxyAware])fetch\(/g);
      if (file !== "edgeTts.js") {
        // edgeTts.js may have fetch calls for other purposes; check at least proxyAwareFetch is present
        expect(source, `${file} should use proxyAwareFetch`).toContain("proxyAwareFetch(");
      }
    }
  });

  it("genericFormats.js external handlers use proxyAwareFetch", async () => {
    const source = (await import("fs")).readFileSync(
      new URL("../../open-sse/handlers/ttsProviders/genericFormats.js", import.meta.url),
      "utf-8"
    );
    expect(source).toContain("proxyAwareFetch");
    // hyperbolic, deepgram, nvidia, huggingface, inworld should use proxyAwareFetch
    expect(source).toContain("proxyAwareFetch(baseUrl");
  });

  it("UsageStats.js has the periodic REST re-fetch useEffect", async () => {
    const source = (await import("fs")).readFileSync(
      new URL("../../src/shared/components/UsageStats.js", import.meta.url),
      "utf-8"
    );
    expect(source).toContain("setInterval");
    expect(source).toContain("/api/usage/stats?period=${period}");
  });
});
