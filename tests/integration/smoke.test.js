// tests/integration/smoke.test.js: basic security headers and static file checks
const request = require('supertest');

// Mock database module so health checks don't hit real DB
jest.mock('../../db', () => ({
  pool: { query: jest.fn().mockResolvedValue({}) },
}));

const { app, server } = require('../../server');

afterAll(() => {
  if (server && server.listening) server.close();
});

describe('RENN.AI CRM Security & Auth', () => {
  it('should not serve .db files', async () => {
    const res = await request(app).get('/crm.db');
    expect(res.status).toBe(404);
  });

  it('should enforce CSP headers', async () => {
    const res = await request(app).get('/static/dashboard.html');
    expect(res.headers['content-security-policy']).toBeDefined();
    expect(res.headers['content-security-policy']).toMatch(/cdn\.tailwindcss\.com/);
  });

  it('should enforce CORS allowlist', async () => {
    const res = await request(app)
      .get('/healthz')
      .set('Origin', 'http://localhost:3000');
    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:3000');
  });
});
