# RUNBOOK for renn-ai-crm

## Local Setup
1. Copy `.env.example` to `.env` and fill in secrets.
2. Run `docker compose up -d postgres` to start local Postgres.
3. Run `npm install` to install dependencies.
4. Run `npm run migrate:db` to apply DB schema.
5. Run `npm run seed:db` to insert admin/sample data.
6. Run `npm run diagnostics` to verify config and security.
7. Start server: `npm start`.

## Railway Deployment
1. Create Railway project and add Railway Postgres plugin.
2. Add these Railway environment variables:
   - `DATABASE_URL` (from Railway Postgres plugin)
   - `PG_SSL=true`
   - `JWT_SECRET`: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
   - `ALLOWED_ORIGINS`: include your Railway domain (e.g. `https://your-railway-app.up.railway.app`)
3. Run `npm run migrate:db && npm run seed:db` in Railway shell.
4. Run `npm run diagnostics` in Railway shell (should exit 0).
5. Deploy.
6. Post-deploy smoke checks:
   ```bash
   curl https://<APP_URL>/healthz
   curl https://<APP_URL>/readyz
   curl -I https://<APP_URL>/static/
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
- [ ] /healthz returns { ok: true }
- [ ] No SQLite code or dependencies
- [ ] All /api/* unauthorized without cookie
- [ ] CSV protected with ownership
- [ ] Webhook signature enforced
- [ ] Login sets HttpOnly cookie; Logout clears it
- [ ] Static only at /static
