const express = require('express');
const complianceService = require('../services/complianceService');
const { Invoice } = require('../models');

const router = express.Router();

router.get('/scores', (req, res) => {
  const en16931 = complianceService.calculateEN16931Score(req.user.tenantId);
  const peppol = complianceService.calculatePEPPOLScore(req.user.tenantId);

  res.json({
    en16931: { score: en16931.score, checklist: en16931.checklist },
    peppol: { score: peppol.score, checklist: peppol.checklist }
  });
});

router.get('/timeline', (req, res) => {
  res.json([
    { id: 'germany', date: '2025-01', status: 'active', title: 'Germany B2B E-Invoice', description: 'Mandatory reception of e-invoices for all B2B transactions.' },
    { id: 'france', date: '2026-09', status: 'upcoming', title: 'France E-Invoicing Mandate', description: 'All B2B invoices must be issued as structured e-invoices via PDP.' },
    { id: 'eu_vida', date: '2028-01', status: 'planned', title: 'EU ViDA Regulation', description: 'EU-wide digital reporting & real-time e-invoicing requirements.' },
  ]);
});

router.post('/validate/:invoiceId', (req, res) => {
  const invoice = Invoice.findById(req.user.tenantId, req.params.invoiceId);
  if (!invoice) return res.status(404).json({ error: 'Invoice not found' });

  const result = complianceService.validateInvoice(invoice);

  if (result.valid) {
    Invoice.update(req.user.tenantId, req.params.invoiceId, { en16931Valid: 1 });
  }

  res.json(result);
});

module.exports = router;
