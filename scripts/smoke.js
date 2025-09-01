// scripts/smoke.js: lightweight smoke tests for health endpoints
const request = require('supertest');

// Stub database pool so health checks don't require a real DB
const db = require('../db');
db.pool.query = async () => ({});

const { app, server } = require('../server');

(async () => {
  try {
    await request(app).get('/healthz').expect(200);
    await request(app).get('/readyz').expect(200);
    console.log('Smoke tests passed');
    if (server && server.listening) server.close();
  } catch (err) {
    console.error('Smoke tests failed', err);
    if (server && server.listening) server.close();
    process.exit(1);
  }
})();
