import { createClient } from "redis";

let client = null;
let isReady = false;

if (process.env.REDIS_URL) {
  client = createClient({
    url: process.env.REDIS_URL,
  });

  client.on("error", (err) => {
    console.error("[Redis] Client Error:", err.message);
  });

  client.on("ready", () => {
    isReady = true;
  });

  client.on("end", () => {
    isReady = false;
  });

  // Connect in background
  client.connect().catch((err) => {
    console.error("[Redis] Connection failed:", err.message);
  });
}

export async function redisGet(key) {
  if (!client || !isReady) return null;
  try {
    const data = await client.get(key);
    return data ? JSON.parse(data) : null;
  } catch (err) {
    console.error(`[Redis] Get failed for ${key}:`, err.message);
    return null;
  }
}

export async function redisSet(key, value, ttlSeconds = 300) {
  if (!client || !isReady) return;
  try {
    const serialized = JSON.stringify(value);
    await client.set(key, serialized, {
      EX: ttlSeconds,
    });
  } catch (err) {
    console.error(`[Redis] Set failed for ${key}:`, err.message);
  }
}

export async function redisDel(key) {
  if (!client || !isReady) return;
  try {
    await client.del(key);
  } catch (err) {
    console.error(`[Redis] Del failed for ${key}:`, err.message);
  }
}

export async function redisClearPrefix(prefix) {
  if (!client || !isReady) return;
  try {
    const keys = await client.keys(`${prefix}*`);
    if (keys.length > 0) {
      await client.del(keys);
    }
  } catch (err) {
    console.error(`[Redis] ClearPrefix failed for ${prefix}:`, err.message);
  }
}
