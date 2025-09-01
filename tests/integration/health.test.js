// tests/integration/health.test.js: verify health and readiness probes
const request = require('supertest');

jest.mock('../../db', () => ({
  pool: { query: jest.fn().mockResolvedValue({}) },
}));

const { app, server } = require('../../server');

afterAll(() => {
  if (server && server.listening) server.close();
});

describe('Health and readiness endpoints', () => {
  it('responds on /healthz', async () => {
    const res = await request(app).get('/healthz');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok', db: 'PostgreSQL' });
  });

  it('responds on /readyz', async () => {
    const res = await request(app).get('/readyz');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ready: true });
  });
});
