// server.js - Super Server that merges everything together
// Routes are defined inline; no standalone apiRouter is used.
const express = require('express');
const path = require('path');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const slowDown = require('express-slow-down');
const pinoHttp = require('pino-http');
const crypto = require('crypto');
const { randomUUID } = crypto;
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const cookieParser = require('cookie-parser');
const metrics = require('./metrics');
const config = require('./config');
const { pool } = require('./db');

const app = express();
app.disable('x-powered-by');
app.enable('trust proxy'); // Railway/NGINX proxy

const { PORT, NODE_ENV, ALLOWED_ORIGINS, JWT_SECRET } = config;

/** request id + logging */
app.use((req, _res, next) => {
  req.id = randomUUID();
  next();
});
app.use(
  pinoHttp({
    genReqId: (req) => req.id,
    redact: ['req.headers.authorization'],
  })
);

/** Prometheus metrics */
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

/** CORS allowlist (no '*' + credentials) */
const raw = ALLOWED_ORIGINS || '';
const ALLOWLIST = raw
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin) return cb(null, true); // same-origin / curl
      if (ALLOWLIST.length === 0) return cb(null, true); // dev-open if not set
      cb(null, ALLOWLIST.includes(origin));
    },
    credentials: true,
    optionsSuccessStatus: 200,
  })
);

/** Security & compression */
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

/** Parsers + static */
app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: false, limit: '100kb' }));
app.use(cookieParser());

// Serve static files from public directory
app.use(
  '/static',
  express.static(path.join(__dirname, 'public'), {
    maxAge: NODE_ENV === 'production' ? '1y' : 0,
    etag: true,
  })
);

/** Rate limits (skip in dev) */
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

/** Health/readiness */
const healthHandler = async (_req, res) => {
  try {
    await pool.query('select 1');
    res.json({ status: 'healthy' });
  } catch {
    res.status(500).json({ status: 'error' });
  }
};
app.get('/healthz', healthHandler);
app.get('/health', healthHandler);

const readinessHandler = async (_req, res) => {
  try {
    await pool.query('select 1');
    res.json({ ready: true });
  } catch {
    res.status(503).json({ ready: false });
  }
};
app.get('/readyz', readinessHandler);
app.get('/readiness', readinessHandler);

app.get('/metrics', async (_req, res) => {
  res.set('Content-Type', metrics.register.contentType);
  res.end(await metrics.register.metrics());
});

/** Authentication middleware */
const auth = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  const cookieToken = req.cookies?.token;

  const token = authHeader?.startsWith('Bearer ')
    ? authHeader.substring(7)
    : cookieToken;

  if (!token) {
    return res.status(401).json({ error: 'No authentication token' });
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.userId = payload.userId;
    req.agencyId = payload.agencyId;
    req.isAdmin = payload.isAdmin;
    next();
  } catch (e) {
    res.status(401).json({ error: 'Invalid token' });
  }
};

/** API Routes */
// Auth routes
app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res
      .status(400)
      .json({ success: false, message: 'Email and password required' });
  }

  try {
    const result = await pool.query(
      'SELECT id, password_hash, agency_id, is_admin FROM users WHERE email = $1',
      [email]
    );
    const user = result.rows[0];
    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      return res
        .status(401)
        .json({ success: false, message: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { userId: user.id, agencyId: user.agency_id, isAdmin: user.is_admin },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.cookie('token', token, {
      httpOnly: true,
      secure: NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 24 * 60 * 60 * 1000,
    });

    res.json({
      success: true,
      token,
      user: {
        id: user.id,
        email,
        agencyId: user.agency_id,
        isAdmin: user.is_admin,
      },
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

app.post('/api/auth/logout', (req, res) => {
  res.clearCookie('token', {
    httpOnly: true,
    secure: NODE_ENV === 'production',
    sameSite: 'lax',
  });
  return res.json({ success: true });
});

app.get('/api/auth/me', auth, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT email, agency_id FROM users WHERE id = $1',
      [req.userId]
    );
    const user = result.rows[0];
    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: 'User not found' });
    }

    const agencyResult = await pool.query(
      'SELECT name FROM agencies WHERE id = $1',
      [user.agency_id]
    );
    const agency = agencyResult.rows[0]?.name;

    res.json({
      success: true,
      email: user.email,
      agency,
      role: req.isAdmin ? 'admin' : 'user',
    });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// Protected routes
app.get('/api/campaigns', auth, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM campaigns WHERE agency_id = $1 ORDER BY created_at DESC',
      [req.agencyId]
    );
    res.json({ campaigns: result.rows });
  } catch (error) {
    console.error('Get campaigns error:', error);
    res.status(500).json({ error: 'Failed to fetch campaigns' });
  }
});

app.get('/api/campaigns/:id', auth, async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query(
      'SELECT * FROM campaigns WHERE id = $1 AND agency_id = $2',
      [id, req.agencyId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Campaign not found' });
    }
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Get campaign error:', error);
    res.status(500).json({ error: 'Failed to fetch campaign' });
  }
});

// Serve static files (HTML, CSS, JS)
app.get('/', (req, res) => {
  res.redirect('/static/dashboard.html');
});

app.get('/dashboard.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'dashboard.html'));
});

app.get('/Login.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'Login.html'));
});

/** Error handling */
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, _next) => {
  req.log?.error({ err }, 'Unhandled error');
  res
    .status(err.status || 500)
    .json({ id: req.id, error: err.message || 'Internal Server Error' });
});

const server = app.listen(PORT, () => {
  console.log(`🚀 RENN.AI Ultra-Optimized Server running on port ${PORT}`);
  console.log(`📍 Environment: ${NODE_ENV}`);
  console.log(`🔗 Health check: http://localhost:${PORT}/health`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('🛑 SIGTERM received, shutting down gracefully');
  server.close(() => {
    console.log('✅ Server closed');
    process.exit(0);
  });
});

module.exports = { app, server, auth };

