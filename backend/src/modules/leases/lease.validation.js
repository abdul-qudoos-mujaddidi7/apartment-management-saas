const { z } = require('zod');
const optionalText = (max) => z.preprocess((v) => typeof v === 'string' && !v.trim() ? null : v, z.string().trim().max(max).nullable().optional());
/* The rent's currency: optional, uppercased, and defaulted server-side to the reporting currency. */
const currencyCode = z.preprocess(
  (v) => { if (typeof v !== 'string') return v; const t = v.trim().toUpperCase(); return t === '' ? undefined : t; },
  z.string().regex(/^[A-Z]{3}$/, 'Use a three-letter currency code such as USD.').optional(),
);
const fields = {
  tenantId: z.string().trim().min(1), apartmentId: z.string().trim().min(1), contractNumber: z.string().trim().min(1).max(100),
  startDate: z.coerce.date(), endDate: z.coerce.date(), monthlyRent: z.coerce.number().positive(), securityDeposit: z.coerce.number().min(0).default(0), currency: currencyCode,
  paymentDueDay: z.coerce.number().int().min(1).max(28), status: z.enum(['DRAFT', 'ACTIVE', 'EXPIRED', 'TERMINATED']).default('DRAFT'), notes: optionalText(5000),
};
const dates = (schema) => schema.refine((v) => !v.startDate || !v.endDate || v.startDate < v.endDate, { message: 'Start date must be before end date.', path: ['endDate'] });
module.exports = { createLeaseSchema: dates(z.object(fields)), updateLeaseSchema: dates(z.object(fields).partial().refine((v) => Object.keys(v).length, { message: 'At least one field is required.' })), listLeasesSchema: z.object({ page:z.coerce.number().int().min(1).default(1), pageSize:z.coerce.number().int().min(1).max(100).default(10), tenantId:z.string().optional(), apartmentId:z.string().optional(), buildingId:z.string().optional(), status:z.enum(['DRAFT','ACTIVE','EXPIRED','TERMINATED']).optional(), search:z.string().trim().max(100).default('') }) };
