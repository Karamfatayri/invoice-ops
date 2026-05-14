const express = require('express');
const { v4: uuid } = require('uuid');
const db = require('../config/database');
const AuditService = require('../services/auditService');

const router = express.Router();

// === APPROVAL RULES ===

// List approval rules
router.get('/rules', (req, res) => {
  const rules = db.prepare(
    `SELECT ar.*, u.full_name as approver_name, u.email as approver_email
     FROM approval_rules ar
     LEFT JOIN users u ON ar.approver_user_id = u.id
     WHERE ar.tenant_id = ?
     ORDER BY ar.created_at DESC`
  ).all(req.user.tenantId);

  res.json(rules);
});

// Create approval rule
router.post('/rules', (req, res) => {
  const { name, conditionField, conditionOperator, conditionValue, approverUserId } = req.body;

  if (!name || !conditionField || !conditionOperator || !conditionValue) {
    return res.status(400).json({ error: 'Missing required fields: name, conditionField, conditionOperator, conditionValue' });
  }

  const validFields = ['amount', 'vendor', 'category'];
  if (!validFields.includes(conditionField)) {
    return res.status(400).json({ error: `conditionField must be one of: ${validFields.join(', ')}` });
  }

  const validOps = ['gt', 'lt', 'eq', 'contains'];
  if (!validOps.includes(conditionOperator)) {
    return res.status(400).json({ error: `conditionOperator must be one of: ${validOps.join(', ')}` });
  }

  // Validate approver exists in tenant
  if (approverUserId) {
    const approver = db.prepare(
      'SELECT id FROM users WHERE id = ? AND tenant_id = ?'
    ).get(approverUserId, req.user.tenantId);
    if (!approver) return res.status(400).json({ error: 'Approver user not found in this tenant' });
  }

  const id = uuid();
  db.prepare(
    `INSERT INTO approval_rules (id, tenant_id, name, condition_field, condition_operator, condition_value, approver_user_id)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(id, req.user.tenantId, name, conditionField, conditionOperator, conditionValue, approverUserId || null);

  AuditService.log(req.user.tenantId, req.user.id, 'approval_rule.created', 'approval_rule', id, { name, conditionField, conditionOperator, conditionValue }, req);

  const rule = db.prepare('SELECT * FROM approval_rules WHERE id = ?').get(id);
  res.status(201).json(rule);
});

// Delete approval rule
router.delete('/rules/:id', (req, res) => {
  const rule = db.prepare(
    'SELECT id FROM approval_rules WHERE id = ? AND tenant_id = ?'
  ).get(req.params.id, req.user.tenantId);

  if (!rule) return res.status(404).json({ error: 'Approval rule not found' });

  db.prepare('DELETE FROM approval_rules WHERE id = ?').run(req.params.id);

  AuditService.log(req.user.tenantId, req.user.id, 'approval_rule.deleted', 'approval_rule', req.params.id, null, req);

  res.json({ success: true });
});

// === APPROVAL REQUESTS ===

// List pending approvals for current user
router.get('/pending', (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = Math.min(parseInt(req.query.limit) || 20, 100);
  const offset = (page - 1) * limit;

  const where = `WHERE ar.tenant_id = ? AND ar.status = 'pending' AND (ar.approver_user_id = ? OR ar.approver_user_id IS NULL)`;
  const params = [req.user.tenantId, req.user.id];

  const total = db.prepare(
    `SELECT COUNT(*) as count FROM approval_requests ar ${where}`
  ).get(...params).count;

  const items = db.prepare(
    `SELECT ar.*, i.invoice_number, i.vendor_name, i.amount, i.currency,
            rl.name as rule_name, rl.condition_field, rl.condition_operator, rl.condition_value
     FROM approval_requests ar
     LEFT JOIN invoices i ON ar.invoice_id = i.id
     LEFT JOIN approval_rules rl ON ar.rule_id = rl.id
     ${where}
     ORDER BY ar.created_at DESC LIMIT ? OFFSET ?`
  ).all(...params, limit, offset);

  res.json({ items, total, page, limit, pages: Math.ceil(total / limit) });
});

// Approve
router.post('/:id/approve', (req, res) => {
  const approval = db.prepare(
    `SELECT * FROM approval_requests WHERE id = ? AND tenant_id = ?`
  ).get(req.params.id, req.user.tenantId);

  if (!approval) return res.status(404).json({ error: 'Approval request not found' });
  if (approval.status !== 'pending') return res.status(400).json({ error: 'Approval already decided' });

  db.prepare(
    `UPDATE approval_requests SET status = 'approved', comment = ?, approver_user_id = ?, decided_at = datetime('now') WHERE id = ?`
  ).run(req.body.comment || null, req.user.id, req.params.id);

  // Update invoice status to processed
  if (approval.invoice_id) {
    db.prepare(
      `UPDATE invoices SET status = 'processed', updated_at = datetime('now') WHERE id = ? AND tenant_id = ?`
    ).run(approval.invoice_id, req.user.tenantId);
  }

  AuditService.log(req.user.tenantId, req.user.id, 'approval.approved', 'approval', req.params.id, { invoiceId: approval.invoice_id, comment: req.body.comment }, req);

  res.json({ success: true, status: 'approved' });
});

// Reject
router.post('/:id/reject', (req, res) => {
  const approval = db.prepare(
    `SELECT * FROM approval_requests WHERE id = ? AND tenant_id = ?`
  ).get(req.params.id, req.user.tenantId);

  if (!approval) return res.status(404).json({ error: 'Approval request not found' });
  if (approval.status !== 'pending') return res.status(400).json({ error: 'Approval already decided' });

  db.prepare(
    `UPDATE approval_requests SET status = 'rejected', comment = ?, approver_user_id = ?, decided_at = datetime('now') WHERE id = ?`
  ).run(req.body.comment || null, req.user.id, req.params.id);

  // Update invoice status to flagged
  if (approval.invoice_id) {
    db.prepare(
      `UPDATE invoices SET status = 'flagged', updated_at = datetime('now') WHERE id = ? AND tenant_id = ?`
    ).run(approval.invoice_id, req.user.tenantId);
  }

  AuditService.log(req.user.tenantId, req.user.id, 'approval.rejected', 'approval', req.params.id, { invoiceId: approval.invoice_id, comment: req.body.comment }, req);

  res.json({ success: true, status: 'rejected' });
});

module.exports = router;
