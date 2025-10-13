import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import metrics from '../metrics.js';
import { checkAndSetReplay } from './replayStore.js';
import { pool, withAgencyContext, withTransaction } from './db/pool.js';
import config from '../config/index.js';
import { getRedisClient } from './redis.js';
import { auth, authenticateWeb } from './auth.js';
import { recordAudit } from './audit.js';
import { sendLeadToDrip } from './utils/dripIntegration.js';
import { validate, schemas } from './validate.js';
import { scoreLead } from './utils/leadScoring.js';
import { enrichLead } from './utils/enrichment.js';
import { recordTimelineEvent } from './utils/leadTimeline.js';
import { addLeadEvent, getLeadTimeline as getLeadEvents } from './utils/leadEvents.js';
import { detectSourceFromReferer } from './utils/sourceDetection.js';
import { cloneCampaign as cloneCampaignUtil } from './utils/campaignCloner.js';
import { suggestNextStep } from './utils/dealCoach.js';
import { encryptSecret, decryptSecret } from './security/encryption.js';
import { createTotpSecret, generateRecoveryCodes, verifyTotp } from './security/totp.js';
import { captureSecurityEvent } from './utils/alerting.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const {
  JWT_SECRET,
  NODE_ENV,
  WEBHOOK_SECRET,
  METRICS_TOKEN,
  METRICS_INTERNAL_ONLY,
  METRICS_ALLOWED_HOST_SUFFIX,
  ADMIN_API_TOKEN,
  PASSWORD_RESET_TOKEN_TTL_MINUTES,
} = config;

// Replay TTL window
const REPLAY_TTL_MS = 5 * 60 * 1000;
const LOGIN_TOKEN_TTL_SECONDS = 24 * 60 * 60;
const TOTP_CHALLENGE_TTL_SECONDS = 5 * 60;
const TOTP_RATE_LIMIT_WINDOW_MS = 5 * 60 * 1000;
const PASSWORD_RESET_REQUEST_WINDOW_MS = 15 * 60 * 1000;
const PASSWORD_RESET_REQUEST_MAX = 3;

const normalizeEmail = (email) => String(email || '').trim().toLowerCase();

async function hashRecoveryCodes(codes) {
  return Promise.all(codes.map((code) => bcrypt.hash(code, 12)));
}

