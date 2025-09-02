// tests/setup.js: Test environment setup
const crypto = require('crypto');

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://user:pass@localhost:5432/test_db';
process.env.JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(32).toString('hex');
process.env.WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || crypto.randomBytes(32).toString('hex');
process.env.SEED_ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL || 'admin@test.example';
process.env.SEED_ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD || crypto.randomBytes(32).toString('hex');
process.env.ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS || 'http://localhost:3000';
process.env.PG_SSL = process.env.PG_SSL || 'false';

