const { z } = require('zod');

const authService = require('./auth.service');

const loginSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1),
});

const registrationSchema = z.object({
  organizationName: z.string().trim().min(1),
  firstName: z.string().trim().min(1),
  lastName: z.string().trim().min(1),
  email: z.string().trim().email(),
  phone: z.string().trim().min(1),
  password: z.string().min(8),
});

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
    if (error.code === 'EMAIL_ALREADY_EXISTS' || error.code === 'SLUG_ALREADY_EXISTS') {
      return res.status(409).json({
        success: false,
        code: error.code,
        message: error.message,
        field: error.code === 'EMAIL_ALREADY_EXISTS' ? 'email' : 'organization',
      });
    }

    if (error.code === 'P2002') {
      const target = error.meta?.target;
      const field = Array.isArray(target) && target.includes('email') ? 'email' : 'organizationName';
      return res.status(409).json({
        success: false,
        code: field === 'email' ? 'EMAIL_ALREADY_EXISTS' : 'SLUG_ALREADY_EXISTS',
        message: field === 'email' ? 'Email is already registered.' : 'Organization slug already exists.',
        field: field === 'email' ? 'email' : 'organization',
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
      result.data.email,
      result.data.password,
    );

    if (!user) {
      return res.status(401).json({
        success: false,
        code: 'INVALID_CREDENTIALS',
        message: 'Invalid email or password.',
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
