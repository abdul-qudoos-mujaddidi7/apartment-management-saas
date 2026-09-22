const { z } = require('zod');

const optionalText = (max) =>
  z.preprocess(
    (value) => {
      if (typeof value === 'string' && !value.trim()) return null;
      return value;
    },
    z.string().trim().max(max).nullable().optional(),
  );

// Omitted currency means the organization's base currency.
const optionalCurrencyCode = z.preprocess(
  (value) => (value === '' || value === null || value === undefined ? undefined : value),
  z.string().trim().length(3).regex(/^[A-Za-z]{3}$/, 'Use a three-letter currency code such as USD.').optional(),
);

const createTransactionSchema = z.object({
  type: z.enum(['RECEIVED', 'DEDUCTION', 'REFUND']),
  currency: optionalCurrencyCode,
  amount: z.coerce.number().positive(),
  transactionDate: z.coerce.date(),
  reference: optionalText(191),
  notes: optionalText(5000),
});

const voidTransactionSchema = z.object({
  voidReason: z.string().trim().min(1).max(5000),
});

const listSecurityDepositsSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(10),
  search: z.string().trim().max(100).default(''),
  buildingId: z.string().optional(),
  tenantId: z.string().optional(),
  leaseStatus: z.enum(['DRAFT', 'ACTIVE', 'EXPIRED', 'TERMINATED']).optional(),
  depositStatus: z
    .enum(['NOT_PAID', 'PARTIAL', 'HELD', 'PARTIALLY_USED', 'SETTLED'])
    .optional(),
});

module.exports = {
  createTransactionSchema,
  voidTransactionSchema,
  listSecurityDepositsSchema,
};
