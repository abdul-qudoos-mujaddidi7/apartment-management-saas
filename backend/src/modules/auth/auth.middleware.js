const authService = require('./auth.service');

const requestWindows = new Map();
const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 10;

function authRateLimit(req, res, next) {
  const key = `${req.ip}:${req.path}`;
  const now = Date.now();
  const current = requestWindows.get(key);

  if (!current || now - current.startedAt >= WINDOW_MS) {
    requestWindows.set(key, { startedAt: now, count: 0 });
  }

  const active = requestWindows.get(key);
  if (active.count >= MAX_ATTEMPTS) {
    const retryAfterSeconds = Math.max(1, Math.ceil((WINDOW_MS - (now - active.startedAt)) / 1000));
    res.set('Retry-After', String(retryAfterSeconds));
    return res.status(429).json({
      success: false,
      code: 'AUTH_RATE_LIMITED',
      message: 'Too many authentication attempts. Please try again later.',
    });
  }

  // Only an invalid login credential response consumes an attempt. Registration
  // validation/conflict errors no longer lock somebody out, and a successful
  // login clears previous failures immediately.
  res.once('finish', () => {
    if (req.path !== '/login') return;
    const window = requestWindows.get(key);
    if (!window) return;
    if (res.statusCode === 401) window.count += 1;
    else if (res.statusCode >= 200 && res.statusCode < 300) requestWindows.delete(key);
  });

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
