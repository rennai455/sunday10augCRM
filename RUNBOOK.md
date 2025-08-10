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
2. In the project's **Environment** settings define:
   - `DATABASE_URL` from the plugin, appending `?sslmode=require`
   - `JWT_SECRET` generated via `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
   - `WEBHOOK_SECRET` generated via `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
   - `ALLOWED_ORIGINS` including your Railway domain (e.g. `https://your-railway-app.up.railway.app`)
3. Run `npm run migrate:db && npm run seed:db` in Railway shell.
4. Run `npm run diagnostics` in Railway shell (should exit 0).
5. Deploy and visit `/health` for `{ ok: true }`.

## Environment Variables
- DATABASE_URL
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
