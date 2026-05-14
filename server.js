require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('path');
const logger = require('./src/utils/logger');

// Initialize database (runs migrations)
const db = require('./src/config/database');

const app = express();
const PORT = process.env.PORT || 3000;

// === SECURITY MIDDLEWARE (before everything) ===
const securityMiddleware = require('./src/middleware/security');
app.use(securityMiddleware);

// === WEBHOOK ROUTE (must be before json body parser) ===
const webhookRoutes = require('./src/routes/webhooks');
app.use('/api/webhooks', webhookRoutes);

// === GLOBAL MIDDLEWARE ===
app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));

// Request logging with request ID
app.use((req, res, next) => {
  if (req.path.startsWith('/api')) {
    logger.info('Request', { method: req.method, path: req.path, requestId: req.requestId });
  }
  next();
});

// Rate limiter for API routes
const rateLimiter = require('./src/middleware/rateLimiter');
app.use('/api', rateLimiter({ maxRequests: 100, windowMs: 60000 }));

// === STATIC FILES ===
app.use(express.static(path.join(__dirname, 'public')));

// === API ROUTES ===
const auth = require('./src/middleware/auth');
const authRoutes = require('./src/routes/auth');
const invoiceRoutes = require('./src/routes/invoices');
const vendorRoutes = require('./src/routes/vendors');
const analyticsRoutes = require('./src/routes/analytics');
const complianceRoutes = require('./src/routes/compliance');
const settingsRoutes = require('./src/routes/settings');
const billingRoutes = require('./src/routes/billing');
const apiKeyRoutes = require('./src/routes/apiKeys');
const customerWebhookRoutes = require('./src/routes/customerWebhooks');
const auditRoutes = require('./src/routes/audit');
const approvalRoutes = require('./src/routes/approvals');

app.use('/api/auth', authRoutes);
app.use('/api/invoices', auth, invoiceRoutes);
app.use('/api/vendors', auth, vendorRoutes);
app.use('/api/analytics', auth, analyticsRoutes);
app.use('/api/compliance', auth, complianceRoutes);
app.use('/api/settings', auth, settingsRoutes);
app.use('/api/billing', auth, billingRoutes);
app.use('/api/api-keys', auth, apiKeyRoutes);
app.use('/api/customer-webhooks', auth, customerWebhookRoutes);
app.use('/api/audit', auth, auditRoutes);
app.use('/api/approvals', auth, approvalRoutes);

// === HEALTH CHECK ===
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', version: '2.0.0', timestamp: new Date().toISOString() });
});

// === SPA FALLBACK ===
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// === ERROR HANDLER ===
const errorHandler = require('./src/middleware/errorHandler');
app.use(errorHandler);

// === GRACEFUL SHUTDOWN ===
let server;

function gracefulShutdown(signal) {
  logger.info(`${signal} received, shutting down gracefully...`);
  if (server) {
    server.close(() => {
      logger.info('HTTP server closed');
      try {
        db.close();
        logger.info('Database connection closed');
      } catch (_) { /* already closed */ }
      process.exit(0);
    });

    // Force exit after 10 seconds
    setTimeout(() => {
      logger.error('Forced shutdown after timeout');
      process.exit(1);
    }, 10000);
  } else {
    process.exit(0);
  }
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

process.on('uncaughtException', (err) => {
  logger.error('Uncaught exception', { message: err.message, stack: err.stack });
  gracefulShutdown('uncaughtException');
});

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled rejection', { reason: String(reason) });
});

// === START SERVER ===
server = app.listen(PORT, () => {
  logger.info(`Invoice Ops server running`, { port: PORT, env: process.env.NODE_ENV || 'development', version: '2.0.0' });
});

module.exports = app;
