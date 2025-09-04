# sunday10augCRM

[![CI](https://github.com/rennai455/sunday10augCRM/actions/workflows/ci.yml/badge.svg)](https://github.com/rennai455/sunday10augCRM/actions/workflows/ci.yml)
Prepared for GitHub import.

## Getting Started

1. Copy env template and fill secrets:

   ```bash
   cp .env.example .env
   ```

2. Install dependencies and start the server:

   ```bash
   npm install
   npm start
   ```

3. Run database migrations and seed data:

   ```bash
   npm run db:migrate && npm run db:seed
   ```

   The `db:migrate` command runs `db/run-migrations.js` to prepare the
   PostgreSQL schema. The previously empty `migrate-to-postgresql.js` script
   has been removed.

4. Lint and test the project:

   ```bash
   npm run lint
   npm test
   ```

5. Health endpoints:
   - `GET /health`
   - `GET /readyz`

6. Static files are served from `/static/*`.

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
