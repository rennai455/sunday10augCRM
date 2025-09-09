const request = require('supertest');
const crypto = require('crypto');

// Mock DB to avoid real connections
jest.mock('../db', () => ({ pool: { query: jest.fn().mockResolvedValue({ rows: [] }) } }));

const { app, server } = require('../server');

function sign({ body, id, ts, secret }) {
  const bodyBuf = Buffer.from(body, 'utf8');
  const toSign = id && ts
    ? Buffer.concat([Buffer.from(String(id)), Buffer.from('.'), Buffer.from(String(ts)), Buffer.from('.'), bodyBuf])
    : bodyBuf;
  return crypto.createHmac('sha256', secret).update(toSign).digest('hex');
}

describe('webhook metrics', () => {
  afterAll(() => {
    if (server && server.listening) server.close();
  });

  it('exposes webhook_events_total with accepted and replay outcomes', async () => {
    const secret = process.env.WEBHOOK_SECRET;
    const body = JSON.stringify({ ok: true });

    const id = 'evt_metrics';
    const ts = Date.now();
    const sig = sign({ body, id, ts, secret });

    await request(app)
      .post('/webhook')
      .set('Content-Type', 'application/json')
      .set('x-id', id)
      .set('x-timestamp', String(ts))
      .set('x-signature', sig)
      .send(body);

    await request(app)
      .post('/webhook')
      .set('Content-Type', 'application/json')
      .set('x-id', id)
      .set('x-timestamp', String(ts))
      .set('x-signature', sig)
      .send(body);

    const metricsRes = await request(app).get('/metrics');
    expect(metricsRes.status).toBe(200);
    const text = metricsRes.text;
    expect(text).toMatch(/webhook_events_total/);
    expect(text).toMatch(/webhook_events_total\{outcome="accepted"\}/);
    expect(text).toMatch(/webhook_events_total\{outcome="replay"\}/);
  });
});

