const { z } = require('zod');
const optionalText = (max) => z.preprocess((v) => typeof v === 'string' && !v.trim() ? null : v, z.string().trim().max(max).nullable().optional());
/* Money currencies are optional, uppercased, and defaulted server-side. */
const currencyCode = z.preprocess(
  (v) => { if (typeof v !== 'string') return v; const t = v.trim().toUpperCase(); return t === '' ? undefined : t; },
  z.string().regex(/^[A-Z]{3}$/, 'Use a three-letter currency code such as USD.').optional(),
);
const leaseStatuses = ['DRAFT', 'ACTIVE', 'EXPIRED', 'TERMINATED'];
const fields = {
  tenantId: z.string().trim().min(1), apartmentId: z.string().trim().min(1), contractNumber: z.string().trim().min(1).max(100),
  startDate: z.coerce.date(), endDate: z.coerce.date(), monthlyRent: z.coerce.number().positive(), securityDeposit: z.coerce.number().min(0), currency: currencyCode, securityDepositCurrency: currencyCode,
  /* The recurring fee billed on top of the rent, agreed once and carried by
     every invoice raised on this lease. */
  serviceFee: z.coerce.number().min(0), serviceFeeCurrency: currencyCode,
  paymentDueDay: z.coerce.number().int().min(1).max(28), status: z.enum(leaseStatuses), notes: optionalText(5000),
};
const dates = (schema) => schema.refine((v) => !v.startDate || !v.endDate || v.startDate < v.endDate, { message: 'Start date must be before end date.', path: ['endDate'] });
/*
 * The defaults belong to a *new* lease. They are applied here and not in
 * `fields`, because Zod fills a default in even when the field is absent after
 * `.partial()` — so a partial update reset every defaulted field, and
 * activating a lease zeroed its deposit and reverted it to draft.
 */
const createLeaseSchema = dates(z.object({
  ...fields,
  securityDeposit: fields.securityDeposit.default(0),
  serviceFee: fields.serviceFee.default(0),
  status: fields.status.default('DRAFT'),
}));
const updateLeaseSchema = dates(z.object(fields).partial().refine((v) => Object.keys(v).length, { message: 'At least one field is required.' }));
const listLeasesSchema = z.object({ page:z.coerce.number().int().min(1).default(1), pageSize:z.coerce.number().int().min(1).max(100).default(10), tenantId:z.string().optional(), apartmentId:z.string().optional(), buildingId:z.string().optional(), status:z.enum(leaseStatuses).optional(), search:z.string().trim().max(100).default('') });
module.exports = { createLeaseSchema, updateLeaseSchema, listLeasesSchema };
