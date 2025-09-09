-- agencies
CREATE TABLE agencies (
    id SERIAL PRIMARY KEY,
    name VARCHAR(128) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- users
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(128) UNIQUE NOT NULL,
    password_hash VARCHAR(256) NOT NULL,
    agency_id INTEGER REFERENCES agencies(id) ON DELETE CASCADE,
    is_admin BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- campaigns
CREATE TABLE campaigns (
    id SERIAL PRIMARY KEY,
    agency_id INTEGER REFERENCES agencies(id) ON DELETE CASCADE,
    name VARCHAR(128) NOT NULL,
    status VARCHAR(32) NOT NULL,
    details JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- leads
CREATE TABLE leads (
    id SERIAL PRIMARY KEY,
    campaign_id INTEGER REFERENCES campaigns(id) ON DELETE CASCADE,
    client_id INTEGER REFERENCES clients(id),
    name VARCHAR(128),
    email VARCHAR(128),
    phone VARCHAR(32),
    status VARCHAR(32),
    status_history JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- campaign_analytics
CREATE TABLE campaign_analytics (
    id SERIAL PRIMARY KEY,
    campaign_id INTEGER REFERENCES campaigns(id) ON DELETE CASCADE,
    metrics JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- api_usage
CREATE TABLE api_usage (
    id SERIAL PRIMARY KEY,
    agency_id INTEGER REFERENCES agencies(id) ON DELETE CASCADE,
    endpoint VARCHAR(128),
    usage_count INTEGER DEFAULT 0,
    last_used TIMESTAMP
);

-- lead_activities
CREATE TABLE lead_activities (
    id SERIAL PRIMARY KEY,
    lead_id INTEGER REFERENCES leads(id) ON DELETE CASCADE,
    activity_type VARCHAR(64),
    details JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- deals
CREATE TABLE deals (
    id SERIAL PRIMARY KEY,
    lead_id INTEGER REFERENCES leads(id) ON DELETE CASCADE,
    stage VARCHAR(32),
    value NUMERIC(12,2),
    probability INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- drip_campaigns
CREATE TABLE drip_campaigns (
    id SERIAL PRIMARY KEY,
    agency_id INTEGER REFERENCES agencies(id) ON DELETE CASCADE,
    name VARCHAR(128),
    sequence JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- clients
CREATE TABLE clients (
    id SERIAL PRIMARY KEY,
    agency_id INTEGER REFERENCES agencies(id) ON DELETE CASCADE,
    name VARCHAR(128),
    email VARCHAR(128),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- tasks
CREATE TABLE tasks (
    id SERIAL PRIMARY KEY,
    client_id INTEGER REFERENCES clients(id) ON DELETE CASCADE,
    description TEXT,
    status VARCHAR(32),
    due_date TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- client_projects
CREATE TABLE client_projects (
    id SERIAL PRIMARY KEY,
    client_id INTEGER REFERENCES clients(id) ON DELETE CASCADE,
    name VARCHAR(128),
    details JSONB,
    status VARCHAR(32),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes
CREATE INDEX idx_campaigns_agency_id ON campaigns(agency_id);
CREATE INDEX idx_leads_campaign_id ON leads(campaign_id);
CREATE INDEX idx_leads_client_id ON leads(client_id);
CREATE INDEX idx_deals_lead_id ON deals(lead_id);
CREATE INDEX idx_clients_agency_id ON clients(agency_id);
CREATE INDEX idx_client_projects_client_id ON client_projects(client_id);
-- Composite indexes for recency queries
CREATE INDEX idx_campaigns_agency_created ON campaigns(agency_id, created_at DESC);
CREATE INDEX idx_leads_campaign_created ON leads(campaign_id, created_at DESC);

-- audit_log
CREATE TABLE audit_log (
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
CREATE INDEX idx_audit_agency_time ON audit_log(agency_id, occurred_at DESC);
CREATE INDEX idx_audit_user_time ON audit_log(user_id, occurred_at DESC);
CREATE INDEX idx_audit_action_time ON audit_log(action, occurred_at DESC);
