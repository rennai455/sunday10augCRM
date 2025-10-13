# Railway Deployment Checklist

- Service
  - Use repo’s Dockerfile (multi-stage, non-root, healthcheck)
  - Auto deploy from main branch, protected branches enabled

- Variables (Service → Variables)
  - `NODE_ENV=production`
  - `DATABASE_URL=<railway postgres url incl. ?sslmode=require>`
  - `PG_SSL=true`
  - `JWT_SECRET=<strong 32B secret>`
  - `WEBHOOK_SECRET=<strong 32B secret>`
  - `ALLOWED_ORIGINS=https://<your-app>.up.railway.app,https://<custom-domain>`
  - `SEED_ADMIN_EMAIL=<admin@domain>`
  - `SEED_ADMIN_PASSWORD=<one-time strong password>`
  - Optional (recommended): `ADMIN_API_TOKEN=<strong token>` (required for `/api/admin/*` if set)
  - Optional (recommended): `METRICS_TOKEN=<strong token>` (non-production scraping)
  - Optional: `METRICS_INTERNAL_ONLY=true` (serve `/metrics` only to `*.railway.internal`)
  - Optional: `METRICS_ALLOWED_HOST_SUFFIX=railway.internal` (override suffix for internal-only)
  - Optional: `TOTP_ENCRYPTION_KEY=<64 hex chars>` (encrypt MFA seeds)
  - Optional: `SENTRY_DSN=<sentry project dsn>`
  - Optional: `PASSWORD_RESET_TOKEN_TTL_MINUTES=30`
  - Optional: `REDIS_URL=<railway redis url>`
  - Optional: `API_RATE_WINDOW_MS, API_RATE_MAX, AUTH_RATE_WINDOW_MS, AUTH_RATE_MAX`

- First deploy
  - Shell → `node db/run-migrations.js`
  - Shell → `node db/seed.js`
  - Shell → `npm install --dev && node scripts/diagnostics.js`
  - Verify `/health`, `/readyz` and `/metrics`

- Monitoring
  - Alert on 5xx rate, auth failure spikes (Sentry + metrics), `rate_limit_blocked_total`
  - Alert on webhook_events_total outcomes: invalid_sig/replay/stale

- Security
  - Rotate secrets quarterly; scope ALLOWED_ORIGINS tightly (closed by default if unset)
  - HSTS enabled by default in production
  - Webhooks use HMAC + optional replay via Redis
  - Admins provision MFA via `/api/admin/users/:id/totp/setup`; `/metrics` is internal-only when `NODE_ENV=production`
  - Password reset tokens are single-use, time-bound, and audited
