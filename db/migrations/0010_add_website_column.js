/* eslint-disable */
exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.sql(`
ALTER TABLE leads ADD COLUMN IF NOT EXISTS website TEXT;
`);
};

exports.down = (pgm) => {
  pgm.sql(`
ALTER TABLE leads DROP COLUMN IF EXISTS website;
`);
};

