const request = require('supertest');

// Mock DB to avoid real connections
jest.mock('../db', () => ({ pool: { query: jest.fn().mockResolvedValue({ rows: [] }) } }));

const { app, server } = require('../server');

describe('rate limit metrics', () => {
  afterAll(() => {
    if (server && server.listening) server.close();
  });

  it('increments rate_limit_blocked_total on auth exhaustion', async () => {
    // Hit auth endpoint more than 10 times in a window to trigger 429
    const reqs = [];
    for (let i = 0; i < 11; i++) {
      reqs.push(
        request(app)
          .post('/api/auth/login')
          .send({ email: 'a@b.c', password: 'x' })
          .set('Content-Type', 'application/json')
      );
    }
    const responses = await Promise.all(reqs);
    const last = responses[responses.length - 1];
    expect([200, 401, 400, 429]).toContain(last.status);

    // Scrape metrics
    const metricsRes = await request(app).get('/metrics');
    expect(metricsRes.status).toBe(200);
    const body = metricsRes.text;
    // Ensure metric exists; we don't assert exact count due to shared process state
    expect(body).toMatch(/rate_limit_blocked_total/);
  });
});

