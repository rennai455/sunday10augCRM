// path: docs/RUNBOOK.md

# RENN.AI CRM — Database Connectivity & Setup RUNBOOK

## Secrets
- Generate secure secrets:
  - JWT_SECRET: `node -e "crypto.randomBytes(32).toString('hex')"`
  - WEBHOOK_SECRET: `node -e "crypto.randomBytes(32).toString('hex')"`

## Scenario A: Local Postgres (Docker)

### Launch Postgres 16 (DB: renn_ai, user: postgres, password: postgres)
```sh
docker compose up -d
# OR (one-liner)
docker run --name renn-ai-db -e POSTGRES_PASSWORD=postgres -e POSTGRES_USER=postgres -e POSTGRES_DB=renn_ai -p 5432:5432 -d postgres:16
```

### Verify DB is running
```sh
psql "postgres://postgres:postgres@localhost:5432/renn_ai" -c "select version();"
# Node.js one-liner:
node -e "require('pg').Pool({connectionString:'postgres://postgres:postgres@localhost:5432/renn_ai'}).query('select 1').then(r=>console.log('OK')).catch(e=>console.error(e.message))"
```

## Scenario B: Managed Postgres (Neon/Supabase/Render/RDS)
- Use `?sslmode=require` in `DATABASE_URL`.
- Ensure your DB firewall/allowlist permits your app/server IP.

## .env Setup


### Local dev (no SSL)
```
DATABASE_URL=postgres://postgres:postgres@localhost:5432/renn_ai
NODE_ENV=development
JWT_SECRET=<run `node -e "crypto.randomBytes(32).toString('hex')"`>
WEBHOOK_SECRET=<run `node -e "crypto.randomBytes(32).toString('hex')"`>
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:5173
ENABLE_SELF_SIGNUP=false
```

### Managed (SSL required)
```
DATABASE_URL=postgres://USER:PASSWORD@HOST:5432/DBNAME?sslmode=require
NODE_ENV=production
JWT_SECRET=<generated-hex>
WEBHOOK_SECRET=<generated-hex>
ALLOWED_ORIGINS=https://app.renn.ai
ENABLE_SELF_SIGNUP=false
```
- If your password contains `@:/?#`, URL-encode it (e.g. `%40` for `@`).

## DB User Mismatch
- If you see `role "postgres" does not exist`:
  - The official `postgres` Docker image already creates the `postgres` role. If you are using this image, double-check your `DATABASE_URL` instead of recreating the role.
  - Option 1: Change `DATABASE_URL` to match your actual DB user.
  - Option 2: Create a user and database for a custom role:
    ```sql
    CREATE ROLE <db_user> WITH LOGIN PASSWORD '<db_pass>';
    CREATE DATABASE <db_name> OWNER <db_user>;
    ```
  - Then set `DATABASE_URL=postgres://<db_user>:<db_pass>@localhost:5432/<db_name>`

## Run Order
```sh
npm i
npm run db:up        # (if using Docker)
npm run migrate:db
npm run seed:db
npm run diagnostics
npm test
npm run dev
```

## Troubleshooting Matrix
| Error | Cause | Fix |
|-------|-------|-----|
| `Missing env vars` | .env incomplete | Copy from .env.example |
| `ECONNREFUSED` | DB not running / wrong host/port | Start DB, check port |
| `getaddrinfo ENOTFOUND` | Bad hostname | Fix host in DATABASE_URL |
| `no pg_hba.conf entry` | Role/DB/host not allowed | Check DB user, DB name, host, pg_hba.conf |
| `self signed certificate` | SSL mismatch | Add `?sslmode=require` and set NODE_ENV=production |
| `password authentication failed` | Bad credentials / encoding | Check user/pass, URL-encode password |
| `role "postgres" does not exist` | DB user missing | Create user in DB |
| `database "renn_ai" does not exist` | DB missing | Create DB |
| `Agencies table error` | Migrations not run | Run migrate:db |

## Acceptance Checklist
- [ ] DB connectivity OK
- [ ] Migrations applied
- [ ] Diagnostics pass
- [ ] Register/login works
- [ ] Security middleware enabled
