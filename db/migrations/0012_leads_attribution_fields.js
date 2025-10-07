/* eslint-disable */
exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.sql(`
ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS source TEXT,
  ADD COLUMN IF NOT EXISTS utm_medium TEXT,
  ADD COLUMN IF NOT EXISTS utm_source TEXT,
  ADD COLUMN IF NOT EXISTS utm_campaign TEXT,
  ADD COLUMN IF NOT EXISTS utm_term TEXT,
  ADD COLUMN IF NOT EXISTS utm_content TEXT,
  ADD COLUMN IF NOT EXISTS converted_at TIMESTAMPTZ;
`);
};

exports.down = (pgm) => {
  pgm.sql(`
ALTER TABLE leads
  DROP COLUMN IF EXISTS source,
  DROP COLUMN IF EXISTS utm_medium,
  DROP COLUMN IF EXISTS utm_source,
  DROP COLUMN IF EXISTS utm_campaign,
  DROP COLUMN IF EXISTS utm_term,
  DROP COLUMN IF EXISTS utm_content,
  DROP COLUMN IF EXISTS converted_at;
`);
};

