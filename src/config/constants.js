const PLANS = {
  finops: {
    starter: {
      name: 'Starter',
      base_price: 0,
      per_invoice: 0.05,
      max_invoices_month: 5000,
      stripe_price_id: process.env.STRIPE_FINOPS_STARTER_PRICE_ID,
      features: ['upload', 'ocr', 'basic_dashboard']
    },
    growth: {
      name: 'Growth',
      base_price: 500,
      per_invoice: 0.03,
      max_invoices_month: 20000,
      stripe_price_id: process.env.STRIPE_FINOPS_GROWTH_PRICE_ID,
      features: ['upload', 'ocr', 'classification', 'duplicate_detection', 'analytics', 'api_access']
    },
    enterprise: {
      name: 'Enterprise',
      base_price: 2500,
      per_invoice: 0.01,
      max_invoices_month: Infinity,
      stripe_price_id: process.env.STRIPE_FINOPS_ENTERPRISE_PRICE_ID,
      features: ['all_finops', 'custom_sla', 'dedicated_support', 'sso']
    }
  },
  compliance: {
    starter: {
      name: 'Starter',
      base_price: 100,
      per_invoice: 0.02,
      max_invoices_month: 5000,
      stripe_price_id: process.env.STRIPE_COMPLIANCE_STARTER_PRICE_ID,
      features: ['en16931_validation', 'einvoice_generation']
    },
    growth: {
      name: 'Growth',
      base_price: 800,
      per_invoice: 0.015,
      max_invoices_month: 20000,
      stripe_price_id: process.env.STRIPE_COMPLIANCE_GROWTH_PRICE_ID,
      features: ['en16931', 'peppol_routing', 'xades_signing']
    },
    enterprise: {
      name: 'Enterprise',
      base_price: 3000,
      per_invoice: 0.01,
      max_invoices_month: Infinity,
      stripe_price_id: process.env.STRIPE_COMPLIANCE_ENTERPRISE_PRICE_ID,
      features: ['all_compliance', 'worm_archive', 'peppol_optimization', 'dedicated']
    }
  }
};

const TRIAL_DAYS = 14;

const CATEGORIES = [
  'cloud', 'monitoring', 'data', 'streaming', 'database',
  'devops', 'security', 'search', 'cdn', 'consulting', 'hardware', 'other'
];

const INVOICE_STATUSES = ['pending', 'processing', 'processed', 'flagged', 'rejected'];

module.exports = { PLANS, TRIAL_DAYS, CATEGORIES, INVOICE_STATUSES };
