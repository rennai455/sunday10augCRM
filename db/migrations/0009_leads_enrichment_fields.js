/* eslint-disable */
exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.sql(`
ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS website_found BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS keywords TEXT[] DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS enriched_at TIMESTAMPTZ;
`);
};

exports.down = (pgm) => {
  pgm.sql(`
ALTER TABLE leads
  DROP COLUMN IF EXISTS website_found,
  DROP COLUMN IF EXISTS keywords,
  DROP COLUMN IF EXISTS enriched_at;
`);
};

