const express = require('express');
const { v4: uuid } = require('uuid');
const crypto = require('crypto');
const db = require('../config/database');
const AuditService = require('../services/auditService');

const router = express.Router();

// List webhook endpoints
router.get('/', (req, res) => {
  const endpoints = db.prepare(
    `SELECT id, url, events, is_active, last_triggered_at, failure_count, created_at
     FROM webhook_endpoints WHERE tenant_id = ? ORDER BY created_at DESC`
  ).all(req.user.tenantId);

  res.json(endpoints.map((e) => ({
    ...e,
    events: JSON.parse(e.events || '[]'),
  })));
});

// Create webhook endpoint
router.post('/', (req, res) => {
  const { url, events } = req.body;
  if (!url || typeof url !== 'string') {
    return res.status(400).json({ error: 'URL is required' });
  }
  if (!Array.isArray(events) || events.length === 0) {
    return res.status(400).json({ error: 'At least one event type is required' });
  }

  // Validate URL
  try {
    new URL(url);
  } catch {
    return res.status(400).json({ error: 'Invalid URL format' });
  }

  const id = uuid();
  const secret = `whsec_${crypto.randomBytes(24).toString('hex')}`;

  db.prepare(
    `INSERT INTO webhook_endpoints (id, tenant_id, url, events, secret)
     VALUES (?, ?, ?, ?, ?)`
  ).run(id, req.user.tenantId, url, JSON.stringify(events), secret);

  AuditService.log(req.user.tenantId, req.user.id, 'webhook.created', 'webhook', id, { url, events }, req);

  res.status(201).json({ id, url, events, secret, isActive: true });
});

// Update webhook endpoint
router.patch('/:id', (req, res) => {
  const endpoint = db.prepare(
    'SELECT * FROM webhook_endpoints WHERE id = ? AND tenant_id = ?'
  ).get(req.params.id, req.user.tenantId);

  if (!endpoint) return res.status(404).json({ error: 'Webhook endpoint not found' });

  const sets = [];
  const vals = [];

  if (req.body.url !== undefined) {
    try { new URL(req.body.url); } catch { return res.status(400).json({ error: 'Invalid URL format' }); }
    sets.push('url = ?'); vals.push(req.body.url);
  }
  if (req.body.events !== undefined) {
    if (!Array.isArray(req.body.events)) return res.status(400).json({ error: 'Events must be an array' });
    sets.push('events = ?'); vals.push(JSON.stringify(req.body.events));
  }
  if (req.body.isActive !== undefined) {
    sets.push('is_active = ?'); vals.push(req.body.isActive ? 1 : 0);
  }

  if (sets.length === 0) return res.json({ message: 'No changes' });

  vals.push(req.params.id);
  db.prepare(`UPDATE webhook_endpoints SET ${sets.join(', ')} WHERE id = ?`).run(...vals);

  AuditService.log(req.user.tenantId, req.user.id, 'webhook.updated', 'webhook', req.params.id, req.body, req);

  const updated = db.prepare('SELECT * FROM webhook_endpoints WHERE id = ?').get(req.params.id);
  res.json({ ...updated, events: JSON.parse(updated.events || '[]') });
});

// Delete webhook endpoint
router.delete('/:id', (req, res) => {
  const endpoint = db.prepare(
    'SELECT id FROM webhook_endpoints WHERE id = ? AND tenant_id = ?'
  ).get(req.params.id, req.user.tenantId);

  if (!endpoint) return res.status(404).json({ error: 'Webhook endpoint not found' });

  db.prepare('DELETE FROM webhook_endpoints WHERE id = ?').run(req.params.id);

  AuditService.log(req.user.tenantId, req.user.id, 'webhook.deleted', 'webhook', req.params.id, null, req);

  res.json({ success: true });
});

// Get delivery log for an endpoint
router.get('/:id/deliveries', (req, res) => {
  const endpoint = db.prepare(
    'SELECT id FROM webhook_endpoints WHERE id = ? AND tenant_id = ?'
  ).get(req.params.id, req.user.tenantId);

  if (!endpoint) return res.status(404).json({ error: 'Webhook endpoint not found' });

  const page = parseInt(req.query.page) || 1;
  const limit = Math.min(parseInt(req.query.limit) || 20, 100);
  const offset = (page - 1) * limit;

  const total = db.prepare(
    'SELECT COUNT(*) as count FROM webhook_deliveries WHERE endpoint_id = ?'
  ).get(req.params.id).count;

  const deliveries = db.prepare(
    `SELECT * FROM webhook_deliveries WHERE endpoint_id = ? ORDER BY delivered_at DESC LIMIT ? OFFSET ?`
  ).all(req.params.id, limit, offset);

  res.json({
    items: deliveries,
    total,
    page,
    limit,
    pages: Math.ceil(total / limit),
  });
});

module.exports = router;
