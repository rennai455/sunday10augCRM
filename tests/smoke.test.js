// tests/smoke.test.js: security/auth/CSP/CORS smoke tests
const request = require('supertest');
const app = require('../Server');
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
      .get('/health')
      .set('Origin', process.env.TEST_ORIGIN || 'http://localhost:3000');
    expect(res.headers['access-control-allow-origin']).toBe(
      process.env.TEST_ORIGIN || 'http://localhost:3000'
    );
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
