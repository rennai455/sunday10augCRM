// server.js
require('dotenv').config();
const express = require('express');
const path = require('path');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const slowDown = require('express-slow-down');
const pinoHttp = require('pino-http');
const { randomUUID } = require('crypto');
const metrics = require('./metrics');
const { pool } = require('./db'); // single source of pg Pool

const app = express();
const PORT = process.env.PORT || 3002;
const NODE_ENV = process.env.NODE_ENV || 'development';

/** request id + logging */
app.use((req, _res, next) => {
  req.id = randomUUID();
  next();
});
app.use(pinoHttp({
  genReqId: req => req.id,
  redact: ['req.headers.authorization'],
}));

/** CORS allowlist (no '*' + credentials) */
const raw = process.env.ALLOWED_ORIGINS || '';
const ALLOWLIST = raw.split(',').map(s => s.trim()).filter(Boolean);
app.use(cors({
  origin: (origin, cb) => {
    if (!origin) return cb(null, true);                // same-origin / curl
    if (ALLOWLIST.length === 0) return cb(null, true); // dev-open if not set
    cb(null, ALLOWLIST.includes(origin));
  },
  credentials: true,
  optionsSuccessStatus: 200,
}));

/** Security & compression */
app.enable('trust proxy'); // Railway/NGINX proxy
app.use(helmet({
  crossOriginEmbedderPolicy: false,
  contentSecurityPolicy: {
    useDefaults: true,
    directives: {
      "default-src": ["'self'"],
      "script-src": ["'self'", "https://cdn.tailwindcss.com", "'unsafe-inline'"],
      "style-src": ["'self'", "'unsafe-inline'"],
      "img-src": ["'self'", "data:"],
      "frame-ancestors": ["'none'"]
    }
  }
}));
if (NODE_ENV === 'production') {
  app.use(helmet.hsts({ maxAge: 31536000, includeSubDomains: true, preload: true }));
}
app.use(compression());

/** Parsers + static */
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use('/static', express.static(path.join(__dirname, 'public'), {
  maxAge: NODE_ENV === 'production' ? '1y' : 0,
  etag: true,
}));

/** Rate limits (skip in dev) */
const makeLimiter = (windowMs, max, message) => rateLimit({
  windowMs, max, standardHeaders: true, legacyHeaders: false,
  message: { error: message }, skip: () => NODE_ENV === 'development'
});
app.use('/api/', makeLimiter(15*60*1000, 1000, 'Too many requests'));
app.use('/api/auth/', makeLimiter(15*60*1000, 10, 'Too many auth attempts'));
app.use(slowDown({ windowMs: 15*60*1000, delayAfter: 50, delayMs: 500, maxDelayMs: 20000 }));

/** Health/readiness */
app.get('/healthz', (_req, res) => {
  res.json({ status: 'ok' });
});
app.get('/readyz', async (_req, res) => {
  try { await pool.query('select 1'); res.json({ ready: true }); }
  catch { res.status(503).json({ ready: false }); }
});
app.get('/metrics', async (_req, res) => {
  res.set('Content-Type', metrics.register.contentType);
  res.end(await metrics.register.metrics());
});

/** TODO: wire real routes here (users, agencies, leads, etc.) */

app.use((err, req, res, _next) => {
  req.log?.error({ err }, 'Unhandled error');
  res.status(err.status || 500).json({ id: req.id, error: err.message || 'Internal Server Error' });
});

const server = app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
  console.log(`Environment: ${NODE_ENV}`);
});
module.exports = { app, server };
