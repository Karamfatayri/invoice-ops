const db = require('../config/database');

function check(tenantId, extractedData) {
  const reasons = [];

  // Check 1: Same vendor + same amount + same invoice number
  if (extractedData.invoiceNumber) {
    const dup = db.prepare('SELECT id, invoice_number FROM invoices WHERE tenant_id = ? AND vendor_name = ? AND amount = ? AND invoice_number = ?')
      .get(tenantId, extractedData.vendorName, extractedData.amount, extractedData.invoiceNumber);
    if (dup) {
      reasons.push(`Exact match: same vendor, amount, and invoice number as ${dup.invoice_number}`);
      return { isDuplicate: true, duplicateOf: dup.id, confidence: 99, reasons };
    }
  }

  // Check 2: Same vendor + same amount + date within 5 days
  if (extractedData.date && extractedData.vendorName) {
    const dateObj = new Date(extractedData.date);
    const before = new Date(dateObj); before.setDate(dateObj.getDate() - 5);
    const after = new Date(dateObj); after.setDate(dateObj.getDate() + 5);

    const similar = db.prepare('SELECT id, invoice_number, date FROM invoices WHERE tenant_id = ? AND vendor_name = ? AND amount = ? AND date BETWEEN ? AND ?')
      .all(tenantId, extractedData.vendorName, extractedData.amount, before.toISOString().split('T')[0], after.toISOString().split('T')[0]);

    if (similar.length > 0) {
      reasons.push(`Similar invoice from same vendor with same amount within 5 days (${similar[0].invoice_number})`);
      return { isDuplicate: true, duplicateOf: similar[0].id, confidence: 85, reasons };
    }
  }

  // Check 3: Anomaly - amount significantly higher than average for this vendor
  if (extractedData.vendorName) {
    const avg = db.prepare('SELECT AVG(amount) as avg_amount, COUNT(*) as count FROM invoices WHERE tenant_id = ? AND vendor_name = ?')
      .get(tenantId, extractedData.vendorName);
    if (avg.count >= 3 && extractedData.amount > avg.avg_amount * 2.5) {
      reasons.push(`Amount €${extractedData.amount} is ${Math.round(extractedData.amount / avg.avg_amount * 100)}% of average (€${Math.round(avg.avg_amount)})`);
    }
  }

  return {
    isDuplicate: false,
    duplicateOf: null,
    confidence: 0,
    reasons
  };
}

module.exports = { check };
