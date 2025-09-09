const { getRedisClient } = require('./redis');

// In-memory fallback store
const localCache = new Map(); // id -> timestamp(ms)

function pruneLocal(ttlMs) {
  const now = Date.now();
  for (const [id, ts] of localCache.entries()) {
    if (now - ts > ttlMs) localCache.delete(id);
  }
}

async function checkAndSetReplay(id, ttlMs) {
  if (!id) return false;
  const client = getRedisClient();
  const key = `webhook:replay:${id}`;
  if (client) {
    try {
      const res = await client.sendCommand(['SET', key, '1', 'PX', String(ttlMs), 'NX']);
      // res === 'OK' if set; null if exists
      return res === null; // true means replay
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('Redis replay check error, falling back to memory:', err);
    }
  }

  pruneLocal(ttlMs);
  const now = Date.now();
  if (localCache.has(id)) return true;
  localCache.set(id, now);
  return false;
}

module.exports = { checkAndSetReplay };

