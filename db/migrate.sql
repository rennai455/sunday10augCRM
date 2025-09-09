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
    phone VARCHAR(32),
    status VARCHAR(32),
    status_history JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

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
