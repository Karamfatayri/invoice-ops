const express = require('express');
const { Tenant, Settings } = require('../models');

const router = express.Router();

router.get('/', (req, res) => {
  const tenant = Tenant.findById(req.user.tenantId);
  const settings = Settings.findByTenant(req.user.tenantId);
  res.json({ tenant, settings });
});

router.patch('/account', (req, res) => {
  const { companyName, vatNumber } = req.body;
  const tenant = Tenant.update(req.user.tenantId, { name: companyName, vatNumber });
  res.json(tenant);
});

router.patch('/processing', (req, res) => {
  const settings = Settings.update(req.user.tenantId, req.body);
  res.json(settings);
});

router.patch('/compliance', (req, res) => {
  const settings = Settings.update(req.user.tenantId, req.body);
  res.json(settings);
});

module.exports = router;
