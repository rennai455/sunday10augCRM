# RUNBOOK for renn-ai-crm

## Local Setup

1. Copy `.env.example` to `.env` and fill in secrets.
2. Run `docker compose up -d postgres` to start local Postgres.
3. Run `npm install` to install dependencies.
4. Run `npm run db:migrate` to apply DB schema (idempotent).
5. Run `npm run db:seed` to insert admin/sample data.
6. Run `npm install --dev && npm run diagnostics` to verify config and security.
7. Start server: `npm start`.

## Docker

- Use `docker build -t renn-ai-crm .` to build the multi-stage image.
- The container runs as non-root and exposes `PORT` (default 3005).
- Healthcheck targets `/healthz` via an internal Node script.

## Railway Deployment

1. Create Railway project and add Railway Postgres plugin.
2. In Railway's dashboard, add service variables:
   - `DATABASE_URL` (copy from Postgres plugin)
   - `JWT_SECRET`: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
   - `WEBHOOK_SECRET`: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
   - `PG_SSL=true`
   - `ALLOWED_ORIGINS` – comma-separated list of allowed domains, including your Railway domain (e.g. `https://your-railway-app.up.railway.app`)
   - Optional (prod): `REDIS_URL` for Redis-backed rate limits
3. Run `npm run migrate:db && npm run seed:db` in Railway shell.
4. Run `npm install --dev && npm run diagnostics` in Railway shell (should exit 0).
5. Deploy and visit `/health` for `{ ok: true }`.

For a more detailed walkthrough, see [docs/RUNBOOK.md](docs/RUNBOOK.md).

## Environment Variables

- DATABASE_URL
- PG_SSL
- JWT_SECRET
- WEBHOOK_SECRET
- ALLOWED_ORIGINS
- SEED_ADMIN_EMAIL
- SEED_ADMIN_PASSWORD
- REDIS_URL (optional for prod rate limits and webhook replay guard)
- API_RATE_WINDOW_MS (optional)
- API_RATE_MAX (optional)
- AUTH_RATE_WINDOW_MS (optional)
- AUTH_RATE_MAX (optional)

## Webhooks

- Required: `x-signature` header (HMAC-SHA256)
- Recommended: `x-id` and `x-timestamp` headers; the signature should be computed over `"<x-id>.<x-timestamp>.<raw-body>"` (dot-delimited). Requests older than 5 minutes or reused `x-id` are rejected.
  If `REDIS_URL` is set, replay tracking uses Redis (NX + PX). Otherwise an in-process fallback is used (single instance only).

## Acceptance Checklist

- [ ] All env vars present
- [ ] DB schema applied
- [ ] Admin user exists
- [ ] Security middleware enabled
- [ ] Diagnostics script passes
- [ ] /health returns { ok: true }
- [ ] No SQLite code or dependencies
- [ ] All /api/\* unauthorized without cookie
- [ ] CSV protected with ownership
- [ ] Webhook signature enforced
- [ ] Rate limiting metrics visible (`rate_limit_blocked_total`)
- [ ] Webhook metrics visible (`webhook_events_total`)
- [ ] Audit log entries on login/logout/webhook
- [ ] Login sets HttpOnly cookie; Logout clears it
- [ ] Static only at /static
