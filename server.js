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

        "default-src": ["'self'"],
        "script-src": [
          "'self'",
          "https://cdn.tailwindcss.com",
          `'nonce-${res.locals.cspNonce}'`
        ],
        "style-src": [
          "'self'",
          "https://cdn.tailwindcss.com",
          "https://fonts.googleapis.com",
          `'nonce-${res.locals.cspNonce}'`
        ],
        "font-src": ["'self'", "https://fonts.gstatic.com"],
        "img-src": ["'self'", "data:"],
        "connect-src": ["'self'"],
        "frame-ancestors": ["'none'"]
      }
    }

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

// Serve static files from public directory
app.use(
  '/static',
  express.static(path.join(__dirname, 'public'), {
    maxAge: NODE_ENV === 'production' ? '1y' : 0,
    etag: true,
  })
);

/** Rate limits (skip in dev) */
const makeLimiter = (windowMs, max, message) => {
  return rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: message },
    skip: () => NODE_ENV === 'development'
  });
};

    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: message },
const makeLimiter = (windowMs, max, message) => {
  const opts = { windowMs, max, message, skip: () => NODE_ENV === 'development' };
  if (NODE_ENV !== 'production') {
    opts.validate = { trustProxy: false };
  }
  return rateLimit(opts);
};

app.use('/api/', makeLimiter(15 * 60 * 1000, 1000, 'Too many requests'));
app.use('/api/auth/', makeLimiter(15 * 60 * 1000, 10, 'Too many auth attempts'));

const slowDownConfig = {
  windowMs: 15 * 60 * 1000,
  delayAfter: 50,
  delayMs: () => 500,
  maxDelayMs: 20000
};
if (NODE_ENV !== 'production') {
  slowDownConfig.validate = { delayMs: false, trustProxy: false };
}
app.use(slowDown(slowDownConfig));


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

/** Authentication middleware */
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res
      .status(401)
      .json({ success: false, error: 'Access token required' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res
        .status(403)
        .json({ success: false, error: 'Invalid or expired token' });
    }
    req.user = user;
    next();
  });
};

/** Static page routes */
// Serve login.html as static for unauthenticated users
app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'Login.html'));
});

// Also serve at /Login.html for direct access
app.get('/Login.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'Login.html'));
});

// Serve dashboard.html (authentication handled by frontend)
app.get('/dashboard.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

// Serve register page
app.get('/Register.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'Register.html'));
});

// Root route redirects to login
app.get('/', (req, res) => {
  res.redirect('/Login.html');
});

/** Authentication API routes */
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email and password are required',
      });
    }

    // For demo purposes, accept demo credentials
    if (email === 'demo@renn.ai' && password === 'demo123') {
      const token = jwt.sign(
        { id: 1, email: 'demo@renn.ai', role: 'admin', agency: 'Demo Agency' },
        JWT_SECRET,
        { expiresIn: '24h' }
      );

      return res.json({
        success: true,
        token,
        user: {
          id: 1,
          email: 'demo@renn.ai',
          role: 'admin',
          agency: 'Demo Agency',
        },
      });
    }

    // Try database authentication
    const result = await pool.query(
      'SELECT id, email, password_hash, name FROM agencies WHERE email = $1',
      [email.toLowerCase()]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials',
      });
    }

    const user = result.rows[0];
    const isValid = await bcrypt.compare(password, user.password_hash);

    if (!isValid) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials',
      });
    }

    const token = jwt.sign(
      { id: user.id, email: user.email, role: 'admin', agency: user.name },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({
      success: true,
      token,
      user: {
        id: user.id,
        email: user.email,
        role: 'admin',
        agency: user.name,
      },
    });
  } catch (error) {
    req.log?.error({ error }, 'Login error');
    res.status(500).json({
      success: false,
      message: 'Internal server error',
    });
  }
});

app.post('/api/auth/register', async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Name, email, and password are required',
      });
    }

    // Check if user already exists
    const existing = await pool.query(
      'SELECT id FROM agencies WHERE email = $1',
      [email.toLowerCase()]
    );

    if (existing.rows.length > 0) {
      return res.status(409).json({
        success: false,
        message: 'User already exists',
      });
    }

    // Hash password and create user
    const passwordHash = await bcrypt.hash(password, 10);
    const result = await pool.query(
      'INSERT INTO agencies (name, email, password_hash) VALUES ($1, $2, $3) RETURNING id, email, name',
      [name, email.toLowerCase(), passwordHash]
    );

    const user = result.rows[0];
    const token = jwt.sign(
      { id: user.id, email: user.email, role: 'admin', agency: user.name },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.status(201).json({
      success: true,
      token,
      user: {
        id: user.id,
        email: user.email,
        role: 'admin',
        agency: user.name,
      },
    });
  } catch (error) {
    req.log?.error({ error }, 'Registration error');
    res.status(500).json({
      success: false,
      message: 'Internal server error',
    });
  }
});

