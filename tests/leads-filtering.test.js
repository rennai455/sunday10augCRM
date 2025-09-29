const request = require('supertest');
const bcrypt = require('bcryptjs');

const hashedPassword = bcrypt.hashSync('password123', 10);

// Mock DB layer
const mockPoolQuery = jest.fn();
const withAgencyContext = async (_agencyId, fn) => {
  const client = {
    query: jest.fn(async (sql, params) => {
      if (/SELECT COUNT\(\*\)::int AS total FROM leads/i.test(sql)) {
        return { rows: [{ total: 2 }] };
      }
      if (/SELECT l\.\* FROM leads/i.test(sql)) {
        return {
          rows: [
            {
              id: 1,
              campaign_id: params[0] || 1,
              name: 'John',
              status: 'new',
              created_at: new Date().toISOString(),
            },
            {
              id: 2,
              campaign_id: params[0] || 1,
              name: 'Jane',
              status: 'active',
              created_at: new Date().toISOString(),
            },
          ],
        };
      }
      return { rows: [] };
    }),
  };
  return fn(client);
};

jest.mock('../src/db/pool', () => ({
  query: (...args) => mockPoolQuery(...args),
  withTransaction: async (fn) => fn({ query: mockPoolQuery }),
  withAgencyContext,
  pool: { query: mockPoolQuery, end: jest.fn() },
  smokeTest: jest.fn(),
}));

const { app, server } = require('../server');

describe('Leads filtering API', () => {
  afterAll(() => {
    if (server && server.listening) server.close();
  });

  it('lists leads with pagination and filters', async () => {
    // Mock login user row
    mockPoolQuery.mockResolvedValueOnce({
      rows: [
        { id: 1, password_hash: hashedPassword, agency_id: 1, is_admin: false },
      ],
    });

    const agent = request.agent(app);
    const loginRes = await agent
      .post('/api/auth/login')
      .send({ email: 'user@example.com', password: 'password123' });
    expect(loginRes.status).toBe(200);

    const res = await agent.get('/api/leads?page=1&pageSize=2&status=active');
    expect(res.status).toBe(200);
    expect(res.headers['x-total-count']).toBeDefined();
    expect(Array.isArray(res.body.leads)).toBe(true);
  });
});
