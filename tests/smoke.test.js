// tests/smoke.test.js: security/auth/CSP/CORS smoke tests
const request = require('supertest');
const app = require('../Server');
const { pool } = require('../db');
describe('RENN.AI CRM Security & Auth', () => {
  it('should not serve .db files', async () => {
    const res = await request(app).get('/crm.db');
    expect(res.status).toBe(404);
  });
  it('should enforce CSP headers', async () => {
    const res = await request(app).get('/static/Login.html');
    const csp = res.headers['content-security-policy'];
    expect(csp).toBeDefined();
    expect(csp).toMatch(/'self'/);
    expect(csp).toMatch(/nonce-/);
    expect(csp).toMatch(/cdn\.tailwindcss\.com/);
  });
  it('should enforce CORS allowlist', async () => {
    const res = await request(app).get('/healthz').set('Origin', 'http://localhost:3000');
    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:3000');
  });
  it('should reflect readiness', async () => {
    const spy = jest.spyOn(pool, 'query').mockResolvedValueOnce();
    let res = await request(app).get('/readyz');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ready: true });
    spy.mockRejectedValueOnce(new Error('fail'));
    res = await request(app).get('/readyz');
    expect(res.status).toBe(503);
    expect(res.body).toEqual({ ready: false });
    spy.mockRestore();
  });
  it('should block unauthorized API access', async () => {
    const res = await request(app).get('/api/agencies');
    expect(res.status).toBe(401);
  });
});
