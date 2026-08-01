import { v4 as uuidv4 } from "uuid";
import { getAdapter } from "../driver.js";
import { parseJson, stringifyJson } from "../helpers/jsonCol.js";
import { redisGet, redisSet, redisClearPrefix } from "../../redis.js";

function rowToCombo(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    kind: row.kind,
    models: parseJson(row.models, []),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function getCombos() {
  const cacheKey = "9router:cache:combos:list";
  const cached = await redisGet(cacheKey);
  if (cached) return cached;

  const db = await getAdapter();
  const rows = db.all(`SELECT * FROM combos ORDER BY createdAt ASC`);
  const list = rows.map(rowToCombo);
  await redisSet(cacheKey, list, 300);
  return list;
}

export async function getComboById(id) {
  const cacheKey = `9router:cache:combos:id:${id}`;
  const cached = await redisGet(cacheKey);
  if (cached) return cached;

  const db = await getAdapter();
  const row = db.get(`SELECT * FROM combos WHERE id = ?`, [id]);
  const res = rowToCombo(row);
  if (res) await redisSet(cacheKey, res, 300);
  return res;
}

export async function getComboByName(name) {
  const cacheKey = `9router:cache:combos:name:${name}`;
  const cached = await redisGet(cacheKey);
  if (cached) return cached;

  const db = await getAdapter();
  const row = db.get(`SELECT * FROM combos WHERE name = ?`, [name]);
  const res = rowToCombo(row);
  if (res) await redisSet(cacheKey, res, 300);
  return res;
}

export async function createCombo(data) {
  const db = await getAdapter();
  const now = new Date().toISOString();
  const combo = {
    id: uuidv4(),
    name: data.name,
    kind: data.kind || null,
    models: data.models || [],
    createdAt: now,
    updatedAt: now,
  };
  db.run(
    `INSERT INTO combos(id, name, kind, models, createdAt, updatedAt) VALUES(?, ?, ?, ?, ?, ?)`,
    [combo.id, combo.name, combo.kind, stringifyJson(combo.models), combo.createdAt, combo.updatedAt]
  );
  await redisClearPrefix("9router:cache:combos:");
  return combo;
}

export async function updateCombo(id, data) {
  const db = await getAdapter();
  let result = null;
  db.transaction(() => {
    const row = db.get(`SELECT * FROM combos WHERE id = ?`, [id]);
    if (!row) return;
    const merged = { ...rowToCombo(row), ...data, updatedAt: new Date().toISOString() };
    db.run(
      `UPDATE combos SET name = ?, kind = ?, models = ?, updatedAt = ? WHERE id = ?`,
      [merged.name, merged.kind, stringifyJson(merged.models || []), merged.updatedAt, id]
    );
    result = merged;
  });
  await redisClearPrefix("9router:cache:combos:");
  return result;
}

export async function deleteCombo(id) {
  const db = await getAdapter();
  const res = db.run(`DELETE FROM combos WHERE id = ?`, [id]);
  const ok = (res?.changes ?? 0) > 0;
  if (ok) {
    await redisClearPrefix("9router:cache:combos:");
  }
  return ok;
}
