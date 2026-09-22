const { z } = require('zod');

const buildingFields = {
  name: z.string().trim().min(1).max(191),
  code: z.string().trim().min(1).max(64),
  address: z.string().trim().max(500).optional().nullable(),
  status: z.enum(['ACTIVE', 'INACTIVE']),
};

const createBuildingSchema = z.object(buildingFields);
const updateBuildingSchema = z
  .object(buildingFields)
  .partial()
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field is required.',
  });
const buildingIdParamsSchema = z.object({
  id: z.string().trim().min(1),
});
const buildingListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(10),
  search: z.string().trim().max(100).default(''),
});

module.exports = {
  buildingIdParamsSchema,
  buildingListQuerySchema,
  createBuildingSchema,
  updateBuildingSchema,
};
