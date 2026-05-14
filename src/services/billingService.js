const { getStripe } = require('../config/stripe');
const { Subscription, UsageLog } = require('../models');
const { PLANS } = require('../config/constants');
const logger = require('../utils/logger');

async function createCheckoutSession(tenantId, { finopsPlan, compliancePlan, successUrl, cancelUrl }) {
  const stripe = getStripe();
  if (!stripe) throw Object.assign(new Error('Stripe not configured'), { statusCode: 503 });

  const sub = Subscription.findByTenant(tenantId);
  if (!sub) throw Object.assign(new Error('No subscription found'), { statusCode: 404 });

  const lineItems = [];

  if (finopsPlan && PLANS.finops[finopsPlan]) {
    const plan = PLANS.finops[finopsPlan];
    if (plan.stripe_price_id) {
      lineItems.push({ price: plan.stripe_price_id, quantity: 1 });
    }
  }

  if (compliancePlan && PLANS.compliance[compliancePlan]) {
    const plan = PLANS.compliance[compliancePlan];
    if (plan.stripe_price_id) {
      lineItems.push({ price: plan.stripe_price_id, quantity: 1 });
    }
  }

  if (lineItems.length === 0) {
    throw Object.assign(new Error('No valid plans selected'), { statusCode: 400 });
  }

  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    customer: sub.stripe_customer_id || undefined,
    line_items: lineItems,
    success_url: successUrl || `${process.env.APP_URL || 'http://localhost:3000'}/?checkout=success`,
    cancel_url: cancelUrl || `${process.env.APP_URL || 'http://localhost:3000'}/?checkout=canceled`,
    metadata: { tenantId },
  });

  return { url: session.url, sessionId: session.id };
}

async function createPortalSession(tenantId) {
  const stripe = getStripe();
  if (!stripe) throw Object.assign(new Error('Stripe not configured'), { statusCode: 503 });

  const sub = Subscription.findByTenant(tenantId);
  if (!sub?.stripe_customer_id) {
    throw Object.assign(new Error('No Stripe customer found'), { statusCode: 404 });
  }

  const session = await stripe.billingPortal.sessions.create({
    customer: sub.stripe_customer_id,
    return_url: `${process.env.APP_URL || 'http://localhost:3000'}/#dashboard`,
  });

  return { url: session.url };
}

function getUsageSummary(tenantId) {
  const sub = Subscription.findByTenant(tenantId);
  if (!sub) return null;

  const plan = PLANS.finops[sub.finops_plan];
  const compPlan = sub.compliance_plan ? PLANS.compliance[sub.compliance_plan] : null;

  return {
    finopsPlan: sub.finops_plan,
    compliancePlan: sub.compliance_plan,
    status: sub.status,
    invoicesThisPeriod: sub.invoice_count_this_period,
    invoiceLimit: plan?.max_invoices_month || 0,
    estimatedCost: {
      finops: (plan?.base_price || 0) + (sub.invoice_count_this_period * (plan?.per_invoice || 0)),
      compliance: compPlan ? (compPlan.base_price + sub.invoice_count_this_period * compPlan.per_invoice) : 0,
    },
    periodStart: sub.current_period_start,
    periodEnd: sub.current_period_end,
    trialEndsAt: sub.trial_ends_at,
  };
}

module.exports = { createCheckoutSession, createPortalSession, getUsageSummary };
