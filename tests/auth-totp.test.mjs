import { jest } from '@jest/globals';
import request from 'supertest';
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

const encryptionMocks = {
  encryptSecret: jest.fn(() => ({ ciphertext: 'cipher', iv: 'iv' })),
  decryptSecret: jest.fn(() => 'JBSWY3DPEHPK3PXP'),
};

await jest.unstable_mockModule('../src/security/encryption.js', () => ({
  __esModule: true,
  ...encryptionMocks,
}));

const hashedPassword = bcrypt.hashSync('Password123!', 10);
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

test('admin login returns a TOTP challenge when MFA is enabled', async () => {
  mockQuery.mockImplementation((sql) => {
    if (sql.includes('FROM users WHERE email = $1')) {
      return Promise.resolve({
        rows: [
          {
            id: 1,
            password_hash: hashedPassword,
            agency_id: 2,
            is_admin: true,
            totp_enabled: true,
          },
        ],
        rowCount: 1,
      });
    }
    if (sql.startsWith('INSERT INTO audit_log')) {
      return auditResponse();
    }
    throw new Error(`Unexpected query ${sql}`);
  });

  const res = await request(app)
    .post('/api/auth/login')
    .send({ email: 'admin@example.com', password: 'Password123!' });

  expect(res.status).toBe(200);
  expect(res.body.requiresTotp).toBe(true);
  expect(typeof res.body.challengeToken).toBe('string');
});

test('totp verification issues session cookie when code is valid', async () => {
  const now = Date.now();
  const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(now);

  const { totp } = await import('../src/security/totp.js');
  mockQuery.mockImplementation((sql) => {
    if (sql.includes('FROM users WHERE email = $1')) {
      return Promise.resolve({
        rows: [
          {
            id: 1,
            password_hash: hashedPassword,
            agency_id: 2,
            is_admin: true,
            totp_enabled: true,
          },
        ],
        rowCount: 1,
      });
    }
    if (sql.includes('FROM users WHERE id = $1')) {
      return Promise.resolve({
        rows: [
          {
            id: 1,
            agency_id: 2,
            is_admin: true,
            totp_enabled: true,
            totp_secret_encrypted: 'cipher',
            totp_secret_iv: 'iv',
            totp_recovery_codes: [],
          },
        ],
        rowCount: 1,
      });
    }
    if (sql.startsWith('INSERT INTO audit_log')) {
      return auditResponse();
    }
    throw new Error(`Unexpected query ${sql}`);
  });

  try {
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: 'admin@example.com', password: 'Password123!' });

    expect(loginRes.body.requiresTotp).toBe(true);
    const challengeToken = loginRes.body.challengeToken;

    const code = totp('JBSWY3DPEHPK3PXP');
    const verifyRes = await request(app)
      .post('/api/auth/totp/verify')
      .send({ challengeToken, code });

    expect(verifyRes.status).toBe(200);
    expect(verifyRes.body.success).toBe(true);
    expect(verifyRes.headers['set-cookie']).toEqual(
      expect.arrayContaining([expect.stringMatching(/^token=/)])
    );
  } finally {
    nowSpy.mockRestore();
  }
});
