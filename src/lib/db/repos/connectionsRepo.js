import { v4 as uuidv4 } from "uuid";
import { getAdapter } from "../driver.js";
import { parseJson, stringifyJson } from "../helpers/jsonCol.js";
import { redisGet, redisSet, redisDel, redisClearPrefix } from "../../redis.js";
import { vaultRead, vaultWrite, vaultDelete } from "../../vault.js";

async function enrichSecrets(conn) {
  if (!conn) return null;
  const secrets = await vaultRead(conn.id);
  if (secrets) {
    Object.assign(conn, secrets);
  }
  return conn;
}

async function enrichSecretsList(list) {
  if (!list || list.length === 0) return list;
  await Promise.all(list.map(enrichSecrets));
  return list;
}

const OPTIONAL_FIELDS = [
  "displayName", "email", "globalPriority", "defaultModel",
  "accessToken", "refreshToken", "expiresAt", "tokenType",
  "scope", "projectId", "apiKey", "testStatus",
  "lastTested", "lastError", "lastErrorAt", "rateLimitedUntil", "expiresIn", "errorCode",
  "consecutiveUseCount", "idToken", "lastRefreshAt",
];

const SECRET_FIELDS = ["apiKey", "accessToken", "refreshToken", "idToken"];

let vaultWarningShown = false;
function warnVaultInactive() {
  if (!vaultWarningShown) {
    vaultWarningShown = true;
    console.warn("[connectionsRepo] VAULT_ADDR/VAULT_TOKEN not set — sensitive connection fields stored in SQLite plaintext. Configure Vault to store them securely.");
  }
}

function vaultActive() {
  return !!(process.env.VAULT_ADDR && process.env.VAULT_TOKEN);
}

