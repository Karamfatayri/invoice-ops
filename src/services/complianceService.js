const db = require('../config/database');

function calculateEN16931Score(tenantId) {
  const settings = db.prepare('SELECT * FROM tenant_settings WHERE tenant_id = ?').get(tenantId);
  const invoiceStats = db.prepare(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN vendor_name IS NOT NULL AND amount > 0 AND date IS NOT NULL THEN 1 ELSE 0 END) as complete_fields,
      SUM(CASE WHEN vat_amount > 0 THEN 1 ELSE 0 END) as has_vat,
      SUM(CASE WHEN en16931_valid = 1 THEN 1 ELSE 0 END) as valid_count
    FROM invoices WHERE tenant_id = ?
  `).get(tenantId);

  const checklist = [
    { id: 'xml_schema', label: 'XML Schema Validation', done: settings?.en16931_generation === 1 },
    { id: 'mandatory_fields', label: 'Mandatory Field Completeness', done: invoiceStats.total === 0 || (invoiceStats.complete_fields / Math.max(invoiceStats.total, 1)) > 0.8 },
    { id: 'vat_accuracy', label: 'VAT Calculation Accuracy', done: invoiceStats.total === 0 || (invoiceStats.has_vat / Math.max(invoiceStats.total, 1)) > 0.7 },
    { id: 'digital_signature', label: 'Digital Signature (XAdES)', done: settings?.en16931_generation === 1 },
    { id: 'cross_border_vat', label: 'Cross-border VAT Mapping', done: false },
  ];

  const doneCount = checklist.filter(c => c.done).length;
  const score = Math.round((doneCount / checklist.length) * 100);

  return { score, checklist };
}

function calculatePEPPOLScore(tenantId) {
  const settings = db.prepare('SELECT * FROM tenant_settings WHERE tenant_id = ?').get(tenantId);
  const peppolSent = db.prepare('SELECT COUNT(*) as count FROM invoices WHERE tenant_id = ? AND peppol_sent = 1').get(tenantId);

  const checklist = [
    { id: 'bis3', label: 'PEPPOL BIS 3.0 Format', done: settings?.peppol_routing === 1 },
    { id: 'access_point', label: 'Access Point Registration', done: settings?.peppol_routing === 1 },
    { id: 'smp_sml', label: 'SMP/SML Lookup', done: settings?.peppol_routing === 1 },
    { id: 'production_test', label: 'Production Endpoint Testing', done: peppolSent.count > 0 },
    { id: 'worm', label: 'WORM Archive Integration', done: settings?.worm_archiving === 1 },
  ];

  const doneCount = checklist.filter(c => c.done).length;
  const score = Math.round((doneCount / checklist.length) * 100);

  return { score, checklist };
}

function validateInvoice(invoice) {
  const errors = [];
  if (!invoice.vendor_name) errors.push('Missing vendor name');
  if (!invoice.amount || invoice.amount <= 0) errors.push('Invalid amount');
  if (!invoice.date) errors.push('Missing invoice date');
  if (!invoice.currency) errors.push('Missing currency');
  if (invoice.vat_rate > 0 && (!invoice.vat_amount || invoice.vat_amount <= 0)) errors.push('VAT rate set but no VAT amount');

  return {
    valid: errors.length === 0,
    errors,
    score: Math.max(0, 100 - errors.length * 20)
  };
}

module.exports = { calculateEN16931Score, calculatePEPPOLScore, validateInvoice };
