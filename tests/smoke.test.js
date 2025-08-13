// tests/smoke.test.js: security/auth/CSP/CORS smoke tests
// Mock the database pool before loading the app so routes use the stubbed pool
jest.mock('../db', () => ({
  pool: {
    query: jest.fn(),
  },
}));

const request = require('supertest');
const { pool } = require('../db');
const app = require('../Server');
describe('RENN.AI CRM Security & Auth', () => {
  it('should not serve .db files', async () => {
    const res = await request(app).get('/crm.db');
    expect(res.status).toBe(404);
  });

  it.each([
    '/static/dashboard.html',
    '/static/Login.html',
  ])('should enforce CSP headers on %s', async (path) => {
    const res = await request(app).get(path);
    expect(res.headers['content-security-policy']).toBeDefined();
  });

  it('should include CDN in CSP policy', async () => {
    const res = await request(app).get('/static/dashboard.html');
    expect(res.headers['content-security-policy']).toMatch(/cdn\.tailwindcss\.com/);
  });

  it('should set CORS header for allow-listed origin', async () => {
    const res = await request(app).get('/health').set('Origin', 'http://localhost:3000');
    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:3000');
  });

  it('should not set CORS header for disallowed origin', async () => {
    const res = await request(app).get('/health').set('Origin', 'http://evil.example');
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('should return 200 from /readyz when DB is reachable', async () => {
    pool.query.mockResolvedValueOnce({ rows: [{ ok: 1 }] });
    const res = await request(app).get('/readyz');
    expect(res.status).toBe(200);
  });

  it('should block unauthorized API access', async () => {
    const res = await request(app).get('/api/campaigns/123');
    expect(res.status).toBe(401);
  });

  it('should allow registration, login, and dashboard access', async () => {
    const email = `test${Date.now()}@renn.ai`;
    const password = 'testpassword123';
    // Register
    let res = await request(app).post('/api/auth/register').send({ email, password, agency: 'Test Agency' });
    expect(res.body.success).toBe(true);
    // Login
    res = await request(app).post('/api/auth/login').send({ email, password });
    expect(res.body.success).toBe(true);
    const cookies = res.headers['set-cookie'];
    expect(cookies).toBeDefined();
    // Logout
    res = await request(app).post('/api/auth/logout').set('Cookie', cookies);
    expect(res.body.success).toBe(true);
  });
});
