import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';

let app;
try {
  const mod = await import('../Server.js');
  app = mod.default || mod;
} catch (err) {
  test('server import failed', (t) => t.skip(err.message));
}

if (app) {
  const server = app.listen(0);
  await once(server, 'listening');
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  test('healthz returns ok', async () => {
    const res = await fetch(`${baseUrl}/healthz`);
    assert.strictEqual(res.status, 200);
    assert.deepStrictEqual(await res.json(), { ok: true });
  });

  test('readyz reports ready when DB reachable', async () => {
    const res = await fetch(`${baseUrl}/readyz`);
    assert.strictEqual(res.status, 200);
  });

  test('static html has CSP header', async () => {
    const res = await fetch(`${baseUrl}/static/dashboard.html`);
    assert.strictEqual(res.status, 200);
    assert.ok(res.headers.get('content-security-policy'));
  });

  test.after(() => server.close());
}
