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
# Optional hardening
ADMIN_API_TOKEN=<strong token>          # header: X-Admin-Token (for /api/admin/*)
METRICS_TOKEN=<strong token>            # only honoured outside production
METRICS_INTERNAL_ONLY=true              # restrict /metrics to *.railway.internal
METRICS_ALLOWED_HOST_SUFFIX=railway.internal
TOTP_ENCRYPTION_KEY=<64 hex chars>      # AES-256 key for MFA secrets
SENTRY_DSN=<sentry project dsn>
PASSWORD_RESET_TOKEN_TTL_MINUTES=30     # optional override
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

## 4. MFA & credential recovery
- MFA provisioning (admin only): `POST /api/admin/users/:id/totp/setup`
  - Returns `otpauth://` URI and plain-text recovery codes **once**.
  - Secrets are stored encrypted with `TOTP_ENCRYPTION_KEY`; recovery codes are bcrypt-hashed.
- Login flow:
  1. User submits credentials at `/api/auth/login`.
  2. If `totp_enabled`, response returns `{ requiresTotp: true, challengeToken }`.
  3. Client posts `{ challengeToken, code }` or recovery code to `/api/auth/totp/verify` (rate-limited to 5 attempts / 5 min).
  4. On success a 24h session cookie is issued and `auth:login:totp` is audited.
- Password reset:
  - `POST /api/auth/password-reset/request` → queues a single-use token (SHA-256 stored) and records `auth:password_reset:requested`.
  - Delivery happens off-platform; in non-production responses include the raw token to aid testing.
  - `POST /api/auth/password-reset/confirm` → verifies token (expiry configurable via `PASSWORD_RESET_TOKEN_TTL_MINUTES`), rotates password, and invalidates the token.
- All admin actions, password resets, and MFA events hit the `audit_log` table with requester metadata.

## 5. Observability & alerting
- Set `SENTRY_DSN` and configure alerts for:
  - `auth:invalid_credentials`, `auth:totp_failure`, and invalid password reset attempts (warn level).
  - `http_5xx` operational events emitted from the middleware (error level).
- Prometheus metrics remain exposed only on the internal hostname in production.

## 6. Secret rotation checklist
- Rotate quarterly or after incident:
  - `JWT_SECRET`, `TOTP_ENCRYPTION_KEY`, `WEBHOOK_SECRET`, `ADMIN_API_TOKEN`, `METRICS_TOKEN` (non-prod), database credentials.
  - Re-seed recovery codes by re-running `/api/admin/users/:id/totp/setup` and redistributing to users.
  - Re-issue password reset tokens for pending resets (previous tokens are single-use).
- Document rotation in `audit_log` via `recordAudit` helper or manual insert for offline rotations.
