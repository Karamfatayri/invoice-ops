-- Enterprise Schema Additions
-- Migration 002

-- Audit Log (immutable, append-only)
CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id TEXT NOT NULL,
  user_id TEXT,
  action TEXT NOT NULL,
  entity_type TEXT,
  entity_id TEXT,
  details TEXT,
  ip_address TEXT,
  user_agent TEXT,
  timestamp TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_audit_tenant ON audit_log(tenant_id, timestamp);

-- API Keys (for programmatic access)
CREATE TABLE IF NOT EXISTS api_keys (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  name TEXT NOT NULL,
  key_hash TEXT NOT NULL,
  key_prefix TEXT NOT NULL,
  permissions TEXT DEFAULT '["read"]',
  last_used_at TEXT,
  expires_at TEXT,
  is_active INTEGER DEFAULT 1,
  created_by TEXT REFERENCES users(id),
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_apikeys_tenant ON api_keys(tenant_id);

-- Webhook Endpoints (customer-configured)
CREATE TABLE IF NOT EXISTS webhook_endpoints (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  url TEXT NOT NULL,
  events TEXT NOT NULL,
  secret TEXT NOT NULL,
  is_active INTEGER DEFAULT 1,
  last_triggered_at TEXT,
  failure_count INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Webhook Deliveries (log)
CREATE TABLE IF NOT EXISTS webhook_deliveries (
  id TEXT PRIMARY KEY,
  endpoint_id TEXT REFERENCES webhook_endpoints(id),
  event TEXT NOT NULL,
  payload TEXT NOT NULL,
  response_status INTEGER,
  response_body TEXT,
  delivered_at TEXT DEFAULT (datetime('now'))
);

-- Approval Workflows
CREATE TABLE IF NOT EXISTS approval_rules (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  name TEXT NOT NULL,
  condition_field TEXT NOT NULL,
  condition_operator TEXT NOT NULL,
  condition_value TEXT NOT NULL,
  approver_user_id TEXT REFERENCES users(id),
  is_active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Approval Requests
CREATE TABLE IF NOT EXISTS approval_requests (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  invoice_id TEXT REFERENCES invoices(id),
  rule_id TEXT REFERENCES approval_rules(id),
  approver_user_id TEXT REFERENCES users(id),
  status TEXT DEFAULT 'pending',
  comment TEXT,
  decided_at TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Integrations
CREATE TABLE IF NOT EXISTS integrations (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  type TEXT NOT NULL,
  config TEXT,
  is_active INTEGER DEFAULT 1,
  last_sync_at TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Data Retention Policy
CREATE TABLE IF NOT EXISTS data_retention_policies (
  tenant_id TEXT PRIMARY KEY REFERENCES tenants(id),
  invoice_retention_days INTEGER DEFAULT 2555,
  audit_log_retention_days INTEGER DEFAULT 3650,
  gdpr_consent_given INTEGER DEFAULT 0,
  gdpr_consent_date TEXT,
  data_processing_agreement INTEGER DEFAULT 0,
  updated_at TEXT DEFAULT (datetime('now'))
);
