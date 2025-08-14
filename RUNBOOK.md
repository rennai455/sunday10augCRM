# RUNBOOK for renn-ai-crm

## Local Setup
1. Copy `.env.example` to `.env` and fill in secrets.
2. Run `docker compose up -d postgres` to start local Postgres.
3. Run `npm ci` to install dependencies.
4. Run `npm run migrate:db` to apply DB schema.
5. Run `npm run seed:db` to insert admin/sample data.
6. Run `npm run build` to compile assets.
7. Run `npm run diagnostics` to verify config and security.
8. Start server: `npm start`.
9. Smoke checks:
   ```bash
   curl -s http://localhost:3002/healthz
   curl -s http://localhost:3002/readyz
   curl -I -H "Origin: http://localhost:3000" http://localhost:3002/healthz | grep -i access-control-allow-origin
   ```

## Railway Deployment
1. Create Railway project and add Railway Postgres plugin.
2. Copy Railway `DATABASE_URL` to your Railway environment variables.
3. Generate secrets:
   - JWT_SECRET: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
   - WEBHOOK_SECRET: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
4. Set env vars:
   - `PG_SSL=true`
   - `ALLOWED_ORIGINS=https://your-railway-app.up.railway.app`
5. Run `npm run migrate:db && npm run seed:db` in Railway shell.
6. Run `npm run diagnostics` in Railway shell (should exit 0).
7. Deploy and verify health:
   ```bash
   curl -s https://<app>.up.railway.app/healthz
   curl -s https://<app>.up.railway.app/readyz
   curl -I -H "Origin: https://<app>.up.railway.app" https://<app>.up.railway.app/healthz | grep -i access-control-allow-origin
   ```

## Environment Variables
- DATABASE_URL
- PG_SSL
- JWT_SECRET
- WEBHOOK_SECRET
- ALLOWED_ORIGINS
- ENABLE_SELF_SIGNUP
- ALLOWED_SIGNUP_DOMAINS
- SEED_ADMIN_EMAIL
- SEED_ADMIN_PASSWORD

## Acceptance Checklist
- [ ] All env vars present
- [ ] DB schema applied
- [ ] Admin user exists
- [ ] Security middleware enabled
- [ ] Diagnostics script passes
- [ ] /health returns { ok: true }
- [ ] No SQLite code or dependencies
- [ ] All /api/* unauthorized without cookie
- [ ] CSV protected with ownership
- [ ] Webhook signature enforced
- [ ] Login sets HttpOnly cookie; Logout clears it
- [ ] Static only at /static
