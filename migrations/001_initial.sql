-- Invoice Ops Database Schema
-- SQLite with WAL mode

-- Tenants (organizations)
CREATE TABLE IF NOT EXISTS tenants (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  vat_number TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Users
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  full_name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'admin',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_tenant ON users(tenant_id);

-- Subscriptions
CREATE TABLE IF NOT EXISTS subscriptions (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL UNIQUE REFERENCES tenants(id) ON DELETE CASCADE,
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  finops_plan TEXT NOT NULL DEFAULT 'starter',
  compliance_plan TEXT DEFAULT NULL,
  status TEXT NOT NULL DEFAULT 'trialing',
  trial_ends_at TEXT,
  current_period_start TEXT,
  current_period_end TEXT,
  invoice_count_this_period INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Vendors
CREATE TABLE IF NOT EXISTS vendors (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  category TEXT,
  contact_email TEXT,
  peppol_id TEXT,
  total_spend REAL DEFAULT 0,
  invoice_count INTEGER DEFAULT 0,
  icon_letter TEXT,
  icon_color TEXT DEFAULT '#3b82f6',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_vendors_tenant ON vendors(tenant_id);

-- Invoices
CREATE TABLE IF NOT EXISTS invoices (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  invoice_number TEXT NOT NULL,
  vendor_id TEXT REFERENCES vendors(id),
  vendor_name TEXT,
  amount REAL NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'EUR',
  vat_amount REAL DEFAULT 0,
  vat_rate REAL DEFAULT 0,
  date TEXT,
  due_date TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  category TEXT,
  cost_center TEXT,
  project TEXT,
  team TEXT,
  environment TEXT,
  confidence_score REAL DEFAULT 0,
  source TEXT DEFAULT 'upload',
  original_filename TEXT,
  file_path TEXT,
  ocr_raw_data TEXT,
  duplicate_of TEXT REFERENCES invoices(id),
  is_duplicate INTEGER DEFAULT 0,
  fraud_flags TEXT,
  en16931_valid INTEGER DEFAULT 0,
  peppol_sent INTEGER DEFAULT 0,
  peppol_id TEXT,
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_invoices_tenant ON invoices(tenant_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_invoices_vendor ON invoices(tenant_id, vendor_id);
CREATE INDEX IF NOT EXISTS idx_invoices_date ON invoices(tenant_id, date);

-- Tenant Settings
CREATE TABLE IF NOT EXISTS tenant_settings (
  tenant_id TEXT PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  auto_classify INTEGER DEFAULT 1,
  duplicate_detection INTEGER DEFAULT 1,
  auto_approve_under_threshold INTEGER DEFAULT 0,
  auto_approve_amount REAL DEFAULT 500,
  auto_approve_confidence REAL DEFAULT 90,
  en16931_generation INTEGER DEFAULT 1,
  peppol_routing INTEGER DEFAULT 1,
  worm_archiving INTEGER DEFAULT 1,
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Usage Log (for metered billing)
CREATE TABLE IF NOT EXISTS usage_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  invoice_id TEXT REFERENCES invoices(id),
  action TEXT NOT NULL,
  timestamp TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_usage_tenant_time ON usage_log(tenant_id, timestamp);
