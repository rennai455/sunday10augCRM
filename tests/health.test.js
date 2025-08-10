const request = require('supertest');
const { app } = require('../Server');

describe('health and readiness', () => {
  it('responds on /health', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });

  it('fails readiness when db not initialized', async () => {
    const res = await request(app).get('/ready');
    expect(res.status).toBeGreaterThanOrEqual(500);
  });
});
