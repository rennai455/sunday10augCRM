# sunday10augCRM

Prepared for GitHub import.

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

## Environment variables

Set the following variables before starting the server:

- `DATABASE_URL` – PostgreSQL connection string.
- `PG_SSL=true` – enable SSL when connecting to managed Postgres (Railway, etc.).
- `JWT_SECRET` – secret used to sign JWTs.
- `ALLOWED_ORIGINS` – comma-separated list of allowed origins; include your Railway URL (e.g. `https://your-app.up.railway.app`).

## Database setup

Create and seed the database:

```bash
createdb renn_ai
npm run migrate:db
npm run seed:db
```

## Service endpoints

- `/healthz` – liveness probe returning `{ ok: true }`.
- `/readyz` – readiness probe returning `{ ok: true }` once dependencies are reachable.
- Static files are served from `/static/...`.
