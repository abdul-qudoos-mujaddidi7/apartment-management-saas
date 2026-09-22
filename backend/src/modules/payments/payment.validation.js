const { z } = require('zod');

const paymentMethods = ['CASH', 'BANK_TRANSFER', 'CARD', 'MOBILE_MONEY', 'OTHER'];
const paymentStatuses = ['POSTED', 'VOIDED'];

const requiredDate = z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/)
  .transform((value) => new Date(`${value}T00:00:00.000Z`))
  .refine((value) => !Number.isNaN(value.getTime()), 'Invalid date.');

const optionalText = (max) => z.preprocess(
  (value) => (typeof value === 'string' && !value.trim() ? null : value),
  z.string().trim().max(max).nullable().optional(),
);

const paymentAllocationSchema = z.object({
  invoiceItemId: z.string().trim().min(1),
  amount: z.coerce.number().finite().positive().max(999999999999),
});

// Omitted currency means the organization's base currency.
const optionalCurrencyCode = z.preprocess(
  (value) => (value === '' || value === null || value === undefined ? undefined : value),
  z.string().trim().length(3).regex(/^[A-Za-z]{3}$/, 'Use a three-letter currency code such as USD.').optional(),
);

const createPaymentSchema = z.object({
  tenantId: z.string().trim().min(1),
  leaseId: z.preprocess((value) => (value === '' || value === null ? null : value), z.string().trim().min(1).nullable().optional()),
  paymentDate: requiredDate,
  currency: optionalCurrencyCode,
  receiveAccountId: z.string().trim().min(1),
  paymentMethod: z.enum(paymentMethods),
  amount: z.coerce.number().finite().positive().max(999999999999),
  reference: optionalText(191),
  notes: optionalText(5000),
  allocations: z.array(paymentAllocationSchema).default([]),
});

const voidPaymentSchema = z.object({
  voidReason: z.string().trim().min(1).max(5000),
});

const optionalFilter = (schema) => z.preprocess((value) => (value === '' ? undefined : value), schema.optional());

const listPaymentsSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(10),
  search: z.string().trim().max(100).default(''),
  tenantId: optionalFilter(z.string().trim().min(1)),
  leaseId: optionalFilter(z.string().trim().min(1)),
  status: optionalFilter(z.enum(paymentStatuses)),
  currency: optionalFilter(z.string().trim().length(3).regex(/^[A-Za-z]{3}$/)),
  dateFrom: optionalFilter(requiredDate),
  dateTo: optionalFilter(requiredDate),
});

const outstandingInvoicesSchema = z.object({
  tenantId: z.string().trim().min(1),
  leaseId: optionalFilter(z.string().trim().min(1)),
});

module.exports = {
  createPaymentSchema,
  listPaymentsSchema,
  outstandingInvoicesSchema,
  paymentMethods,
  paymentStatuses,
  voidPaymentSchema,
};
