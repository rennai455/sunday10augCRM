/* eslint-disable */
exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.sql(`
CREATE OR REPLACE FUNCTION set_campaigns_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_campaigns_set_updated_at'
  ) THEN
    CREATE TRIGGER trg_campaigns_set_updated_at
    BEFORE UPDATE ON campaigns
    FOR EACH ROW EXECUTE FUNCTION set_campaigns_updated_at();
  END IF;
END$$;
`);
};

exports.down = (pgm) => {
  pgm.sql(`
DROP TRIGGER IF EXISTS trg_campaigns_set_updated_at ON campaigns;
DROP FUNCTION IF EXISTS set_campaigns_updated_at();
`);
};

