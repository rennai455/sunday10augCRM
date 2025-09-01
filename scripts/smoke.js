'use strict';

const BASE = process.env.BASE_URL || 'http://localhost:3002';

async function hit(path) {
  try {
    const res = await fetch(BASE + path);
    const body = await res.text();
    console.log(`${path} -> ${res.status}`, body.slice(0, 200));
  } catch (e) {
    console.error(`${path} -> error`, e.message);
  }
}

(async function run() {
  await hit('/healthz');
  await hit('/readyz');
  await hit('/metrics');
})();

