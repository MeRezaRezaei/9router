import { ProxyAgent, Agent, fetch as undiciFetch } from "undici";
import { SocksClient } from "socks";
import tls from "tls";

const DEFAULT_TEST_URL = "https://google.com/";
const DEFAULT_TIMEOUT_MS = 8000;

function getErrorMessage(err) {
  if (!err) return "Unknown error";
  const base = err?.message || String(err);
  const causeCode = err?.cause?.code || err?.code;
  const causeMessage = err?.cause?.message;

  if (causeMessage && causeMessage !== base) {
    return causeCode ? `${base}: ${causeMessage} (${causeCode})` : `${base}: ${causeMessage}`;
  }

  if (causeCode && !base.includes(causeCode)) {
    return `${base} (${causeCode})`;
  }

  return base;
}

function normalizeString(value) {
  if (value === undefined || value === null) return "";
  return String(value).trim();
}

export async function testProxyUrl({ proxyUrl, testUrl, timeoutMs } = {}) {
  const normalizedProxyUrl = normalizeString(proxyUrl);
  if (!normalizedProxyUrl) {
    return { ok: false, status: 400, error: "proxyUrl is required" };
  }

  const normalizedTestUrl = normalizeString(testUrl) || DEFAULT_TEST_URL;
  const timeoutMsRaw = Number(timeoutMs);
  const normalizedTimeoutMs =
    Number.isFinite(timeoutMsRaw) && timeoutMsRaw > 0
      ? Math.min(timeoutMsRaw, 30000)
      : DEFAULT_TIMEOUT_MS;

  let dispatcher;

  try {
    try {
      const u = new URL(normalizedProxyUrl);
      if (u.protocol === "socks5:" || u.protocol === "socks5h:") {
        dispatcher = new Agent({
          connect: async (opts, callback) => {
            try {
              const port = opts.port ? parseInt(opts.port, 10) : (opts.protocol === 'https:' ? 443 : 80);
              const { socket } = await SocksClient.createConnection({
                proxy: {
                  host: u.hostname,
                  port: parseInt(u.port || "1080", 10),
                  type: 5,
                  userId: u.username || undefined,
                  password: u.password || undefined,
                },
                command: 'connect',
                destination: {
                  host: opts.hostname,
                  port
                }
              });
              if (opts.protocol === 'https:') {
                const tlsSocket = tls.connect({
                  socket,
                  servername: opts.hostname,
                  rejectUnauthorized: false
                }, () => {
                  callback(null, tlsSocket);
                });
                tlsSocket.once('error', callback);
              } else {
                callback(null, socket);
              }
            } catch (e) {
              callback(e);
            }
          }
        });
      } else {
        dispatcher = new ProxyAgent({ uri: normalizedProxyUrl });
      }
    } catch (err) {
      return {
        ok: false,
        status: 400,
        error: `Invalid proxy URL: ${err?.message || String(err)}`,
      };
    }

    const controller = new AbortController();
    const startedAt = Date.now();
    const timer = setTimeout(() => controller.abort(), normalizedTimeoutMs);

    try {
      const res = await undiciFetch(normalizedTestUrl, {
        method: "HEAD",
        dispatcher,
        signal: controller.signal,
        headers: {
          "User-Agent": "9Router",
        },
      });

      return {
        ok: res.ok,
        status: res.status,
        statusText: res.statusText,
        url: normalizedTestUrl,
        elapsedMs: Date.now() - startedAt,
      };
    } catch (err) {
      const message =
        err?.name === "AbortError"
          ? "Proxy test timed out"
          : getErrorMessage(err);
      return { ok: false, status: 500, error: message };
    } finally {
      clearTimeout(timer);
    }
  } finally {
    try {
      await dispatcher?.close?.();
    } catch {
      // ignore
    }
  }
}
