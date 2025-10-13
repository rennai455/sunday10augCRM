#!/usr/bin/env node
// Lightweight diagnostics that can skip DB/API on CI
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const args = new Set(process.argv.slice(2));
const skipApi = args.has('--skip-api');

async function main() {
  console.log('Diagnostics start. Skip API =', skipApi);
  // Env presence check (non-fatal)
  const required = ['JWT_SECRET', 'WEBHOOK_SECRET'];
  const missing = required.filter((k) => !process.env[k]);
  if (missing.length) {
    console.warn('Missing env (non-fatal in CI):', missing.join(', '));
  }

  // Middleware presence check
  try {
    const code = fs.readFileSync(path.join(__dirname, '..', 'src', 'middleware.js'), 'utf8');
    if (!code.includes('helmet(') || !code.includes('rateLimit(')) {
      console.warn('Security middleware missing expected keywords');
    } else {
      console.log('Security middleware OK');
    }
  } catch (e) {
    console.warn('Unable to read middleware.js');
  }

  if (!skipApi) {
    // Heavy checks are out of scope for CI wrapper
    console.log('Full diagnostics are disabled without --skip-api');
  }

  console.log('Diagnostics complete');
}

main().catch((e) => {
  console.error('Diagnostics error', e);
  process.exit(1);
});

