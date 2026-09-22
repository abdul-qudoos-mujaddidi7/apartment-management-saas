const { z } = require('zod');

const dateOnly = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a YYYY-MM-DD date.')
  .transform((value) => new Date(`${value}T00:00:00.000Z`));

const optionalDateOnly = z.preprocess(
  (value) => (value === '' || value === null || value === undefined ? undefined : value),
  dateOnly.optional(),
);

const optionalText = z.preprocess(
  (value) => (typeof value === 'string' && !value.trim() ? null : value),
  z.string().trim().max(100).nullable().optional(),
);

const rate = z.coerce.number().finite().positive().max(9999999999);

const listCurrenciesSchema = z.object({
  search: z.string().trim().max(100).default(''),
  includeInactive: z
    .preprocess((value) => value === 'true' || value === '1' || value === true, z.boolean())
    .default(false),
});

const catalogueQuerySchema = z.object({
  search: z.string().trim().max(100).default(''),
  refresh: z
    .preprocess((value) => value === 'true' || value === '1' || value === true, z.boolean())
    .default(false),
});

const createCurrencySchema = z.object({
  code: z.string().trim().min(3).max(3).regex(/^[A-Za-z]{3}$/, 'Use a three-letter code such as USD.'),
  name: optionalText,
  symbol: optionalText,
  rate: rate.optional(),
  effectiveDate: optionalDateOnly,
});

const updateCurrencySchema = z
  .object({
    name: optionalText,
    symbol: optionalText,
    isActive: z.boolean().optional(),
    rate: rate.optional(),
    effectiveDate: optionalDateOnly,
  })
  .refine((data) => Object.keys(data).length > 0, { message: 'At least one field is required.' });

const addRateSchema = z.object({
  rate,
  effectiveDate: optionalDateOnly,
});

const setBaseCurrencySchema = z.object({
  code: z.string().trim().min(3).max(3).regex(/^[A-Za-z]{3}$/, 'Use a three-letter code such as USD.'),
});

const rateQuerySchema = z.object({
  currency: z.string().trim().min(3).max(3).optional(),
  date: optionalDateOnly,
});

const convertQuerySchema = z.object({
  amount: z.coerce.number().finite(),
  from: z.string().trim().min(3).max(3).optional(),
  to: z.string().trim().min(3).max(3).optional(),
  date: optionalDateOnly,
});

module.exports = {
  addRateSchema,
  catalogueQuerySchema,
  convertQuerySchema,
  createCurrencySchema,
  listCurrenciesSchema,
  rateQuerySchema,
  setBaseCurrencySchema,
  updateCurrencySchema,
};
