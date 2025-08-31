# Railway Deployment RUNBOOK

## 1. Railway service & variables
- Create Railway Project
- Provision PostgreSQL → copy `DATABASE_URL` (likely includes `?sslmode=require`).
- Connect GitHub repo as a Web Service.
- Set service variables:

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

(Generate secrets locally with: `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`)

## 2. First deploy
- Deploy from GitHub.
- After the container is running, open Railway Shell and execute:

```
node db/run-migrations.js
node db/seed.js
```

## 3. Smoke checks
- `GET https://<app>/health` → `{ status: 'ok', db: 'PostgreSQL' }`
- `HEAD https://<app>/static/Login.html` → has `Content-Security-Policy`
- `HEAD https://<app>/health` with `Origin: https://<app>` → `Access-Control-Allow-Origin` present.
