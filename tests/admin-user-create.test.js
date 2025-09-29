const request = require('supertest');
const bcrypt = require('bcryptjs');

const hashedPassword = bcrypt.hashSync('password123', 10);

const mockQuery = jest.fn();

jest.mock('../src/db/pool', () => ({
  query: (...args) => mockQuery(...args),
  withTransaction: async (fn) => fn({ query: mockQuery }),
  withAgencyContext: async (_agencyId, fn) => fn({ query: mockQuery }),
  pool: { query: mockQuery, end: jest.fn() },
  smokeTest: jest.fn(),
}));

const { app, server } = require('../server');

describe('POST /api/admin/users', () => {
  afterAll(() => {
    if (server && server.listening) server.close();
  });

  beforeEach(() => {
    mockQuery.mockReset();
  });

  it('rejects non-admin callers', async () => {
    mockQuery.mockImplementation((sql) => {
      if (sql.includes('FROM users WHERE email = $1')) {
        return Promise.resolve({
          rows: [
            {
              id: 1,
              password_hash: hashedPassword,
              agency_id: 2,
              is_admin: false,
            },
          ],
          rowCount: 1,
        });
      }
      if (sql.startsWith('INSERT INTO audit_log')) {
        return Promise.resolve({ rows: [], rowCount: 0 });
      }
      throw new Error(`Unexpected query in non-admin test: ${sql}`);
    });

    const agent = request.agent(app);
    await agent
      .post('/api/auth/login')
      .send({ email: 'user@example.com', password: 'password123' })
      .expect(200);

    const res = await agent
      .post('/api/admin/users')
      .send({ email: 'new@example.com', password: 'Password123!' });

    expect(res.status).toBe(403);
  });

  it('creates a user for admins', async () => {
    mockQuery.mockImplementation((sql, params) => {
      if (sql.includes('FROM users WHERE email = $1')) {
        return Promise.resolve({
          rows: [
            {
              id: 1,
              password_hash: hashedPassword,
              agency_id: 2,
              is_admin: true,
            },
          ],
          rowCount: 1,
        });
      }
      if (sql.startsWith('SELECT id FROM agencies')) {
        expect(params).toEqual([2]);
        return Promise.resolve({ rows: [{ id: 2 }], rowCount: 1 });
      }
      if (sql.startsWith('INSERT INTO users')) {
        expect(params?.[0]).toBe('new@example.com');
        return Promise.resolve({
          rows: [
            {
              id: 5,
              email: 'new@example.com',
              agency_id: 2,
              is_admin: false,
              created_at: '2025-01-01T00:00:00.000Z',
            },
          ],
          rowCount: 1,
        });
      }
      if (sql.startsWith('INSERT INTO audit_log')) {
        return Promise.resolve({ rows: [], rowCount: 0 });
      }
      throw new Error(`Unexpected query in admin success test: ${sql}`);
    });

    const agent = request.agent(app);
    await agent
      .post('/api/auth/login')
      .send({ email: 'admin@example.com', password: 'password123' })
      .expect(200);

    const res = await agent
      .post('/api/admin/users')
      .send({ email: 'new@example.com', password: 'Password123!' });

    expect(res.status).toBe(201);
    expect(res.body.user).toMatchObject({
      id: 5,
      email: 'new@example.com',
      agencyId: 2,
      isAdmin: false,
    });

    const insertCall = mockQuery.mock.calls.find(([statement]) =>
      /INSERT INTO users/.test(statement)
    );
    expect(insertCall).toBeDefined();
  });

  it('returns conflict when email already exists', async () => {
    mockQuery.mockImplementation((sql) => {
      if (sql.includes('FROM users WHERE email = $1')) {
        return Promise.resolve({
          rows: [
            {
              id: 1,
              password_hash: hashedPassword,
              agency_id: 2,
              is_admin: true,
            },
          ],
          rowCount: 1,
        });
      }
      if (sql.startsWith('SELECT id FROM agencies')) {
        return Promise.resolve({ rows: [{ id: 2 }], rowCount: 1 });
      }
      if (sql.startsWith('INSERT INTO users')) {
        const err = new Error('duplicate key value');
        err.code = '23505';
        return Promise.reject(err);
      }
      throw new Error(`Unexpected query in conflict test: ${sql}`);
    });

    const agent = request.agent(app);
    await agent
      .post('/api/auth/login')
      .send({ email: 'admin@example.com', password: 'password123' })
      .expect(200);

    const res = await agent
      .post('/api/admin/users')
      .send({ email: 'existing@example.com', password: 'Password123!' });

    expect(res.status).toBe(409);
    expect(res.body.error).toBe('Email already exists');
  });
});
