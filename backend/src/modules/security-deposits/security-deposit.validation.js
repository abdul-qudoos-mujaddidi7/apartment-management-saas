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

// The account a receipt is taken into, and a refund is paid out of. Omitted
// means the workspace's cash account.
const optionalAccountId = z.preprocess(
  (value) => (value === '' || value === null || value === undefined ? undefined : value),
  z.string().trim().min(1).optional(),
);

const createTransactionSchema = z
  .object({
    type: z.enum(['RECEIVED', 'DEDUCTION', 'REFUND']),
    // Why the deposit is being kept. Required for a deduction, because the two
    // reasons post to different accounts: rent arrears settle a receivable,
    // damage is income that has never been recognised.
    reason: z.preprocess(
      (value) => (value === '' || value === null || value === undefined ? undefined : String(value).trim().toUpperCase()),
      z.enum(['RENT_ARREARS', 'DAMAGE', 'OTHER'], {
        message: 'Use RENT_ARREARS, DAMAGE or OTHER.',
      }).optional(),
    ),
    currency: optionalCurrencyCode,
    amount: z.coerce.number().positive(),
    transactionDate: z.coerce.date(),
    accountId: optionalAccountId,
    reference: optionalText(191),
    notes: optionalText(5000),
  })
  .refine((data) => data.type !== 'DEDUCTION' || Boolean(data.reason), {
    path: ['reason'],
    message: 'Say why the deposit is being kept: rent arrears, damage, or other.',
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
