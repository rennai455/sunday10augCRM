const request = require('supertest');
const bcrypt = require('bcryptjs');

const hashedPassword = bcrypt.hashSync('password123', 10);

const mockQuery = jest.fn().mockResolvedValue({ rows: [] });
jest.mock('../db', () => ({
  pool: { query: mockQuery },
}));

const { app, server } = require('../server');

describe('dashboard authentication flow', () => {
  afterAll(() => {
    if (server.listening) server.close();
  });

  it('redirects unauthenticated users to Login.html', async () => {
    const res = await request(app).get('/dashboard.html');
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/Login.html');
  });

  it('sets cookie on login and grants access to dashboard', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        { id: 1, password_hash: hashedPassword, agency_id: 1, is_admin: false },
      ],
    });
    const agent = request.agent(app);
    const loginRes = await agent
      .post('/api/auth/login')
      .send({ email: 'user@example.com', password: 'password123' });
    expect(loginRes.status).toBe(200);
    expect(loginRes.headers['set-cookie'][0]).toMatch(/^token=/);

    const dashRes = await agent.get('/dashboard.html');
    expect(dashRes.status).toBe(200);
  });
});
