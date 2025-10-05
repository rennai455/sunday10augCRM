const path = require('path');
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const metrics = require('../metrics');
const { checkAndSetReplay } = require('./replayStore');
const { pool, withAgencyContext } = require('../db');
const config = require('../config');
const { getRedisClient } = require('./redis');
const { auth, authenticateWeb, DEMO_SESSION_VALUE, DEMO_USER } = require('./auth');
const { recordAudit } = require('./audit');
const { sendLeadToDrip } = require('./utils/dripIntegration');
const { validate, schemas } = require('./validate');

const { JWT_SECRET, NODE_ENV, WEBHOOK_SECRET } = config;

// Replay TTL window
const REPLAY_TTL_MS = 5 * 60 * 1000;

function timingSafeEqHexHex(aHex, bHex) {
  const a = Buffer.from(aHex, 'hex');
  const b = Buffer.from(bHex, 'hex');
  if (a.length !== b.length) return false;
  try {
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

function registerWebhook(app) {
  app.post(
    '/webhook',
    express.raw({ type: 'application/json' }),
    (req, res) => {
      const signature = req.get('x-signature');
      if (!signature) {
        metrics.webhookEventsTotal?.inc({ outcome: 'missing_sig' });
        return res.status(401).json({ error: 'Missing signature' });
      }

      const id = req.get('x-id');
      const ts = req.get('x-timestamp');

      // Prefer signing scheme with id+timestamp for replay protection; otherwise fallback
      const toSign =
        id && ts
          ? Buffer.concat([
              Buffer.from(String(id)),
              Buffer.from('.'),
              Buffer.from(String(ts)),
              Buffer.from('.'),
              Buffer.from(req.body),
            ])
          : Buffer.from(req.body);

      const secrets = config.WEBHOOK_SECRET_LIST || [WEBHOOK_SECRET];
      let valid = false;
      for (const s of secrets) {
        const expected = crypto
          .createHmac('sha256', s)
          .update(toSign)
          .digest('hex');
        if (timingSafeEqHexHex(signature, expected)) {
          valid = true;
          break;
        }
      }
      if (!valid) {
        metrics.webhookEventsTotal?.inc({ outcome: 'invalid_sig' });
        return res.status(400).json({ error: 'Invalid signature' });
      }

      // Replay guard when id/timestamp provided
      if (id && ts) {
        const now = Date.now();
        const tsNum = Number(ts);
        if (!Number.isFinite(tsNum) || Math.abs(now - tsNum) > REPLAY_TTL_MS) {
          metrics.webhookEventsTotal?.inc({ outcome: 'stale' });
          return res.status(408).json({ error: 'Stale timestamp' });
        }
        // Check and set replay marker (Redis or in-memory fallback)
        // If marker already exists, it's a replay
        checkAndSetReplay(id, REPLAY_TTL_MS)
          .then((isReplay) => {
            if (isReplay) {
              metrics.webhookEventsTotal?.inc({ outcome: 'replay' });
              return res.status(409).json({ error: 'Replay detected' });
            }
            try {
              const payload = JSON.parse(req.body.toString('utf8'));
              req.log?.info({ id, ts, payload }, 'Webhook received');
              metrics.webhookEventsTotal?.inc({ outcome: 'accepted' });
              recordAudit(req, 'webhook:received', { id, ts });
              return res.json({ received: true });
            } catch {
              metrics.webhookEventsTotal?.inc({ outcome: 'invalid_json' });
              return res.status(400).json({ error: 'Invalid JSON' });
            }
          })
          .catch(() => res.status(500).json({ error: 'Replay guard failure' }));
        return; // Response handled in promise
      }

      // No id/timestamp: legacy signing over raw body only
      try {
        const payload = JSON.parse(req.body.toString('utf8'));
        req.log?.info({ id, ts, payload }, 'Webhook received');
        metrics.webhookEventsTotal?.inc({ outcome: 'accepted' });
        recordAudit(req, 'webhook:received', { id, ts });
        return res.json({ received: true });
      } catch {
        metrics.webhookEventsTotal?.inc({ outcome: 'invalid_json' });
        return res.status(400).json({ error: 'Invalid JSON' });
      }
    }
  );
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
      // If Redis configured, ensure it responds
      try {
        const rc = getRedisClient?.();
        if (rc && typeof rc.ping === 'function') {
          await Promise.race([
            rc.ping(),
            new Promise((_, rej) =>
              setTimeout(() => rej(new Error('Redis ping timeout')), 1500)
            ),
          ]);
        }
      } catch (e) {
        return res.status(503).json({ ready: false, redis: 'unavailable' });
      }
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

  // API Docs (admin-only)
  const requireAdmin = (req, res, next) => {
    if (!req.isAdmin) return res.status(403).send('Forbidden');
    next();
  };
  app.get('/docs', authenticateWeb, requireAdmin, (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'docs', 'swagger.html'));
  });
  app.get('/docs/openapi.json', authenticateWeb, requireAdmin, (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'docs', 'openapi.json'));
  });

  // Admin Audit page
  app.get('/Audit.html', authenticateWeb, requireAdmin, (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'Audit.html'));
  });

  app.post(
    '/api/auth/login',
    validate({ body: schemas.loginBody }),
    async (req, res) => {
      const { email, password } = req.body;
      if (!email || !password) {
        return res
          .status(400)
          .json({ success: false, message: 'Email and password required' });
      }

      if (email === 'admin@renn.ai' && password === 'secure123') {
        res.cookie('auth', DEMO_SESSION_VALUE, {
          httpOnly: true,
          sameSite: 'lax',
          secure: NODE_ENV === 'production',
          maxAge: 7 * 24 * 60 * 60 * 1000,
        });
        res.clearCookie('token', {
          httpOnly: true,
          secure: NODE_ENV === 'production',
          sameSite: 'lax',
        });
        recordAudit(req, 'auth:login', { demo: true });
        return res.json({ success: true });
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

        res.clearCookie('auth', { sameSite: 'lax', httpOnly: true, secure: NODE_ENV === 'production' });
        res.cookie('token', token, {
          httpOnly: true,
          secure: NODE_ENV === 'production',
          sameSite: 'lax',
          maxAge: 24 * 60 * 60 * 1000,
        });
        recordAudit(req, 'auth:login', {
          userId: user.id,
          agencyId: user.agency_id,
        });
        res.json({ success: true, token, expiresIn: 24 * 60 * 60 });
      } catch (error) {
        console.error('Login error:', error);
        res
          .status(500)
          .json({ success: false, message: 'Internal server error' });
      }
    }
  );

  app.post('/api/auth/logout', (req, res) => {
    res.clearCookie('token', {
      httpOnly: true,
      secure: NODE_ENV === 'production',
      sameSite: 'lax',
    });
    res.clearCookie('auth', {
      httpOnly: true,
      secure: NODE_ENV === 'production',
      sameSite: 'lax',
    });
    recordAudit(req, 'auth:logout');
    return res.json({ success: true });
  });

  app.post(
    '/api/admin/users',
    auth,
    validate({ body: schemas.userCreateBody }),
    async (req, res) => {
      if (!req.isAdmin) {
        return res.status(403).json({ error: 'Forbidden' });
      }

      const {
        email,
        password,
        isAdmin: makeAdmin = false,
        agencyId,
      } = req.body;
      const targetAgencyId = agencyId ?? req.agencyId;
      if (!targetAgencyId) {
        return res.status(400).json({ error: 'Agency context required' });
      }

      const normalizedEmail = email.trim().toLowerCase();

      try {
        const agencyCheck = await pool.query(
          'SELECT id FROM agencies WHERE id = $1',
          [targetAgencyId]
        );
        if (agencyCheck.rowCount === 0) {
          return res.status(404).json({ error: 'Agency not found' });
        }

        const passwordHash = await bcrypt.hash(password, 12);
        const insert = await pool.query(
          'INSERT INTO users (email, password_hash, agency_id, is_admin) VALUES ($1, $2, $3, $4) RETURNING id, email, agency_id, is_admin, created_at',
          [normalizedEmail, passwordHash, targetAgencyId, makeAdmin]
        );

        const created = insert.rows[0];
        await recordAudit(req, 'admin:user:create', {
          newUserId: created.id,
          agencyId: created.agency_id,
          isAdmin: created.is_admin,
        });

        return res.status(201).json({
          user: {
            id: created.id,
            email: created.email,
            agencyId: created.agency_id,
            isAdmin: created.is_admin,
            createdAt: created.created_at,
          },
        });
      } catch (err) {
        if (err?.code === '23505') {
          return res.status(409).json({ error: 'Email already exists' });
        }
        req.log?.error({ err }, 'Failed to create user');
        return res.status(500).json({ error: 'Failed to create user' });
      }
    }
  );

  app.get('/api/auth/me', auth, async (req, res) => {
    if (req.demoUser) {
      return res.json({
        success: true,
        email: req.demoUser.email,
        agency: req.demoUser.agency,
        role: req.demoUser.role,
      });
    }

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
      res
        .status(500)
        .json({ success: false, message: 'Internal server error' });
    }
  });

  app.get(
    '/api/campaigns',
    auth,
    validate({ query: schemas.paginationQuery }),
    async (req, res) => {
      try {
        const page = req.query.page || 1;
        const pageSize = req.query.pageSize || 50;
        const sortCol =
          req.query.sort === 'updated_at' ? 'updated_at' : 'created_at';
        const orderDir = req.query.order === 'asc' ? 'ASC' : 'DESC';
        const offset = (page - 1) * pageSize;

        const result = await withAgencyContext(req.agencyId, async (client) => {
          const countRes = await client.query(
            'SELECT COUNT(*)::int AS total FROM campaigns WHERE agency_id = $1',
            [req.agencyId]
          );
          const total = countRes.rows[0]?.total || 0;
          const rows = (
            await client.query(
              `SELECT * FROM campaigns WHERE agency_id = $1 ORDER BY ${sortCol} ${orderDir} LIMIT $2 OFFSET $3`,
              [req.agencyId, pageSize, offset]
            )
          ).rows;
          return { rows, total };
        });
        res.set('X-Total-Count', String(result.total));
        res.json({ campaigns: result.rows });
      } catch (error) {
        console.error('Get campaigns error:', error);
        res.status(500).json({ error: 'Failed to fetch campaigns' });
      }
    }
  );

  app.get(
    '/api/campaigns/:id',
    auth,
    validate({ params: schemas.idParam }),
    async (req, res) => {
      const { id } = req.params;
      try {
        const result = await withAgencyContext(req.agencyId, (client) =>
          client.query(
            'SELECT * FROM campaigns WHERE id = $1 AND agency_id = $2',
            [id, req.agencyId]
          )
        );
        if (result.rows.length === 0) {
          return res.status(404).json({ error: 'Campaign not found' });
        }
        res.json(result.rows[0]);
      } catch (error) {
        console.error('Get campaign error:', error);
        res.status(500).json({ error: 'Failed to fetch campaign' });
      }
    }
  );

  // Leads CRUD (tenant-scoped)
  app.get(
    '/api/leads',
    auth,
    validate({ query: schemas.leadsFilterQuery }),
    async (req, res) => {
      const {
        page = 1,
        pageSize = 50,
        campaignId,
        status,
        sort,
        order,
        from,
        to,
      } = req.query;
      const offset = (page - 1) * pageSize;
      const sortMap = {
        created_at: 'l.created_at',
        status: 'l.status',
        updated_at: 'l.updated_at',
      };
      const sortCol = sortMap[sort] || 'l.created_at';
      const orderDir = order === 'asc' ? 'ASC' : 'DESC';
      try {
        const result = await withAgencyContext(req.agencyId, async (client) => {
          const where = ['c.agency_id = $1'];
          const params = [req.agencyId];
          if (campaignId) {
            where.push('l.campaign_id = $' + (params.length + 1));
            params.push(campaignId);
          }
          if (status) {
            where.push('l.status = $' + (params.length + 1));
            params.push(status);
          }
          if (from) {
            where.push('l.created_at >= $' + (params.length + 1));
            params.push(new Date(from));
          }
          if (to) {
            where.push('l.created_at <= $' + (params.length + 1));
            params.push(new Date(to));
          }
          const whereSql = where.length ? 'WHERE ' + where.join(' AND ') : '';
          const countRes = await client.query(
            `SELECT COUNT(*)::int AS total FROM leads l JOIN campaigns c ON l.campaign_id = c.id ${whereSql}`,
            params
          );
          const total = countRes.rows[0]?.total || 0;
          const rows = (
            await client.query(
              `SELECT l.* FROM leads l JOIN campaigns c ON l.campaign_id = c.id ${whereSql} ORDER BY ${sortCol} ${orderDir} LIMIT $${
                params.length + 1
              } OFFSET $${params.length + 2}`,
              params.concat([pageSize, offset])
            )
          ).rows;
          return { rows, total };
        });
        res.set('X-Total-Count', String(result.total));
        res.json({ leads: result.rows });
      } catch (error) {
        console.error('List leads error:', error);
        res.status(500).json({ error: 'Failed to fetch leads' });
      }
    }
  );

  app.get(
    '/api/leads/:id',
    auth,
    validate({ params: schemas.idParam }),
    async (req, res) => {
      const { id } = req.params;
      try {
        const result = await withAgencyContext(req.agencyId, (client) =>
          client.query(
            'SELECT l.* FROM leads l JOIN campaigns c ON l.campaign_id = c.id WHERE l.id = $1 AND c.agency_id = $2',
            [id, req.agencyId]
          )
        );
        const lead = result.rows[0];
        if (!lead) return res.status(404).json({ error: 'Lead not found' });
        res.json(lead);
      } catch (error) {
        console.error('Get lead error:', error);
        res.status(500).json({ error: 'Failed to fetch lead' });
      }
    }
  );

  app.post(
    '/api/leads',
    auth,
    validate({ body: schemas.leadCreateBody }),
    async (req, res) => {
      const { campaign_id, name, email, phone, status } = req.body;
      try {
        const result = await withAgencyContext(req.agencyId, async (client) => {
          const campaign = await client.query(
            'SELECT id FROM campaigns WHERE id = $1 AND agency_id = $2',
            [campaign_id, req.agencyId]
          );
          if (campaign.rowCount === 0) {
            return { error: 'campaign-not-found' };
          }

          const insert = await client.query(
            'INSERT INTO leads (campaign_id, name, email, phone, status, status_history) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *',
            [
              campaign_id,
              name || null,
              email || null,
              phone || null,
              status || null,
              JSON.stringify([]),
            ]
          );

          const createdLead = insert.rows[0];
          recordAudit(req, 'lead:create', {
            id: createdLead.id,
            campaign_id,
            status: status || null,
          });

          return { lead: createdLead };
        });

        if (result?.error === 'campaign-not-found') {
          return res.status(404).json({ error: 'Campaign not found' });
        }

        const createdLead = result?.lead;
        if (!createdLead) {
          return res.status(500).json({ error: 'Failed to create lead' });
        }

        await sendLeadToDrip({
          name: createdLead.name || name || null,
          email: createdLead.email || email || null,
          company: req.body.company || null,
          painPoint: req.body.painPoint || null,
        });

        res.status(201).json(createdLead);
      } catch (error) {
        console.error('Create lead error:', error);
        res.status(500).json({ error: 'Failed to create lead' });
      }
    }
  );

  app.put(
    '/api/leads/:id',
    auth,
    validate({ params: schemas.idParam, body: schemas.leadUpdateBody }),
    async (req, res) => {
      const { id } = req.params;
      const fields = ['name', 'email', 'phone', 'status'];
      const set = [];
      const values = [];
      fields.forEach((f) => {
        if (Object.prototype.hasOwnProperty.call(req.body, f)) {
          set.push(`${f} = $${set.length + 1}`);
          values.push(req.body[f]);
        }
      });
      if (set.length === 0)
        return res.status(400).json({ error: 'No fields to update' });
      try {
        const updated = await withAgencyContext(
          req.agencyId,
          async (client) => {
            const sql =
              `UPDATE leads l SET ${set.join(', ')} FROM campaigns c WHERE l.campaign_id = c.id AND l.id = $$
            {idx} AND c.agency_id = $$ {aid} RETURNING l.*`
                .replace('$$\n            {idx}', `$${set.length + 1}`)
                .replace('$$ {aid}', `$${set.length + 2}`);
            const resu = await client.query(
              sql,
              values.concat([id, req.agencyId])
            );
            return resu.rows[0];
          }
        );
        if (!updated) return res.status(404).json({ error: 'Lead not found' });
        recordAudit(req, 'lead:update', { id, fields: Object.keys(req.body) });
        res.json(updated);
      } catch (error) {
        console.error('Update lead error:', error);
        res.status(500).json({ error: 'Failed to update lead' });
      }
    }
  );

  app.delete(
    '/api/leads/:id',
    auth,
    validate({ params: schemas.idParam }),
    async (req, res) => {
      const { id } = req.params;
      try {
        const deleted = await withAgencyContext(
          req.agencyId,
          async (client) => {
            const del = await client.query(
              'DELETE FROM leads USING campaigns WHERE leads.campaign_id = campaigns.id AND leads.id = $1 AND campaigns.agency_id = $2',
              [id, req.agencyId]
            );
            return del.rowCount > 0;
          }
        );
        if (!deleted) return res.status(404).json({ error: 'Lead not found' });
        recordAudit(req, 'lead:delete', { id });
        res.status(204).end();
      } catch (error) {
        console.error('Delete lead error:', error);
        res.status(500).json({ error: 'Failed to delete lead' });
      }
    }
  );

  // Recent lead activity (audit)
  app.get(
    '/api/audit/leads',
    auth,
    validate({ query: schemas.auditLimitQuery }),
    async (req, res) => {
      const limit = req.query.limit || 10;
      try {
        const result = await pool.query(
          `SELECT occurred_at, action FROM audit_log WHERE agency_id = $1 AND action LIKE 'lead:%' ORDER BY occurred_at DESC LIMIT $2`,
          [req.agencyId, limit]
        );
        res.json({ events: result.rows });
      } catch (error) {
        console.error('Audit fetch error:', error);
        res.status(500).json({ error: 'Failed to fetch activity' });
      }
    }
  );

  // Audit search (admin-only)
  app.get(
    '/api/audit/search',
    auth,
    (req, res, next) =>
      req.isAdmin ? next() : res.status(403).json({ error: 'Forbidden' }),
    validate({ query: schemas.auditSearchQuery }),
    async (req, res) => {
      const { limit = 50, action, from, to } = req.query;
      try {
        const parts = ['agency_id = $1'];
        const params = [req.agencyId];
        if (action) {
          parts.push('action ILIKE $' + (params.length + 1));
          params.push(action.endsWith('%') ? action : action + '%');
        }
        if (from) {
          parts.push('occurred_at >= $' + (params.length + 1));
          params.push(new Date(from));
        }
        if (to) {
          parts.push('occurred_at <= $' + (params.length + 1));
          params.push(new Date(to));
        }
        const where = 'WHERE ' + parts.join(' AND ');
        const rows = (
          await pool.query(
            `SELECT occurred_at, action FROM audit_log ${where} ORDER BY occurred_at DESC LIMIT $${
              params.length + 1
            }`,
            params.concat([limit])
          )
        ).rows;
        res.json({ events: rows });
      } catch (error) {
        console.error('Audit search error:', error);
        res.status(500).json({ error: 'Failed to fetch audit events' });
      }
    }
  );

  // Recent activity (any action)
  app.get(
    '/api/audit/recent',
    auth,
    validate({ query: schemas.auditLimitQuery }),
    async (req, res) => {
      const limit = req.query.limit || 5;
      try {
        const result = await pool.query(
          `SELECT occurred_at, action FROM audit_log WHERE agency_id = $1 ORDER BY occurred_at DESC LIMIT $2`,
          [req.agencyId, limit]
        );
        res.json({ events: result.rows });
      } catch (error) {
        console.error('Recent audit fetch error:', error);
        res.status(500).json({ error: 'Failed to fetch recent activity' });
      }
    }
  );

  app.get('/api/dashboard', auth, async (req, res) => {
    if (!req.agencyId) {
      return res.status(400).json({ error: 'Agency context required' });
    }
    try {
      const data = await withAgencyContext(req.agencyId, async (client) => {
        const totals = {
          campaigns: 0,
          leads: 0,
          averageScore: 0,
          activeClients: 0,
        };

        const campaignsCount = await client.query(
          'SELECT COUNT(*)::int AS count FROM campaigns WHERE agency_id = $1',
          [req.agencyId]
        );
        totals.campaigns = Number(campaignsCount.rows[0]?.count || 0);

        const leadsCount = await client.query(
          `SELECT COUNT(*)::int AS count
             FROM leads l
             JOIN campaigns c ON l.campaign_id = c.id
            WHERE c.agency_id = $1`,
          [req.agencyId]
        );
        totals.leads = Number(leadsCount.rows[0]?.count || 0);

        const activeClientsResult = await client.query(
          `SELECT COUNT(DISTINCT identifier)::int AS count
             FROM (
               SELECT COALESCE(NULLIF(TRIM(l.email), ''), NULLIF(TRIM(l.name), '')) AS identifier
                 FROM leads l
                 JOIN campaigns c ON l.campaign_id = c.id
                WHERE c.agency_id = $1
             ) s
            WHERE identifier IS NOT NULL`,
          [req.agencyId]
        );
        totals.activeClients = Number(activeClientsResult.rows[0]?.count || 0);

        const dealsTable = await client.query(
          "SELECT to_regclass('public.deals') IS NOT NULL AS exists"
        );
        if (dealsTable.rows[0]?.exists) {
          const averageScoreResult = await client.query(
            `SELECT COALESCE(AVG(d.probability)::int, 0) AS average_score
               FROM deals d
               JOIN leads l ON d.lead_id = l.id
               JOIN campaigns c ON l.campaign_id = c.id
              WHERE c.agency_id = $1`,
            [req.agencyId]
          );
          totals.averageScore = Number(
            averageScoreResult.rows[0]?.average_score || 0
          );
        }

        const recentCampaigns = await client.query(
          `SELECT
             c.id,
             (SELECT name
                FROM leads l
               WHERE l.campaign_id = c.id
                 AND l.name IS NOT NULL
               ORDER BY l.created_at ASC
               LIMIT 1) AS client,
             c.status,
             (SELECT COUNT(*)::int FROM leads l WHERE l.campaign_id = c.id) AS leads,
             c.created_at AS started_at
           FROM campaigns c
          WHERE c.agency_id = $1
          ORDER BY c.created_at DESC
          LIMIT 10`,
          [req.agencyId]
        );

        return { totals, recentCampaigns: recentCampaigns.rows };
      });

      res.json(data);
    } catch (error) {
      console.error('Dashboard metrics error:', error);
      res.status(500).json({ error: 'Failed to load dashboard data' });
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
