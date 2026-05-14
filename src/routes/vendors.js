const express = require('express');
const { Vendor } = require('../models');

const router = express.Router();

router.get('/', (req, res) => {
  const vendors = Vendor.findAll(req.user.tenantId);
  res.json(vendors);
});

router.get('/:id', (req, res) => {
  const vendor = Vendor.findById(req.user.tenantId, req.params.id);
  if (!vendor) return res.status(404).json({ error: 'Vendor not found' });
  res.json(vendor);
});

router.post('/', (req, res) => {
  const { name, category, contactEmail, peppolId, iconColor } = req.body;
  if (!name) return res.status(400).json({ error: 'Vendor name is required' });

  const existing = Vendor.findByName(req.user.tenantId, name);
  if (existing) return res.status(409).json({ error: 'Vendor already exists' });

  const vendor = Vendor.create({
    tenantId: req.user.tenantId,
    name, category, contactEmail, peppolId, iconColor
  });
  res.status(201).json(vendor);
});

router.patch('/:id', (req, res) => {
  const vendor = Vendor.findById(req.user.tenantId, req.params.id);
  if (!vendor) return res.status(404).json({ error: 'Vendor not found' });

  const updated = Vendor.update(req.user.tenantId, req.params.id, req.body);
  res.json(updated);
});

router.delete('/:id', (req, res) => {
  const vendor = Vendor.findById(req.user.tenantId, req.params.id);
  if (!vendor) return res.status(404).json({ error: 'Vendor not found' });

  if (vendor.invoice_count > 0) {
    return res.status(400).json({ error: 'Cannot delete vendor with linked invoices' });
  }

  Vendor.delete(req.user.tenantId, req.params.id);
  res.json({ success: true });
});

module.exports = router;
