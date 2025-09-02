// tests/smoke.test.js: basic health and security smoke tests
const request = require('supertest');
const { app } = require('../server');

describe('RENN.AI CRM health endpoints', () => {
  it('GET /healthz should report ok', async () => {
    const res = await request(app).get('/healthz');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });

  it('GET /readyz should report ready', async () => {
    const res = await request(app).get('/readyz');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('status', 'ready');

  });

  it('should not expose .env files', async () => {
    const res = await request(app).get('/.env');
    expect(res.status).toBe(404);
  });
});
