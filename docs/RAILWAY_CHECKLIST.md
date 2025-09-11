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
  - Optional: `REDIS_URL=<railway redis url>`
  - Optional: `API_RATE_WINDOW_MS, API_RATE_MAX, AUTH_RATE_WINDOW_MS, AUTH_RATE_MAX`

- First deploy
  - Shell → `node db/run-migrations.js`
  - Shell → `node db/seed.js`
  - Shell → `npm install --dev && node scripts/diagnostics.js`
  - Verify `/health`, `/readyz` and `/metrics`

- Monitoring
  - Alert on 5xx rate, p95 latency, rate_limit_blocked_total spikes
  - Alert on webhook_events_total outcomes: invalid_sig/replay/stale

- Security
  - Rotate secrets quarterly; scope ALLOWED_ORIGINS tightly
  - HSTS enabled by default in production
  - Webhooks use HMAC + optional replay via Redis

