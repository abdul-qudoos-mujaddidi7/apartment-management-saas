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

module.exports = { loginSchema, registrationSchema };
