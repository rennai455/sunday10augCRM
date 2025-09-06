const express = require('express');
const path = require('path');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const slowDown = require('express-slow-down');
const pinoHttp = require('pino-http');
const crypto = require('crypto');
const cookieParser = require('cookie-parser');
const metrics = require('../metrics');
const config = require('../config');

const { NODE_ENV, ALLOWED_ORIGINS } = config;

function applyPreMiddleware(app) {
  app.use((req, _res, next) => {
    req.id = crypto.randomUUID();
    next();
  });

  app.use(
    pinoHttp({
      genReqId: (req) => req.id,
      redact: ['req.headers.authorization'],
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
  const ALLOWLIST = raw.split(',').map((s) => s.trim()).filter(Boolean);
  app.use(
    cors({
      origin: (origin, cb) => {
        if (!origin) return cb(null, true);
        if (ALLOWLIST.length === 0) return cb(null, true);
        cb(null, ALLOWLIST.includes(origin));
      },
      credentials: true,
      optionsSuccessStatus: 200,
    })
  );

  app.use((req, res, next) => {
    res.locals.cspNonce = crypto.randomBytes(16).toString('base64');
    helmet({
      crossOriginEmbedderPolicy: false,
      contentSecurityPolicy: {
        useDefaults: true,
        directives: {
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
        },
      },
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

  const makeLimiter = (windowMs, max, message) =>
    rateLimit({
      windowMs,
      max,
      standardHeaders: true,
      legacyHeaders: false,
      message: { error: message },
      skip: () => NODE_ENV === 'development',
    });
  app.use('/api/', makeLimiter(15 * 60 * 1000, 1000, 'Too many requests'));
  app.use(
    '/api/auth/',
    makeLimiter(15 * 60 * 1000, 10, 'Too many auth attempts')
  );

  const slowDownConfig = {
    windowMs: 15 * 60 * 1000,
    delayAfter: 50,
    delayMs: 500,
    maxDelayMs: 20000,
  };
  if (NODE_ENV !== 'production') {
    slowDownConfig.validate = { delayMs: false, trustProxy: false };
  }
  app.use(slowDown(slowDownConfig));
}

module.exports = { applyPreMiddleware, applyPostMiddleware };
