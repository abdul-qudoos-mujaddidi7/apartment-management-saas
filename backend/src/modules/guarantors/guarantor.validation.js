const { z } = require('zod');
const optional = (max) => z.preprocess(v => typeof v === 'string' && !v.trim() ? null : v, z.string().trim().max(max).nullable().optional());
// Documents are stored in an organization-specific directory by the upload API.
const fields = {
  firstName: z.string().trim().min(1).max(191),
  lastName: z.string().trim().min(1).max(191),
  phone: z.string().trim().min(3).max(64),
  alternatePhone: optional(64), nationalId: optional(64), address: optional(500), notes: optional(5000),
  documentUrl: z.preprocess(v => v === '' ? null : v, z.string().max(500).regex(/^\/uploads\/guarantors\/[a-z0-9_-]+\/document-[a-z0-9-]+\.(jpg|png|webp)$/i).nullable().optional()),
};
module.exports = {
  createGuarantorSchema: z.object(fields),
  updateGuarantorSchema: z.object(fields).partial().refine(v => Object.keys(v).length > 0, { message: 'At least one field is required.' }),
  listGuarantorsSchema: z.object({ page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(1).max(100).default(10), search: z.string().trim().max(100).default('') }),
};
