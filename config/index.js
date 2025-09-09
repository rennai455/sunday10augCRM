let dotenv;
try {
  // Optional in environments where dotenv is not installed
  dotenv = require('dotenv');
  dotenv.config();
} catch {
  // eslint-disable-next-line no-empty
}
const { cleanEnv, str, num, bool } = require('envalid');

const env = cleanEnv(process.env, {
  NODE_ENV: str({ choices: ['development', 'test', 'production'], default: 'development' }),
  PORT: num({ default: 3002 }),
  DATABASE_URL: str(),
  PG_SSL: bool({ default: false }),
  ALLOWED_ORIGINS: str({ default: '' }),
  JWT_SECRET: str(),
  WEBHOOK_SECRET: str(),
  SEED_ADMIN_EMAIL: str(),
  SEED_ADMIN_PASSWORD: str(),
  REDIS_URL: str({ default: '' }),
  // Rate limit configuration
  API_RATE_WINDOW_MS: num({ default: 900000 }), // 15 minutes
  API_RATE_MAX: num({ default: 1000 }),
  AUTH_RATE_WINDOW_MS: num({ default: 900000 }),
  AUTH_RATE_MAX: num({ default: 10 }),
});

module.exports = env;
