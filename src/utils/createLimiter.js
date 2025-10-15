import rateLimit from 'express-rate-limit';
import { ipKeyGenerator } from 'express-rate-limit/helpers.js';
import RedisStore from 'rate-limit-redis';
import { createClient } from 'redis';
import config from '../../config/index.js';
import { createRequire } from 'node:module';

const reqr = createRequire(import.meta.url);

// Keep a registry of per-limiter Redis clients for graceful shutdown
const limiterClients = new Set();

function createRedisClient(url) {
  const client = createClient({ url });
  // Connect in background; surface errors to console but don't crash
  client.connect().catch((err) => {
    // eslint-disable-next-line no-console
    console.error('RateLimit Redis connect error:', err);
  });
  client.on('error', (err) => {
    // eslint-disable-next-line no-console
    console.error('RateLimit Redis client error:', err);
  });
  limiterClients.add(client);
  return client;
}

function createLimiter(options = {}, meta = {}) {
  const { REDIS_URL } = config;
  const name = meta.name || 'default';

  let store;
  if (REDIS_URL) {
    try {
      const client = createRedisClient(REDIS_URL);
      store = new RedisStore({
        prefix: `rl:${name}:`,
        sendCommand: (...args) => client.sendCommand(args),
      });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('Failed to initialize RedisStore for limiter:', name, err);
      store = undefined;
    }
  }

  const limiter = rateLimit({
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: ipKeyGenerator,
    ...options,
    // Ensure our store and keyGenerator defaults are applied after spread
    store: store ?? options.store,
    keyGenerator: options.keyGenerator || ipKeyGenerator,
  });

  return limiter;
}

async function shutdownLimiterStores() {
  const tasks = [];
  for (const client of Array.from(limiterClients)) {
    try {
      tasks.push(client.quit().catch(() => client.disconnect?.()));
    } catch {}
    limiterClients.delete(client);
  }
  await Promise.allSettled(tasks);
}

function printRateLimitDiagnostics(extra = {}) {
  try {
    const erlPkg = reqr('express-rate-limit/package.json');
    const rlrPkg = reqr('rate-limit-redis/package.json');
    const redisPkg = reqr('redis/package.json');
    // eslint-disable-next-line no-console
    console.log(
      `ℹ️ rate-limit: express-rate-limit@${erlPkg.version}, rate-limit-redis@${rlrPkg.version}, redis@${redisPkg.version}`,
      extra
    );
  } catch {}
}

export { createLimiter, shutdownLimiterStores, printRateLimitDiagnostics };
export default { createLimiter, shutdownLimiterStores, printRateLimitDiagnostics };

