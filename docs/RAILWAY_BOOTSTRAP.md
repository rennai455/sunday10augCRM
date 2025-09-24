# Railway Bootstrap Guide

This guide gets the CRM running on Railway with sane defaults and a quick post-deploy checklist.

## 1) Create service + Postgres

- Create a Railway project
- Add the PostgreSQL plugin to the project
- Add a new Web Service connected to your GitHub repo

## 2) Set service variables

Set these on the Web Service in Railway:

```
NODE_ENV=production
PORT=3005
DATABASE_URL=<copy from Railway Postgres; includes ?sslmode=require>
PG_SSL=true
JWT_SECRET=<32B random base64>
WEBHOOK_SECRET=<32B random base64>
ALLOWED_ORIGINS=https://your-frontend.example,https://your-railway-subdomain.up.railway.app
# Optional (recommended in prod)
# REDIS_URL=redis://default:<password>@<host>:<port>
# SENTRY_DSN=<dsn>
# OTEL_EXPORTER_OTLP_ENDPOINT=https://otel.example/v1/traces

# Initial seed admin (first-time setup only)
SEED_ADMIN_EMAIL=admin@renn.ai
SEED_ADMIN_PASSWORD=<strong-password>
```

Generate secrets locally:

```
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Notes:

- ALLOWED_ORIGINS is a comma-separated list. Include your frontend domain(s).
- If you will use cookie auth cross-site, you must set cookies with `SameSite=None; Secure` and configure CORS with credentials. Otherwise, prefer Bearer tokens for SPAs.

## 3) First deploy + DB prep

Deploy once from GitHub. When the container is running:

1. Open Railway Shell for the service and run:

```
node db/run-migrations.js
node db/seed.js
```

2. Optional sanity checks:

```
npm install --dev
npm run diagnostics
```

3. Smoke check endpoints:

- GET /health → `{ status: 'healthy' }`
- GET /readyz → `{ ready: true }`
- GET /metrics → Prometheus text output

## 4) n8n → CRM webhooks

- Use HMAC headers: `x-id`, `x-timestamp`, `x-signature`
- Signature = HMAC-SHA256 of `"<x-id>.<x-timestamp>.<raw-body>"` with `WEBHOOK_SECRET`
- See docs/N8N-HMAC-RECIPE.md for a drop-in node sequence

## 5) SPA frontend integration

- Login returns `{ success, token, expiresIn }` and also sets an HttpOnly cookie for same-site pages
- For SPAs on a different domain, store the `token` in memory and send `Authorization: Bearer <token>` for API calls
- Set ALLOWED_ORIGINS to your SPA’s origin; CSRF is enforced only for cookie-based state-changing requests

## 6) Operations

- Rotate webhook secrets with `WEBHOOK_SECRETS` (comma-separated). Keep the old and new in place during rotation.
- Optional Postgres RLS: enable with `PG_ENABLE_RLS=true` after running `npm run db:rls`
- Rate limits: tune via env vars (see README.md)
