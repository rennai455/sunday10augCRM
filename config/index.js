const dotenv = require('dotenv');
const { cleanEnv, str, num, bool } = require('envalid');

dotenv.config();

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
});

module.exports = env;
