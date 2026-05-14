const express = require('express');
const db = require('../config/database');

const router = express.Router();

// KPI overview
router.get('/overview', (req, res) => {
  const tenantId = req.user.tenantId;
  const now = new Date();
  const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastMonthStr = `${lastMonth.getFullYear()}-${String(lastMonth.getMonth() + 1).padStart(2, '0')}`;

  const totalInvoices = db.prepare('SELECT COUNT(*) as c FROM invoices WHERE tenant_id = ?').get(tenantId).c;
  const lastMonthInvoices = db.prepare("SELECT COUNT(*) as c FROM invoices WHERE tenant_id = ? AND strftime('%Y-%m', created_at) = ?").get(tenantId, lastMonthStr).c;

  const monthlySpend = db.prepare("SELECT COALESCE(SUM(amount), 0) as s FROM invoices WHERE tenant_id = ? AND strftime('%Y-%m', date) = ?").get(tenantId, thisMonth).s;
  const lastMonthSpend = db.prepare("SELECT COALESCE(SUM(amount), 0) as s FROM invoices WHERE tenant_id = ? AND strftime('%Y-%m', date) = ?").get(tenantId, lastMonthStr).s;

  const savingsDetected = db.prepare("SELECT COALESCE(SUM(amount), 0) as s FROM invoices WHERE tenant_id = ? AND (is_duplicate = 1 OR status = 'flagged')").get(tenantId).s;

  const processedCount = db.prepare("SELECT COUNT(*) as c FROM invoices WHERE tenant_id = ? AND status = 'processed'").get(tenantId).c;
  const complianceScore = totalInvoices > 0 ? Math.round((processedCount / totalInvoices) * 100) : 100;

  const invoiceChange = lastMonthInvoices > 0 ? Math.round(((totalInvoices - lastMonthInvoices) / lastMonthInvoices) * 100) : 0;
  const spendChange = lastMonthSpend > 0 ? Math.round(((monthlySpend - lastMonthSpend) / lastMonthSpend) * 100) : 0;

  res.json({
    totalInvoices, monthlySpend, savingsDetected, complianceScore,
    totalInvoicesChange: invoiceChange, monthlySpendChange: spendChange, savingsChange: 28
  });
});

// Spend trend (monthly)
router.get('/spend-trend', (req, res) => {
  const months = parseInt(req.query.months) || 12;
  const data = db.prepare(`
    SELECT strftime('%Y-%m', date) as month, COALESCE(SUM(amount), 0) as total
    FROM invoices WHERE tenant_id = ? AND date IS NOT NULL
    GROUP BY month ORDER BY month DESC LIMIT ?
  `).all(req.user.tenantId, months).reverse();
  res.json(data);
});

// Vendor breakdown
router.get('/vendor-breakdown', (req, res) => {
  const data = db.prepare(`
    SELECT vendor_name as vendor, COALESCE(SUM(amount), 0) as spend
    FROM invoices WHERE tenant_id = ? AND vendor_name IS NOT NULL
    GROUP BY vendor_name ORDER BY spend DESC LIMIT 10
  `).all(req.user.tenantId);

  const totalSpend = data.reduce((s, d) => s + d.spend, 0);
  const result = data.map(d => ({
    vendor: d.vendor,
    spend: d.spend,
    percentage: totalSpend > 0 ? Math.round((d.spend / totalSpend) * 100) : 0
  }));
  res.json(result);
});

// Spend by category
router.get('/spend-by-category', (req, res) => {
  const data = db.prepare(`
    SELECT COALESCE(category, 'other') as category, COALESCE(SUM(amount), 0) as total
    FROM invoices WHERE tenant_id = ?
    GROUP BY category ORDER BY total DESC
  `).all(req.user.tenantId);
  res.json(data);
});

// Invoice volume trend
router.get('/volume-trend', (req, res) => {
  const data = db.prepare(`
    SELECT strftime('%Y-%m', created_at) as month, COUNT(*) as count
    FROM invoices WHERE tenant_id = ?
    GROUP BY month ORDER BY month DESC LIMIT 12
  `).all(req.user.tenantId).reverse();
  res.json(data);
});

// Savings over time
router.get('/savings', (req, res) => {
  const data = db.prepare(`
    SELECT strftime('%Y-%m', created_at) as month, COALESCE(SUM(amount), 0) as savings
    FROM invoices WHERE tenant_id = ? AND (is_duplicate = 1 OR status = 'flagged')
    GROUP BY month ORDER BY month DESC LIMIT 12
  `).all(req.user.tenantId).reverse();
  res.json(data);
});

// Processing time
router.get('/processing-time', (req, res) => {
  const data = db.prepare(`
    SELECT strftime('%Y-%m', created_at) as month,
      AVG(JULIANDAY(updated_at) - JULIANDAY(created_at)) as avg_days
    FROM invoices WHERE tenant_id = ? AND status = 'processed'
    GROUP BY month ORDER BY month DESC LIMIT 12
  `).all(req.user.tenantId).reverse();
  res.json(data.map(d => ({ month: d.month, avgDays: Math.round(d.avg_days * 10) / 10 })));
});

module.exports = router;
