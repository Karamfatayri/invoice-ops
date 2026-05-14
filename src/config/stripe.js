const Stripe = require('stripe');

let stripe = null;

function getStripe() {
  if (!stripe) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (key && key !== 'sk_test_placeholder') {
      stripe = new Stripe(key, { apiVersion: '2024-04-10' });
    }
  }
  return stripe;
}

module.exports = { getStripe };
