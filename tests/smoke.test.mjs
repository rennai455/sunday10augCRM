import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import process from 'node:process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = 3002;
let server;

before(async () => {
  server = spawn('node', ['Server.js'], {
    cwd: path.join(__dirname, '..'),
    env: {
      ...process.env,
      PORT: String(PORT),
      ALLOWED_ORIGINS: 'http://localhost:3000',
    },
    stdio: 'inherit',
  });

  for (let i = 0; i < 10; i++) {
    await delay(500);
    if (server.exitCode !== null) {
      throw new Error('Server failed to start');
    }
    try {
      const res = await fetch(`http://localhost:${PORT}/health`);
      if (res.ok || res.status >= 400) return;
    } catch {
      // retry
    }
  }
  throw new Error('Server did not start in time');
});

after(() => {
  if (server && server.exitCode === null) {
    server.kill();
  }
});

test('GET /health responds with ok', async () => {
  const res = await fetch(`http://localhost:${PORT}/health`);
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.status, 'ok');
});

test('CORS header echoes allowed origin', async () => {
  const res = await fetch(`http://localhost:${PORT}/health`, {
    headers: { Origin: 'http://localhost:3000' },
  });
  assert.equal(
    res.headers.get('access-control-allow-origin'),
    'http://localhost:3000'
  );
});

test('serves static login page', async () => {
  const res = await fetch(`http://localhost:${PORT}/Login.html`);
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type'), /text\/html/);
});
