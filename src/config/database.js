const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const DB_PATH = process.env.DATABASE_PATH || './data/invoiceops.db';

// Ensure directory exists
const dir = path.dirname(DB_PATH);
if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

const db = new Database(DB_PATH);

// Performance optimizations
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.pragma('busy_timeout = 5000');

// Run migrations
function migrate() {
  const migrationsDir = path.join(__dirname, '..', '..', 'migrations');

  // Run SQL migration files in order
  const migrationFiles = ['001_initial.sql', '002_enterprise.sql'];
  for (const file of migrationFiles) {
    const migrationPath = path.join(migrationsDir, file);
    if (fs.existsSync(migrationPath)) {
      const sql = fs.readFileSync(migrationPath, 'utf8');
      db.exec(sql);
    }
  }

  // ALTER TABLE additions (safe: catch errors if columns already exist)
  const alterStatements = [
    'ALTER TABLE users ADD COLUMN mfa_enabled INTEGER DEFAULT 0',
    'ALTER TABLE users ADD COLUMN mfa_secret TEXT',
    'ALTER TABLE users ADD COLUMN last_login_at TEXT',
    'ALTER TABLE users ADD COLUMN login_count INTEGER DEFAULT 0',
    'ALTER TABLE tenants ADD COLUMN plan_type TEXT DEFAULT \'standard\'',
    'ALTER TABLE tenants ADD COLUMN custom_domain TEXT',
    'ALTER TABLE tenants ADD COLUMN logo_url TEXT',
    'ALTER TABLE tenants ADD COLUMN billing_email TEXT',
  ];

  for (const stmt of alterStatements) {
    try {
      db.exec(stmt);
    } catch (err) {
      // Column already exists — safe to ignore
      if (!err.message.includes('duplicate column')) {
        // Log unexpected errors but don't crash
        console.error(`Migration warning: ${err.message}`);
      }
    }
  }
}

migrate();

module.exports = db;