app.get('/api/auth/me', authenticateToken, (req, res) => {
  res.json({
    success: true,
    id: req.user.id,
    email: req.user.email,
    role: req.user.role,
    agency: req.user.agency,
  });
});

app.post('/api/auth/logout', (req, res) => {
  // In a stateless JWT system, logout is handled client-side
  res.json({ success: true, message: 'Logged out successfully' });
});

/** API routes for CRM functionality */
app.get('/api/campaigns', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM campaigns WHERE agency_id = $1 ORDER BY created_at DESC',
      [req.user.id]
    );
    res.json({ success: true, campaigns: result.rows });
  } catch (error) {
    req.log?.error({ error }, 'Campaigns fetch error');
    res
      .status(500)
      .json({ success: false, error: 'Failed to fetch campaigns' });
  }
});

app.post('/api/campaigns', authenticateToken, async (req, res) => {
  try {
    const { name, status = 'draft', details = {} } = req.body;

    if (!name) {
      return res
        .status(400)
        .json({ success: false, error: 'Campaign name is required' });
    }

    const result = await pool.query(
      'INSERT INTO campaigns (agency_id, name, status, details) VALUES ($1, $2, $3, $4) RETURNING *',
      [req.user.id, name, status, details]
    );

    res.status(201).json({ success: true, campaign: result.rows[0] });
  } catch (error) {
    req.log?.error({ error }, 'Campaign creation error');
    res
      .status(500)
      .json({ success: false, error: 'Failed to create campaign' });
  }
});

app.get('/api/clients', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM clients WHERE agency_id = $1 ORDER BY created_at DESC',
      [req.user.id]
    );
    res.json({ success: true, clients: result.rows });
  } catch (error) {
    req.log?.error({ error }, 'Clients fetch error');
    res.status(500).json({ success: false, error: 'Failed to fetch clients' });
  }
});

app.post('/api/clients', authenticateToken, async (req, res) => {
  try {
    const { name, email } = req.body;

    if (!name || !email) {
      return res
        .status(400)
        .json({ success: false, error: 'Client name and email are required' });
    }

    const result = await pool.query(
      'INSERT INTO clients (agency_id, name, email) VALUES ($1, $2, $3) RETURNING *',
      [req.user.id, name, email]
    );

    res.status(201).json({ success: true, client: result.rows[0] });
  } catch (error) {
    req.log?.error({ error }, 'Client creation error');
    res.status(500).json({ success: false, error: 'Failed to create client' });
  }
});

app.get('/api/analytics/overview', authenticateToken, async (req, res) => {
  try {
    // Get campaign count
    const campaignCount = await pool.query(
      'SELECT COUNT(*) as count FROM campaigns WHERE agency_id = $1',
      [req.user.id]
    );

    // Get client count
    const clientCount = await pool.query(
      'SELECT COUNT(*) as count FROM clients WHERE agency_id = $1',
      [req.user.id]
    );

    // Get lead count
    const leadCount = await pool.query(
      'SELECT COUNT(*) as count FROM leads l JOIN campaigns c ON l.campaign_id = c.id WHERE c.agency_id = $1',
      [req.user.id]
    );

    res.json({
      success: true,
      data: {
        campaigns: parseInt(campaignCount.rows[0].count),
        clients: parseInt(clientCount.rows[0].count),
        leads: parseInt(leadCount.rows[0].count),
        conversion_rate: '12.5%', // Mock data
      },
    });
  } catch (error) {
    req.log?.error({ error }, 'Analytics fetch error');
    res
      .status(500)
      .json({ success: false, error: 'Failed to fetch analytics' });
  }
});

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, _next) => {
  req.log?.error({ err }, 'Unhandled error');
  res.status(err.status || 500).json({
    id: req.id,
    error: err.message || 'Internal Server Error',
  });
});

const server = app.listen(PORT, () => {
  console.log(`🚀 Super Server listening on http://localhost:${PORT}`);
  console.log(`Environment: ${NODE_ENV}`);
  console.log(`Static files served from: ${path.join(__dirname, 'public')}`);
});

const shutdown = () => {
  console.log('Shutting down gracefully...');
  const timer = setTimeout(() => {
    console.error('Forced shutdown');
    process.exit(1);
  }, 10000);

  server.close(() => {
    clearTimeout(timer);
    pool.end().catch((err) => {
      console.error('Error closing database pool:', err);
    });
    console.log('Server shutdown complete');
    process.exit(0);
  });
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

module.exports = { app, server };
