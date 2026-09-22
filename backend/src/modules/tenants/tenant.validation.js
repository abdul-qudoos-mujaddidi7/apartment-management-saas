const { z } = require('zod');

const tenantStatuses = ['ACTIVE', 'INACTIVE'];

// Empty optional form inputs become null in MySQL instead of empty-string values.
const optionalString = (max) =>
  z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? null : value),
    z.string().trim().max(max).nullable().optional(),
  );

const tenantFields = {
  firstName: z.string().trim().min(1).max(191),
  lastName: z.string().trim().min(1).max(191),
  phone: z.string().trim().min(3).max(64),
  alternatePhone: optionalString(64),
  email: z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? null : value),
    z.string().trim().email().max(191).nullable().optional(),
  ),
  nationalId: optionalString(64),
  address: optionalString(500),
  emergencyContactName: optionalString(191),
  emergencyContactPhone: optionalString(64),
  notes: optionalString(5000),
  status: z.enum(tenantStatuses).default('ACTIVE'),
};

const createTenantSchema = z.object(tenantFields);
const updateTenantSchema = z
  .object(tenantFields)
  .partial()
  .refine((data) => Object.keys(data).length > 0, { message: 'At least one field is required.' });
const listTenantsSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(10),
  search: z.string().trim().max(100).default(''),
});

module.exports = { createTenantSchema, listTenantsSchema, tenantStatuses, updateTenantSchema };
