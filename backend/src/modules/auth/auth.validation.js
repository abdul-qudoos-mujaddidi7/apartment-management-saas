const { z } = require('zod');

const usernameSchema = z.string().trim().min(3).max(64)
  .regex(/^[\p{L}\p{N}._-]+$/u, 'Use letters, numbers, dots, underscores or hyphens.')
  .transform(value => value.toLowerCase());

// Keep the email request field for existing clients. New clients send the
// username field, which may also contain an existing user's old email address.
const loginSchema = z.object({
  username: z.string().trim().min(1).max(191).optional(),
  email: z.string().trim().email().optional(),
  password: z.string().min(1),
}).refine(value => Boolean(value.username || value.email), {
  message: 'Enter your username.', path: ['username'],
});

const registrationCurrency = z.preprocess(
  value => value === '' || value === null || value === undefined
    ? undefined : String(value).trim().toUpperCase(),
  z.string().regex(/^[A-Z]{3}$/, 'Use a three-letter currency code such as USD.').optional(),
);

const registrationSchema = z.object({
  organizationName: z.string().trim().min(1),
  firstName: z.string().trim().min(1),
  lastName: z.string().trim().min(1),
  username: usernameSchema.optional(),
  email: z.string().trim().email().optional(),
  phone: z.string().trim().min(1),
  password: z.string().min(8),
  currency: registrationCurrency,
}).refine(value => Boolean(value.username || value.email), {
  message: 'Enter a username.', path: ['username'],
}).transform(({ email, ...data }) => ({
  ...data,
  // Older registration clients can still send email, now stored as username.
  username: data.username || email.trim().toLowerCase(),
}));

// The signed-in user's own record. Only the display name is editable here: the
// username is the login identifier and the role is the administrator's call, so
// neither is accepted from this endpoint's body.
const profileSchema = z.object({
  firstName: z.string().trim().min(1, 'Enter your first name.').max(80, 'That name is too long.'),
  lastName: z.string().trim().min(1, 'Enter your last name.').max(80, 'That name is too long.'),
});

// A new password must be long enough to matter and must not be the one already
// in place, which is the usual way a "change" turns out to have changed nothing.
const passwordChangeSchema = z.object({
  currentPassword: z.string().min(1, 'Enter your current password.'),
  newPassword: z.string().min(8, 'Use at least 8 characters.').max(128, 'That password is too long.'),
}).refine(value => value.newPassword !== value.currentPassword, {
  message: 'Choose a password different from your current one.', path: ['newPassword'],
});

module.exports = { loginSchema, passwordChangeSchema, profileSchema, registrationSchema };
