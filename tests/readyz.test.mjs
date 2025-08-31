import test from 'node:test';
import assert from 'node:assert/strict';
import app from '../Server.js';

// Start the server on an ephemeral port for testing
 test('health and readiness endpoints', async (t) => {
  const server = app.listen(0);
  t.after(() => server.close());

  const { port } = server.address();
  const base = `http://localhost:${port}`;

  const healthRes = await fetch(`${base}/healthz`);
  assert.equal(healthRes.status, 200);
  assert.deepEqual(await healthRes.json(), { ok: true });

  const readyRes = await fetch(`${base}/readyz`);
  assert.equal(readyRes.status, 200);
  assert.deepEqual(await readyRes.json(), { ready: true });
});
