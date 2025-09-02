#!/usr/bin/env node
// scripts/smoke-direct.js: Direct smoke tests using supertest (PR #83 approach)
const request = require('supertest');

// Stub database pool so health checks don't require a real DB
const db = require('../db');
db.pool.query = async () => ({});

const { app, server } = require('../server');

(async () => {
  try {
    console.log('🔥 Running direct smoke tests...');

    await request(app).get('/healthz').expect(200);
    console.log('✅ /healthz endpoint OK');

    await request(app).get('/readyz').expect(200);
    console.log('✅ /readyz endpoint OK');

    await request(app).get('/health').expect(200);
    console.log('✅ /health endpoint OK');

    console.log('✅ All direct smoke tests passed!');
    if (server && server.listening) server.close();
  } catch (err) {
    console.error('❌ Direct smoke tests failed:', err.message);
    if (server && server.listening) server.close();
    process.exit(1);
  }
})();
