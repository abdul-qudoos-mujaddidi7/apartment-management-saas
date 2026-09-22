const { z } = require('zod');

const journalStatuses = ['POSTED', 'VOIDED'];

const requiredDate = z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/)
  .transform((value) => new Date(`${value}T00:00:00.000Z`))
  .refine((value) => !Number.isNaN(value.getTime()), 'Invalid date.');

const optionalText = (max) => z.preprocess(
  (value) => (typeof value === 'string' && !value.trim() ? null : value),
  z.string().trim().max(max).nullable().optional(),
);

const optionalFilter = (schema) => z.preprocess((value) => (value === '' ? undefined : value), schema.optional());

/**
 * One side of the entry. A line carries a debit or a credit, never both and
 * never neither — the service enforces the same rule, this only rejects the
 * obviously malformed payloads before they reach the accounting code.
 *
 * `tenantId` is optional and tags the posting to a tenant's account: the line
 * still names a general-ledger account (the receivable control account), and
 * the tenant identifies whose account it belongs to. That is the same shape
 * invoice and payment postings use, so a manual entry can move a tenant's
 * balance exactly like a document does.
 */
const journalLineSchema = z.object({
  accountId: z.string().trim().min(1),
  tenantId: optionalText(64),
  debit: z.coerce.number().finite().min(0).max(999999999999).default(0),
  credit: z.coerce.number().finite().min(0).max(999999999999).default(0),
  description: optionalText(500),
}).refine(
  (line) => (line.debit > 0) !== (line.credit > 0),
  { message: 'A journal line needs a debit or a credit, but not both.' },
);

/**
 * The currency the whole entry is written in. Omitted means the organization's
 * base currency, which is what every caller sent before multi-currency existed;
 * the service resolves the rate for `transactionDate` and freezes it on the
 * entry when it posts.
 */
const optionalCurrencyCode = z.preprocess(
  (value) => (value === '' || value === null || value === undefined ? undefined : value),
  z.string().trim().length(3).regex(/^[A-Za-z]{3}$/, 'Use a three-letter currency code such as USD.').optional(),
);

const journalBodySchema = z.object({
  transactionDate: requiredDate,
  currency: optionalCurrencyCode,
  description: optionalText(5000),
  lines: z.array(journalLineSchema).min(2).max(200),
});

const createJournalSchema = journalBodySchema;

const updateJournalSchema = journalBodySchema;

const voidJournalSchema = z.object({
  voidReason: z.string().trim().min(1).max(5000),
});

const listJournalsSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(10),
  search: z.string().trim().max(100).default(''),
  status: optionalFilter(z.enum(journalStatuses)),
  referenceType: optionalFilter(z.string().trim().max(50)),
  currency: optionalFilter(z.string().trim().length(3).regex(/^[A-Za-z]{3}$/)),
  accountId: optionalFilter(z.string().trim().min(1)),
  dateFrom: optionalFilter(requiredDate),
  dateTo: optionalFilter(requiredDate),
});

module.exports = {
  createJournalSchema,
  journalStatuses,
  listJournalsSchema,
  updateJournalSchema,
  voidJournalSchema,
};
