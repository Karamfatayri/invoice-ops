const { verifyToken } = require('../utils/jwt');
const { comparePassword } = require('../utils/hash');
const db = require('../config/database');

function auth(req, res, next) {
  // Check for API key first
  const apiKey = req.headers['x-api-key'];
  if (apiKey) {
    return authenticateApiKey(apiKey, req, res, next);
  }

  // Fall back to JWT Bearer token
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const token = header.slice(7);
  try {
    const payload = verifyToken(token);
    // Verify user still exists
    const user = db.prepare('SELECT id, tenant_id, email, role, full_name FROM users WHERE id = ?').get(payload.id);
    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }
    req.user = {
      id: user.id,
      tenantId: user.tenant_id,
      email: user.email,
      role: user.role,
      fullName: user.full_name
    };
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

async function authenticateApiKey(rawKey, req, res, next) {
  try {
    const prefix = rawKey.slice(0, 12);
    const candidates = db.prepare(
      `SELECT ak.*, u.tenant_id as user_tenant_id, u.email, u.role, u.full_name
       FROM api_keys ak
       LEFT JOIN users u ON ak.created_by = u.id
       WHERE ak.key_prefix = ? AND ak.is_active = 1`
    ).all(prefix);

    if (candidates.length === 0) {
      return res.status(401).json({ error: 'Invalid API key' });
    }

    // Verify hash against each candidate (usually just one)
    for (const candidate of candidates) {
      const valid = await comparePassword(rawKey, candidate.key_hash);
      if (!valid) continue;

      // Check expiry
      if (candidate.expires_at && new Date(candidate.expires_at) < new Date()) {
        return res.status(401).json({ error: 'API key expired' });
      }

      // Update last_used_at
      db.prepare("UPDATE api_keys SET last_used_at = datetime('now') WHERE id = ?").run(candidate.id);

      req.user = {
        id: candidate.created_by,
        tenantId: candidate.tenant_id,
        email: candidate.email || 'api-key',
        role: candidate.role || 'api',
        fullName: candidate.full_name || 'API Key',
      };
      req.apiKey = {
        id: candidate.id,
        permissions: JSON.parse(candidate.permissions || '["read"]'),
      };
      return next();
    }

    return res.status(401).json({ error: 'Invalid API key' });
  } catch (err) {
    return res.status(401).json({ error: 'API key authentication failed' });
  }
}

module.exports = auth;
