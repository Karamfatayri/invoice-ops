const db = require('../config/database');
const { PLANS } = require('../config/constants');

function planLimits(req, res, next) {
  const sub = db.prepare('SELECT * FROM subscriptions WHERE tenant_id = ?').get(req.user.tenantId);
  if (!sub) {
    return res.status(403).json({ error: 'No active subscription' });
  }

  // Check subscription status
  if (sub.status === 'canceled') {
    return res.status(402).json({ error: 'Subscription canceled. Please resubscribe.' });
  }
  if (sub.status === 'past_due') {
    return res.status(402).json({ error: 'Payment past due. Please update your payment method.' });
  }

  // Check trial expiry
  if (sub.status === 'trialing' && sub.trial_ends_at) {
    if (new Date(sub.trial_ends_at) < new Date()) {
      return res.status(402).json({ error: 'Trial expired. Please choose a plan to continue.' });
    }
  }

  // Check invoice limits for the current period
  const plan = PLANS.finops[sub.finops_plan];
  if (plan && sub.invoice_count_this_period >= plan.max_invoices_month) {
    return res.status(402).json({
      error: 'Invoice limit reached for your current plan',
      current: sub.invoice_count_this_period,
      limit: plan.max_invoices_month,
      upgrade: true
    });
  }

  req.subscription = sub;
  next();
}

module.exports = planLimits;
