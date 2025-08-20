require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { pool } = require('./db');

const app = express();

app.enable('trust proxy');
app.use(rateLimit({ windowMs: 60_000, max: 120, standardHeaders: true, legacyHeaders: false }));

const raw = process.env.ALLOWED_ORIGINS || '';
const ALLOWLIST = raw.split(',').map(s => s.trim()).filter(Boolean);
app.use(cors({
  origin: (origin, cb) => {
    if (!origin) return cb(null, true);
    if (ALLOWLIST.length === 0) return cb(null, true);
    cb(null, ALLOWLIST.includes(origin));
  },
  credentials: true,
  optionsSuccessStatus: 200,
}));

app.use(helmet({
  crossOriginEmbedderPolicy: false,
  contentSecurityPolicy: {
    useDefaults: true,
    directives: {
      'script-src': ["'self'", 'https://cdn.tailwindcss.com'],
      'frame-ancestors': ["'none'"]
    }
  }
}));

app.use(express.json());

app.use('/static', express.static(path.join(__dirname, 'public'), {
  maxAge: process.env.NODE_ENV === 'production' ? '1y' : 0,
  etag: true,
}));

const users = new Map();

app.post('/api/auth/register', async (req, res) => {
  const { email, password } = req.body;
  const hash = await bcrypt.hash(password, 10);
  users.set(email, { email, passwordHash: hash });
  res.json({ success: true });
});

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  const user = users.get(email);
  if (!user) return res.status(401).json({ success: false });
  const match = await bcrypt.compare(password, user.passwordHash);
  if (!match) return res.status(401).json({ success: false });
  const token = jwt.sign({ email }, process.env.JWT_SECRET || 'secret');
  res.cookie('token', token, { httpOnly: true, sameSite: 'lax' });
  res.json({ success: true });
});

app.post('/api/auth/logout', (req, res) => {
  res.clearCookie('token');
  res.json({ success: true });
});

function authenticateJWT(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET || 'secret');
    next();
  } catch {
    res.status(401).json({ error: 'Unauthorized' });
  }
}

app.get('/api/campaigns/:id', authenticateJWT, (req, res) => {
  res.json({ id: req.params.id });
});

app.get('/health', (req,res)=>res.json({ status: 'ok', db: 'PostgreSQL' }));
app.get('/ready', async (req,res)=>{
  try { await pool.query('select 1'); return res.json({ ready: true }); }
  catch { return res.status(503).json({ ready: false }); }
});

app.get('/login', (req,res)=>res.sendFile(path.join(__dirname, 'Login.html')));
app.get('/Login.html', (req,res)=>res.sendFile(path.join(__dirname, 'Login.html')));
app.get('/dashboard.html', (req,res)=>res.sendFile(path.join(__dirname, 'dashboard.html')));

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  const status = err.status || 500;
  const message = process.env.NODE_ENV === 'production' ? 'Internal Server Error' : err.message;
  res.status(status).json({ error: message });
});

if (require.main === module) {
  const port = process.env.PORT || 3002;
  app.listen(port, () => console.log(`Server on http://localhost:${port}`));
} else {
  module.exports = app;
}
