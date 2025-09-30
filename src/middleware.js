const express = require('express');
const path = require('path');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const RedisStore = require('rate-limit-redis');
const { getRedisClient } = require('./redis');
const slowDown = require('express-slow-down');
const pinoHttp = require('pino-http');
const crypto = require('crypto');
const cookieParser = require('cookie-parser');
const metrics = require('../metrics');
const config = require('../config');
const csurf = require('csurf');

const {
  NODE_ENV,
  ALLOWED_ORIGINS,
  REDIS_URL,
  API_RATE_WINDOW_MS,
  API_RATE_MAX,
  AUTH_RATE_WINDOW_MS,
  AUTH_RATE_MAX,
} = config;

let redisStore;
function initRateLimitStore() {
  if (redisStore) return redisStore;
  if (NODE_ENV === 'production' && REDIS_URL) {
    try {
      const redisClient = getRedisClient();
      redisStore = new RedisStore({
        sendCommand: (...args) => redisClient.sendCommand(args),
      });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('Failed to init Redis store (rate limit):', err);
      redisStore = undefined;
    }
  }
  return redisStore;
}

function applyPreMiddleware(app) {
  app.use((req, _res, next) => {
    req.id = crypto.randomUUID();
    next();
  });

  app.use(
    pinoHttp({
      genReqId: (req) => req.id,
      redact: {
        paths: [
          'req.headers.authorization',
          'req.headers.cookie',
          "res.headers['set-cookie']",
          'req.cookies',
          'req.body.password',
          'req.body.email',
          'req.body.phone',
        ],
        censor: '[REDACTED]',
      },
    })
  );

  app.use((req, res, next) => {
    const end = metrics.httpRequestDuration.startTimer();
    res.on('finish', () => {
      const route = req.route?.path || req.path;
      const labels = { method: req.method, route, status_code: res.statusCode };
      metrics.httpRequestsTotal.inc(labels);
      end(labels);
    });
    next();
  });

  const raw = ALLOWED_ORIGINS || '';
  const ALLOWLIST = raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  app.use(
    cors({
      origin: (origin, cb) => {
        // Allow non-browser/server-to-server requests without CORS header
        if (!origin) return cb(null, true);
        if (ALLOWLIST.length === 0) {
          return cb(null, true);
        }
        cb(null, ALLOWLIST.includes(origin));
      },
      credentials: true,
      optionsSuccessStatus: 200,
    })
  );

  app.use((req, res, next) => {
    res.locals.cspNonce = crypto.randomBytes(16).toString('base64');
    const directives = {
      'default-src': ["'self'"],
      'script-src': [
        "'self'",
        'https://cdn.tailwindcss.com',
        'https://cdn.jsdelivr.net',
        'https://cdnjs.cloudflare.com',
        'https://cdn.jsdelivr.net',
        `'nonce-${res.locals.cspNonce}'`,
      ],
      'style-src': [
        "'self'",
        'https://cdn.tailwindcss.com',
        'https://fonts.googleapis.com',
        `'nonce-${res.locals.cspNonce}'`,
      ],
      'font-src': ["'self'", 'https://fonts.gstatic.com'],
      'img-src': ["'self'", 'data:'],
      'connect-src': ["'self'"],
      'frame-ancestors': ["'none'"],
    };
    if (NODE_ENV !== 'production') {
      directives['upgrade-insecure-requests'] = null;
    }
    helmet({
      crossOriginEmbedderPolicy: false,
      contentSecurityPolicy: {
        useDefaults: true,
        directives,
      },
      hsts: NODE_ENV === 'production' ? undefined : false,
    })(req, res, next);
  });

  if (NODE_ENV === 'production') {
    app.use(
      helmet.hsts({ maxAge: 31536000, includeSubDomains: true, preload: true })
    );
  }

  app.use(compression());
}

function applyPostMiddleware(app) {
  app.use(express.json({ limit: '100kb' }));
  app.use(express.urlencoded({ extended: false, limit: '100kb' }));
  app.use(cookieParser());

  // CSRF protection (double submit cookie). Exempt safe routes and webhooks.
  const csrfProtection = csurf({
    cookie: {
      key: 'csrf_token',
      sameSite: 'lax',
      httpOnly: true,
      secure: NODE_ENV === 'production',
    },
  });
  const csrfExempt = new Set([
    '/webhook',
    '/metrics',
    '/health',
    '/healthz',
    '/readyz',
    '/readiness',
    '/api/auth/login',
  ]);
  app.use((req, res, next) => {
    if (NODE_ENV === 'test') return next();
    // Only protect state-changing API routes
    const method = req.method.toUpperCase();
    const unsafe =
      method === 'POST' ||
      method === 'PUT' ||
      method === 'PATCH' ||
      method === 'DELETE';
    if (!unsafe) return next();
    if (csrfExempt.has(req.path)) return next();
    return csrfProtection(req, res, (err) => {
      if (err) return res.status(403).json({ error: 'Invalid CSRF token' });
      next();
    });
  });

  app.use(express.static(path.join(__dirname, '..', 'public')));

  app.use(
    '/static',
    (req, res, next) => {
      if (path.extname(req.path).toLowerCase() === '.html') {
        return res.status(404).end();
      }
      next();
    },
    express.static(path.join(__dirname, '..', 'public'), {
      maxAge: NODE_ENV === 'production' ? '1y' : 0,
      etag: true,
      index: false,
    })
  );

  // Endpoint to fetch a CSRF token for clients that need it
  app.get('/api/csrf-token', (req, res) => {
    try {
      // Generate a token by invoking the middleware on demand
      csurf({
        cookie: {
          key: 'csrf_token',
          sameSite: 'lax',
          httpOnly: true,
          secure: NODE_ENV === 'production',
        },
      })(req, res, () => {
        res.json({ csrfToken: req.csrfToken?.() });
      });
    } catch (e) {
      res.status(500).json({ error: 'Failed to issue CSRF token' });
    }
  });

  const makeLimiter = (windowMs, max, message, typeLabel) => {
    const store = initRateLimitStore();
    return rateLimit({
      windowMs,
      max,
      standardHeaders: true,
      legacyHeaders: false,
      message: { error: message },
      skip: () => NODE_ENV === 'development',
      store,
      validate: { trustProxy: config.RATE_LIMIT_TRUST_PROXY },
      handler: (req, res, _next, options) => {
        const labels = {
          route: req.path || req.baseUrl || 'unknown',
          type: typeLabel || 'api',
        };
        if (
          metrics.rateLimitBlockedTotal &&
          typeof metrics.rateLimitBlockedTotal.inc === 'function'
        ) {
          metrics.rateLimitBlockedTotal.inc(labels);
        }
        res.status(options.statusCode || 429).json({ error: message });
      },
    });
  };
  app.use(
    '/api/',
    makeLimiter(API_RATE_WINDOW_MS, API_RATE_MAX, 'Too many requests', 'api')
  );
  app.use(
    '/api/auth/',
    makeLimiter(
      AUTH_RATE_WINDOW_MS,
      AUTH_RATE_MAX,
      'Too many auth attempts',
      'auth'
    )
  );

  const slowDownConfig = {
    windowMs: 15 * 60 * 1000,
    delayAfter: 50,
    // Use function form to avoid deprecation/warning and keep consistent behavior
    delayMs: () => 500,
    maxDelayMs: 20000,
    // Disable validation warnings for delayMs behavior
    validate: { delayMs: false, trustProxy: NODE_ENV === 'production' },
  };
  app.use(slowDown(slowDownConfig));
}

module.exports = { applyPreMiddleware, applyPostMiddleware };
