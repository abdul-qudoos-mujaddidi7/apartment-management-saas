const { z } = require('zod');

const floorFields = {
  buildingId: z.string().trim().min(1),
  // Free text on purpose: buildings number their floors "1", "B1", "Ground"…
  floorNumber: z.string().trim().min(1).max(32),
  name: z.string().trim().min(1).max(191),
};

const createFloorSchema = z.object(floorFields);

const updateFloorSchema = z
  .object(floorFields)
  .partial()
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field is required.',
  });

const listFloorsSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(10),
  search: z.string().trim().max(100).default(''),
  buildingId: z.string().trim().min(1).optional(),
});

module.exports = { createFloorSchema, listFloorsSchema, updateFloorSchema };
