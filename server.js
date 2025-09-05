const express = require('express');
const config = require('./config');
const { applyPreMiddleware, applyPostMiddleware } = require('./src/middleware');
const { registerWebhook, registerRoutes } = require('./src/routes');
const { auth } = require('./src/auth');

const app = express();
app.disable('x-powered-by');
app.enable('trust proxy'); // Railway/NGINX proxy

applyPreMiddleware(app);
registerWebhook(app);
applyPostMiddleware(app);
registerRoutes(app);

const { PORT, NODE_ENV } = config;

let server;
if (require.main === module) {
  server = app.listen(PORT, () => {
    console.log(`🚀 RENN.AI Ultra-Optimized Server running on port ${PORT}`);
    console.log(`📍 Environment: ${NODE_ENV}`);
    console.log(`🔗 Health check: http://localhost:${PORT}/health`);
  });

  const shutdown = (signal) => {
    console.log(`🛑 ${signal} received, shutting down gracefully`);
    server.close(() => {
      console.log('✅ Server closed');
      process.exit(0);
    });
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

module.exports = { app, server, auth };
