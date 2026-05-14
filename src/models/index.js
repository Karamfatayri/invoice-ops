const db = require('../config/database');
const { v4: uuid } = require('uuid');

// === TENANTS ===
const Tenant = {
  create(data) {
    const id = uuid();
    db.prepare('INSERT INTO tenants (id, name, vat_number) VALUES (?, ?, ?)').run(id, data.name, data.vatNumber || null);
    return this.findById(id);
  },
  findById(id) {
    return db.prepare('SELECT * FROM tenants WHERE id = ?').get(id);
  },
  update(id, data) {
    const sets = [];
    const vals = [];
    if (data.name !== undefined) { sets.push('name = ?'); vals.push(data.name); }
    if (data.vatNumber !== undefined) { sets.push('vat_number = ?'); vals.push(data.vatNumber); }
    sets.push("updated_at = datetime('now')");
    vals.push(id);
    db.prepare(`UPDATE tenants SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
    return this.findById(id);
  }
};

// === USERS ===
const User = {
  create(data) {
    const id = uuid();
    db.prepare('INSERT INTO users (id, tenant_id, email, password_hash, full_name, role) VALUES (?, ?, ?, ?, ?, ?)').run(id, data.tenantId, data.email, data.passwordHash, data.fullName, data.role || 'admin');
    return this.findById(id);
  },
  findById(id) {
    return db.prepare('SELECT id, tenant_id, email, full_name, role, created_at FROM users WHERE id = ?').get(id);
  },
  findByEmail(email) {
    return db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  },
  updateEmail(id, email) {
    db.prepare("UPDATE users SET email = ?, updated_at = datetime('now') WHERE id = ?").run(email, id);
  }
};

// === SUBSCRIPTIONS ===
const Subscription = {
  create(data) {
    const id = uuid();
    const trialEnd = new Date();
    trialEnd.setDate(trialEnd.getDate() + 14);
    db.prepare(`INSERT INTO subscriptions (id, tenant_id, finops_plan, compliance_plan, status, trial_ends_at, current_period_start, current_period_end) VALUES (?, ?, ?, ?, 'trialing', ?, datetime('now'), ?)`).run(id, data.tenantId, data.finopsPlan || 'starter', data.compliancePlan || null, trialEnd.toISOString(), trialEnd.toISOString());
    return this.findByTenant(data.tenantId);
  },
  findByTenant(tenantId) {
    return db.prepare('SELECT * FROM subscriptions WHERE tenant_id = ?').get(tenantId);
  },
  update(tenantId, data) {
    const sets = [];
    const vals = [];
    for (const [key, val] of Object.entries(data)) {
      const col = key.replace(/([A-Z])/g, '_$1').toLowerCase();
      sets.push(`${col} = ?`);
      vals.push(val);
    }
    sets.push("updated_at = datetime('now')");
    vals.push(tenantId);
    db.prepare(`UPDATE subscriptions SET ${sets.join(', ')} WHERE tenant_id = ?`).run(...vals);
    return this.findByTenant(tenantId);
  },
  incrementInvoiceCount(tenantId) {
    db.prepare("UPDATE subscriptions SET invoice_count_this_period = invoice_count_this_period + 1, updated_at = datetime('now') WHERE tenant_id = ?").run(tenantId);
  }
};

// === VENDORS ===
const Vendor = {
  create(data) {
    const id = uuid();
    db.prepare('INSERT INTO vendors (id, tenant_id, name, category, contact_email, peppol_id, icon_letter, icon_color) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(id, data.tenantId, data.name, data.category || null, data.contactEmail || null, data.peppolId || null, (data.name || '?')[0].toUpperCase(), data.iconColor || '#3b82f6');
    return this.findById(data.tenantId, id);
  },
  findById(tenantId, id) {
    return db.prepare('SELECT * FROM vendors WHERE id = ? AND tenant_id = ?').get(id, tenantId);
  },
  findByName(tenantId, name) {
    return db.prepare('SELECT * FROM vendors WHERE tenant_id = ? AND name = ?').get(tenantId, name);
  },
  findAll(tenantId) {
    return db.prepare('SELECT * FROM vendors WHERE tenant_id = ? ORDER BY total_spend DESC').all(tenantId);
  },
  update(tenantId, id, data) {
    const sets = [];
    const vals = [];
    if (data.name !== undefined) { sets.push('name = ?'); vals.push(data.name); }
    if (data.category !== undefined) { sets.push('category = ?'); vals.push(data.category); }
    if (data.contactEmail !== undefined) { sets.push('contact_email = ?'); vals.push(data.contactEmail); }
    if (data.peppolId !== undefined) { sets.push('peppol_id = ?'); vals.push(data.peppolId); }
    if (data.iconColor !== undefined) { sets.push('icon_color = ?'); vals.push(data.iconColor); }
    sets.push("updated_at = datetime('now')");
    vals.push(id, tenantId);
    db.prepare(`UPDATE vendors SET ${sets.join(', ')} WHERE id = ? AND tenant_id = ?`).run(...vals);
    return this.findById(tenantId, id);
  },
  delete(tenantId, id) {
    return db.prepare('DELETE FROM vendors WHERE id = ? AND tenant_id = ?').run(id, tenantId);
  },
  updateSpend(tenantId, id) {
    const result = db.prepare('SELECT COALESCE(SUM(amount), 0) as total, COUNT(*) as count FROM invoices WHERE vendor_id = ? AND tenant_id = ?').get(id, tenantId);
    db.prepare("UPDATE vendors SET total_spend = ?, invoice_count = ?, updated_at = datetime('now') WHERE id = ? AND tenant_id = ?").run(result.total, result.count, id, tenantId);
  }
};

// === INVOICES ===
const Invoice = {
  create(data) {
    const id = uuid();
    const num = this._nextNumber(data.tenantId);
    db.prepare(`INSERT INTO invoices (id, tenant_id, invoice_number, vendor_id, vendor_name, amount, currency, vat_amount, vat_rate, date, due_date, status, category, cost_center, project, team, environment, confidence_score, source, original_filename, file_path) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(id, data.tenantId, num, data.vendorId || null, data.vendorName || null, data.amount || 0, data.currency || 'EUR', data.vatAmount || 0, data.vatRate || 0, data.date || null, data.dueDate || null, data.status || 'pending', data.category || null, data.costCenter || null, data.project || null, data.team || null, data.environment || null, data.confidenceScore || 0, data.source || 'upload', data.originalFilename || null, data.filePath || null);
    return this.findById(data.tenantId, id);
  },
  _nextNumber(tenantId) {
    const year = new Date().getFullYear();
    const last = db.prepare("SELECT invoice_number FROM invoices WHERE tenant_id = ? AND invoice_number LIKE ? ORDER BY created_at DESC LIMIT 1").get(tenantId, `INV-${year}-%`);
    let seq = 1;
    if (last) {
      const parts = last.invoice_number.split('-');
      seq = parseInt(parts[2] || '0', 10) + 1;
    }
    return `INV-${year}-${String(seq).padStart(4, '0')}`;
  },
  findById(tenantId, id) {
    return db.prepare('SELECT * FROM invoices WHERE id = ? AND tenant_id = ?').get(id, tenantId);
  },
  findAll(tenantId, { status, vendorId, category, search, dateFrom, dateTo, page = 1, limit = 20, sort = 'created_at', order = 'desc' } = {}) {
    let where = 'WHERE tenant_id = ?';
    const params = [tenantId];
    if (status) { where += ' AND status = ?'; params.push(status); }
    if (vendorId) { where += ' AND vendor_id = ?'; params.push(vendorId); }
    if (category) { where += ' AND category = ?'; params.push(category); }
    if (search) { where += ' AND (vendor_name LIKE ? OR invoice_number LIKE ?)'; params.push(`%${search}%`, `%${search}%`); }
    if (dateFrom) { where += ' AND date >= ?'; params.push(dateFrom); }
    if (dateTo) { where += ' AND date <= ?'; params.push(dateTo); }

    const allowedSorts = ['created_at', 'date', 'amount', 'vendor_name', 'status'];
    const sortCol = allowedSorts.includes(sort) ? sort : 'created_at';
    const sortDir = order === 'asc' ? 'ASC' : 'DESC';
    const offset = (page - 1) * limit;

    const total = db.prepare(`SELECT COUNT(*) as count FROM invoices ${where}`).get(...params).count;
    const items = db.prepare(`SELECT * FROM invoices ${where} ORDER BY ${sortCol} ${sortDir} LIMIT ? OFFSET ?`).all(...params, limit, offset);

    return { items, total, page, limit, pages: Math.ceil(total / limit) };
  },
  update(tenantId, id, data) {
    const sets = [];
    const vals = [];
    const fields = { status: 'status', category: 'category', costCenter: 'cost_center', project: 'project', team: 'team', environment: 'environment', notes: 'notes', confidenceScore: 'confidence_score', vendorId: 'vendor_id', vendorName: 'vendor_name', amount: 'amount', vatAmount: 'vat_amount', vatRate: 'vat_rate', date: 'date', dueDate: 'due_date', isDuplicate: 'is_duplicate', duplicateOf: 'duplicate_of', fraudFlags: 'fraud_flags', en16931Valid: 'en16931_valid', peppolSent: 'peppol_sent', ocrRawData: 'ocr_raw_data' };
    for (const [key, col] of Object.entries(fields)) {
      if (data[key] !== undefined) { sets.push(`${col} = ?`); vals.push(data[key]); }
    }
    if (sets.length === 0) return this.findById(tenantId, id);
    sets.push("updated_at = datetime('now')");
    vals.push(id, tenantId);
    db.prepare(`UPDATE invoices SET ${sets.join(', ')} WHERE id = ? AND tenant_id = ?`).run(...vals);
    return this.findById(tenantId, id);
  },
  delete(tenantId, id) {
    return db.prepare('DELETE FROM invoices WHERE id = ? AND tenant_id = ?').run(id, tenantId);
  }
};

// === TENANT SETTINGS ===
const Settings = {
  create(tenantId) {
    db.prepare('INSERT INTO tenant_settings (tenant_id) VALUES (?)').run(tenantId);
    return this.findByTenant(tenantId);
  },
  findByTenant(tenantId) {
    return db.prepare('SELECT * FROM tenant_settings WHERE tenant_id = ?').get(tenantId);
  },
  update(tenantId, data) {
    const sets = [];
    const vals = [];
    const fields = { autoClassify: 'auto_classify', duplicateDetection: 'duplicate_detection', autoApproveUnderThreshold: 'auto_approve_under_threshold', autoApproveAmount: 'auto_approve_amount', autoApproveConfidence: 'auto_approve_confidence', en16931Generation: 'en16931_generation', peppolRouting: 'peppol_routing', wormArchiving: 'worm_archiving' };
    for (const [key, col] of Object.entries(fields)) {
      if (data[key] !== undefined) { sets.push(`${col} = ?`); vals.push(data[key]); }
    }
    if (sets.length === 0) return this.findByTenant(tenantId);
    sets.push("updated_at = datetime('now')");
    vals.push(tenantId);
    db.prepare(`UPDATE tenant_settings SET ${sets.join(', ')} WHERE tenant_id = ?`).run(...vals);
    return this.findByTenant(tenantId);
  }
};

// === USAGE LOG ===
const UsageLog = {
  log(tenantId, invoiceId, action) {
    db.prepare('INSERT INTO usage_log (tenant_id, invoice_id, action) VALUES (?, ?, ?)').run(tenantId, invoiceId, action);
  },
  getCount(tenantId, from, to) {
    return db.prepare('SELECT COUNT(*) as count FROM usage_log WHERE tenant_id = ? AND timestamp >= ? AND timestamp <= ?').get(tenantId, from, to).count;
  }
};

// === AUDIT LOG ===
const AuditLog = {
  findByTenant(tenantId, { page = 1, limit = 50 } = {}) {
    const offset = (page - 1) * limit;
    const total = db.prepare('SELECT COUNT(*) as count FROM audit_log WHERE tenant_id = ?').get(tenantId).count;
    const items = db.prepare('SELECT * FROM audit_log WHERE tenant_id = ? ORDER BY timestamp DESC LIMIT ? OFFSET ?').all(tenantId, limit, offset);
    return { items, total, page, limit, pages: Math.ceil(total / limit) };
  },
};

// === API KEY ===
const ApiKey = {
  findById(id) {
    return db.prepare('SELECT * FROM api_keys WHERE id = ?').get(id);
  },
  findByTenant(tenantId) {
    return db.prepare('SELECT id, name, key_prefix, permissions, last_used_at, expires_at, is_active, created_at FROM api_keys WHERE tenant_id = ? ORDER BY created_at DESC').all(tenantId);
  },
  deactivate(id) {
    db.prepare('UPDATE api_keys SET is_active = 0 WHERE id = ?').run(id);
  },
};

// === WEBHOOK ENDPOINT ===
const WebhookEndpoint = {
  findById(id) {
    return db.prepare('SELECT * FROM webhook_endpoints WHERE id = ?').get(id);
  },
  findByTenant(tenantId) {
    return db.prepare('SELECT * FROM webhook_endpoints WHERE tenant_id = ? ORDER BY created_at DESC').all(tenantId);
  },
  findActive(tenantId) {
    return db.prepare('SELECT * FROM webhook_endpoints WHERE tenant_id = ? AND is_active = 1').all(tenantId);
  },
  delete(id) {
    db.prepare('DELETE FROM webhook_endpoints WHERE id = ?').run(id);
  },
};

// === APPROVAL RULE ===
const ApprovalRule = {
  findById(id) {
    return db.prepare('SELECT * FROM approval_rules WHERE id = ?').get(id);
  },
  findByTenant(tenantId) {
    return db.prepare('SELECT * FROM approval_rules WHERE tenant_id = ? AND is_active = 1 ORDER BY created_at DESC').all(tenantId);
  },
  delete(id) {
    db.prepare('DELETE FROM approval_rules WHERE id = ?').run(id);
  },
};

// === APPROVAL REQUEST ===
const ApprovalRequest = {
  create(data) {
    const id = uuid();
    db.prepare(
      `INSERT INTO approval_requests (id, tenant_id, invoice_id, rule_id, approver_user_id)
       VALUES (?, ?, ?, ?, ?)`
    ).run(id, data.tenantId, data.invoiceId, data.ruleId || null, data.approverUserId || null);
    return this.findById(id);
  },
  findById(id) {
    return db.prepare('SELECT * FROM approval_requests WHERE id = ?').get(id);
  },
  findPending(tenantId, userId) {
    return db.prepare(
      `SELECT * FROM approval_requests WHERE tenant_id = ? AND status = 'pending' AND (approver_user_id = ? OR approver_user_id IS NULL) ORDER BY created_at DESC`
    ).all(tenantId, userId);
  },
  decide(id, status, userId, comment) {
    db.prepare(
      `UPDATE approval_requests SET status = ?, approver_user_id = ?, comment = ?, decided_at = datetime('now') WHERE id = ?`
    ).run(status, userId, comment || null, id);
    return this.findById(id);
  },
};

// === INTEGRATION ===
const Integration = {
  create(data) {
    const id = uuid();
    db.prepare(
      'INSERT INTO integrations (id, tenant_id, type, config) VALUES (?, ?, ?, ?)'
    ).run(id, data.tenantId, data.type, data.config ? JSON.stringify(data.config) : null);
    return this.findById(id);
  },
  findById(id) {
    return db.prepare('SELECT * FROM integrations WHERE id = ?').get(id);
  },
  findByTenant(tenantId) {
    return db.prepare('SELECT * FROM integrations WHERE tenant_id = ? ORDER BY created_at DESC').all(tenantId);
  },
  update(id, data) {
    const sets = [];
    const vals = [];
    if (data.config !== undefined) { sets.push('config = ?'); vals.push(JSON.stringify(data.config)); }
    if (data.isActive !== undefined) { sets.push('is_active = ?'); vals.push(data.isActive ? 1 : 0); }
    if (data.lastSyncAt !== undefined) { sets.push('last_sync_at = ?'); vals.push(data.lastSyncAt); }
    if (sets.length === 0) return this.findById(id);
    vals.push(id);
    db.prepare(`UPDATE integrations SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
    return this.findById(id);
  },
  delete(id) {
    db.prepare('DELETE FROM integrations WHERE id = ?').run(id);
  },
};

// === DATA RETENTION POLICY ===
const DataRetentionPolicy = {
  findByTenant(tenantId) {
    return db.prepare('SELECT * FROM data_retention_policies WHERE tenant_id = ?').get(tenantId);
  },
  upsert(tenantId, data) {
    const existing = this.findByTenant(tenantId);
    if (existing) {
      const sets = [];
      const vals = [];
      if (data.invoiceRetentionDays !== undefined) { sets.push('invoice_retention_days = ?'); vals.push(data.invoiceRetentionDays); }
      if (data.auditLogRetentionDays !== undefined) { sets.push('audit_log_retention_days = ?'); vals.push(data.auditLogRetentionDays); }
      if (data.gdprConsentGiven !== undefined) { sets.push('gdpr_consent_given = ?'); vals.push(data.gdprConsentGiven ? 1 : 0); }
      if (data.gdprConsentDate !== undefined) { sets.push('gdpr_consent_date = ?'); vals.push(data.gdprConsentDate); }
      if (data.dataProcessingAgreement !== undefined) { sets.push('data_processing_agreement = ?'); vals.push(data.dataProcessingAgreement ? 1 : 0); }
      sets.push("updated_at = datetime('now')");
      vals.push(tenantId);
      if (sets.length > 1) {
        db.prepare(`UPDATE data_retention_policies SET ${sets.join(', ')} WHERE tenant_id = ?`).run(...vals);
      }
    } else {
      db.prepare(
        'INSERT INTO data_retention_policies (tenant_id, invoice_retention_days, audit_log_retention_days, gdpr_consent_given, gdpr_consent_date, data_processing_agreement) VALUES (?, ?, ?, ?, ?, ?)'
      ).run(
        tenantId,
        data.invoiceRetentionDays || 2555,
        data.auditLogRetentionDays || 3650,
        data.gdprConsentGiven ? 1 : 0,
        data.gdprConsentDate || null,
        data.dataProcessingAgreement ? 1 : 0
      );
    }
    return this.findByTenant(tenantId);
  },
};

module.exports = { Tenant, User, Subscription, Vendor, Invoice, Settings, UsageLog, AuditLog, ApiKey, WebhookEndpoint, ApprovalRule, ApprovalRequest, Integration, DataRetentionPolicy };
