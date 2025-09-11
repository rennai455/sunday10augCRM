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

describe('Admin-only docs route', () => {
  afterAll(() => { if (server && server.listening) server.close(); });

  it('forbids non-admins', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 1, password_hash: hashedPassword, agency_id: 1, is_admin: false }] });
    const agent = request.agent(app);
    await agent.post('/api/auth/login').send({ email: 'user@example.com', password: 'password123' });
    const res = await agent.get('/docs');
    expect(res.status).toBe(403);
  });

  it('allows admins', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 1, password_hash: hashedPassword, agency_id: 1, is_admin: true }] });
    const agent = request.agent(app);
    await agent.post('/api/auth/login').send({ email: 'admin@example.com', password: 'password123' });
    const res = await agent.get('/docs');
    expect([200, 302]).toContain(res.status); // 200 expected; 302 if auth changes redirect flow
  });
});

