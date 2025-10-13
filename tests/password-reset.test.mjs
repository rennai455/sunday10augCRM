import { jest } from '@jest/globals';
import request from 'supertest';
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL =
  process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';
process.env.WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || 'test-webhook';
process.env.SEED_ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL || 'admin@test.example';
process.env.SEED_ADMIN_PASSWORD =
  process.env.SEED_ADMIN_PASSWORD || 'Password123!';
process.env.TOTP_ENCRYPTION_KEY =
  process.env.TOTP_ENCRYPTION_KEY || '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

const alertingMocks = {
  captureSecurityEvent: jest.fn(),
  captureOperationalEvent: jest.fn(),
  captureException: jest.fn(),
};

await jest.unstable_mockModule('../src/utils/alerting.js', () => ({
  __esModule: true,
  ...alertingMocks,
}));

const mockQuery = jest.fn();

await jest.unstable_mockModule('../src/db/pool.js', () => ({
  __esModule: true,
  default: {
    query: (...args) => mockQuery(...args),
    withTransaction: async (fn) => fn({ query: mockQuery }),
    withAgencyContext: async (_agencyId, fn) => fn({ query: mockQuery }),
    pool: { query: mockQuery, end: jest.fn() },
    smokeTest: jest.fn(),
  },
  query: (...args) => mockQuery(...args),
  withTransaction: async (fn) => fn({ query: mockQuery }),
  withAgencyContext: async (_agencyId, fn) => fn({ query: mockQuery }),
  pool: { query: mockQuery, end: jest.fn() },
  smokeTest: jest.fn(),
}));

let app;
let server;

beforeAll(async () => {
  ({ app, server } = await import('../server.js'));
});

afterAll(() => {
  if (server && server.listening) server.close();
});

afterEach(() => {
  mockQuery.mockReset();
});

function auditResponse() {
  return Promise.resolve({ rows: [], rowCount: 1 });
}

test('password reset request queues token and returns opaque delivery hint', async () => {
  const tokenHashMap = new Map();
  mockQuery.mockImplementation((sql, params) => {
    if (sql.includes('FROM users WHERE email = $1')) {
      return Promise.resolve({
        rows: [
          { id: 10, agency_id: 3 },
        ],
        rowCount: 1,
      });
    }
    if (sql.startsWith('UPDATE password_reset_tokens')) {
      return Promise.resolve({ rowCount: 1 });
    }
    if (sql.startsWith('INSERT INTO password_reset_tokens')) {
      tokenHashMap.set('hash', params[1]);
      return Promise.resolve({ rowCount: 1 });
    }
    if (sql.startsWith('INSERT INTO audit_log')) {
      return auditResponse();
    }
    throw new Error(`Unexpected query ${sql}`);
  });

  const res = await request(app)
    .post('/api/auth/password-reset/request')
    .send({ email: 'admin@example.com' });

  expect(res.status).toBe(202);
  expect(res.body.success).toBe(true);
  expect(res.body.delivery).toBe('email');
  expect(typeof res.body.token).toBe('string');
  expect(tokenHashMap.get('hash')).toBe(
    crypto.createHash('sha256').update(res.body.token).digest('hex')
  );
});

test('password reset confirm updates password when token valid', async () => {
  const rawToken = 'reset-token-valid-000000000000000000000000';
  const newPasswordHashes = [];

  mockQuery.mockImplementation((sql, params) => {
    if (sql.includes('FROM password_reset_tokens')) {
      expect(params[0]).toBe(
        crypto.createHash('sha256').update(rawToken).digest('hex')
      );
      return Promise.resolve({
        rows: [
          {
            id: 5,
            user_id: 10,
            expires_at: new Date(Date.now() + 60000).toISOString(),
            used_at: null,
            agency_id: 7,
          },
        ],
        rowCount: 1,
      });
    }
    if (sql.startsWith('UPDATE users SET password_hash')) {
      newPasswordHashes.push(params[0]);
      return Promise.resolve({ rowCount: 1 });
    }
    if (sql.startsWith('UPDATE password_reset_tokens SET used_at')) {
      return Promise.resolve({ rowCount: 1 });
    }
    if (sql.startsWith('INSERT INTO audit_log')) {
      return auditResponse();
    }
    throw new Error(`Unexpected query ${sql}`);
  });

  const res = await request(app)
    .post('/api/auth/password-reset/confirm')
    .send({ token: rawToken, password: 'NewPassword123!' });

  expect(res.status).toBe(200);
  expect(res.body.success).toBe(true);
  expect(newPasswordHashes).toHaveLength(1);
  expect(await bcrypt.compare('NewPassword123!', newPasswordHashes[0])).toBe(true);
});

test('password reset confirm rejects invalid token', async () => {
  const rawToken = 'missing-token-00000000000000000000000000';

  mockQuery.mockImplementation((sql) => {
    if (sql.includes('FROM password_reset_tokens')) {
      return Promise.resolve({ rows: [], rowCount: 0 });
    }
    if (sql.startsWith('INSERT INTO audit_log')) {
      return auditResponse();
    }
    throw new Error(`Unexpected query ${sql}`);
  });

  const res = await request(app)
    .post('/api/auth/password-reset/confirm')
    .send({ token: rawToken, password: 'NewPassword123!' });

  expect(res.status).toBe(400);
  expect(res.body.success).toBe(false);
});
