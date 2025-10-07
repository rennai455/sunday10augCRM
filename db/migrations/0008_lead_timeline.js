/* eslint-disable */
exports.shorthands = undefined;

exports.up = (pgm) => {
  // Note: leads.id is INTEGER in current schema; using INTEGER for lead_id to match.
  pgm.sql(`
CREATE TABLE IF NOT EXISTS lead_timeline (
  id SERIAL PRIMARY KEY,
  lead_id INTEGER REFERENCES leads(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  context JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lead_timeline_lead_created
  ON lead_timeline (lead_id, created_at DESC);
`);
};

exports.down = (pgm) => {
  pgm.sql(`
DROP INDEX IF EXISTS idx_lead_timeline_lead_created;
DROP TABLE IF EXISTS lead_timeline;
`);
};

