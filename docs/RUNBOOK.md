# Railway Deployment RUNBOOK

## 1. Railway service & variables
- Create Railway Project
- Provision PostgreSQL → copy `DATABASE_URL` (likely includes `?sslmode=require`).
- Connect GitHub repo as a Web Service.
- Set service variables:

```
NODE_ENV=production
# Do not set PORT; Railway injects it
DATABASE_URL=<Railway URL incl. ?sslmode=require>
PG_SSL=true
JWT_SECRET=<strong random 32B base64>
WEBHOOK_SECRET=<strong random 32B base64>
ALLOWED_ORIGINS=https://<your-subdomain>.up.railway.app,https://another-domain.com
RATE_LIMIT_TRUST_PROXY=true
# Optional hardening
ADMIN_API_TOKEN=<strong token>          # header: X-Admin-Token (for /api/admin/*)
METRICS_TOKEN=<strong token>            # header: X-Metrics-Token (for /metrics)
METRICS_INTERNAL_ONLY=false             # only disable internal-only metrics if required
REDIS_URL=<Railway Redis URL>           # enables Redis-backed rate limiting
```

(Generate secrets locally with: `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`)
`ALLOWED_ORIGINS` accepts a comma-separated list of domains.

## 2. First deploy
- The `postinstall` script runs `npm run build` to generate `public/dist/main.css` before the server starts.
- Deploy from GitHub.
- After the container is running, open Railway Shell and execute:

```
node db/run-migrations.js
node db/seed.js
```

## 3. Smoke checks
- `GET https://<app>/health` → `{ status: 'ok', db: 'PostgreSQL' }`
- `HEAD https://<app>/Login.html` → has `Content-Security-Policy`
- `HEAD https://<app>/health` with `Origin: https://<app>` → `Access-Control-Allow-Origin` present.
- `GET https://<app>/metrics` → 401 unless `X-Metrics-Token` valid (or 404 if internal-only)
- `GET https://<app>/dashboard.html` (no session) → redirect to `Login.html`
