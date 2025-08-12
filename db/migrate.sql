-- migrate.sql: idempotent schema for renn-ai-crm

CREATE TABLE IF NOT EXISTS agencies (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    agency_id INTEGER REFERENCES agencies(id),
    is_admin BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS campaigns (
    id SERIAL PRIMARY KEY,
    agency_id INTEGER REFERENCES agencies(id),
    name TEXT NOT NULL,
    status TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS leads (
    id SERIAL PRIMARY KEY,
    campaign_id INTEGER REFERENCES campaigns(id),
    name TEXT NOT NULL,
    email TEXT,
    phone TEXT,
    status TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Add indexes for uniqueness and performance
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'users') THEN
    CREATE UNIQUE INDEX IF NOT EXISTS users_email_key ON users(email);
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'leads') THEN
    CREATE INDEX IF NOT EXISTS leads_email_idx ON leads(email);
    CREATE INDEX IF NOT EXISTS leads_phone_idx ON leads(phone);
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'campaigns') THEN
    CREATE INDEX IF NOT EXISTS campaigns_agency_id_idx ON campaigns(agency_id);
  END IF;
END
$$ LANGUAGE plpgsql;
