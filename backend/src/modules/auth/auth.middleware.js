const authService = require('./auth.service');

const requestWindows = new Map();
const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 10;

function authRateLimit(req, res, next) {
  const key = `${req.ip}:${req.path}`;
  const now = Date.now();
  const current = requestWindows.get(key);

  if (!current || now - current.startedAt >= WINDOW_MS) {
    requestWindows.set(key, { startedAt: now, count: 1 });
    return next();
  }

  if (current.count >= MAX_ATTEMPTS) {
    return res.status(429).json({
      success: false,
      code: 'AUTH_RATE_LIMITED',
      message: 'Too many authentication attempts. Please try again later.',
    });
  }

  current.count += 1;
  return next();
}

async function requireAuth(req, res, next) {
  const token = req.cookies.accessToken;

  if (!token) {
    return res.status(401).json({ success: false, message: 'Authentication required.' });
  }

  let payload;
  try {
    payload = authService.verifyAccessToken(token);
  } catch {
    return res.status(401).json({ success: false, message: 'Invalid or expired token.' });
  }

  if (!payload.sub) {
    return res.status(401).json({ success: false, message: 'Invalid or expired token.' });
  }

  try {
    const user = await authService.getCurrentUser(payload.sub);

    if (!user) {
      return res.status(401).json({ success: false, message: 'Authentication required.' });
    }

    req.user = user;
    return next();
  } catch (error) {
    return next(error);
  }
}

module.exports = { authRateLimit, requireAuth };
