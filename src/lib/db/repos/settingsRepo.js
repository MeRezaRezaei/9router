import { getAdapter } from "../driver.js";
import { parseJson, stringifyJson } from "../helpers/jsonCol.js";
import { redisGet, redisSet, redisClearPrefix } from "../../redis.js";
import { vaultRead, vaultWrite } from "../../vault.js";

const DEFAULT_MITM_ROUTER_BASE = "http://localhost:20129";
const DEFAULT_HEADROOM_URL = process.env.HEADROOM_URL || "http://localhost:8787";

const DEFAULT_SETTINGS = {
  cloudEnabled: false,
  tunnelEnabled: false,
  tunnelUrl: "",
  tunnelProvider: "cloudflare",
  tailscaleEnabled: false,
  tailscaleUrl: "",
  stickyRoundRobinLimit: 3,
  providerStrategies: {},
  quotaVisibility: {},
  comboStrategy: "fallback",
  comboStickyRoundRobinLimit: 1,
  comboStrategies: {},
  requireLogin: true,
  tunnelDashboardAccess: true,
  authMode: "password",
  oidcIssuerUrl: "",
  oidcClientId: "",
  oidcClientSecret: "",
  oidcScopes: "openid profile email",
  oidcLoginLabel: "Sign in with OIDC",
  enableObservability: true,
  observabilityMaxRecords: 1000,
  observabilityBatchSize: 20,
  observabilityFlushIntervalMs: 5000,
  observabilityMaxJsonSize: 5,
  outboundProxyEnabled: false,
  outboundProxyUrl: "",
  outboundNoProxy: "",
  outboundProxyKillSwitch: false,
  mitmRouterBaseUrl: DEFAULT_MITM_ROUTER_BASE,
  // SOCKS5/SOCKS5h upstream proxy for MITM outbound connections.
  // When enabled, all upstream TLS connections from the MITM server (ALPN
  // probe, HTTP/2, HTTP/1.1 passthrough) tunnel through this proxy.
  // socks5h:// = proxy resolves DNS (recommended — prevents DNS leaks).
  // socks5://  = local DNS resolution, proxy tunnels TCP only.
  // Kill switch: disable this without stopping the MITM server entirely.
  mitmSocksProxyEnabled: false,
  mitmSocksProxyUrl: "",
  dnsToolEnabled: {},
  rtkEnabled: true,
  headroomEnabled: false,
  headroomUrl: DEFAULT_HEADROOM_URL,
  headroomCompressUserMessages: false,
  cavemanEnabled: false,
  cavemanLevel: "full",
  ponytailEnabled: false,
  ponytailLevel: "full",
  pxpipeEnabled: false,
  pxpipeAutoInstall: true,
  pxpipeMinChars: 25000,
  pxpipeTimeoutMs: 15000,
  modelAggregationEnabled: false,
};

async function readRaw() {
  const db = await getAdapter();
  const row = db.get(`SELECT data FROM settings WHERE id = 1`);
  return row ? parseJson(row.data, {}) : {};
}

let vaultWarningShown = false;
function vaultActive() {
  return !!(process.env.VAULT_ADDR && process.env.VAULT_TOKEN);
}
function warnVaultInactive() {
  if (!vaultWarningShown) {
    vaultWarningShown = true;
    console.warn("[settingsRepo] VAULT_ADDR/VAULT_TOKEN not set — oidcClientSecret stored in SQLite plaintext. Configure Vault to store it securely.");
  }
}

// Merge raw settings with defaults; backward-compat for missing keys
function mergeWithDefaults(raw) {
  const merged = { ...DEFAULT_SETTINGS, ...(raw || {}) };
  for (const [key, defVal] of Object.entries(DEFAULT_SETTINGS)) {
    if (merged[key] === undefined) {
      if (
        key === "outboundProxyEnabled" &&
        typeof merged.outboundProxyUrl === "string" &&
        merged.outboundProxyUrl.trim()
      ) {
        merged[key] = true;
      } else {
        merged[key] = defVal;
      }
    }
  }
  return merged;
}

export async function getSettings() {
  const cacheKey = "9router:cache:settings";
  const cached = await redisGet(cacheKey);
  if (cached) return cached;

  const raw = await readRaw();
  const res = mergeWithDefaults(raw);

  if (vaultActive()) {
    const secrets = await vaultRead("settings");
    if (secrets) {
      Object.assign(res, secrets);
    }
  }

  await redisSet(cacheKey, res, 300);
  return res;
}

// Atomic read-merge-write inside transaction (prevents losing concurrent updates)
export async function updateSettings(updates) {
  const db = await getAdapter();
  let next;
  let secretsToWrite = null;

  db.transaction(() => {
    const row = db.get(`SELECT data FROM settings WHERE id = 1`);
    const current = row ? parseJson(row.data, {}) : {};
    next = { ...current, ...updates };

    if (vaultActive()) {
      const secrets = {};
      let hasSecrets = false;
      // Migrate legacy plaintext secret from the row AND pick up any new one
      if (next.oidcClientSecret !== undefined) {
        secrets.oidcClientSecret = next.oidcClientSecret;
        hasSecrets = true;
      }
      delete next.oidcClientSecret;
      if (hasSecrets) {
        secretsToWrite = secrets;
      }
    } else if (next.oidcClientSecret !== undefined) {
      warnVaultInactive();
    }

    db.run(
      `INSERT INTO settings(id, data) VALUES(1, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data`,
      [stringifyJson(next)]
    );
  });

  if (secretsToWrite) {
    await vaultWrite("settings", secretsToWrite);
  }

  await redisClearPrefix("9router:cache:settings");
  const finalSettings = mergeWithDefaults(next);
  if (secretsToWrite) {
    Object.assign(finalSettings, secretsToWrite);
  }
  return finalSettings;
}

export async function isCloudEnabled() {
  const settings = await getSettings();
  return settings.cloudEnabled === true;
}

export async function getCloudUrl() {
  const settings = await getSettings();
  return (
    settings.cloudUrl ||
    process.env.CLOUD_URL ||
    process.env.NEXT_PUBLIC_CLOUD_URL ||
    ""
  );
}

export async function exportSettings() {
  const raw = await readRaw();
  // Never export credentials — they live in Vault, not the settings row
  delete raw.oidcClientSecret;
  return raw;
}
