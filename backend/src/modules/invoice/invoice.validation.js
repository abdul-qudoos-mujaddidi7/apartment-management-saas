const { z } = require('zod');

const itemTypes = ['RENT', 'ELECTRICITY', 'WATER', 'GAS', 'SERVICE_FEE', 'OTHER'];
const invoiceStatuses = ['UNPAID', 'PARTIALLY_PAID', 'PAID', 'OVERDUE', 'CANCELLED'];

const requiredDate = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .transform((value) => new Date(`${value}T00:00:00.000Z`))
  .refine((value) => !Number.isNaN(value.getTime()), 'Invalid date.');

const optionalDate = z.preprocess(
  (value) => (value === '' || value === null || value === undefined ? null : value),
  requiredDate.nullable(),
);

const optionalText = z.preprocess(
  (value) => (typeof value === 'string' && !value.trim() ? null : value),
  z.string().trim().max(5000).nullable().optional(),
);

const invoiceItemSchema = z.object({
  type: z.enum(itemTypes),
  meterReadingId: z.string().trim().min(1).optional(),
  description: z.string().trim().min(1).max(500).optional(),
  quantity: z.coerce.number().finite().positive().max(999999999999).optional(),
  unitPrice: z.coerce.number().finite().min(0).max(999999999999).optional(),
}).superRefine((item, ctx) => {
  if (item.meterReadingId) {
    if (!['ELECTRICITY', 'WATER', 'GAS'].includes(item.type)) {
      ctx.addIssue({ code: 'custom', path: ['type'], message: 'Meter readings must use a utility item type.' });
    }
    return;
  }

  if (!item.description) ctx.addIssue({ code: 'custom', path: ['description'], message: 'Description is required.' });
  if (item.quantity === undefined) ctx.addIssue({ code: 'custom', path: ['quantity'], message: 'Quantity is required.' });
  if (item.unitPrice === undefined) ctx.addIssue({ code: 'custom', path: ['unitPrice'], message: 'Unit price is required.' });
});

const datesAreValid = (schema) => schema.refine(
  (data) => !data.dueDate || !data.invoiceDate || data.dueDate >= data.invoiceDate,
  { path: ['dueDate'], message: 'Due date cannot be before invoice date.' },
);

/*
 * There is no currency on the invoice itself any more: every charge is stated in
 * the currency it was agreed in — the lease's rent currency, the fee's own
 * currency, the base currency a meter was priced in — and the invoice adds those
 * lines up in the organization's base currency. A client still sending
 * `currency` has the field ignored rather than rejected.
 */
const createInvoiceSchema = datesAreValid(z.object({
  leaseId: z.string().trim().min(1),
  invoiceDate: requiredDate,
  dueDate: optionalDate,
  notes: optionalText,
  items: z.array(invoiceItemSchema).min(1),
}));

const updateInvoiceSchema = datesAreValid(z.object({
  invoiceDate: requiredDate.optional(),
  dueDate: optionalDate.optional(),
  notes: optionalText,
  items: z.array(invoiceItemSchema).min(1).optional(),
}).refine((data) => Object.keys(data).length > 0, {
  message: 'At least one field is required.',
}));

const optionalFilter = (schema) => z.preprocess(
  (value) => (value === '' ? undefined : value),
  schema.optional(),
);

const listInvoicesSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(10),
  search: z.string().trim().max(100).default(''),
  buildingId: optionalFilter(z.string().trim().min(1)),
  floorId: optionalFilter(z.string().trim().min(1)),
  apartmentId: optionalFilter(z.string().trim().min(1)),
  tenantId: optionalFilter(z.string().trim().min(1)),
  leaseId: optionalFilter(z.string().trim().min(1)),
  status: optionalFilter(z.enum(invoiceStatuses)),
  currency: optionalFilter(z.string().trim().length(3).regex(/^[A-Za-z]{3}$/)),
  dateFrom: optionalFilter(requiredDate),
  dateTo: optionalFilter(requiredDate),
});

module.exports = {
  createInvoiceSchema,
  invoiceStatuses,
  itemTypes,
  listInvoicesSchema,
  updateInvoiceSchema,
};
