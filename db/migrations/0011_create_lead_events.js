export async function up(pg) {
  await pg.query(`
    CREATE TABLE lead_events (
      id SERIAL PRIMARY KEY,
      lead_id INTEGER NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
      type TEXT NOT NULL,
      message TEXT,
      metadata JSONB DEFAULT '{}'::JSONB,
      created_at TIMESTAMPTZ DEFAULT now()
    );
    CREATE INDEX ON lead_events (lead_id, created_at DESC);
  `);
}

export async function down(pg) {
  await pg.query(`DROP TABLE IF EXISTS lead_events`);
}

