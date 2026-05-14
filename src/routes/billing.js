const express = require('express');
const billingService = require('../services/billingService');

const router = express.Router();

router.post('/create-checkout', async (req, res, next) => {
  try {
    const { finopsPlan, compliancePlan } = req.body;
    const result = await billingService.createCheckoutSession(req.user.tenantId, {
      finopsPlan, compliancePlan,
      successUrl: req.body.successUrl,
      cancelUrl: req.body.cancelUrl,
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.post('/create-portal', async (req, res, next) => {
  try {
    const result = await billingService.createPortalSession(req.user.tenantId);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.get('/usage', (req, res) => {
  const usage = billingService.getUsageSummary(req.user.tenantId);
  if (!usage) return res.status(404).json({ error: 'No subscription found' });
  res.json(usage);
});

module.exports = router;
