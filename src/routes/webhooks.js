const express = require('express');
const { getStripe } = require('../config/stripe');
const { Subscription } = require('../models');
const logger = require('../utils/logger');

const router = express.Router();

router.post('/stripe', express.raw({ type: 'application/json' }), (req, res) => {
  const stripe = getStripe();
  if (!stripe) return res.status(503).json({ error: 'Stripe not configured' });

  const sig = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
  } catch (err) {
    logger.error('Webhook signature verification failed', { error: err.message });
    return res.status(400).json({ error: 'Invalid signature' });
  }

  const { type, data } = event;

  switch (type) {
    case 'checkout.session.completed': {
      const session = data.object;
      const tenantId = session.metadata?.tenantId;
      if (tenantId) {
        Subscription.update(tenantId, {
          stripe_customer_id: session.customer,
          stripe_subscription_id: session.subscription,
          status: 'active',
        });
      }
      break;
    }
    case 'customer.subscription.updated': {
      const sub = data.object;
      // Find tenant by stripe customer ID
      const dbSub = require('../config/database')
        .prepare('SELECT tenant_id FROM subscriptions WHERE stripe_customer_id = ?')
        .get(sub.customer);
      if (dbSub) {
        Subscription.update(dbSub.tenant_id, {
          status: sub.status === 'active' ? 'active' : sub.status === 'past_due' ? 'past_due' : sub.status,
          current_period_start: new Date(sub.current_period_start * 1000).toISOString(),
          current_period_end: new Date(sub.current_period_end * 1000).toISOString(),
        });
      }
      break;
    }
    case 'customer.subscription.deleted': {
      const sub = data.object;
      const dbSub = require('../config/database')
        .prepare('SELECT tenant_id FROM subscriptions WHERE stripe_customer_id = ?')
        .get(sub.customer);
      if (dbSub) {
        Subscription.update(dbSub.tenant_id, { status: 'canceled' });
      }
      break;
    }
    case 'invoice.payment_succeeded': {
      const invoice = data.object;
      const dbSub = require('../config/database')
        .prepare('SELECT tenant_id FROM subscriptions WHERE stripe_customer_id = ?')
        .get(invoice.customer);
      if (dbSub) {
        // Reset period counter on new billing period
        Subscription.update(dbSub.tenant_id, { invoice_count_this_period: 0 });
      }
      break;
    }
    default:
      logger.info('Unhandled webhook event', { type });
  }

  res.json({ received: true });
});

module.exports = router;
