/* eslint-disable */
exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.sql(`
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS totp_secret_encrypted TEXT,
  ADD COLUMN IF NOT EXISTS totp_secret_iv TEXT,
  ADD COLUMN IF NOT EXISTS totp_enabled BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS totp_enrolled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS totp_recovery_codes JSONB DEFAULT '[]'::jsonb;
`);

  pgm.sql(`
CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT UNIQUE NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  request_ip INET,
  request_user_agent TEXT
);
`);

  pgm.sql(`
CREATE INDEX IF NOT EXISTS password_reset_tokens_user_idx
  ON password_reset_tokens(user_id);
`);

  pgm.sql(`
CREATE INDEX IF NOT EXISTS password_reset_tokens_active_idx
  ON password_reset_tokens(token_hash, expires_at)
  WHERE used_at IS NULL;
`);
};

exports.down = (pgm) => {
  pgm.sql(`
ALTER TABLE users
  DROP COLUMN IF EXISTS totp_secret_encrypted,
  DROP COLUMN IF EXISTS totp_secret_iv,
  DROP COLUMN IF EXISTS totp_enabled,
  DROP COLUMN IF EXISTS totp_enrolled_at,
  DROP COLUMN IF EXISTS totp_recovery_codes;
`);

  pgm.sql('DROP TABLE IF EXISTS password_reset_tokens;');
};
