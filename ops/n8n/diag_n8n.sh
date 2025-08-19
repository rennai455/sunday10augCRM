#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

echo "== n8n diagnostics =="
echo "Working dir: $PWD"
echo

# 0) Basic files
if [[ ! -f docker-compose.yml ]]; then
  echo "❌ Missing ops/n8n/docker-compose.yml"
  exit 1
fi

if [[ ! -f .env ]]; then
  echo "❌ Missing ops/n8n/.env (copy .env.example -> .env and fill secrets)"
  exit 2
fi

# 1) Show key env (redacted)
echo "== .env sanity (redacted) =="
grep -E '^(N8N_(PORT|EDITOR_BASE_URL|LOG_LEVEL|ENFORCE|BASIC_AUTH_ACTIVE|BASIC_AUTH_USER)|GENERIC_TIMEZONE|DB_POSTGRES_(HOST|PORT|DB|USER))=' .env \
  | sed -E 's/(PASSWORD|ENCRYPTION_KEY|BASIC_AUTH_PASSWORD)=.*/\1=<redacted>/'
echo

# 2) Compose validation
echo "== docker compose config =="
docker compose config >/dev/null && echo "✅ docker compose config valid"
echo

# 3) Bring up Postgres first
echo "== Starting postgres =="
docker compose up -d postgres
sleep 2
echo "== Postgres health =="
docker compose ps postgres
# Prefer env, but fallback to defaults so this script works even before export
source .env || true
docker compose exec -T postgres pg_isready -U "${DB_POSTGRES_USER:-n8n}" -d "${DB_POSTGRESDB:-n8n}" && echo "✅ pg_isready OK" || true
echo

# 4) Bring up n8n (after PG healthy)
echo "== Starting n8n =="
docker compose up -d n8n
sleep 3

echo "== n8n env inside container =="
docker compose exec -T n8n env | egrep 'DB_POSTGRES|DB_TYPE|N8N_ENFORCE|N8N_PORT|N8N_BASIC_AUTH_ACTIVE' || true
echo

# 5) Quick network/permissions checks inside n8n
echo "== n8n -> postgres name resolution =="
docker compose exec -T n8n sh -lc 'getent hosts postgres || (command -v getent >/dev/null || echo "getent not available")' || true
echo

echo "== n8n settings file permissions =="
docker compose exec -T n8n sh -lc 'ls -l /home/node/.n8n/ || true; ls -l /home/node/.n8n/config 2>/dev/null || true' || true
echo

# 6) Logs
echo "== Last n8n logs (tail) =="
docker compose logs --no-color --tail=200 n8n || true
echo

# 7) Port check from host
PORT_HOST="$(grep -E '^N8N_PORT=' .env | cut -d= -f2 || echo 5678)"
echo "== Host port check =="
echo "Trying http://localhost:${PORT_HOST}"
curl -sfI "http://localhost:${PORT_HOST}" | head -n 1 || echo "⚠️ Could not reach editor on localhost:${PORT_HOST}"
echo

echo "== SUMMARY HINTS =="
echo "- If logs show 'connect ECONNREFUSED ::1:5432': set DB_POSTGRES_HOST=postgres in .env."
echo "- If '.env not found': copy .env.example to .env and fill secrets."
echo "- If permission warning on /home/node/.n8n/config: set N8N_ENFORCE_SETTINGS_FILE_PERMISSIONS=true (in .env) or run:"
echo "  docker compose exec n8n chmod 600 /home/node/.n8n/config"
echo "- If n8n starts before PG: we added a PG healthcheck + depends_on—ensure your compose file matches."
echo
echo "Done."
