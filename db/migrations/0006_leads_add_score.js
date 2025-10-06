/* eslint-disable */
exports.shorthands = undefined;

exports.up = (pgm) => {
  // PostgreSQL does not support column positioning; this will append the column.
  // Logical order can be maintained in SELECTs/views if needed.
  pgm.sql(`
ALTER TABLE leads ADD COLUMN IF NOT EXISTS score INTEGER;
`);
};

exports.down = (pgm) => {
  pgm.sql(`
ALTER TABLE leads DROP COLUMN IF EXISTS score;
`);
};

