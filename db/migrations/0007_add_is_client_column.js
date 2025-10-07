/* eslint-disable */
exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.sql(`
ALTER TABLE leads ADD COLUMN IF NOT EXISTS is_client BOOLEAN DEFAULT FALSE;
`);
};

exports.down = (pgm) => {
  pgm.sql(`
ALTER TABLE leads DROP COLUMN IF EXISTS is_client;
`);
};

