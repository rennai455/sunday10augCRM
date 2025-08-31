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

## Environment Variables

| Name | Description |
| --- | --- |
| `DATABASE_URL` | Postgres connection string |
| `PG_SSL` | Set to `true` when SSL required |
| `JWT_SECRET` | Secret for signing JWTs |
| `WEBHOOK_SECRET` | Secret for verifying webhooks |
| `ALLOWED_ORIGINS` | Comma-separated list of allowed CORS origins |
| `ENABLE_SELF_SIGNUP` | Enable public signups (`true`/`false`) |
| `ALLOWED_SIGNUP_DOMAINS` | Domains allowed for self-signup |
| `SEED_ADMIN_EMAIL` | Admin seed email |
| `SEED_ADMIN_PASSWORD` | Admin seed password |

## Health Endpoints

- `GET /healthz` – process is up
- `GET /readyz` – database connectivity (503 if unavailable)

## Static Assets

Static files live under `/static/` and map to the `public/` directory.

## Build & Run

```bash
npm ci
npm run build
npm start
```

## Railway Notes

- set `PG_SSL=true`
- add your Railway URL to `ALLOWED_ORIGINS`
- run `npm run migrate:db` and `npm run seed:db` if needed
