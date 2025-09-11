/* eslint-disable */
exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.sql(`
-- Prepare permissive policies; enforcement controlled via enable-rls script
CREATE POLICY IF NOT EXISTS users_select_self ON users
  FOR SELECT USING (true);

CREATE POLICY IF NOT EXISTS campaigns_isolation ON campaigns
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY IF NOT EXISTS leads_isolation ON leads
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY IF NOT EXISTS agencies_ro ON agencies
  FOR SELECT USING (true);
`);
};

exports.down = (pgm) => {
  // Keep policies; no down migration by default
};

