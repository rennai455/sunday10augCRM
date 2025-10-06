import { createClient } from 'redis';
import config from '../config/index.js';

let client;

function getRedisClient() {
  const { REDIS_URL } = config;
  if (!REDIS_URL) return null;
  if (client) return client;
  try {
    client = createClient({ url: REDIS_URL });
    client.connect().catch((err) => {
      // eslint-disable-next-line no-console
      console.error('Redis connect error:', err);
    });
    client.on('error', (err) => {
      // eslint-disable-next-line no-console
      console.error('Redis client error:', err);
    });
    return client;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Failed to create Redis client:', err);
    return null;
  }
}

export { getRedisClient };
export default { getRedisClient };
