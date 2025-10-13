import express from 'express';
import { fileURLToPath, URL } from 'node:url';
import path from 'node:path';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';
import { getRedisClient } from './redis.js';
import slowDown from 'express-slow-down';
import pinoHttp from 'pino-http';
import crypto from 'node:crypto';
import cookieParser from 'cookie-parser';
import metrics from '../metrics.js';
import config from '../config/index.js';
import csurf from 'csurf';
import { createRequire } from 'node:module';
const reqr = createRequire(import.meta.url);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const {
  NODE_ENV,
  ALLOWED_ORIGINS,
  REDIS_URL,
  API_RATE_WINDOW_MS,
  API_RATE_MAX,
  AUTH_RATE_WINDOW_MS,
  AUTH_RATE_MAX,
  RATE_LIMIT_TRUST_PROXY,
} = config;

let redisStore;
let redisInitAttempted = false;
function initRateLimitStore() {
  if (redisStore) return redisStore;
  if (redisInitAttempted) return undefined;
  if (REDIS_URL) {
    try {
      const redisClient = getRedisClient();
      if (!redisClient) {
        throw new Error('Redis client unavailable');
      }
      redisStore = new RedisStore({
        sendCommand: (...args) => redisClient.sendCommand(args),
      });
      redisInitAttempted = true;
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('Failed to init Redis store (rate limit):', err);
      redisInitAttempted = true;
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

  const normalizeOrigin = (input) => {
    if (!input) return '';
    try {
      const asUrl = new URL(input);
      return asUrl.origin.toLowerCase();
    } catch {
      return String(input).trim().replace(/\/$/, '').toLowerCase();
    }
  };
  const raw = ALLOWED_ORIGINS || '';
  const allowlist = new Set(
    raw
      .split(',')
      .map((s) => normalizeOrigin(s))
      .filter(Boolean)
  );
  const corsMiddleware = cors({
    origin: (origin, cb) => {
      // Allow non-browser/server-to-server requests without CORS header
      if (!origin) return cb(null, true);
      const normalizedOrigin = normalizeOrigin(origin);
      if (allowlist.size === 0) {
        const error = new Error('CORS origin blocked: allowlist empty');
        error.statusCode = 403;
        return cb(error);
      }
      if (!allowlist.has(normalizedOrigin)) {
        const error = new Error(`CORS origin blocked: ${origin}`);
        error.statusCode = 403;
        return cb(error);
      }
      return cb(null, true);
    },
    credentials: true,
    optionsSuccessStatus: 204,
  });
  const handleCorsError = (err, req, res) => {
    req.log?.warn?.(
      { origin: req.headers.origin, message: err.message },
      'CORS request rejected'
    );
    res.status(err.statusCode || 403).json({ error: 'Origin not allowed' });
  };
  app.use((req, res, next) => {
    corsMiddleware(req, res, (err) => {
      if (err) return handleCorsError(err, req, res);
      return next();
    });
  });
  app.options('*', (req, res, next) => {
    corsMiddleware(req, res, (err) => {
      if (err) return handleCorsError(err, req, res);
      if (!res.headersSent) {
        return res.sendStatus(204);
      }
      return next();
    });
  });

  app.use((req, res, next) => {
    res.locals.cspNonce = crypto.randomBytes(16).toString('base64');
    const directives = {
      'default-src': ["'self'"],
      'script-src': ["'self'", `'nonce-${res.locals.cspNonce}'`],
      'style-src': ["'self'", `'nonce-${res.locals.cspNonce}'`],
      'font-src': ["'self'"],
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
    // Public lead intake form (HMAC-protected)
    '/api/leads/form',
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

  // Protect HTML pages before mounting static. Only allow public pages without auth.
  const publicHtml = new Set(['/Login.html', '/form.html', '/index.html']);
  app.use((req, res, next) => {
    if (req.method !== 'GET') return next();
    if (!req.path || !req.path.toLowerCase().endsWith('.html')) return next();
    if (publicHtml.has(req.path)) return next();
    // Lazy import to avoid cycle
    import('./auth.js').then(({ default: authMod }) => {
      const guard = authMod?.authenticateWeb;
      if (typeof guard === 'function') return guard(req, res, next);
      next();
    }).catch(() => next());
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
      validate: { trustProxy: RATE_LIMIT_TRUST_PROXY },
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

  // Central error handler to capture 5xx spikes and exceptions
  // Sentry is initialized in observability if DSN present; require dynamically here
  // to avoid importing in environments without DSN.
  // Must be added before any final fallthrough handlers.
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    try {
      if (config.SENTRY_DSN) {
        const Sentry = reqr('@sentry/node');
        Sentry.captureException(err);
      }
    } catch {}
    const status = err?.status || err?.statusCode || 500;
    if (status >= 500) {
      req.log?.error?.({ err }, 'Unhandled error');
    }
    if (!res.headersSent) {
      res.status(status).json({ error: status >= 500 ? 'Internal Server Error' : err?.message || 'Error' });
    }
  });

  const slowDownConfig = {
    windowMs: 15 * 60 * 1000,
    delayAfter: 50,
    // Use function form to avoid deprecation/warning and keep consistent behavior
    delayMs: () => 500,
    maxDelayMs: 20000,
    // Disable validation warnings for delayMs behavior
    validate: { delayMs: false, trustProxy: RATE_LIMIT_TRUST_PROXY },
  };
  app.use(slowDown(slowDownConfig));
}

export { applyPreMiddleware, applyPostMiddleware };
export default { applyPreMiddleware, applyPostMiddleware };
