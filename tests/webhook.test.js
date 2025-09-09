const request = require('supertest');
const crypto = require('crypto');

// Use the app without starting a network listener
const { app, server } = require('../server');

function signBody({ bodyBuffer, id, ts, secret }) {
  const toSign = id && ts
    ? Buffer.concat([
        Buffer.from(String(id)),
        Buffer.from('.'),
        Buffer.from(String(ts)),
        Buffer.from('.'),
        bodyBuffer,
      ])
    : bodyBuffer;
  return crypto.createHmac('sha256', secret).update(toSign).digest('hex');
}

describe('webhook hmac + replay guard', () => {
  const secret = process.env.WEBHOOK_SECRET;
  const payloadStr = JSON.stringify({ ok: true });
  const json = Buffer.from(payloadStr, 'utf8');

  afterAll(() => {
    if (server && server.listening) server.close();
  });

  it('accepts valid signature with id/timestamp', async () => {
    const id = 'evt_123';
    const ts = Date.now();
    const sig = signBody({ bodyBuffer: json, id, ts, secret });

    const res = await request(app)
      .post('/webhook')
      .set('Content-Type', 'application/json')
      .set('x-id', id)
      .set('x-timestamp', String(ts))
      .set('x-signature', sig)
      .send(payloadStr);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
  });

  it('rejects replay with same id', async () => {
    const id = 'evt_replay';
    const ts = Date.now();
    const sig = signBody({ bodyBuffer: json, id, ts, secret });

    const first = await request(app)
      .post('/webhook')
      .set('Content-Type', 'application/json')
      .set('x-id', id)
      .set('x-timestamp', String(ts))
      .set('x-signature', sig)
      .send(payloadStr);
    expect(first.status).toBe(200);

    const second = await request(app)
      .post('/webhook')
      .set('Content-Type', 'application/json')
      .set('x-id', id)
      .set('x-timestamp', String(ts))
      .set('x-signature', sig)
      .send(payloadStr);
    expect([409, 400]).toContain(second.status); // 409 preferred
  });

  it('rejects stale timestamp', async () => {
    const id = 'evt_stale';
    const ts = Date.now() - 6 * 60 * 1000; // 6 minutes
    const sig = signBody({ bodyBuffer: json, id, ts, secret });

    const res = await request(app)
      .post('/webhook')
      .set('Content-Type', 'application/json')
      .set('x-id', id)
      .set('x-timestamp', String(ts))
      .set('x-signature', sig)
      .send(payloadStr);
    expect(res.status).toBe(408);
  });

  it('rejects invalid signature', async () => {
    const res = await request(app)
      .post('/webhook')
      .set('Content-Type', 'application/json')
      .set('x-signature', 'deadbeef')
      .send(payloadStr);
    expect(res.status).toBe(400);
  });
});
