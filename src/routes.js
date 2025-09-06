const path = require('path');
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const metrics = require('../metrics');
const { pool } = require('../db');
const config = require('../config');
const { auth, authenticateWeb } = require('./auth');

const { JWT_SECRET, NODE_ENV, WEBHOOK_SECRET } = config;

function registerWebhook(app) {
  app.post('/webhook', express.raw({ type: 'application/json' }), (req, res) => {
    const signature = req.get('x-signature');
    if (!signature) {
      return res.status(401).json({ error: 'Missing signature' });
    }

    const expected = crypto
      .createHmac('sha256', WEBHOOK_SECRET)
      .update(req.body)
      .digest('hex');

    const sigBuf = Buffer.from(signature, 'hex');
    const expBuf = Buffer.from(expected, 'hex');
    if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
      return res.status(400).json({ error: 'Invalid signature' });
    }

    try {
      const payload = JSON.parse(req.body.toString('utf8'));
      req.log?.info({ payload }, 'Webhook received');
      return res.json({ received: true });
    } catch {
      return res.status(400).json({ error: 'Invalid JSON' });
    }
  });
}

function registerRoutes(app) {
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

      res.json({ success: true });
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

  const sendDashboard = (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'dashboard.html'));
  };

  app.get('/', authenticateWeb, sendDashboard);
  app.get('/dashboard.html', authenticateWeb, sendDashboard);

  app.get('/Register.html', authenticateWeb, (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'Register.html'));
  });

  app.get('/Login.html', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'Login.html'));
  });

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, _next) => {
    req.log?.error({ err }, 'Unhandled error');
    res
      .status(err.status || 500)
      .json({ id: req.id, error: err.message || 'Internal Server Error' });
  });
}

module.exports = { registerWebhook, registerRoutes };
