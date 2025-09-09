# sunday10augCRM

[![CI](https://github.com/rennai455/sunday10augCRM/actions/workflows/ci.yml/badge.svg)](https://github.com/rennai455/sunday10augCRM/actions/workflows/ci.yml)
Prepared for GitHub import.

## Getting Started

1. Copy env template and fill secrets:

   ```bash
   cp .env.example .env
   ```

2. Install dependencies and start the server:

   ```bash
   npm install
   npm start
   ```

3. Run database migrations and seed data:

   ```bash
   npm run db:migrate && npm run db:seed
   ```

   The `db:migrate` command runs `db/run-migrations.js` to prepare the
   PostgreSQL schema. The previously empty `migrate-to-postgresql.js` script
   has been removed.

4. Lint and test the project:

   ```bash
   npm run lint
   npm test
   ```

5. Health endpoints:
   - `GET /health`
   - `GET /readyz`

6. Static files are served from `/static/*`.

## Environment Variables

The server expects several variables to be present at runtime:

- `DATABASE_URL` – PostgreSQL connection string
- `JWT_SECRET` – secret used to sign JWTs
- `WEBHOOK_SECRET` – shared secret for verifying webhooks
- `ALLOWED_ORIGINS` – comma separated list of allowed origins
- `SEED_ADMIN_EMAIL` – email for the seeded admin user
- `SEED_ADMIN_PASSWORD` – password for the seeded admin user

See the [RUNBOOK](RUNBOOK.md#environment-variables) for additional notes on configuring these values.

### CORS policy
Cross-origin requests are default-denied. Only origins explicitly included in `ALLOWED_ORIGINS` are allowed. Server-to-server requests without an `Origin` header are accepted.

### Webhook verification and replay guard
Incoming webhooks must include `x-signature` (HMAC-SHA256) of the raw body using `WEBHOOK_SECRET`.
For stronger replay protection, send `x-id` (unique ID) and `x-timestamp` (ms since epoch) and compute the signature over: `"<x-id>.<x-timestamp>.<raw-body>"`.
Requests older than 5 minutes or reused `x-id` values are rejected.

If `REDIS_URL` is configured in production, webhook replay tracking uses Redis (`SET key NX PX=5m`). Without Redis, an in-process fallback store is used (single instance only).

## Diagnostics

Run the diagnostics script to validate configuration and security settings:

```bash
npm install --dev
npm run diagnostics
```

The command should exit with code `0`. The [RUNBOOK](RUNBOOK.md#acceptance-checklist) lists the checks performed.

## Railway Deployment

To deploy on [Railway](https://railway.app):

1. Create a Railway project and provision a PostgreSQL database.
2. Set the environment variables listed above, including secrets and `DATABASE_URL`.
3. Run migrations and seed data in a Railway shell.
4. Execute `npm run diagnostics` and verify `/health` returns `{ ok: true }`.

Full deployment instructions are in [docs/RUNBOOK.md](docs/RUNBOOK.md).

### Rate limiting metrics
Prometheus counter `rate_limit_blocked_total{route,type}` increments on 429 responses from the rate limiter (types: `api`, `auth`). Use this for alerting on abuse or misconfiguration.

## Quick start

From the project root (top-level folder of your code):

```bash
chmod +x push.sh
./push.sh
# or: ./push.sh git@github.com:rennai455/sunday10augCRM.git
# or: ./push.sh https://github.com/rennai455/sunday10augCRM.git
```

The script will:

- init git (if needed)
- create/force `main` as default branch
- set `origin` to your repo
- push the initial commit
