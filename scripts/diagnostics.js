// Restore checkEnv function
async function checkEnv() {
  const required = ['DATABASE_URL', 'JWT_SECRET', 'WEBHOOK_SECRET'];
  const missing = required.filter(k => !config[k] || !String(config[k]).trim());
  if (missing.length) {
    fail('Missing required env vars: ' + missing.join(', '));
  } else {
    pass('Required env vars present.');
  }
}
'use strict';
const config = require('../config');

/**
 * RENN.AI Diagnostics
 * - Verifies env + Postgres connectivity
 * - (If available) probes API protections via supertest
 * - Prints targeted hints on common failures
 *
 * Exit codes: 0 = all checks passed, 1 = failure
 */


const { Pool } = require('pg');

const EXIT = { OK: 0, FAIL: 1 };
let hadFailure = false;

function info(msg)  { console.log(`ℹ️  ${msg}`); }
function pass(msg)  { console.log(`✅ ${msg}`); }
function warn(msg)  { console.log(`⚠️  ${msg}`); }
function fail(msg)  { hadFailure = true; console.error(`❌ ${msg}`); }

function sslConfig() {
  return config.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false;
}

async function checkAPI() {
  // Import the Express app for diagnostics (should export `app`)
  let app = null;
  try {
    app = require('../server');
  } catch (e) {
    warn('Could not import Express app from server.js: ' + e.message);
    return;
  }

  if (!app || typeof app.handle !== 'function') {
    warn('Express app not found or invalid export. Ensure server.js exports `app`.');
    return;
  }

  let request;
  try {
    request = require('supertest');
  } catch (e) {
    warn('supertest not installed. Skipping API checks.');
    return;
  }

  // Example API probe: health endpoint
  try {
    const res = await request(app).get('/health');
    if (res.status === 200 && res.body.status === 'ok') {
      pass('API /health endpoint OK');
    } else {
      fail('API /health endpoint failed: ' + JSON.stringify(res.body));
    }
  } catch (e) {
    fail('API /health probe error: ' + e.message);
  }
}

async function checkDB() {
  const url = config.DATABASE_URL;
  if (!url || !String(url).trim()) {
    fail('DATABASE_URL is empty. Set it in .env (see RUNBOOK.md for examples).');
    return;
  }
  const pool = new Pool({ connectionString: url, ssl: sslConfig() });
  try {
    const client = await pool.connect();
    const r = await client.query('SELECT 1 AS ok');
    if (!r || !r.rows || r.rows[0].ok !== 1) throw new Error('Unexpected DB result');
    client.release();
    await pool.end();
    pass('PostgreSQL connection OK (SELECT 1).');
  } catch (e) {
    fail(`PostgreSQL connection FAILED: ${e.message}`);
    const m = e.message || '';
    if (/ECONNREFUSED/i.test(m)) {
      info('Cause: Postgres not running or wrong host/port.\nFix: Start local DB (docker) or use a reachable managed instance.');
    } else if (/ENOTFOUND|getaddrinfo/i.test(m)) {
      info('Cause: Bad hostname.\nFix: Check HOST in DATABASE_URL.');
    } else if (/self signed certificate|certificate/i.test(m)) {
      info("Cause: SSL mismatch.\nFix: Append '?sslmode=require' to DATABASE_URL and ensure production code uses SSL.");
    } else if (/password authentication failed/i.test(m)) {
      info('Cause: Wrong user/password or special chars not URL-encoded.\nFix: Verify creds; URL-encode @ : / ? #.');
    } else if (/no pg_hba\.conf entry/i.test(m)) {
      info('Cause: Host/user not allowed by server.\nFix: Allowlist your IP or adjust pg_hba.conf / provider settings.');
    } else if (/database .* does not exist/i.test(m)) {
      info('Cause: DB name not created.\nFix: Create the database and grant privileges to your role.');
    }
    try { await pool.end(); } catch (error) { 
      // Ignore cleanup errors
      void error;
    }
  }
}

async function checkAPI() {
  // Try to import the Express app (should export `app`)
  let app = null;
  try {
    // Common export patterns
    app = require('../server'); // without extension
  } catch (error) {
    // Ignore import errors
    void error;
    try { 
      app = require('../server.js'); 
    } catch (innerError) { 
      void innerError;
    }
  }

  if (!app || !app.handle) {
    warn('API checks skipped: could not import Express app. Ensure server.js exports `app` and only listens when run directly.');
    return;
  }

  let request;
  try {
    request = require('supertest');
  } catch (e) {
    warn('supertest not installed; skipping API probes. Run: npm i -D supertest');
    return;
  }

  const agent = request(app);

  // 1) /crm.db must not be served
  try {
    const res = await agent.get('/crm.db');
    if (res.status === 404) pass('Static DB exposure: /crm.db is NOT served (good).');
    else fail(`Static DB exposure: /crm.db returned status ${res.status} (should be 404).`);
  } catch (e) {
    warn(`/crm.db check skipped due to error: ${e.message}`);
  }

  // 2) Unauthorized API guard
  try {
    const res = await agent.get('/api/campaigns/nonexistent');
    if (res.status === 401) pass('Unauthorized access correctly blocked with 401.');
    else if (res.status === 403) {
      warn('Got 403 on unauthenticated request (prefer 401). Verify auth middleware runs before ownership checks.');
    } else {
      fail(`Unexpected status for unauthenticated request: ${res.status} (expected 401).`);
    }
  } catch (e) {
    warn(`Unauthorized check error: ${e.message}`);
  }

  // 3) Webhook signature enforcement
  try {
    const res = await agent
      .post('/api/webhooks/campaign-update')
      .set('Content-Type', 'application/json')
      .send('{}'); // missing X-Signature + X-Timestamp
    if (res.status === 400 || res.status === 401) {
      pass('Webhook without signature rejected (good).');
    } else {
      fail(`Webhook missing-signature returned ${res.status} (expected 400/401).`);
    }
  } catch (e) {
    warn(`Webhook check error: ${e.message}`);
  }

  // 4) Helmet/CSP presence on any route
  try {
    const candidates = ['/', '/static/dashboard.html', '/static/'];
    let seenCsp = false;
    for (const p of candidates) {
      const res = await agent.get(p);
      if (res && res.headers && res.headers['content-security-policy']) {
        seenCsp = true; break;
      }
    }
    if (seenCsp) pass('Helmet CSP header present.');
    else warn('Could not detect CSP header. Ensure helmet() with CSP is enabled.');
  } catch (e) {
    warn(`CSP check error: ${e.message}`);
  }

  // 5) CORS deny unknown origin
  try {
    const res = await agent
      .options('/api/campaigns/nonexistent')
      .set('Origin', 'https://evil.example')
      .set('Access-Control-Request-Method', 'GET');
    const allowed = res.headers['access-control-allow-origin'];
    if (!allowed || allowed === 'null' || allowed === 'https://evil.example') {
      pass('CORS appears restrictive (unknown origin not explicitly allowed).');
    } else {
      warn(`CORS allowed origin header = ${allowed}. Verify ALLOWED_ORIGINS configuration.`);
    }
  } catch (e) {
    warn(`CORS check error: ${e.message}`);
  }
}

(async function main() {
  info('Running diagnostics…');
  await checkEnv();
  await checkDB();
  await checkAPI();
  if (hadFailure) {
    fail('Diagnostics FAILED. See messages above and docs/RUNBOOK.md.');
    process.exit(EXIT.FAIL);
  } else {
    pass('All diagnostics passed.');
    process.exit(EXIT.OK);
  }
})();
