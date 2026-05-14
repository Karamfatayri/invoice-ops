const db = require('../config/database');
const logger = require('../utils/logger');

const AuditService = {
  /**
   * Log an audit event (append-only).
   * @param {string} tenantId
   * @param {string|null} userId
   * @param {string} action - e.g. 'invoice.created', 'user.login'
   * @param {string|null} entityType - e.g. 'invoice', 'user'
   * @param {string|null} entityId
   * @param {object|null} details - arbitrary JSON-serializable data
   * @param {object|null} req - Express request (for ip/user-agent)
   */
  log(tenantId, userId, action, entityType, entityId, details, req) {
    try {
      const ipAddress = req
        ? req.headers['x-forwarded-for'] || req.socket?.remoteAddress || null
        : null;
      const userAgent = req ? req.headers['user-agent'] || null : null;
      const detailsJson = details ? JSON.stringify(details) : null;

      db.prepare(
        `INSERT INTO audit_log (tenant_id, user_id, action, entity_type, entity_id, details, ip_address, user_agent)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(tenantId, userId, action, entityType, entityId, detailsJson, ipAddress, userAgent);
    } catch (err) {
      // Audit logging must never crash the request
      logger.error('Audit log write failed', { error: err.message, action, tenantId });
    }
  },

  /**
   * Query audit log with pagination and filters.
   */
  getAuditLog(tenantId, { page = 1, limit = 50, action, entityType, dateFrom, dateTo } = {}) {
    let where = 'WHERE tenant_id = ?';
    const params = [tenantId];

    if (action) {
      where += ' AND action = ?';
      params.push(action);
    }
    if (entityType) {
      where += ' AND entity_type = ?';
      params.push(entityType);
    }
    if (dateFrom) {
      where += ' AND timestamp >= ?';
      params.push(dateFrom);
    }
    if (dateTo) {
      where += ' AND timestamp <= ?';
      params.push(dateTo);
    }

    const offset = (page - 1) * limit;
    const total = db.prepare(`SELECT COUNT(*) as count FROM audit_log ${where}`).get(...params).count;
    const items = db.prepare(
      `SELECT * FROM audit_log ${where} ORDER BY timestamp DESC LIMIT ? OFFSET ?`
    ).all(...params, limit, offset);

    return {
      items,
      total,
      page,
      limit,
      pages: Math.ceil(total / limit),
    };
  },
};

module.exports = AuditService;
