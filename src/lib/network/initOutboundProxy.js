import { getSettings } from "@/lib/localDb";
import { applyOutboundProxyEnv } from "@/lib/network/outboundProxy";
import { testProxyUrl } from "@/lib/network/proxyTest";

let initialized = false;

export async function ensureOutboundProxyInitialized() {
  if (initialized) return true;

  try {
    const settings = await getSettings();
    applyOutboundProxyEnv(settings);

    // Startup probe: verify proxy actually routes traffic
    if (settings.outboundProxyEnabled && settings.outboundProxyUrl) {
      const result = await testProxyUrl({ proxyUrl: settings.outboundProxyUrl });
      if (result?.ok) {
        console.log(`[ServerInit] Proxy probe OK (${result.status}) in ${result.elapsedMs}ms`);
      } else {
        const errorMsg = result?.error || "Unknown error";
        if (settings.outboundProxyKillSwitch) {
          console.error(`[ServerInit] ❌ CRITICAL: Proxy kill switch is ON but proxy unreachable: ${errorMsg}`);
          console.error(`[ServerInit] ❌ All outbound requests will FAIL (strict proxy mode). Fix the proxy connection.`);
        } else {
          console.warn(`[ServerInit] ⚠️ Proxy probe failed: ${errorMsg}`);
          console.warn(`[ServerInit] ⚠️ Proxy enabled but unreachable. Requests will fallback to direct (no kill switch).`);
        }
      }
    }
    initialized = true;
  } catch (error) {
    console.error("[ServerInit] Error initializing outbound proxy:", error);
  }

  return initialized;
}

// Defer init so HTTP server accepts connections first
setImmediate(() => {
  ensureOutboundProxyInitialized().catch(console.log);
});

export default ensureOutboundProxyInitialized;