function coerceRecoveryCodes(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

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

function signAuthToken(user) {
  return jwt.sign(
    { userId: user.id, agencyId: user.agency_id, isAdmin: user.is_admin },
    JWT_SECRET,
    { expiresIn: LOGIN_TOKEN_TTL_SECONDS }
  );
}

function setAuthCookies(res, token) {
  res.clearCookie('auth', {
    sameSite: 'lax',
    httpOnly: true,
    secure: NODE_ENV === 'production',
  });
  res.cookie('token', token, {
    httpOnly: true,
    secure: NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: LOGIN_TOKEN_TTL_SECONDS * 1000,
  });
}

function createTotpChallengeToken(user) {
  return jwt.sign(
    {
      userId: user.id,
      agencyId: user.agency_id,
      isAdmin: user.is_admin,
      type: 'totp_challenge',
    },
    JWT_SECRET,
    { expiresIn: TOTP_CHALLENGE_TTL_SECONDS }
  );
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
        const sourceInput = payload.source || detectSourceFromReferer(req);
        const utm = {
          utm_medium: payload.utm_medium || null,
          utm_source: payload.utm_source || null,
          utm_campaign: payload.utm_campaign || null,
          utm_term: payload.utm_term || null,
          utm_content: payload.utm_content || null,
        };
        req.log?.info({ id, ts, payload }, 'Webhook received');
        metrics.webhookEventsTotal?.inc({ outcome: 'accepted' });
        recordAudit(req, 'webhook:received', { id, ts });
        // Optionally store attribution event (no DB insert here since webhook handler isn't creating a lead directly)
        try {
          if (payload.lead_id && (sourceInput || Object.values(utm).some(Boolean))) {
            addLeadEvent(Number(payload.lead_id), 'source', `Lead captured from source: ${sourceInput || 'unknown'}`, { source: sourceInput, utm });
          }
        } catch {}
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

  const totpAttemptLimiter = rateLimit({
    windowMs: TOTP_RATE_LIMIT_WINDOW_MS,
    max: 5,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => {
      const base = ipKeyGenerator(req.ip);
      const bodyToken = req.body?.challengeToken || '';
      return bodyToken ? `${base}:${bodyToken}` : base;
    },
    handler: (_req, res) =>
      res.status(429).json({ error: 'Too many verification attempts' }),
  });

  const passwordResetLimiter = rateLimit({
    windowMs: PASSWORD_RESET_REQUEST_WINDOW_MS,
    max: PASSWORD_RESET_REQUEST_MAX,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => {
      const base = ipKeyGenerator(req.ip);
      const email = normalizeEmail(req.body?.email);
      return email ? `${base}:${email}` : base;
    },
    handler: (_req, res) =>
      res.status(429).json({ error: 'Too many password reset requests' }),
  });

  // Protect metrics: internal-only (optional) and token or admin
  app.get('/metrics', async (req, res) => {
    const internalOnly = NODE_ENV === 'production' ? true : METRICS_INTERNAL_ONLY;
    if (internalOnly) {
      const host = String(
        req.headers['x-forwarded-host'] || req.hostname || req.headers.host || ''
      ).toLowerCase();
      const suffix = String(METRICS_ALLOWED_HOST_SUFFIX || 'railway.internal').toLowerCase();
      if (!host.endsWith(suffix)) return res.status(404).end();
    }
    const allowToken = NODE_ENV !== 'production' && METRICS_TOKEN;
    if (allowToken) {
      const provided = req.headers['x-metrics-token'] || req.query.token;
      if (provided !== METRICS_TOKEN) return res.status(401).send('Unauthorized');
      res.set('Content-Type', metrics.register.contentType);
      return res.end(await metrics.register.metrics());
    }
    return authenticateWeb(req, res, async () => {
      if (!req.isAdmin) return res.status(403).send('Forbidden');
      res.set('Content-Type', metrics.register.contentType);
      res.end(await metrics.register.metrics());
    });
  });

  // API Docs (admin-only)
  const requireAdmin = (req, res, next) => {
    if (!req.isAdmin) return res.status(403).send('Forbidden');
    next();
  };
  // Optional admin API token guard: if ADMIN_API_TOKEN is set and provided, allow without cookie
  const adminApiGuard = (req, res, next) => {
    const expected = ADMIN_API_TOKEN;
    if (expected) {
      const provided = req.headers['x-admin-token'] || req.query.admin_token;
      if (provided === expected) {
        req.adminTokenBypass = true;
        return next();
      }
    }
    if (req.isAdmin) return next();
    return res.status(403).json({ error: 'Forbidden' });
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

      // Demo login path removed in production build

      try {
        const normalizedEmail = normalizeEmail(email);
        const result = await pool.query(
          `SELECT id, password_hash, agency_id, is_admin, totp_enabled
             FROM users WHERE email = $1`,
          [normalizedEmail]
        );
        const user = result.rows[0];
        if (!user || !(await bcrypt.compare(password, user.password_hash))) {
          captureSecurityEvent('auth:invalid_credentials', {
            email: normalizedEmail,
            ip: req.ip || null,
          });
          return res
            .status(401)
            .json({ success: false, message: 'Invalid credentials' });
        }

        const totpRequired = Boolean(user.totp_enabled);
        if (totpRequired) {
          const challengeToken = createTotpChallengeToken(user);
          await recordAudit(req, 'auth:login:totp_challenge', {
            userId: user.id,
            agencyId: user.agency_id,
          });
          return res.json({
            success: true,
            requiresTotp: true,
            challengeToken,
            expiresIn: TOTP_CHALLENGE_TTL_SECONDS,
          });
        }

        const token = signAuthToken(user);
        setAuthCookies(res, token);
        await recordAudit(req, 'auth:login', {
          userId: user.id,
          agencyId: user.agency_id,
        });
        res.json({ success: true, token, expiresIn: LOGIN_TOKEN_TTL_SECONDS });
      } catch (error) {
        console.error('Login error:', error);
        res
          .status(500)
          .json({ success: false, message: 'Internal server error' });
      }
    }
  );

  app.post(
    '/api/auth/totp/verify',
    totpAttemptLimiter,
    validate({ body: schemas.totpVerifyBody }),
    async (req, res) => {
      const { challengeToken, code, recoveryCode } = req.body;
      let payload;
      try {
        payload = jwt.verify(challengeToken, JWT_SECRET);
      } catch {
        captureSecurityEvent('auth:totp_invalid_challenge', {
          ip: req.ip || null,
        });
        return res
          .status(401)
          .json({ success: false, message: 'Invalid or expired challenge' });
      }
      if (payload.type !== 'totp_challenge') {
        captureSecurityEvent('auth:totp_invalid_payload', {
          ip: req.ip || null,
        });
        return res.status(400).json({ success: false, message: 'Invalid challenge' });
      }

      try {
        const userRes = await pool.query(
          `SELECT id, agency_id, is_admin, totp_secret_encrypted, totp_secret_iv, totp_enabled, totp_recovery_codes
             FROM users WHERE id = $1`,
          [payload.userId]
        );
        if (userRes.rowCount === 0) {
          return res.status(404).json({ success: false, message: 'User not found' });
        }
        const user = userRes.rows[0];
        if (!user.totp_enabled) {
          return res.status(400).json({ success: false, message: 'TOTP not enabled' });
        }

        const secret = decryptSecret(
          user.totp_secret_encrypted,
          user.totp_secret_iv
        );
        if (!secret) {
          return res.status(500).json({ success: false, message: 'Secret unavailable' });
        }

        let verified = false;
        let usedRecovery = false;
        if (code && verifyTotp(secret, code)) {
          verified = true;
        }

        let remaining = coerceRecoveryCodes(user.totp_recovery_codes);
        if (!verified && recoveryCode) {
          const normalized = recoveryCode.toUpperCase();
          for (let i = 0; i < remaining.length; i += 1) {
            const hashed = remaining[i];
            // eslint-disable-next-line no-await-in-loop
            const match = await bcrypt.compare(normalized, hashed);
            if (match) {
              verified = true;
              usedRecovery = true;
              remaining = remaining.filter((_, idx) => idx !== i);
              break;
            }
          }
          if (verified) {
            await pool.query(
              'UPDATE users SET totp_recovery_codes = $1 WHERE id = $2',
              [JSON.stringify(remaining), user.id]
            );
          }
        }

        if (!verified) {
          captureSecurityEvent('auth:totp_failure', {
            userId: user.id,
            ip: req.ip || null,
            usedRecovery: Boolean(recoveryCode),
          });
          return res
            .status(401)
            .json({ success: false, message: 'Invalid verification code' });
        }

        const token = signAuthToken(user);
        setAuthCookies(res, token);
        req.userId = user.id;
        req.agencyId = user.agency_id;
        await recordAudit(req, 'auth:login:totp', {
          userId: user.id,
          agencyId: user.agency_id,
          viaRecovery: usedRecovery,
        });
        return res.json({
          success: true,
          token,
          expiresIn: LOGIN_TOKEN_TTL_SECONDS,
          recoveryUsed: usedRecovery,
        });
      } catch (error) {
        console.error('TOTP verify error:', error);
        return res
          .status(500)
          .json({ success: false, message: 'Internal server error' });
      }
    }
  );

  app.post(
    '/api/auth/password-reset/request',
    passwordResetLimiter,
    validate({ body: schemas.passwordResetRequest }),
    async (req, res) => {
      const email = normalizeEmail(req.body.email);
      try {
        const userRes = await pool.query(
          'SELECT id, agency_id FROM users WHERE email = $1',
          [email]
        );
        let tokenForResponse;
        if (userRes.rowCount > 0) {
          const user = userRes.rows[0];
          const rawToken = crypto.randomBytes(32).toString('hex');
          const tokenHash = crypto
            .createHash('sha256')
            .update(rawToken)
            .digest('hex');
          const expiresAt = new Date(
            Date.now() + PASSWORD_RESET_TOKEN_TTL_MINUTES * 60 * 1000
          );
          await pool.query(
            'UPDATE password_reset_tokens SET used_at = NOW() WHERE user_id = $1 AND used_at IS NULL',
            [user.id]
          );
          await pool.query(
            `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at, request_ip, request_user_agent)
               VALUES ($1, $2, $3, $4, $5)`,
            [
              user.id,
              tokenHash,
              expiresAt,
              req.ip || null,
              req.get('user-agent') || null,
            ]
          );
          req.userId = user.id;
          req.agencyId = user.agency_id;
          await recordAudit(req, 'auth:password_reset:requested', {
            userId: user.id,
          });
          if (NODE_ENV !== 'production') {
            tokenForResponse = rawToken;
          }
        }

        const body = { success: true, delivery: 'email' };
        if (tokenForResponse) body.token = tokenForResponse;
        return res.status(202).json(body);
      } catch (error) {
        console.error('Password reset request error:', error);
        return res
          .status(500)
          .json({ success: false, message: 'Failed to queue reset' });
      }
    }
  );

  app.post(
    '/api/auth/password-reset/confirm',
    validate({ body: schemas.passwordResetConfirm }),
    async (req, res) => {
      const { token, password } = req.body;
      const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
      const now = new Date();
      let resetRecord;
      try {
        await withTransaction(async (client) => {
          const tokenRes = await client.query(
            `SELECT prt.id, prt.user_id, prt.expires_at, prt.used_at, u.agency_id
               FROM password_reset_tokens prt
               JOIN users u ON prt.user_id = u.id
              WHERE prt.token_hash = $1
              FOR UPDATE`,
            [tokenHash]
          );
          if (tokenRes.rowCount === 0) {
            throw new Error('invalid');
          }
          const reset = tokenRes.rows[0];
          if (reset.used_at || new Date(reset.expires_at) < now) {
            throw new Error('expired');
          }
          const newHash = await bcrypt.hash(password, 12);
          await client.query('UPDATE users SET password_hash = $1 WHERE id = $2', [
            newHash,
            reset.user_id,
          ]);
          await client.query('UPDATE password_reset_tokens SET used_at = NOW() WHERE id = $1', [
            reset.id,
          ]);
          resetRecord = reset;
        });
      } catch (error) {
        if (error.message === 'invalid' || error.message === 'expired') {
          captureSecurityEvent('auth:password_reset_invalid', {
            reason: error.message,
            ip: req.ip || null,
          });
          return res
            .status(400)
            .json({ success: false, message: 'Invalid or expired token' });
        }
        console.error('Password reset confirm error:', error);
        return res
          .status(500)
          .json({ success: false, message: 'Failed to reset password' });
      }

      req.userId = resetRecord.user_id;
      req.agencyId = resetRecord.agency_id;
      await recordAudit(req, 'auth:password_reset:completed', {
        userId: resetRecord.user_id,
      });
      return res.json({ success: true });
    }
  );

  // Lead coaching suggestion
  app.get(
    '/api/leads/:id/suggestion',
    auth,
    validate({ params: schemas.idParam }),
    async (req, res) => {
      const { id } = req.params;
      try {
        // Verify lead belongs to agency and fetch summary fields
        const leadRes = await withAgencyContext(req.agencyId, (client) =>
          client.query(
            `SELECT l.id, l.status, l.score, l.is_client, l.keywords, l.created_at
               FROM leads l
               JOIN campaigns c ON l.campaign_id = c.id
              WHERE l.id = $1 AND c.agency_id = $2
              LIMIT 1`,
            [id, req.agencyId]
          )
        );
        if (leadRes.rowCount === 0) return res.status(404).json({ error: 'Lead not found' });
        const lead = leadRes.rows[0];

        // Use event stream for recent activity
        const timeline = await getLeadEvents(Number(id));
        const { suggestion, reason } = suggestNextStep(lead, timeline || []);
        return res.json({ suggestion, reason });
      } catch (err) {
        console.error('Lead suggestion error:', err);
        return res.status(500).json({ error: 'Failed to compute suggestion' });
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
    adminApiGuard,
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

  app.post(
    '/api/admin/users/:id/totp/setup',
    auth,
    adminApiGuard,
    validate({ params: schemas.idParam }),
    async (req, res) => {
      if (!req.isAdmin && !req.adminTokenBypass) {
        return res.status(403).json({ error: 'Forbidden' });
      }

      const targetId = Number(req.params.id);
      if (!Number.isFinite(targetId)) {
        return res.status(400).json({ error: 'Invalid user id' });
      }

      try {
        const userRes = await pool.query(
          'SELECT id, email, agency_id FROM users WHERE id = $1',
          [targetId]
        );
        if (userRes.rowCount === 0) {
          return res.status(404).json({ error: 'User not found' });
        }
        const targetUser = userRes.rows[0];
        const sameAgency =
          !req.agencyId || Number(req.agencyId) === Number(targetUser.agency_id);
        if (!sameAgency && !req.adminTokenBypass) {
          return res.status(403).json({ error: 'Cross-agency setup blocked' });
        }

        const { secret, otpauthUrl } = createTotpSecret(targetUser.email);
        const encrypted = encryptSecret(secret);
        const recoveryCodes = generateRecoveryCodes();
        const hashedRecovery = await hashRecoveryCodes(recoveryCodes);
        await pool.query(
          `UPDATE users
              SET totp_secret_encrypted = $1,
                  totp_secret_iv = $2,
                  totp_enabled = TRUE,
                  totp_enrolled_at = NOW(),
                  totp_recovery_codes = $3
            WHERE id = $4`,
          [
            encrypted.ciphertext,
            encrypted.iv,
            JSON.stringify(hashedRecovery),
            targetUser.id,
          ]
        );

        await recordAudit(req, 'admin:totp:setup', {
          targetUserId: targetUser.id,
          agencyId: targetUser.agency_id,
          viaAdminToken: Boolean(req.adminTokenBypass),
        });

        return res.json({
          success: true,
          secret: {
            base32: secret,
            otpauthUrl,
          },
          recoveryCodes,
        });
      } catch (error) {
        console.error('TOTP setup error:', error);
        return res.status(500).json({ error: 'Failed to configure TOTP' });
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
      const sourceInput = req.body.source || detectSourceFromReferer(req);
      const utm = {
        utm_medium: req.body.utm_medium || req.body.utmMedium || null,
        utm_source: req.body.utm_source || req.body.utmSource || null,
        utm_campaign: req.body.utm_campaign || req.body.utmCampaign || null,
        utm_term: req.body.utm_term || req.body.utmTerm || null,
        utm_content: req.body.utm_content || req.body.utmContent || null,
      };
      // Enrich + compute score based on provided payload
      const enrichment = await enrichLead({ email });
      const { score: computedScore, reasons: scoreReasons } = scoreLead({
        email,
        website: enrichment?.websiteFound ? `https://${enrichment.enrichedDomain}` : '',
        keywords: enrichment?.keywords || [],
        painPoint: req.body.painPoint,
      });
      if (scoreReasons?.length) {
        // Optional logging for visibility; consider persisting later
        req.log?.info?.({ score: computedScore, reasons: scoreReasons }, 'Lead scored');
      }
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
            `INSERT INTO leads (
               campaign_id, name, email, phone, status,
               score, is_client, status_history,
               website, keywords, enriched_at, website_found,
               source, utm_medium, utm_source, utm_campaign, utm_term, utm_content, converted_at
             ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
             RETURNING *`,
            [
              campaign_id,
              name || null,
              email || null,
              phone || null,
              status || null,
              computedScore ?? null,
              false,
              JSON.stringify([]),
              enrichment?.websiteFound ? enrichment.enrichedDomain : null,
              (enrichment?.keywords && enrichment.keywords.length) ? enrichment.keywords : null,
              new Date(),
              Boolean(enrichment?.websiteFound),
              sourceInput || null,
              utm.utm_medium,
              utm.utm_source,
              utm.utm_campaign,
              utm.utm_term,
              utm.utm_content,
              null,
            ]
          );

          const createdLead = insert.rows[0];
          recordAudit(req, 'lead:create', {
            id: createdLead.id,
            campaign_id,
            status: status || null,
            score: computedScore ?? null,
          });
          await recordAudit(req, 'lead.created', { lead: createdLead, enrichment });
          try {
            await addLeadEvent(createdLead.id, 'created', 'Lead created from form or manual entry');
            if (sourceInput || Object.values(utm).some(Boolean)) {
              await addLeadEvent(createdLead.id, 'source', `Lead captured from source: ${sourceInput || 'unknown'}`, { source: sourceInput, utm });
            }
          } catch {}
          if (enrichment?.websiteFound || (enrichment?.keywords?.length || 0) > 0) {
            try { await addLeadEvent(createdLead.id, 'enriched', 'Lead enriched via external domain', { website: enrichment?.websiteFound ? enrichment.enrichedDomain : null, keywords: enrichment?.keywords || [] }); } catch {}
          }
          // Timeline: creation + score
          await recordTimelineEvent(client, createdLead.id, 'creation', { source: 'manual' });
          if (Number.isFinite(computedScore)) {
            await recordTimelineEvent(client, createdLead.id, 'score_update', {
              score: computedScore,
              reasons: scoreReasons || [],
            });
          }

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
      const fields = ['name', 'email', 'phone', 'status', 'score'];
      const set = [];
      const values = [];
      // Capture previous status for better status-change messages
      let prevStatus = null;
      try {
        const prev = await withAgencyContext(
          req.agencyId,
          (client) =>
            client.query(
              `SELECT l.status FROM leads l JOIN campaigns c ON l.campaign_id = c.id WHERE l.id = $1 AND c.agency_id = $2 LIMIT 1`,
              [id, req.agencyId]
            )
        );
        if (prev.rowCount > 0) prevStatus = prev.rows[0]?.status || null;
      } catch {}
      fields.forEach((f) => {
        if (Object.prototype.hasOwnProperty.call(req.body, f)) {
          set.push(`${f} = $${set.length + 1}`);
          values.push(req.body[f]);
        }
      });
      // Special-case camelCase -> snake_case for isClient
      if (Object.prototype.hasOwnProperty.call(req.body, 'isClient')) {
        set.push(`is_client = $${set.length + 1}`);
        values.push(Boolean(req.body.isClient));
      }
      // Enrichment fields mapping
      if (Object.prototype.hasOwnProperty.call(req.body, 'websiteFound')) {
        set.push(`website_found = $${set.length + 1}`);
        values.push(Boolean(req.body.websiteFound));
      }
      if (Object.prototype.hasOwnProperty.call(req.body, 'keywords')) {
        set.push(`keywords = $${set.length + 1}`);
        values.push(Array.isArray(req.body.keywords) ? req.body.keywords : []);
      }
      if (Object.prototype.hasOwnProperty.call(req.body, 'enrichedAt')) {
        set.push(`enriched_at = $${set.length + 1}`);
        values.push(req.body.enrichedAt ? new Date(req.body.enrichedAt) : null);
      }
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
        // Audit general update
        recordAudit(req, 'lead:update', { id, fields: Object.keys(req.body) });
        // Timeline: summarize updated fields
        await recordTimelineEvent(pool, id, 'manual_update', { fields: Object.keys(req.body) });
        // Timeline: status change
        if (Object.prototype.hasOwnProperty.call(req.body, 'status')) {
          await recordTimelineEvent(pool, id, 'status_change', { from: prevStatus || null, to: req.body.status });
        }
        // Timeline: score update
        if (Object.prototype.hasOwnProperty.call(req.body, 'score')) {
          await recordTimelineEvent(pool, id, 'score_update', { score: req.body.score });
        }
        // Audit explicit client mark/unmark when requested
        if (Object.prototype.hasOwnProperty.call(req.body, 'isClient')) {
          recordAudit(req, 'lead.markClient', { leadId: id, isClient: Boolean(req.body.isClient) });
          if (Boolean(req.body.isClient) === true) {
            await recordTimelineEvent(pool, id, 'conversion', { isClient: true });
          }
        }
        // Event entries for status/score (more human-readable)
        if (Object.prototype.hasOwnProperty.call(req.body, 'status')) {
          try {
            const newStatus = String(req.body.status || '');
            if (newStatus && newStatus !== (prevStatus || '')) {
              await addLeadEvent(Number(id), 'status', `Status changed from ${prevStatus || 'unknown'} to ${newStatus}`);
            } else if (newStatus) {
              await addLeadEvent(Number(id), 'status', `Status changed to ${newStatus}`);
            }
          } catch {}
        }
        if (Object.prototype.hasOwnProperty.call(req.body, 'score')) {
          try { await addLeadEvent(Number(id), 'score', `Score updated to ${req.body.score}`); } catch {}
        }
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

  // Lead intake: manual (authenticated)
  app.post(
    '/api/leads/manual',
    auth,
    validate({ body: schemas.leadManualBody }),
    async (req, res) => {
      const { campaign_id, name, email, phone, status, triggerDrip } = req.body;
      const sourceInput2 = req.body.source || detectSourceFromReferer(req);
      const utm2 = {
        utm_medium: req.body.utm_medium || req.body.utmMedium || null,
        utm_source: req.body.utm_source || req.body.utmSource || null,
        utm_campaign: req.body.utm_campaign || req.body.utmCampaign || null,
        utm_term: req.body.utm_term || req.body.utmTerm || null,
        utm_content: req.body.utm_content || req.body.utmContent || null,
      };
      try {
        const created = await withAgencyContext(req.agencyId, async (client) => {
          const campaign = await client.query(
            'SELECT id FROM campaigns WHERE id = $1 AND agency_id = $2',
            [campaign_id, req.agencyId]
          );
          if (campaign.rowCount === 0) return { error: 'campaign-not-found' };
          const enrichment = await enrichLead({ email });
          const { score: computedScore } = scoreLead({
            email,
            website: enrichment?.websiteFound ? `https://${enrichment.enrichedDomain}` : '',
            keywords: enrichment?.keywords || [],
          });
          const insert = await client.query(
            `INSERT INTO leads (
               campaign_id, name, email, phone, status,
               score, is_client, status_history,
               website, keywords, enriched_at, website_found,
               source, utm_medium, utm_source, utm_campaign, utm_term, utm_content, converted_at
             ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
             RETURNING *`,
            [
              campaign_id,
              name || null,
              email || null,
              phone || null,
              status || null,
              computedScore ?? null,
              false,
              JSON.stringify([]),
              enrichment?.websiteFound ? enrichment.enrichedDomain : null,
              (enrichment?.keywords && enrichment.keywords.length) ? enrichment.keywords : null,
              new Date(),
              Boolean(enrichment?.websiteFound),
              sourceInput2 || null,
              utm2.utm_medium,
              utm2.utm_source,
              utm2.utm_campaign,
              utm2.utm_term,
              utm2.utm_content,
              null,
            ]
          );
          return insert.rows[0];
        });
        if (created?.error === 'campaign-not-found') {
          return res.status(404).json({ error: 'Campaign not found' });
        }

        recordAudit(req, 'lead:intake:manual', { id: created.id, campaign_id });
        try {
          if (sourceInput2 || Object.values(utm2).some(Boolean)) {
            await addLeadEvent(created.id, 'source', `Lead captured from source: ${sourceInput2 || 'unknown'}`, { source: sourceInput2, utm: utm2 });
          }
        } catch {}
        // Timeline + events: manual creation
        await recordTimelineEvent(pool, created.id, 'creation', { source: 'manual' });
        try { await addLeadEvent(created.id, 'created', 'Lead created from form or manual entry'); } catch {}
        if (triggerDrip) {
          await sendLeadToDrip({
            name: created.name || name || null,
            email: created.email || email || null,
            company: req.body.company || null,
            painPoint: req.body.painPoint || null,
          });
        }

        return res.status(201).json(created);
      } catch (error) {
        console.error('Manual lead intake error:', error);
        return res.status(500).json({ error: 'Failed to create lead' });
      }
    }
  );

  // Lead intake: public form (no auth; HMAC protected)
  app.post(
    '/api/leads/form',
    express.raw({ type: 'application/json' }),
    async (req, res) => {
      try {
        const signature = req.get('x-signature');
        if (!signature) return res.status(401).json({ error: 'Missing signature' });
        const secrets = config.WEBHOOK_SECRET_LIST || [config.WEBHOOK_SECRET];
        let valid = false;
        for (const s of secrets) {
          const expected = crypto.createHmac('sha256', s).update(req.body).digest('hex');
          if (expected === signature) { valid = true; break; }
        }
        if (!valid) return res.status(400).json({ error: 'Invalid signature' });

        // Parse payload after HMAC verification
        const parsed = JSON.parse(req.body.toString('utf8')) || {};
        const { campaign_id, name, email, phone, status } = parsed;
        if (!campaign_id) return res.status(400).json({ error: 'campaign_id required' });

        // Derive agency from campaign
        const campaignRes = await pool.query('SELECT agency_id FROM campaigns WHERE id = $1', [campaign_id]);
        const agencyId = campaignRes.rows[0]?.agency_id;
        if (!agencyId) return res.status(404).json({ error: 'Campaign not found' });

        const created = await withAgencyContext(agencyId, async (client) => {
          const insert = await client.query(
            'INSERT INTO leads (campaign_id, name, email, phone, status, status_history) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *',
            [campaign_id, name || null, email || null, phone || null, status || null, JSON.stringify([])]
          );
          return insert.rows[0];
        });

        recordAudit(req, 'lead:intake:form', { id: created.id, campaign_id });
        // Timeline: form creation
        await recordTimelineEvent(pool, created.id, 'creation', { source: 'form' });
        await sendLeadToDrip({
          name: created.name || name || null,
          email: created.email || email || null,
          company: parsed.company || null,
          painPoint: parsed.painPoint || null,
        });

        return res.status(201).json(created);
      } catch (error) {
        console.error('Form lead intake error:', error);
        return res.status(500).json({ error: 'Failed to create lead' });
      }
    }
  );

  // Lead intake: bulk import (JSON or CSV). Admin-only.
  app.post(
    '/api/leads/import',
    auth,
    // Admin gate similar to /docs
    (req, res, next) => (req.isAdmin ? next() : res.status(403).json({ error: 'Forbidden' })),
    async (req, res) => {
      try {
        const ct = (req.headers['content-type'] || '').toLowerCase();
        let items = [];
        let triggerDrip = false;

        if (ct.includes('application/json')) {
          // Expect JSON body with { items, triggerDrip? }
          const body = req.body && typeof req.body === 'object' ? req.body : {};
          const arr = Array.isArray(body.items) ? body.items : Array.isArray(body) ? body : [];
          items = arr.map((x) => ({
            campaign_id: Number(x.campaign_id),
            name: x.name ?? null,
            email: x.email ?? null,
            phone: x.phone ?? null,
            status: x.status ?? null,
          }));
          triggerDrip = Boolean(body.triggerDrip);
        } else if (ct.includes('text/csv')) {
          // Naive CSV parser (header line required). For complex CSVs, use a proper parser.
          const text = typeof req.body === 'string' ? req.body : req.body?.toString?.('utf8');
          if (!text) return res.status(400).json({ error: 'Empty CSV' });
          const [headerLine, ...rows] = text.split(/\r?\n/).filter(Boolean);
          const headers = headerLine.split(',').map((h) => h.trim());
          items = rows.map((line) => {
            const cols = line.split(',');
            const obj = {};
            headers.forEach((h, i) => (obj[h] = cols[i] ?? ''));
            return {
              campaign_id: Number(obj['campaign_id']),
              name: obj['name'] || null,
              email: obj['email'] || null,
              phone: obj['phone'] || null,
              status: obj['status'] || null,
            };
          });
          triggerDrip = false;
        } else {
          return res.status(415).json({ error: 'Unsupported Content-Type' });
        }

        if (!items.length) return res.status(400).json({ error: 'No items to import' });

        const results = await withAgencyContext(req.agencyId, async (client) => {
          const out = { inserted: 0, failures: 0, errors: [] };
          // Verify all campaigns belong to agency
          const campaignIds = Array.from(new Set(items.map((i) => i.campaign_id))).filter((n) => Number.isFinite(n));
          if (campaignIds.length) {
            const chk = await client.query(
              `SELECT id FROM campaigns WHERE agency_id = $1 AND id = ANY($2::int[])`,
              [req.agencyId, campaignIds]
            );
            const ok = new Set(chk.rows.map((r) => r.id));
            for (const id of campaignIds) {
              if (!ok.has(id)) return { error: 'campaign-out-of-scope', id };
            }
          }

          for (const item of items) {
            try {
              const insert = await client.query(
                'INSERT INTO leads (campaign_id, name, email, phone, status, status_history) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *',
                [item.campaign_id, item.name, item.email, item.phone, item.status, JSON.stringify([])]
              );
              const created = insert.rows[0];
              out.inserted++;
              recordAudit(req, 'lead:intake:import', { id: created.id, campaign_id: item.campaign_id });
              // Timeline: import creation
              await recordTimelineEvent(client, created.id, 'creation', { source: 'import' });
              if (triggerDrip) {
                // Fire and forget drip
                sendLeadToDrip({
                  name: created.name || item.name || null,
                  email: created.email || item.email || null,
                  company: null,
                  painPoint: null,
                }).catch(() => {});
              }
            } catch (e) {
              out.failures++;
              out.errors.push({ campaign_id: item.campaign_id, message: String(e?.message || e) });
            }
          }
          return out;
        });

        if (results?.error === 'campaign-out-of-scope') {
          return res.status(403).json({ error: 'Campaign outside your agency', campaign_id: results.id });
        }

        return res.status(202).json(results);
      } catch (error) {
        console.error('Import leads error:', error);
        return res.status(500).json({ error: 'Failed to import leads' });
      }
    }
  );

  // Lead sources summary (from audit log)
  app.get('/api/leads/sources', auth, async (req, res) => {
    try {
      const data = await withAgencyContext(req.agencyId, (client) =>
        client.query(
          `SELECT COALESCE(regexp_replace(action, '^lead:intake:', ''), 'unknown') AS source, COUNT(*)::int AS count
             FROM audit_log
            WHERE agency_id = $1 AND action LIKE 'lead:intake:%'
            GROUP BY source
            ORDER BY count DESC`,
          [req.agencyId]
        )
      );
      return res.json({ sources: data.rows });
    } catch (error) {
      console.error('Lead sources error:', error);
      return res.status(500).json({ error: 'Failed to fetch lead sources' });
    }
  });

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

  // Lead timeline (events): unified structured events for a given lead (scoped by agency)
  app.get(
    '/api/leads/:id/timeline',
    auth,
    validate({ params: schemas.idParam }),
    async (req, res) => {
      const { id } = req.params;
      try {
        // Verify lead belongs to the current agency
        const exists = await withAgencyContext(req.agencyId, (client) =>
          client.query(
            `SELECT 1
               FROM leads l
               JOIN campaigns c ON l.campaign_id = c.id
              WHERE l.id = $1 AND c.agency_id = $2
              LIMIT 1`,
            [id, req.agencyId]
          )
        );
        if (exists.rowCount === 0) return res.status(404).json({ error: 'Lead not found' });

        const events = await getLeadEvents(Number(id));
        return res.json({ events });
      } catch (error) {
        console.error('Lead timeline fetch error:', error);
        return res.status(500).json({ error: 'Failed to fetch lead timeline' });
      }
    }
  );

  // Lead events: append a new event (follow-up, note, etc.)
  app.post(
    '/api/leads/:id/events',
    auth,
    validate({ params: schemas.idParam }),
    async (req, res) => {
      const { id } = req.params;
      const { type, message, metadata } = req.body || {};
      if (!type || !message) return res.status(400).json({ error: 'type and message are required' });
      try {
        // Verify lead in agency
        const exists = await withAgencyContext(req.agencyId, (client) =>
          client.query(
            `SELECT 1 FROM leads l JOIN campaigns c ON l.campaign_id = c.id WHERE l.id = $1 AND c.agency_id = $2 LIMIT 1`,
            [id, req.agencyId]
          )
        );
        if (exists.rowCount === 0) return res.status(404).json({ error: 'Lead not found' });
        await addLeadEvent(Number(id), String(type), String(message), (metadata && typeof metadata === 'object') ? metadata : {});
        return res.status(201).json({ ok: true });
      } catch (err) {
        console.error('Add lead event error:', err);
        return res.status(500).json({ error: 'Failed to add event' });
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

        // Converted leads (marked as client)
        const convertedRes = await client.query(
          `SELECT COUNT(*)::int AS count
             FROM leads l
             JOIN campaigns c ON l.campaign_id = c.id
            WHERE c.agency_id = $1 AND l.is_client = TRUE`,
          [req.agencyId]
        );
        totals.convertedLeadCount = Number(convertedRes.rows[0]?.count || 0);

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

  // Clone campaign API
  app.post('/api/campaigns/:id/clone', auth, async (req, res) => {
    const sourceId = req.params.id;
    const { name, cloneLeads } = req.body || {};
    if (!name || typeof name !== 'string') {
      return res.status(400).json({ error: 'name is required' });
    }
    try {
      const result = await withAgencyContext(req.agencyId, async (client) => {
        return await cloneCampaignUtil(client, req.agencyId, sourceId, { name: name.trim(), cloneLeads: Boolean(cloneLeads) });
      });
      // Audit + high-level events (no per-lead events here, handled in utility via SQL)
      recordAudit(req, 'campaign.clone', { from: Number(sourceId), to: result.newCampaignId, leadsCopied: result.leadsCopied });
      return res.status(201).json(result);
    } catch (err) {
      if ((err?.message || '').includes('not found')) {
        return res.status(404).json({ error: 'Campaign not found' });
      }
      console.error('Clone campaign error:', err);
      return res.status(500).json({ error: 'Failed to clone campaign' });
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

export { registerWebhook, registerRoutes };
export default { registerWebhook, registerRoutes };
