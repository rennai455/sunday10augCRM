const request = require('supertest');
const { app } = require('../server');

describe('CSRF flow', () => {
  it('issues a CSRF token', async () => {
    const res = await request(app).get('/api/csrf-token');
    expect(res.status).toBe(200);
    expect(res.body.csrfToken).toBeDefined();
    // Cookie should be set for the token
    expect(res.headers['set-cookie']).toBeDefined();
  });
});

