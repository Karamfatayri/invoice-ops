const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuid } = require('uuid');
const { Invoice, Vendor, Subscription, UsageLog } = require('../models');
const ocrService = require('../services/ocrService');
const classificationService = require('../services/classificationService');
const duplicateDetection = require('../services/duplicateDetection');
const planLimits = require('../middleware/planLimits');
const AuditService = require('../services/auditService');
const WebhookService = require('../services/webhookService');

const router = express.Router();

// Configure multer for file uploads
const uploadDir = process.env.UPLOAD_DIR || './data/uploads';
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const tenantDir = path.join(uploadDir, req.user.tenantId);
    if (!fs.existsSync(tenantDir)) fs.mkdirSync(tenantDir, { recursive: true });
    cb(null, tenantDir);
  },
  filename: (req, file, cb) => {
    cb(null, `${uuid()}${path.extname(file.originalname)}`);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    const allowed = ['.pdf', '.png', '.jpg', '.jpeg'];
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, allowed.includes(ext));
  }
});

// List invoices
router.get('/', (req, res) => {
  const { status, vendor_id, category, search, date_from, date_to, page, limit, sort, order } = req.query;
  const result = Invoice.findAll(req.user.tenantId, {
    status, vendorId: vendor_id, category, search,
    dateFrom: date_from, dateTo: date_to,
    page: parseInt(page) || 1,
    limit: Math.min(parseInt(limit) || 20, 100),
    sort, order
  });
  res.json(result);
});

// Get single invoice
router.get('/:id', (req, res) => {
  const invoice = Invoice.findById(req.user.tenantId, req.params.id);
  if (!invoice) return res.status(404).json({ error: 'Invoice not found' });
  res.json(invoice);
});

// Upload and process invoice
router.post('/', planLimits, upload.single('file'), (req, res, next) => {
  try {
    const file = req.file;
    const tenantId = req.user.tenantId;

    // Extract data (OCR stub)
    const extracted = ocrService.extract(
      file ? file.path : null,
      file ? file.originalname : (req.body.vendorName || 'manual')
    );

    // Classify
    const classification = classificationService.classify(
      req.body.vendorName || extracted.vendorName,
      req.body.amount ? parseFloat(req.body.amount) : extracted.amount
    );

    // Find or create vendor
    const vendorName = req.body.vendorName || extracted.vendorName;
    let vendor = Vendor.findByName(tenantId, vendorName);
    if (!vendor && vendorName !== 'Unknown Vendor') {
      vendor = Vendor.create({
        tenantId,
        name: vendorName,
        category: classification.category,
      });
    }

    // Check for duplicates
    const dupCheck = duplicateDetection.check(tenantId, {
      vendorName,
      amount: req.body.amount ? parseFloat(req.body.amount) : extracted.amount,
      date: req.body.date || extracted.date,
    });

    // Determine status
    let status = 'processed';
    if (extracted.confidence < 85) status = 'pending';
    if (dupCheck.isDuplicate) status = 'flagged';

    // Create invoice
    const invoice = Invoice.create({
      tenantId,
      vendorId: vendor?.id || null,
      vendorName,
      amount: req.body.amount ? parseFloat(req.body.amount) : extracted.amount,
      currency: req.body.currency || extracted.currency,
      vatAmount: extracted.vatAmount,
      vatRate: extracted.vatRate,
      date: req.body.date || extracted.date,
      dueDate: extracted.dueDate,
      status,
      category: classification.category,
      costCenter: classification.costCenter,
      project: classification.project,
      team: classification.team,
      environment: classification.environment,
      confidenceScore: extracted.confidence,
      source: file ? 'upload' : 'manual',
      originalFilename: file?.originalname || null,
      filePath: file?.path || null,
    });

    // Update if duplicate
    if (dupCheck.isDuplicate) {
      Invoice.update(tenantId, invoice.id, {
        isDuplicate: 1,
        duplicateOf: dupCheck.duplicateOf,
        fraudFlags: JSON.stringify(dupCheck.reasons),
      });
    }

    // Update vendor spend
    if (vendor) Vendor.updateSpend(tenantId, vendor.id);

    // Track usage
    Subscription.incrementInvoiceCount(tenantId);
    UsageLog.log(tenantId, invoice.id, 'invoice_processed');

    // Return updated invoice
    const updated = Invoice.findById(tenantId, invoice.id);

    AuditService.log(tenantId, req.user.id, 'invoice.created', 'invoice', invoice.id, { vendorName, amount: updated.amount, status: updated.status }, req);
    WebhookService.trigger(tenantId, 'invoice.created', updated);

    res.status(201).json(updated);
  } catch (err) {
    next(err);
  }
});

// Update invoice
router.patch('/:id', (req, res) => {
  const invoice = Invoice.findById(req.user.tenantId, req.params.id);
  if (!invoice) return res.status(404).json({ error: 'Invoice not found' });

  const updated = Invoice.update(req.user.tenantId, req.params.id, req.body);

  AuditService.log(req.user.tenantId, req.user.id, 'invoice.updated', 'invoice', req.params.id, { changes: Object.keys(req.body) }, req);
  WebhookService.trigger(req.user.tenantId, 'invoice.updated', updated);

  res.json(updated);
});

// Delete invoice
router.delete('/:id', (req, res) => {
  const invoice = Invoice.findById(req.user.tenantId, req.params.id);
  if (!invoice) return res.status(404).json({ error: 'Invoice not found' });

  Invoice.delete(req.user.tenantId, req.params.id);
  if (invoice.vendor_id) Vendor.updateSpend(req.user.tenantId, invoice.vendor_id);

  AuditService.log(req.user.tenantId, req.user.id, 'invoice.deleted', 'invoice', req.params.id, { invoiceNumber: invoice.invoice_number }, req);
  WebhookService.trigger(req.user.tenantId, 'invoice.deleted', { id: req.params.id, invoiceNumber: invoice.invoice_number });

  res.json({ success: true });
});

// Approve invoice
router.post('/:id/approve', (req, res) => {
  const invoice = Invoice.findById(req.user.tenantId, req.params.id);
  if (!invoice) return res.status(404).json({ error: 'Invoice not found' });

  const updated = Invoice.update(req.user.tenantId, req.params.id, { status: 'processed' });

  AuditService.log(req.user.tenantId, req.user.id, 'invoice.approved', 'invoice', req.params.id, null, req);
  WebhookService.trigger(req.user.tenantId, 'invoice.approved', updated);

  res.json(updated);
});

// Flag invoice
router.post('/:id/flag', (req, res) => {
  const invoice = Invoice.findById(req.user.tenantId, req.params.id);
  if (!invoice) return res.status(404).json({ error: 'Invoice not found' });

  const existingFlags = invoice.fraud_flags ? JSON.parse(invoice.fraud_flags) : [];
  if (req.body.reason) existingFlags.push(req.body.reason);

  const updated = Invoice.update(req.user.tenantId, req.params.id, {
    status: 'flagged',
    fraudFlags: JSON.stringify(existingFlags),
  });

  AuditService.log(req.user.tenantId, req.user.id, 'invoice.flagged', 'invoice', req.params.id, { reason: req.body.reason }, req);
  WebhookService.trigger(req.user.tenantId, 'invoice.flagged', updated);

  res.json(updated);
});

module.exports = router;
