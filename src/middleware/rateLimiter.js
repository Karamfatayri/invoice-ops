// Simple in-memory sliding window rate limiter
const windows = new Map();

function rateLimiter({ maxRequests = 100, windowMs = 60000 } = {}) {
  return (req, res, next) => {
    const key = req.user?.tenantId || req.ip;
    const now = Date.now();

    if (!windows.has(key)) {
      windows.set(key, []);
    }

    const timestamps = windows.get(key).filter(t => t > now - windowMs);
    timestamps.push(now);
    windows.set(key, timestamps);

    res.setHeader('X-RateLimit-Limit', maxRequests);
    res.setHeader('X-RateLimit-Remaining', Math.max(0, maxRequests - timestamps.length));

    if (timestamps.length > maxRequests) {
      return res.status(429).json({ error: 'Too many requests. Please try again later.' });
    }

    next();
  };
}

// Cleanup stale entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, timestamps] of windows) {
    const filtered = timestamps.filter(t => t > now - 120000);
    if (filtered.length === 0) windows.delete(key);
    else windows.set(key, filtered);
  }
}, 300000);

module.exports = rateLimiter;
