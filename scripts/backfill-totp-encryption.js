#!/usr/bin/env node
// Encrypt legacy plaintext TOTP secrets into AES-256-GCM columns
import { pool } from '../src/db/pool.js';
import { encryptAesGcm, getKey } from '../src/utils/crypto.js';

async function run() {
  if (!getKey()) {
    console.error('TOTP_ENCRYPTION_KEY is not set or invalid (need 64 hex chars).');
    process.exit(1);
  }
  const res = await pool.query(
    `SELECT id, totp_secret FROM users
     WHERE totp_secret IS NOT NULL
       AND (totp_secret_encrypted IS NULL OR totp_secret_iv IS NULL)`
  );
  if (res.rowCount === 0) {
    console.log('No plaintext TOTP secrets to backfill.');
    process.exit(0);
  }
  let updated = 0;
  for (const row of res.rows) {
    const enc = encryptAesGcm(row.totp_secret);
    if (!enc) continue;
    await pool.query(
      'UPDATE users SET totp_secret_encrypted = $1, totp_secret_iv = $2, totp_secret = NULL WHERE id = $3',
      [enc.ciphertext, enc.ivHex, row.id]
    );
    updated += 1;
  }
  console.log(`Backfill complete. Updated ${updated} user(s).`);
}

run()
  .catch((e) => {
    console.error('Backfill error:', e);
    process.exit(1);
  })
  .finally(() => pool.end());

