const { z } = require('zod');

const listSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(10),
  search: z.string().trim().max(100).default(''),
  buildingId: z.string().optional(),
  apartmentId: z.string().optional(),
});

const dateFilter = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
});
const ledgerSchema = listSchema.pick({ page: true, pageSize: true }).extend({
  from: dateFilter.optional(),
  to: dateFilter.optional(),
}).refine(value => !value.from || !value.to || value.from <= value.to, { message: 'Start date must not follow end date.', path: ['to'] });
module.exports = { listSchema, ledgerSchema };
