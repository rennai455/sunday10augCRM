// tests/setup.js: Test environment setup
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'postgres://test:test@localhost:5432/test_db';
process.env.JWT_SECRET = 'test-jwt-secret-32-chars-long-12345';
process.env.WEBHOOK_SECRET = 'test-webhook-secret-32-chars-long';
process.env.SEED_ADMIN_EMAIL = 'admin@test.example';
process.env.SEED_ADMIN_PASSWORD = 'test-password';
process.env.ALLOWED_ORIGINS = 'http://localhost:3000';
process.env.PG_SSL = 'false';