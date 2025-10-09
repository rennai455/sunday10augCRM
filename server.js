import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

import config from './config/index.js';
import observability from './src/observability.js';
import middleware from './src/middleware.js';
import routes from './src/routes.js';
import authModule from './src/auth.js';
import db from './src/db/pool.js';
import redis from './src/redis.js';

const { initSentry, initOtel } = observability;
const { applyPreMiddleware, applyPostMiddleware } = middleware;
const { registerWebhook, registerRoutes } = routes;
const { auth } = authModule;
const { pool } = db;
const { getRedisClient } = redis;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Use dynamic port from env with 3000 fallback
const PORT = process.env.PORT || 3000;
const NODE_ENV = process.env.NODE_ENV || (config?.NODE_ENV ?? undefined);

initOtel?.();
initSentry?.();

const app = express();
app.disable('x-powered-by');
app.enable('trust proxy');

applyPreMiddleware?.(app);
registerWebhook?.(app);
applyPostMiddleware?.(app);

app.use(express.static(path.join(__dirname, 'public')));
app.use('/static', express.static(path.join(__dirname, 'public', 'dist')));

registerRoutes?.(app);

let server;
const isPrimaryModule = process.argv[1] === __filename;

if (isPrimaryModule) {
  server = app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

  const shutdown = async (signal, err) => {
    console.log(`🛑 ${signal} received, shutting down gracefully`);
    if (err) console.error('Reason:', err);
    try {
      await new Promise((resolve) => server.close(resolve));
      console.log('✅ HTTP server closed');
    } catch (error) {
      console.error('Error closing HTTP server', error);
    }

    try {
      await pool?.end?.();
      console.log('✅ Postgres pool closed');
    } catch (error) {
      console.error('Error closing Postgres pool', error);
    }

    try {
      const rc = getRedisClient?.();
      if (rc && rc.quit) {
        await rc.quit();
        console.log('✅ Redis client closed');
      }
    } catch (error) {
      console.error('Error closing Redis client', error);
    }

    process.exit(err ? 1 : 0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('unhandledRejection', (reason) => shutdown('unhandledRejection', reason));
  process.on('uncaughtException', (error) => shutdown('uncaughtException', error));
}

export { app, server, __dirname, auth };
