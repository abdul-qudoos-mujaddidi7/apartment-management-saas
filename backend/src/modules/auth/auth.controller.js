const { z } = require('zod');

const authService = require('./auth.service');
const { loginSchema, registrationSchema } = require('./auth.validation');

const cookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax',
  maxAge: 24 * 60 * 60 * 1000,
};

async function register(req, res, next) {
  try {
    const result = registrationSchema.safeParse(req.body);

    if (!result.success) {
      return res.status(400).json({
        success: false,
        code: 'INVALID_REGISTRATION_DATA',
        message: 'Invalid registration data.',
        errors: z.flattenError(result.error).fieldErrors,
      });
    }

    const user = await authService.registerOrganizationAdmin(result.data);
    res.cookie('accessToken', authService.createAccessToken(user), cookieOptions);

    return res.status(201).json({ success: true, user });
  } catch (error) {
    // A currency the catalogue rejects (bad code) is a field error, not a 500.
    if (error.code === 'INVALID_CURRENCY_CODE') {
      return res.status(400).json({
        success: false,
        code: 'INVALID_REGISTRATION_DATA',
        message: 'Invalid registration data.',
        errors: { currency: [error.message] },
      });
    }

    if (['USERNAME_ALREADY_EXISTS', 'SLUG_ALREADY_EXISTS'].includes(error.code)) {
      return res.status(409).json({
        success: false,
        code: error.code,
        message: error.message,
        field: error.code === 'USERNAME_ALREADY_EXISTS' ? 'username' : 'organization',
      });
    }

    if (error.code === 'P2002') {
      const target = error.meta?.target;
      // MySQL reports the unique index name; other Prisma connectors may give
      // a list of columns. Handle both, including concurrent registrations.
      const targetName = Array.isArray(target) ? target.join(' ') : String(target || '');
      const field = targetName.includes('username') ? 'username' : 'organization';
      const conflict = {
        username: ['USERNAME_ALREADY_EXISTS', 'Username is already registered.'],
        organization: ['SLUG_ALREADY_EXISTS', 'Organization slug already exists.'],
      }[field];
      return res.status(409).json({
        success: false,
        code: conflict[0],
        message: conflict[1],
        field,
      });
    }

    return next(error);
  }
}

async function login(req, res, next) {
  try {
    const result = loginSchema.safeParse(req.body);

    if (!result.success) {
      return res.status(400).json({
        success: false,
        code: 'INVALID_LOGIN_DATA',
        message: 'Invalid login data.',
        errors: z.flattenError(result.error).fieldErrors,
      });
    }

    const user = await authService.authenticateUser(
      result.data.username || result.data.email,
      result.data.password,
    );

    if (!user) {
      return res.status(401).json({
        success: false,
        code: 'INVALID_CREDENTIALS',
        message: 'Invalid username or password.',
      });
    }

    res.cookie('accessToken', authService.createAccessToken(user), cookieOptions);
    return res.status(200).json({ success: true, user });
  } catch (error) {
    return next(error);
  }
}

function logout(req, res) {
  res.clearCookie('accessToken', cookieOptions);
  return res.status(200).json({ success: true, message: 'Logged out successfully' });
}

function me(req, res) {
  return res.status(200).json({ success: true, user: req.user });
}

module.exports = { login, logout, me, register };
