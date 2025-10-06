import 'dotenv/config';
import { cleanEnv, str, num, bool } from 'envalid';

// Use a shallow, extensible wrapper around the frozen cleanEnv result
const baseEnv = cleanEnv(process.env, {
  NODE_ENV: str({
    choices: ['development', 'test', 'production'],
    default: 'development',
  }),
  PORT: num({ default: 3005 }),
  DATABASE_URL: str(),
  PG_SSL: bool({ default: false }),
  ALLOWED_ORIGINS: str({ default: '' }),
  JWT_SECRET: str(),
  WEBHOOK_SECRETS: str({ default: '' }),
  WEBHOOK_SECRET: str(),
  SEED_ADMIN_EMAIL: str(),
  SEED_ADMIN_PASSWORD: str(),
  REDIS_URL: str({ default: '' }),
  // Observability
  SENTRY_DSN: str({ default: '' }),
  OTEL_EXPORTER_OTLP_ENDPOINT: str({ default: '' }),
  OTEL_SERVICE_NAME: str({ default: 'renn-ai-crm' }),
  // PG tuning / features
  PG_POOL_MAX: num({ default: 10 }),
  PG_IDLE_TIMEOUT_MS: num({ default: 30000 }),
  PG_ENABLE_RLS: bool({ default: false }),
  // Rate limit configuration
  API_RATE_WINDOW_MS: num({ default: 900000 }), // 15 minutes
  API_RATE_MAX: num({ default: 1000 }),
  AUTH_RATE_WINDOW_MS: num({ default: 900000 }),
  AUTH_RATE_MAX: num({ default: 10 }),
  RATE_LIMIT_TRUST_PROXY: bool({ default: false }),
});

const env = { ...baseEnv };

// Helper: return array of webhook secrets (rotation-friendly)
Object.defineProperty(env, 'WEBHOOK_SECRET_LIST', {
  enumerable: true,
  get() {
    const list = [env.WEBHOOK_SECRET].concat(
      (env.WEBHOOK_SECRETS || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    );
    // De-duplicate while preserving order
    return Array.from(new Set(list.filter(Boolean)));
  },
});

export default env;
