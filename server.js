// server.js
const express = require('express');
const config = require('./config');
const { initSentry, initOtel } = require('./src/observability');
const { applyPreMiddleware, applyPostMiddleware } = require('./src/middleware');
const { registerWebhook, registerRoutes } = require('./src/routes');
const { auth } = require('./src/auth');
const { pool } = require('./src/db/pool');
const { getRedisClient } = require('./src/redis');

const { PORT, NODE_ENV } = config;

// Initialize observability early so instrumentations patch modules
initOtel();
initSentry();

const app = express();
app.disable('x-powered-by');
app.enable('trust proxy'); // Railway/NGINX proxy

applyPreMiddleware(app);
registerWebhook(app);
applyPostMiddleware(app);
registerRoutes(app);

let server;
if (require.main === module) {
  server = app.listen(PORT, () => {
  console.log(`🚀 RENN.AI Ultra-Optimized Server running on port ${PORT}`);
  console.log(`📍 Environment: ${NODE_ENV}`);
  console.log(`🔗 Health check: http://localhost:${PORT}/health`);
  });

  const shutdown = async (signal, err) => {
    console.log(`🛑 ${signal} received, shutting down gracefully`);
    if (err) console.error('Reason:', err);
    try {
      // Stop accepting new connections
      await new Promise((resolve) => server.close(resolve));
      console.log('✅ HTTP server closed');
    } catch (e) {
      console.error('Error closing HTTP server', e);
    }
    try {
      await pool.end();
      console.log('✅ Postgres pool closed');
    } catch (e) {
      console.error('Error closing Postgres pool', e);
    }
    try {
      const rc = getRedisClient?.();
      if (rc && rc.quit) {
        await rc.quit();
        console.log('✅ Redis client closed');
      }
    } catch (e) {
      console.error('Error closing Redis client', e);
    }
    process.exit(err ? 1 : 0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('unhandledRejection', (reason) => shutdown('unhandledRejection', reason));
  process.on('uncaughtException', (err) => shutdown('uncaughtException', err));
}

module.exports = { app, server, auth };
