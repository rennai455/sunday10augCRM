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
METRICS_TOKEN=<strong token>            # only honoured outside production
METRICS_INTERNAL_ONLY=true              # restrict /metrics to *.railway.internal
METRICS_ALLOWED_HOST_SUFFIX=railway.internal
TOTP_ENCRYPTION_KEY=<64 hex chars>      # AES-256 key for MFA secrets
SENTRY_DSN=<sentry project dsn>
PASSWORD_RESET_TOKEN_TTL_MINUTES=30     # optional override
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
- `GET https://<app>/metrics` → 404 on public hostname when `METRICS_INTERNAL_ONLY=true`
- `GET https://<service>.railway.internal/metrics` from internal agent → Prometheus payload
 
### Internal metrics scraping
- Provision a Railway private networking agent (or a sidecar service).
- Call `https://<service>.railway.internal/metrics` with a private agent cookie/admin session. `METRICS_TOKEN` is ignored when `NODE_ENV=production`.
- Keep public ingress blocked (expect 404) to satisfy “internal-only” control.
- `GET https://<app>/dashboard.html` (no session) → redirect to `Login.html`
