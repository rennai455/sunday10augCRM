require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const compression = require('compression');
const helmet = require('helmet');
const slowDown = require('express-slow-down');
const crypto = require('crypto');
const { pool } = require('./db');
const { createRateLimit } = require('./middleware/rateLimit');

if (!process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET not set');
}

const PORT = process.env.PORT || 3002;
const NODE_ENV = process.env.NODE_ENV || 'development';
const JWT_SECRET = process.env.JWT_SECRET;
const allowedOrigins = process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim()) : [];

const app = express();

app.use((req, res, next) => {
  res.locals.nonce = crypto.randomBytes(16).toString('base64');
  next();
});

app.use(
  helmet({
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        "script-src": ["'self'", (req, res) => `'nonce-${res.locals.nonce}'`, 'https://cdn.tailwindcss.com']
      }
    }
  })
);

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, origin || true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true
  })
);

app.use(express.json({ limit: '10mb', type: ['application/json', 'text/plain'] }));
app.use(compression());

const staticOpts = NODE_ENV === 'production' ? { maxAge: '1y', etag: true } : { maxAge: 0, etag: true };
app.use('/static', express.static(path.join(__dirname, 'public'), staticOpts));

const generalLimiter = createRateLimit(15 * 60 * 1000, 1000, 'Too many requests');
const authLimiter = createRateLimit(15 * 60 * 1000, 10, 'Too many authentication attempts');
const speedLimiter = slowDown({ windowMs: 15 * 60 * 1000, delayAfter: 50, delayMs: () => 500, maxDelayMs: 20000 });

app.use('/api/', generalLimiter, speedLimiter);
app.use('/api/auth/', authLimiter);

function authenticateJWT(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Missing token' });
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    res.status(403).json({ error: 'Invalid token' });
  }
}

const authenticateAgency = authenticateJWT;

app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'Login.html'));
});
app.get('/Login.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'Login.html'));
});
app.get('/dashboard.html', authenticateJWT, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

app.get('/healthz', (req, res) => {
  res.json({ ok: true });
});

app.get('/readyz', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ ready: true });
  } catch (e) {
    res.status(503).json({ ready: false });
  }
});

app.get('/api/agencies', authenticateJWT, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM agencies');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/agencies', async (req, res) => {
  const { name, email, password, subscription_tier } = req.body;
  try {
    const password_hash = await bcrypt.hash(password, 10);
    const result = await pool.query(
      'INSERT INTO agencies (name, email, password_hash, subscription_tier, api_key) VALUES ($1,$2,$3,$4,$5) RETURNING *',
      [name, email, password_hash, subscription_tier, 'api_' + Date.now()]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = app;

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Server listening on http://localhost:${PORT}`);
  });
}
