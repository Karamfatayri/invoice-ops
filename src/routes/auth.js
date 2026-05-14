const express = require('express');
const { z } = require('zod');
const { User, Tenant, Subscription, Settings } = require('../models');
const { hashPassword, comparePassword } = require('../utils/hash');
const { signToken } = require('../utils/jwt');
const validate = require('../middleware/validate');
const auth = require('../middleware/auth');
const rateLimiter = require('../middleware/rateLimiter');
const AuditService = require('../services/auditService');
const db = require('../config/database');

const router = express.Router();

const authLimiter = rateLimiter({ maxRequests: 10, windowMs: 60000 });

// Register
const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  fullName: z.string().min(1),
  companyName: z.string().min(1),
});

router.post('/register', authLimiter, validate(registerSchema), async (req, res, next) => {
  try {
    const { email, password, fullName, companyName } = req.body;

    // Check if email exists
    const existing = User.findByEmail(email);
    if (existing) {
      return res.status(409).json({ error: 'Email already registered' });
    }

    // Create tenant
    const tenant = Tenant.create({ name: companyName });

    // Create user
    const passwordHash = await hashPassword(password);
    const user = User.create({
      tenantId: tenant.id,
      email,
      passwordHash,
      fullName,
      role: 'owner'
    });

    // Create subscription (14-day trial)
    Subscription.create({ tenantId: tenant.id });

    // Create default settings
    Settings.create(tenant.id);

    // Generate JWT
    const token = signToken({ id: user.id, tenantId: tenant.id, email: user.email });

    AuditService.log(tenant.id, user.id, 'user.registered', 'user', user.id, { email }, req);

    res.status(201).json({
      token,
      user: { id: user.id, email: user.email, fullName: user.full_name, role: user.role },
      tenant: { id: tenant.id, name: tenant.name }
    });
  } catch (err) {
    next(err);
  }
});

// Login
const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

router.post('/login', authLimiter, validate(loginSchema), async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const user = User.findByEmail(email);
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const valid = await comparePassword(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const tenant = Tenant.findById(user.tenant_id);
    const token = signToken({ id: user.id, tenantId: user.tenant_id, email: user.email });

    // Update login tracking
    try {
      db.prepare("UPDATE users SET last_login_at = datetime('now'), login_count = COALESCE(login_count, 0) + 1 WHERE id = ?").run(user.id);
    } catch (_) { /* column may not exist yet */ }

    AuditService.log(user.tenant_id, user.id, 'user.login', 'user', user.id, { email }, req);

    res.json({
      token,
      user: { id: user.id, email: user.email, fullName: user.full_name, role: user.role },
      tenant: { id: tenant.id, name: tenant.name }
    });
  } catch (err) {
    next(err);
  }
});

// Get current user
router.get('/me', auth, (req, res) => {
  const tenant = Tenant.findById(req.user.tenantId);
  const subscription = Subscription.findByTenant(req.user.tenantId);
  const settings = Settings.findByTenant(req.user.tenantId);

  res.json({
    user: { id: req.user.id, email: req.user.email, fullName: req.user.fullName, role: req.user.role },
    tenant: { id: tenant.id, name: tenant.name, vatNumber: tenant.vat_number },
    subscription: subscription ? {
      finopsPlan: subscription.finops_plan,
      compliancePlan: subscription.compliance_plan,
      status: subscription.status,
      trialEndsAt: subscription.trial_ends_at,
      invoicesThisPeriod: subscription.invoice_count_this_period,
    } : null,
    settings: settings || null
  });
});

module.exports = router;
