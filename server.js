// server.js
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
const crypto = require('crypto');
const config = require('./config');

const app = express();
app.disable('x-powered-by');
app.enable('trust proxy'); // Railway/NGINX proxy

const { PORT, NODE_ENV, ALLOWED_ORIGINS } = config;

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
        "script-src": ["'self'", "https://cdn.tailwindcss.com", `'nonce-${res.locals.cspNonce}'`],
        "style-src": ["'self'", `'nonce-${res.locals.cspNonce}'`],
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
const healthHandler = (_req, res) => {
  res.json({ status: 'healthy' });
};
app.get('/healthz', healthHandler);
app.get('/health', healthHandler);

const readinessHandler = (_req, res) => {
  res.json({ status: 'ready' });
};
app.get('/readyz', readinessHandler);
app.get('/readiness', readinessHandler);
app.get('/metrics', async (_req, res) => {
  res.set('Content-Type', metrics.register.contentType);
  res.end(await metrics.register.metrics());
});

/** TODO: wire real routes here (users, agencies, leads, etc.) */

app.use((err, req, res, next) => {
  req.log?.error({ err }, 'Unhandled error');
  res.status(err.status || 500).json({ id: req.id, error: err.message || 'Internal Server Error' });
});

const server = app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
  console.log(`Environment: ${NODE_ENV}`);
});

module.exports = app;
module.exports.server = server;
