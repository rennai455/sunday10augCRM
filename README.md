# sunday10augCRM

Prepared for GitHub import.

## Environment variables

Copy `.env.example` to `.env` and adjust:

| Variable | Description |
| -------- | ----------- |
| `DATABASE_URL` | PostgreSQL connection string |
| `NODE_ENV` | `development` or `production` |
| `JWT_SECRET` | secret used to sign JSON Web Tokens |
| `WEBHOOK_SECRET` | secret used to verify incoming webhooks |
| `ALLOWED_ORIGINS` | comma separated list of allowed CORS origins |
| `ENABLE_SELF_SIGNUP` | set to `true` to permit self registration |
| `ALLOWED_SIGNUP_DOMAINS` | comma separated list of email domains allowed for signup |
| `SEED_ADMIN_EMAIL` | optional admin email for seeding |
| `SEED_ADMIN_PASSWORD` | optional admin password for seeding |

## Development commands

| Command | Use |
| ------- | --- |
| `npm run db:up` | start local PostgreSQL via Docker |
| `npm run migrate:db` | apply database migrations |
| `npm run seed:db` | seed database with admin/sample data |
| `npm run build` | build static assets |
| `npm start` | start server in production mode |
| `npm run dev` | start development server with live reload |

## Health checks

The application exposes `GET /health` which returns `{ status: 'ok', db: 'PostgreSQL' }` when the server and database are reachable.

## Asset caching

The service worker caches critical resources:

- static assets and HTML cached for 7 days,
- dynamic assets for 24 hours,
- API responses for 5 minutes,
- images for 30 days.

These strategies are configured in `service-worker.js`.

## Tests

| Command | Purpose |
| ------- | ------- |
| `npm test` | run Jest smoke tests |
| `npm run diagnostics` | configuration and security checks |
| `npm run test:lighthouse` | Lighthouse audit |
| `npm run test:visual` | Backstop visual regression |
| `npm run test:all` | run lint/build and both test suites |

## Railway deployment

1. Create a Railway project and add the PostgreSQL plugin.
2. In the service settings, set environment variables:

   | Variable | Source |
   |----------|--------|
   | `DATABASE_URL` | from Railway Postgres plugin |
   | `JWT_SECRET` | `node -e "crypto.randomBytes(32).toString('hex')"` |
   | `WEBHOOK_SECRET` | `node -e "crypto.randomBytes(32).toString('hex')"` |
   | `ALLOWED_ORIGINS` | e.g. `https://your-railway-app.up.railway.app` |
   | `ENABLE_SELF_SIGNUP` | `false` or `true` |
   | `ALLOWED_SIGNUP_DOMAINS` | allowed email domains |
   | `SEED_ADMIN_EMAIL` | optional |
   | `SEED_ADMIN_PASSWORD` | optional |

3. Run `npm run migrate:db && npm run seed:db` from the Railway shell.
4. Run `npm run diagnostics` and ensure it exits 0.
5. Deploy and visit `/health` for `{ status: 'ok' }`.

## Secret rotation

1. Generate a new secret: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.
2. Update the value in `.env` and the Railway service environment variable.
3. Redeploy the service.
4. Invalidate existing tokens or signatures that depended on the old secret.

## Quick start

From the project root:

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
