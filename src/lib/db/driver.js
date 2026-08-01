import { ensureDirs, DATA_FILE, LOGS_FILE } from "./paths.js";

// Use global to survive Next.js dev hot-reload (module state resets on reload)
if (!global._dbAdapter) global._dbAdapter = { instance: null, initPromise: null, logged: false };
if (!global._logsAdapter) global._logsAdapter = { instance: null, initPromise: null, logged: false };

const state = global._dbAdapter;

async function tryBunSqlite(dbFile) {
  // Bun runtime only — built-in, no install needed
  if (!process.versions.bun) return null;
  try {
    const { createBunSqliteAdapter } = await import("./adapters/bunSqliteAdapter.js");
    return await createBunSqliteAdapter(dbFile);
  } catch (e) {
    console.warn(`[DB] bun:sqlite unavailable: ${e.message}`);
    return null;
  }
}

async function tryBetterSqlite(dbFile) {
  // Skip on Bun — better-sqlite3 native bindings unsupported
  if (process.versions.bun) return null;
  try {
    const { createBetterSqliteAdapter } = await import("./adapters/betterSqliteAdapter.js");
    return createBetterSqliteAdapter(dbFile);
  } catch (e) {
    console.warn(`[DB] better-sqlite3 unavailable: ${e.message}`);
    return null;
  }
}

async function tryNodeSqlite(dbFile) {
  // Built-in since Node 22.5.0 — no install needed. Skip under Bun (no node:sqlite).
  if (process.versions.bun) return null;
  const [maj, min] = process.versions.node.split(".").map(Number);
  if (maj < 22 || (maj === 22 && min < 5)) return null;
  try {
    const { createNodeSqliteAdapter } = await import("./adapters/nodeSqliteAdapter.js");
    return await createNodeSqliteAdapter(dbFile);
  } catch (e) {
    console.warn(`[DB] node:sqlite unavailable: ${e.message}`);
    return null;
  }
}

async function trySqlJs(dbFile) {
  try {
    const { createSqlJsAdapter } = await import("./adapters/sqljsAdapter.js");
    return await createSqlJsAdapter(dbFile);
  } catch (e) {
    console.warn(`[DB] sql.js unavailable: ${e.message}`);
    return null;
  }
}

async function initAdapter(dbFile = DATA_FILE, isLogs = false) {
  ensureDirs();
  // Order per runtime:
  //   Bun:  bun:sqlite → sql.js
  //   Node: better-sqlite3 → node:sqlite (≥22.5) → sql.js
  let adapter = await tryBunSqlite(dbFile);
  if (!adapter) adapter = await tryBetterSqlite(dbFile);
  if (!adapter) adapter = await tryNodeSqlite(dbFile);
  if (!adapter) adapter = await trySqlJs(dbFile);
  if (!adapter) throw new Error("[DB] No SQLite driver available (bun/better/node/sql.js all failed)");

  if (isLogs) {
    if (!global._logsAdapter.logged) {
      console.log(`[DB] Logs Driver: ${adapter.driver} | file: ${dbFile}`);
      global._logsAdapter.logged = true;
    }
    const { runLogsMigrationOnce } = await import("./migrate.js");
    await runLogsMigrationOnce(adapter);
  } else {
    if (!state.logged) {
      console.log(`[DB] Driver: ${adapter.driver} | file: ${dbFile}`);
      state.logged = true;
    }
    const { runMigrationOnce } = await import("./migrate.js");
    await runMigrationOnce(adapter);
  }
  return adapter;
}

export async function getAdapter() {
  if (state.instance) return state.instance;
  if (!state.initPromise) state.initPromise = initAdapter(DATA_FILE, false).then((a) => { state.instance = a; return a; });
  return state.initPromise;
}

export function getAdapterSync() {
  if (!state.instance) throw new Error("[DB] adapter not initialized — await getAdapter() first");
  return state.instance;
}

export async function getLogsAdapter() {
  if (global._logsAdapter.instance) return global._logsAdapter.instance;
  if (!global._logsAdapter.initPromise) {
    global._logsAdapter.initPromise = initAdapter(LOGS_FILE, true).then((a) => {
      global._logsAdapter.instance = a;
      return a;
    });
  }
  return global._logsAdapter.initPromise;
}
