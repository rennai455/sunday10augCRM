# sunday10augCRM [![CI](https://github.com/rennai455/sunday10augCRM/actions/workflows/ci.yml/badge.svg)](https://github.com/rennai455/sunday10augCRM/actions/workflows/ci.yml)

Small CRM prototype built with Express and PostgreSQL.

## Setup

1. **Configure environment**

   ```bash
   cp .env.example .env
   ```

   Fill in secrets and connection strings.

2. **Start services and install dependencies**

   ```bash
   docker compose up -d       # start postgres
   npm install                # install node packages
   ```

3. **Migrate and seed the database**

   ```bash
   npm run db:migrate && npm run db:seed
   ```

4. **Run diagnostics (optional but recommended)**

   ```bash
   npm run diagnostics
   ```

5. **Launch the application**

   ```bash
   npm start     # production mode
   # or
   npm run dev   # with live reload
   ```

Health checks are available at `GET /health` and `GET /readyz`. Static assets are served from `/static/*`.

## Scripts

| Command | Description |
| ------- | ----------- |
| `npm start` | Start the server |
| `npm run dev` | Run server with hot reload and CSS watcher |
| `npm run build` | Build CSS assets |
| `npm run db:up` / `npm run db:down` | Start/stop local PostgreSQL via Docker |
| `npm run db:migrate` | Apply database migrations |
| `npm run db:seed` | Seed demo data |
| `npm run diagnostics` | Run configuration and security checks |
| `npm test` | Execute tests (none yet) |

## Environment Variables

| Name | Description |
| ---- | ----------- |
| `PORT` | Port the server listens on |
| `NODE_ENV` | `development` or `production` |
| `DATABASE_URL` | PostgreSQL connection string |
| `PG_SSL` | Set to `true` to enable SSL for PostgreSQL |
| `JWT_SECRET` | Secret for signing JWTs |
| `WEBHOOK_SECRET` | Secret to verify incoming webhooks |
| `ALLOWED_ORIGINS` | Comma-separated CORS allowlist |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | Credentials for seeded admin user |

See [`docs/RUNBOOK.md`](docs/RUNBOOK.md) for deployment details.

## Architecture

The app serves static pages and a JSON API from an Express server backed by PostgreSQL.
For a detailed diagram and explanation see [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## Quick start

To push this repository to your own remote:

```bash
chmod +x push.sh
./push.sh <your-repo-url>
```

The script initializes git (if needed), sets `main` as the default branch, sets `origin`, and pushes the commit.

