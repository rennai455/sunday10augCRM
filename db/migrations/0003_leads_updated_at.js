/* eslint-disable */
exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.sql(`
ALTER TABLE leads ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

CREATE OR REPLACE FUNCTION set_leads_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_leads_set_updated_at'
  ) THEN
    CREATE TRIGGER trg_leads_set_updated_at
    BEFORE UPDATE ON leads
    FOR EACH ROW EXECUTE FUNCTION set_leads_updated_at();
  END IF;
END$$;
`);
};

exports.down = (pgm) => {
  pgm.sql(`
DROP TRIGGER IF EXISTS trg_leads_set_updated_at ON leads;
DROP FUNCTION IF EXISTS set_leads_updated_at();
`);
};

