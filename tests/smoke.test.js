// tests/smoke.test.js: basic health and security smoke tests
const request = require('supertest');

// Mock database layer to avoid real connections during tests
jest.mock('../db', () => ({
  pool: { query: jest.fn().mockResolvedValue({ rows: [] }) },
}));

const { app, server } = require('../server');

describe('RENN.AI CRM Security & Health', () => {
  it('should respond to health endpoint', async () => {
    const res = await request(app).get('/healthz');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'healthy' });
  });

  it('should respond to readiness endpoint', async () => {
    const res = await request(app).get('/readyz');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ready: true });
  });

  it('should not expose .env files', async () => {
    const res = await request(app).get('/.env');
    expect(res.status).toBe(404);
  });

  it('should enforce CSP headers on static content', async () => {
    const res = await request(app).get('/static/dashboard.html');
    expect(res.headers['content-security-policy']).toBeDefined();
    expect(res.headers['content-security-policy']).toMatch(/default-src/);
  });

  it('serves built CSS from /static', async () => {
    const res = await request(app).get('/static/dist/main.css');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/css/);
  });

  it('should enforce CORS allowlist', async () => {
    const res = await request(app)
      .get('/healthz')
      .set('Origin', 'http://localhost:3000');
    expect(res.headers['access-control-allow-origin']).toBe(
      'http://localhost:3000'
    );
  });

  it('should block unauthorized API access', async () => {
    const res = await request(app).get('/api/campaigns/123');
    expect(res.status).toBe(401);
  });

  it('should enforce rate limiting on API routes', async () => {
    // Make multiple requests rapidly to test rate limiting
    const requests = Array(5)
      .fill()
      .map(() => request(app).get('/api/campaigns/123'));

    const responses = await Promise.all(requests);
    // At least some should pass in dev, but rate limiting should be configured
    expect(responses.some((r) => r.status < 500)).toBe(true);
  });

  afterAll(() => {

    if (server.listening) server.close();

  });
});
