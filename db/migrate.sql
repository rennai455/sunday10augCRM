-- migrate.sql: idempotent schema for renn-ai-crm

CREATE TABLE IF NOT EXISTS agencies (
    id SERIAL PRIMARY KEY,
    name VARCHAR(128) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(128) UNIQUE NOT NULL,
    password_hash VARCHAR(256) NOT NULL,
    agency_id INTEGER REFERENCES agencies(id) ON DELETE CASCADE,
    is_admin BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS campaigns (
    id SERIAL PRIMARY KEY,
    agency_id INTEGER REFERENCES agencies(id) ON DELETE CASCADE,
    name VARCHAR(128) NOT NULL,
    status VARCHAR(32) NOT NULL,
    details JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS leads (
    id SERIAL PRIMARY KEY,
    campaign_id INTEGER REFERENCES campaigns(id) ON DELETE CASCADE,
    name VARCHAR(128),
    email VARCHAR(128),
    score INTEGER,
    phone VARCHAR(32),
    status VARCHAR(32),
    status_history JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

-- Performance indexes (idempotent)
CREATE INDEX IF NOT EXISTS idx_campaigns_agency_created ON campaigns(agency_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_leads_campaign_created ON leads(campaign_id, created_at DESC);

-- Audit log for critical actions
CREATE TABLE IF NOT EXISTS audit_log (
  id BIGSERIAL PRIMARY KEY,
  occurred_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  req_id TEXT,
  user_id INTEGER,
  agency_id INTEGER,
  action TEXT NOT NULL,
  payload_hash TEXT,
  ip INET,
  user_agent TEXT
);

CREATE INDEX IF NOT EXISTS idx_audit_agency_time ON audit_log(agency_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_user_time ON audit_log(user_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_action_time ON audit_log(action, occurred_at DESC);

-- Ensure leads updated_at trigger exists
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

-- lead_timeline: structured per-lead activity log
CREATE TABLE IF NOT EXISTS lead_timeline (
  id SERIAL PRIMARY KEY,
  lead_id INTEGER REFERENCES leads(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  context JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lead_timeline_lead_created
  ON lead_timeline (lead_id, created_at DESC);

-- Lead enrichment columns
ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS website TEXT;

-- lead_events: flexible event stream per lead
CREATE TABLE IF NOT EXISTS lead_events (
  id SERIAL PRIMARY KEY,
  lead_id INTEGER NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  message TEXT,
  metadata JSONB DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_lead_events_lead_created ON lead_events (lead_id, created_at DESC);

-- Add score column for existing databases (idempotent)
ALTER TABLE leads ADD COLUMN IF NOT EXISTS score INTEGER;
