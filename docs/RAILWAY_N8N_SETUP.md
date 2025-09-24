# Railway n8n Setup

Use this checklist when provisioning an n8n service alongside the CRM on Railway.

## 1. Service provisioning

- Create a new Railway service from the official `n8nio/n8n` image (or forked repo).
- Attach a dedicated PostgreSQL plugin (do **not** reuse the CRM database).
- Optional: add a Redis service if you plan to run n8n in queue mode.

## 2. Required environment variables

Set these on the n8n service (replace placeholders):

```
N8N_BASIC_AUTH_ACTIVE=true
N8N_BASIC_AUTH_USER=admin
N8N_BASIC_AUTH_PASSWORD=<strong-password>
N8N_ENCRYPTION_KEY=<32-byte base64>
N8N_HOST=<public-hostname>
N8N_PROTOCOL=https
N8N_PORT=5678
WEBHOOK_URL=https://<public-hostname>
GENERIC_TIMEZONE=America/Los_Angeles

# PostgreSQL (Railway variables or custom)
DB_TYPE=postgresdb
DB_POSTGRESDB_HOST=${{PGHOST}}
DB_POSTGRESDB_PORT=${{PGPORT}}
DB_POSTGRESDB_DATABASE=${{PGDATABASE}}
DB_POSTGRESDB_USER=${{PGUSER}}
DB_POSTGRESDB_PASSWORD=${{PGPASSWORD}}
DB_POSTGRESDB_SCHEMA=public

# Opt-in features
N8N_METRICS=true
N8N_LOG_LEVEL=info
N8N_DIAGNOSTICS_ENABLED=false
N8N_PAYLOAD_SIZE_LIMIT=50mb
N8N_WORKFLOW_SIZE_LIMIT=5mb
N8N_RESPONSE_SIZE_LIMIT=50mb
N8N_BINARY_DATA_MODE=filesystem
N8N_BINARY_DATA_SIZE_LIMIT=500mb
N8N_EXECUTION_DATA_SIZE_LIMIT=200mb

# Recommended
N8N_RUNNERS_ENABLED=true
N8N_USER_MANAGEMENT_DISABLED=false

# Optional queue mode (when Redis is attached)
# EXECUTIONS_MODE=queue
# QUEUE_BULL_REDIS_HOST=${{REDIS_HOST}}
# QUEUE_BULL_REDIS_PORT=${{REDIS_PORT}}
# QUEUE_BULL_REDIS_PASSWORD=${{REDIS_PASSWORD}}
```

Generate secure strings with:

```
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

## 3. Initial owner setup

1. Deploy once, then open the n8n URL.
2. Complete the owner onboarding form (email + strong password).
3. Log in with the newly created owner account and enable basic auth if desired.
4. Create an API key from _Profile → API_ for automation.

## 4. CRM integration checklist

- Import `ops/n8n/workflows/hmac_to_crm_example.json` (or the generated template from this repo).
- Set an environment variable on n8n: `CRM_URL=https://<crm-host>` to reuse the template.
- Store the CRM `WEBHOOK_SECRET` in n8n credentials or environment variables.
- Use HTTP Request nodes with headers:
  - `content-type: application/json`
  - `x-id: {{$json.id}}`
  - `x-timestamp: {{$json.timestamp}}`
  - `x-signature: {{$json.signature}}`
- For CRM → n8n callbacks, protect with n8n basic auth or API key.

## 5. Observability

- Export metrics via `/metrics` (Prometheus format) - attach to Railway Observability or your own collector.
- Enable Sentry/OTEL by configuring `SENTRY_DSN` or `OTEL_EXPORTER_OTLP_ENDPOINT`.
- Stream n8n logs to the same destination as the CRM for unified debugging.

## 6. Maintenance

- Schedule backups for the n8n PostgreSQL database.
- Rotate `N8N_ENCRYPTION_KEY`, basic auth password, and CRM webhook secrets periodically.
- Keep the `n8nio/n8n` image pinned to a tested tag; upgrade deliberately.
- Use `n8n export:workflow` in CI or on a schedule to version workflows in git.
