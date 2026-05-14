const express = require('express');
const AuditService = require('../services/auditService');

const router = express.Router();

// Get paginated audit log with filters
router.get('/', (req, res) => {
  const { action, entity_type, date_from, date_to, page, limit } = req.query;

  const result = AuditService.getAuditLog(req.user.tenantId, {
    page: parseInt(page) || 1,
    limit: Math.min(parseInt(limit) || 50, 200),
    action,
    entityType: entity_type,
    dateFrom: date_from,
    dateTo: date_to,
  });

  res.json(result);
});

module.exports = router;
