const rateLimitMap = new Map();

const rateLimit = (windowMs = 15 * 60 * 1000, max = 100) => (req, res, next) => {
  const key = req.ip || req.connection.remoteAddress || "unknown";
  const now = Date.now();
  const windowStart = now - windowMs;

  if (!rateLimitMap.has(key)) {
    rateLimitMap.set(key, []);
  }

  const requests = rateLimitMap.get(key);
  const validRequests = requests.filter((time) => time > windowStart);
  rateLimitMap.set(key, validRequests);

  if (validRequests.length >= max) {
    return res.status(429).json({ 
      message: "Too many requests",
      limit: max,
      remaining: 0,
      resetTime: new Date(now + windowMs).toISOString()
    });
  }

  validRequests.push(now);
  
  // Add rate limit headers
  res.set({
    'X-RateLimit-Limit': max,
    'X-RateLimit-Remaining': max - validRequests.length,
    'X-RateLimit-Reset': new Date(now + windowMs).toISOString()
  });
  
  next();
};

module.exports = { rateLimit };

