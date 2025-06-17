const { RateLimiterMemory } = require('rate-limiter-flexible');

// Create rate limiter
const rateLimiter = new RateLimiterMemory({
  keyGenerator: (req) => {
    // Use IP address as key
    return req.ip || req.connection.remoteAddress || req.socket.remoteAddress;
  },
  points: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100, // Number of requests
  duration: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 900, // Per 15 minutes (900 seconds)
});

// Stricter rate limiter for email generation
const emailGenerationLimiter = new RateLimiterMemory({
  keyGenerator: (req) => {
    return req.ip || req.connection.remoteAddress || req.socket.remoteAddress;
  },
  points: 10, // 10 emails per hour
  duration: 3600, // 1 hour
});

const rateLimiterMiddleware = async (req, res, next) => {
  try {
    await rateLimiter.consume(req.ip);
    next();
  } catch (rateLimiterRes) {
    const secs = Math.round(rateLimiterRes.msBeforeNext / 1000) || 1;
    res.set('Retry-After', String(secs));
    res.status(429).json({
      success: false,
      error: 'Too many requests',
      retryAfter: secs
    });
  }
};

const emailGenerationLimiterMiddleware = async (req, res, next) => {
  try {
    await emailGenerationLimiter.consume(req.ip);
    next();
  } catch (rateLimiterRes) {
    const secs = Math.round(rateLimiterRes.msBeforeNext / 1000) || 1;
    res.set('Retry-After', String(secs));
    res.status(429).json({
      success: false,
      error: 'Too many email generation requests. Please try again later.',
      retryAfter: secs
    });
  }
};

module.exports = {
  rateLimiter: rateLimiterMiddleware,
  emailGenerationLimiter: emailGenerationLimiterMiddleware
}; 