const { z } = require('zod');

const listSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(10),
  search: z.string().trim().max(100).default(''),
  buildingId: z.string().optional(),
  apartmentId: z.string().optional(),
});

module.exports = { listSchema };
