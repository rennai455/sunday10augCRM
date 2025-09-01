// server.js
const express = require('express');
const path = require('path');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const slowDown = require('express-slow-down');
const crypto = require('crypto');
const config = require('./config');
const { pool } = require('./db'); // single source of pg Pool

const app = express();
app.disable('x-powered-by');
app.enable('trust proxy'); // Railway/NGINX proxy

const { PORT, NODE_ENV, ALLOWED_ORIGINS } = config;

/** CORS allowlist (no '*' + credentials) */
const raw = ALLOWED_ORIGINS || '';
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
app.use((req, res, next) => {
  res.locals.cspNonce = crypto.randomBytes(16).toString('base64');
  helmet({
    crossOriginEmbedderPolicy: false,
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        "default-src": ["'self'"],
        "script-src": ["'self'", "https://cdn.tailwindcss.com", `\'nonce-${res.locals.cspNonce}\'`],
        "style-src": ["'self'", `\'nonce-${res.locals.cspNonce}\'`],
        "img-src": ["'self'", "data:"],
        "frame-ancestors": ["'none'"]
      }
    }
  })(req, res, next);
});
if (NODE_ENV === 'production') {
  app.use(helmet.hsts({ maxAge: 31536000, includeSubDomains: true, preload: true }));
}
app.use(compression());

/** Parsers + static */
app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: false, limit: '100kb' }));
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
app.get('/health', async (_req, res) => {
  try { await pool.query('select 1'); res.json({ status: 'ok', db: 'PostgreSQL' }); }
  catch (e) { res.status(500).json({ status: 'error', db: 'PostgreSQL', error: e.message }); }
});
app.get('/readyz', async (_req, res) => {
  try { await pool.query('select 1'); res.json({ ready: true }); }
  catch { res.status(503).json({ ready: false }); }
});

/** TODO: wire real routes here (users, agencies, leads, etc.) */

const server = app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
  console.log(`Environment: ${NODE_ENV}`);
});
module.exports = { app, server };