function rowToConn(row) {
  if (!row) return null;
  const extra = parseJson(row.data, {});
  return {
    ...extra,
    id: row.id,
    provider: row.provider,
    authType: row.authType,
    name: row.name,
    email: row.email,
    priority: row.priority,
    isActive: row.isActive === 1 || row.isActive === true,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function connToRow(c) {
  const { id, provider, authType, name, email, priority, isActive, createdAt, updatedAt, ...rest } = c;
  return {
    id,
    provider,
    authType,
    name: name ?? null,
    email: email ?? null,
    priority: priority ?? null,
    isActive: isActive === false ? 0 : 1,
    data: stringifyJson(rest),
    createdAt,
    updatedAt,
  };
}

function upsert(db, c) {
  const r = connToRow(c);
  db.run(
    `INSERT INTO providerConnections(id, provider, authType, name, email, priority, isActive, data, createdAt, updatedAt)
     VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       provider=excluded.provider, authType=excluded.authType, name=excluded.name,
       email=excluded.email, priority=excluded.priority, isActive=excluded.isActive,
       data=excluded.data, updatedAt=excluded.updatedAt`,
    [r.id, r.provider, r.authType, r.name, r.email, r.priority, r.isActive, r.data, r.createdAt, r.updatedAt]
  );
}

function deriveConnectionName(data, fallbackName) {
  if (data.provider === "github") {
    return data.providerSpecificData?.githubLogin
      || data.providerSpecificData?.githubEmail
      || data.email
      || data.providerSpecificData?.githubName
      || fallbackName;
  }
  return fallbackName;
}

export async function getProviderConnections(filter = {}) {
  const cacheKey = `9router:cache:connections:${JSON.stringify(filter)}`;
  const cached = await redisGet(cacheKey);
  if (cached) return cached;

  const db = await getAdapter();
  const where = [];
  const params = [];
  if (filter.provider) { where.push("provider = ?"); params.push(filter.provider); }
  if (filter.isActive !== undefined) { where.push("isActive = ?"); params.push(filter.isActive ? 1 : 0); }
  const sql = `SELECT * FROM providerConnections${where.length ? ` WHERE ${where.join(" AND ")}` : ""}`;
  const rows = db.all(sql, params);
  const list = rows.map(rowToConn);
  list.sort((a, b) => (a.priority || 999) - (b.priority || 999));

  await enrichSecretsList(list);

  await redisSet(cacheKey, list, 300);
  return list;
}

export async function getProviderConnectionById(id) {
  const cacheKey = `9router:cache:connection:${id}`;
  const cached = await redisGet(cacheKey);
  if (cached) return cached;

  const db = await getAdapter();
  const row = db.get(`SELECT * FROM providerConnections WHERE id = ?`, [id]);
  const conn = rowToConn(row);
  const res = await enrichSecrets(conn);
  if (res) {
    await redisSet(cacheKey, res, 300);
  }
  return res;
}

// Internal sync reorder — must be called INSIDE a transaction
function reorderInTx(db, providerId) {
  const list = db.all(`SELECT * FROM providerConnections WHERE provider = ?`, [providerId]).map(rowToConn);
  list.sort((a, b) => {
    const pDiff = (a.priority || 0) - (b.priority || 0);
    if (pDiff !== 0) return pDiff;
    return new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0);
  });
  list.forEach((c, i) => {
    db.run(`UPDATE providerConnections SET priority = ? WHERE id = ?`, [i + 1, c.id]);
  });
}

export async function createProviderConnection(data) {
  const db = await getAdapter();
  const now = new Date().toISOString();
  let result;
  let secretsToWrite = null;

  db.transaction(() => {
    const all = db.all(`SELECT * FROM providerConnections WHERE provider = ?`, [data.provider]).map(rowToConn);

    let existing = null;
    if (data.authType === "oauth" && data.email) {
      const incomingUsername = data.providerSpecificData?.username;
      const incomingWs = data.providerSpecificData?.chatgptAccountId;
      existing = all.find(c => {
        if (c.authType !== "oauth" || c.email !== data.email) return false;

        // Codex/OpenAI can issue multiple OAuth grants for the same email.
        // Refresh tokens are rotated single-use; collapsing a new login onto an
        // existing bare-email row overwrites the first account's token pair and
        // makes it look "invalid" after adding a second account. Only update an
        // existing Codex row when both rows expose the same ChatGPT account ID.
        if (data.provider === "codex") {
          const existingWs = c.providerSpecificData?.chatgptAccountId;
          return !!incomingWs && !!existingWs && incomingWs === existingWs;
        }

        // Workspace providers use workspace ID when both sides have it
        const existingWs = c.providerSpecificData?.chatgptAccountId;
        if (incomingWs && existingWs) return incomingWs === existingWs;
        if (incomingWs && !existingWs) return false;
        if (!incomingWs && existingWs) return false;
        // Non-workspace providers: match on (email + username) so cross-IdP
        // accounts don't overwrite each other. Require username on both sides
        // — if only one side has it, treat as a distinct identity rather than
        // collapsing onto the bare-email fallback (which would re-introduce
        // the cross-IdP overwrite).
        const existingUsername = c.providerSpecificData?.username;
        if (incomingUsername && existingUsername) {
          return incomingUsername === existingUsername;
        }
        if (incomingUsername || existingUsername) return false;
        return true;
      });
    } else if (data.authType === "apikey" && data.name) {
      existing = all.find(c => c.authType === "apikey" && c.name === data.name);
    }
    // access_token: never dedup — user manages duplicates manually

    let finalConn;
    if (existing) {
      finalConn = { ...existing, ...data, updatedAt: now };
    } else {
      let connectionName = data.name || null;
      if (!connectionName && (data.authType === "oauth" || data.authType === "access_token")) {
        connectionName = deriveConnectionName(data, data.email || `Account ${all.length + 1}`);
      }
      let connectionPriority = data.priority;
      if (!connectionPriority) {
        connectionPriority = all.reduce((m, c) => Math.max(m, c.priority || 0), 0) + 1;
      }

      finalConn = {
        id: uuidv4(),
        provider: data.provider,
        authType: data.authType || "oauth",
        name: connectionName,
        priority: connectionPriority,
        isActive: data.isActive !== undefined ? data.isActive : true,
        createdAt: now,
        updatedAt: now,
      };
      for (const f of OPTIONAL_FIELDS) {
        if (data[f] !== undefined && data[f] !== null) finalConn[f] = data[f];
      }
      if (data.providerSpecificData && Object.keys(data.providerSpecificData).length > 0) {
        finalConn.providerSpecificData = data.providerSpecificData;
      }
      if (data.email !== undefined) finalConn.email = data.email;
    }

    // Extract secrets if Vault is active
    const secrets = {};
    if (vaultActive()) {
      for (const key of SECRET_FIELDS) {
        if (finalConn[key] !== undefined) {
          secrets[key] = finalConn[key];
          delete finalConn[key];
        }
      }
      secretsToWrite = secrets;
    } else {
      for (const key of SECRET_FIELDS) {
        if (finalConn[key] !== undefined) { warnVaultInactive(); break; }
      }
    }

    upsert(db, finalConn);
    reorderInTx(db, finalConn.provider);
    result = { ...finalConn, ...secrets };
  });

  // Write secrets to Vault outside transaction
  if (secretsToWrite && Object.keys(secretsToWrite).length > 0) {
    await vaultWrite(result.id, secretsToWrite);
  }

  // Enrich result with complete secrets from Vault
  await enrichSecrets(result);

  if (result) {
    await redisSet(`9router:cache:connection:${result.id}`, result, 300);
  }

  await redisClearPrefix("9router:cache:connections:");
  return result;
}

// Critical: OAuth refresh token race — atomic merge inside transaction
export async function updateProviderConnection(id, data) {
  const db = await getAdapter();
  let result;
  let secretsToWrite = null;

  db.transaction(() => {
    const row = db.get(`SELECT * FROM providerConnections WHERE id = ?`, [id]);
    if (!row) { result = null; return; }
    const existing = rowToConn(row);
    const merged = { ...existing, ...data, updatedAt: new Date().toISOString() };

    // Extract secrets from updates if Vault is active
    if (vaultActive()) {
      const secrets = {};
      let hasSecrets = false;
      for (const key of SECRET_FIELDS) {
        if (data[key] !== undefined) {
          secrets[key] = data[key];
          hasSecrets = true;
        }
        delete merged[key];
      }
      if (hasSecrets) {
        secretsToWrite = secrets;
      }
    } else {
      for (const key of SECRET_FIELDS) {
        if (data[key] !== undefined) { warnVaultInactive(); break; }
      }
    }

    upsert(db, merged);
    if (data.priority !== undefined) reorderInTx(db, merged.provider);
    result = merged;
  });

  if (!result) return null;

  // Write secrets to Vault outside transaction
  if (secretsToWrite) {
    await vaultWrite(id, secretsToWrite);
  }

  // Enrich result with complete secrets from Vault
  await enrichSecrets(result);

  if (result) {
    await redisSet(`9router:cache:connection:${id}`, result, 300);
  }

  await redisClearPrefix("9router:cache:connections:");
  return result;
}

export async function deleteProviderConnection(id) {
  const db = await getAdapter();
  let ok = false;
  db.transaction(() => {
    const row = db.get(`SELECT provider FROM providerConnections WHERE id = ?`, [id]);
    if (!row) return;
    db.run(`DELETE FROM providerConnections WHERE id = ?`, [id]);
    reorderInTx(db, row.provider);
    ok = true;
  });
  if (ok) {
    await vaultDelete(id);
    await redisDel(`9router:cache:connection:${id}`);
  }
  await redisClearPrefix("9router:cache:connections:");
  return ok;
}

export async function deleteProviderConnectionsByProvider(providerId) {
  const db = await getAdapter();
  const rows = db.all(`SELECT id FROM providerConnections WHERE provider = ?`, [providerId]);
  const before = rows.length;
  db.run(`DELETE FROM providerConnections WHERE provider = ?`, [providerId]);
  for (const row of rows) {
    await vaultDelete(row.id);
    await redisDel(`9router:cache:connection:${row.id}`);
  }
  await redisClearPrefix("9router:cache:connections:");
  return before;
}

export async function reorderProviderConnections(providerId) {
  const db = await getAdapter();
  db.transaction(() => reorderInTx(db, providerId));
  const rows = db.all(`SELECT id FROM providerConnections WHERE provider = ?`, [providerId]);
  for (const row of rows) {
    await redisDel(`9router:cache:connection:${row.id}`);
  }
  await redisClearPrefix("9router:cache:connections:");
}

export async function cleanupProviderConnections() {
  const db = await getAdapter();
  const fieldsToCheck = [
    "displayName", "email", "globalPriority", "defaultModel",
    "accessToken", "refreshToken", "expiresAt", "tokenType",
    "scope", "projectId", "apiKey", "testStatus",
    "lastTested", "lastError", "lastErrorAt", "rateLimitedUntil", "expiresIn",
    "consecutiveUseCount",
  ];
  let cleaned = 0;
  
  const rawRows = db.all(`SELECT * FROM providerConnections`);
  const list = await enrichSecretsList(rawRows.map(rowToConn));

  for (const conn of list) {
    let dirty = false;
    for (const f of fieldsToCheck) {
      if (conn[f] === null || conn[f] === undefined) {
        if (f in conn) { delete conn[f]; cleaned++; dirty = true; }
      }
    }
    if (conn.providerSpecificData && Object.keys(conn.providerSpecificData).length === 0) {
      delete conn.providerSpecificData;
      cleaned++;
      dirty = true;
    }
    if (dirty) {
      const secrets = {};
      const finalConn = { ...conn };
      if (vaultActive()) {
        for (const key of SECRET_FIELDS) {
          if (finalConn[key] !== undefined) {
            secrets[key] = finalConn[key];
            delete finalConn[key];
          }
        }
      } else {
        for (const key of SECRET_FIELDS) {
          if (finalConn[key] !== undefined) { warnVaultInactive(); break; }
        }
      }
      db.transaction(() => {
        upsert(db, finalConn);
      });
      if (Object.keys(secrets).length > 0) {
        await vaultWrite(conn.id, secrets);
      }
      await redisDel(`9router:cache:connection:${conn.id}`);
    }
  }

  await redisClearPrefix("9router:cache:connections:");
  return cleaned;
}
