## Railway Deployment RUNBOOK

This document explains how to deploy and operate the service on [Railway](https://railway.app).

### 1. Provision service and variables
- Create a Railway project.
- Add the PostgreSQL plugin and copy the provided `DATABASE_URL` (usually includes `?sslmode=require`).
- Connect this repository as a Web Service.
- Define service variables:

```
NODE_ENV=production
PORT=3000                     # Railway may inject PORT; app should use process.env.PORT
DATABASE_URL=<Railway URL incl. ?sslmode=require>
PG_SSL=true
JWT_SECRET=<strong random 32B base64>
WEBHOOK_SECRET=<strong random 32B base64>
ALLOWED_ORIGINS=https://<your-subdomain>.up.railway.app
ENABLE_SELF_SIGNUP=false
ALLOWED_SIGNUP_DOMAINS=renn.ai
```

Generate secrets locally with:

```
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

### 2. First deploy
- Deploy from GitHub.
- After the container is running, open a Railway shell and run:

```
node db/run-migrations.js
node db/seed.js
```

### 3. Routine operations
- **Migrations** – run `node db/run-migrations.js` after each deploy that changes the schema.
- **Seeding** – run `node db/seed.js` to create the initial admin user or refresh demo data.
- **Diagnostics** – `npm run diagnostics` verifies env vars, DB connectivity and basic security.
- **Rotating secrets** – update variables in the Railway dashboard and redeploy.

### 4. Smoke checks
- `GET https://<app>/health` → `{ status: 'ok', db: 'PostgreSQL' }`
- `HEAD https://<app>/static/Login.html` → has `Content-Security-Policy`
- `HEAD https://<app>/health` with `Origin: https://<app>` → `Access-Control-Allow-Origin` present

### 5. Troubleshooting
- **DB connection errors** – confirm `DATABASE_URL` and `PG_SSL` settings.
- **CORS issues** – verify `ALLOWED_ORIGINS` is set correctly.
- **500 responses** – inspect container logs via the Railway dashboard.
