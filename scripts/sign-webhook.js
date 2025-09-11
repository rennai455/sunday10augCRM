#!/usr/bin/env node
// sign-webhook.js: compute HMAC signature for CRM /webhook
// Usage:
//   node scripts/sign-webhook.js --secret <WEBHOOK_SECRET> --id <uuid> --ts <ms> --body '{"k":"v"}'
// Prints headers and a curl example.

const crypto = require('crypto');

function parseArgs() {
  const a = process.argv.slice(2);
  const out = {};
  for (let i = 0; i < a.length; i += 2) {
    const k = a[i];
    const v = a[i + 1];
    if (!k || !v) continue;
    out[k.replace(/^--/, '')] = v;
  }
  return out;
}

const { secret, id, ts, body } = parseArgs();
if (!secret || !body) {
  console.error('Missing required args. --secret and --body are required. Optional: --id, --ts');
  process.exit(2);
}

const timestamp = ts || String(Date.now());
const eventId = id || crypto.randomUUID();
const raw = id && ts ? `${eventId}.${timestamp}.${body}` : body;
const sig = crypto.createHmac('sha256', secret).update(raw).digest('hex');

console.log('x-id:', eventId);
console.log('x-timestamp:', timestamp);
console.log('x-signature:', sig);
console.log('\nExample curl:');
console.log(
  `curl -sS -X POST "$CRM_URL/webhook" \\` +
    `\n  -H 'content-type: application/json' \\` +
    `\n  -H 'x-id: ${eventId}' -H 'x-timestamp: ${timestamp}' -H 'x-signature: ${sig}' \\` +
    `\n  --data-raw '${body.replace(/'/g, "'\\''")}'\n`
);

