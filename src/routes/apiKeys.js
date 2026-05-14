const express = require('express');
const crypto = require('crypto');
const { v4: uuid } = require('uuid');
const { hashPassword } = require('../utils/hash');
const db = require('../config/database');
const AuditService = require('../services/auditService');

const router = express.Router();

// List API keys (prefix only, never the full key)
router.get('/', (req, res) => {
  const keys = db.prepare(
    `SELECT id, name, key_prefix, permissions, last_used_at, expires_at, is_active, created_at
     FROM api_keys WHERE tenant_id = ? ORDER BY created_at DESC`
  ).all(req.user.tenantId);

  res.json(keys.map((k) => ({
    ...k,
    permissions: JSON.parse(k.permissions || '["read"]'),
  })));
});

// Create new API key (returns full key exactly once)
router.post('/', async (req, res, next) => {
  try {
    const { name, permissions, expiresAt } = req.body;
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return res.status(400).json({ error: 'Name is required' });
    }

    const validPerms = ['read', 'write', 'admin'];
    const perms = Array.isArray(permissions)
      ? permissions.filter((p) => validPerms.includes(p))
      : ['read'];

    // Generate a secure random key
    const rawKey = `ivo_${crypto.randomBytes(32).toString('hex')}`;
    const keyPrefix = rawKey.slice(0, 12);
    const keyHash = await hashPassword(rawKey);

    const id = uuid();
    db.prepare(
      `INSERT INTO api_keys (id, tenant_id, name, key_hash, key_prefix, permissions, expires_at, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(id, req.user.tenantId, name.trim(), keyHash, keyPrefix, JSON.stringify(perms), expiresAt || null, req.user.id);

    AuditService.log(req.user.tenantId, req.user.id, 'api_key.created', 'api_key', id, { name: name.trim() }, req);

    res.status(201).json({
      id,
      name: name.trim(),
      key: rawKey, // shown only once
      keyPrefix,
      permissions: perms,
      expiresAt: expiresAt || null,
      createdAt: new Date().toISOString(),
    });
  } catch (err) {
    next(err);
  }
});

// Revoke API key
router.delete('/:id', (req, res) => {
  const key = db.prepare(
    'SELECT id FROM api_keys WHERE id = ? AND tenant_id = ?'
  ).get(req.params.id, req.user.tenantId);

  if (!key) return res.status(404).json({ error: 'API key not found' });

  db.prepare('UPDATE api_keys SET is_active = 0 WHERE id = ?').run(req.params.id);

  AuditService.log(req.user.tenantId, req.user.id, 'api_key.revoked', 'api_key', req.params.id, null, req);

  res.json({ success: true });
});

module.exports = router;
