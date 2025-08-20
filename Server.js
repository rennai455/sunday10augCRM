// RENN.AI CRM SERVER
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const compression = require('compression');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const slowDown = require('express-slow-down');
const { pool } = require('./db');

const app = express();
const PORT = process.env.PORT || 3002;
const JWT_SECRET = process.env.JWT_SECRET || 'renn-ai-ultra-secure-key-production-2024';
const NODE_ENV = process.env.NODE_ENV || 'development';

// trust proxy in production
if (NODE_ENV === 'production') {
  app.set('trust proxy', 1);
}

app.use(compression());

// CORS allowlist
const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',')
  : [];
const corsOptionsDelegate = (req, callback) => {
  const origin = req.header('Origin');
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    callback(null, { origin: true, credentials: true });
  } else {
    callback(null, { origin: false });
  }
};
app.use(cors(corsOptionsDelegate));

// Helmet with CSP
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", 'cdn.tailwindcss.com'],
        styleSrc: ["'self'", 'https:', "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'https:'],
        connectSrc: ["'self'"],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
      },
    },
  })
);

app.use(
  express.json({ limit: '10mb', type: ['application/json', 'text/plain'] })
);

// Static assets
app.use(
  '/static',
  express.static(path.join(__dirname, 'public'), {
    setHeaders: (res, filePath) => {
      if (filePath.endsWith('.html')) {
        res.setHeader('Cache-Control', 'no-store');
      } else if (/\.[0-9a-f]{8}\./.test(path.basename(filePath))) {
        res.setHeader(
          'Cache-Control',
          'public, max-age=31536000, immutable'
        );
      }
    },
  })
);

// rate limit helpers
const createRateLimit = (windowMs, max, message) =>
  rateLimit({
    windowMs,
    max,
    message: { error: message, retryAfter: Math.ceil(windowMs / 1000) },
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => req.ip === '127.0.0.1' && NODE_ENV === 'development',
  });

const generalLimiter = createRateLimit(
  15 * 60 * 1000,
  1000,
  'Too many requests'
);
const authLimiter = createRateLimit(
  15 * 60 * 1000,
  10,
  'Too many authentication attempts'
);
const speedLimiter = slowDown({
  windowMs: 15 * 60 * 1000,
  delayAfter: 50,
  delayMs: () => 500,
  maxDelayMs: 20000,
  validate: { delayMs: false },
});

app.use('/api/auth', authLimiter, speedLimiter);
app.use('/api', (req, res, next) => {
  if (req.path.startsWith('/auth')) return next();
  return generalLimiter(req, res, () => speedLimiter(req, res, next));
});

// token helpers
function getToken(req) {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7);
  }
  const cookies = req.headers.cookie;
  if (cookies) {
    const match = cookies.match(/token=([^;]+)/);
    if (match) return match[1];
  }
  return null;
}
function authenticateJWT(req, res, next) {
  const token = getToken(req);
  if (!token) return res.status(401).json({ error: 'Missing token' });
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(403).json({ error: 'Invalid token' });
  }
}

// Auth routes (in-memory store)
const users = new Map();
app.post('/api/auth/register', async (req, res, next) => {
  try {
    const { email, password } = req.body;
    if (users.has(email)) {
      return res.json({ success: true });
    }
    const hash = await bcrypt.hash(password, 10);
    users.set(email, { email, hash });
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});
app.post('/api/auth/login', async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const user = users.get(email);
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });
    const ok = await bcrypt.compare(password, user.hash);
    if (!ok) return res.status(401).json({ error: 'Invalid credentials' });
    const token = jwt.sign({ email }, JWT_SECRET, { expiresIn: '1h' });
    res.cookie('token', token, { httpOnly: true, sameSite: 'lax' });
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});
app.post('/api/auth/logout', (req, res) => {
  res.clearCookie('token');
  res.json({ success: true });
});

// protect subsequent API routes
app.use('/api', (req, res, next) => {
  if (req.path.startsWith('/auth')) return next();
  return authenticateJWT(req, res, next);
});

// sample protected route
app.get('/api/agencies', (req, res) => {
  res.json([]);
});

// HTML routes
app.get('/login', (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.sendFile(path.join(__dirname, 'Login.html'));
});
app.get('/Login.html', (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.sendFile(path.join(__dirname, 'Login.html'));
});
app.get('/dashboard.html', authenticateJWT, (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.sendFile(path.join(__dirname, 'dashboard.html'));
});

// health endpoints
app.get('/healthz', (req, res) => {
  res.json({ status: 'ok' });
});
app.get('/readyz', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok' });
  } catch (err) {
    res.status(503).json({ status: 'error' });
  }
});
// backwards compatibility
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// central error handler
app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.message || 'Internal Server Error' });
});

// start server
function start() {
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

// export app
module.exports = app;

if (require.main === module) {
  start();
}
