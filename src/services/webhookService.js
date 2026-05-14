const db = require('../config/database');
const { v4: uuid } = require('uuid');
const logger = require('../utils/logger');
const https = require('https');
const http = require('http');
const crypto = require('crypto');

const WebhookService = {
  /**
   * Trigger webhooks for a tenant event.
   * Finds all active endpoints subscribed to the event and delivers asynchronously.
   */
  trigger(tenantId, event, payload) {
    try {
      const endpoints = db.prepare(
        `SELECT * FROM webhook_endpoints WHERE tenant_id = ? AND is_active = 1`
      ).all(tenantId);

      for (const endpoint of endpoints) {
        const events = JSON.parse(endpoint.events || '[]');
        if (!events.includes(event) && !events.includes('*')) continue;

        // Fire and forget
        setImmediate(() => this._deliver(endpoint, event, payload));
      }
    } catch (err) {
      logger.error('Webhook trigger failed', { error: err.message, tenantId, event });
    }
  },

  /**
   * Deliver a webhook to a single endpoint.
   */
  _deliver(endpoint, event, payload) {
    const deliveryId = uuid();
    const body = JSON.stringify({
      id: deliveryId,
      event,
      timestamp: new Date().toISOString(),
      data: payload,
    });

    // Create HMAC signature
    const signature = crypto
      .createHmac('sha256', endpoint.secret)
      .update(body)
      .digest('hex');

    const url = new URL(endpoint.url);
    const transport = url.protocol === 'https:' ? https : http;

    const options = {
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname + url.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
        'X-Webhook-Signature': `sha256=${signature}`,
        'X-Webhook-Event': event,
        'X-Webhook-Delivery': deliveryId,
      },
      timeout: 10000,
    };

    const req = transport.request(options, (res) => {
      let responseBody = '';
      res.on('data', (chunk) => { responseBody += chunk; });
      res.on('end', () => {
        // Log delivery
        try {
          db.prepare(
            `INSERT INTO webhook_deliveries (id, endpoint_id, event, payload, response_status, response_body)
             VALUES (?, ?, ?, ?, ?, ?)`
          ).run(deliveryId, endpoint.id, event, body, res.statusCode, responseBody.slice(0, 1000));

          db.prepare(
            `UPDATE webhook_endpoints SET last_triggered_at = datetime('now'), failure_count = CASE WHEN ? < 400 THEN 0 ELSE failure_count + 1 END WHERE id = ?`
          ).run(res.statusCode, endpoint.id);
        } catch (dbErr) {
          logger.error('Webhook delivery log failed', { error: dbErr.message });
        }
      });
    });

    req.on('error', (err) => {
      try {
        db.prepare(
          `INSERT INTO webhook_deliveries (id, endpoint_id, event, payload, response_status, response_body)
           VALUES (?, ?, ?, ?, ?, ?)`
        ).run(deliveryId, endpoint.id, event, body, 0, err.message);

        db.prepare(
          `UPDATE webhook_endpoints SET failure_count = failure_count + 1 WHERE id = ?`
        ).run(endpoint.id);
      } catch (dbErr) {
        logger.error('Webhook delivery error log failed', { error: dbErr.message });
      }
    });

    req.on('timeout', () => { req.destroy(); });
    req.write(body);
    req.end();
  },
};

module.exports = WebhookService;
