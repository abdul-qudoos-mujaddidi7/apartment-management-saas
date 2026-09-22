const { z } = require('zod');

// Empty text is stored as NULL rather than as an empty string.
const optionalText = (max) =>
  z.preprocess(
    (value) => (typeof value === 'string' && !value.trim() ? null : value),
    z.string().trim().max(max).nullable().optional(),
  );

// organizationId is intentionally absent: it is always taken from the authenticated user.
const assetFields = {
  categoryId: optionalText(191),
  name: z.string().trim().min(1).max(191),
  code: optionalText(64),
  unit: optionalText(32),
  description: optionalText(2000),
};

const createAssetSchema = z.object(assetFields);

const updateAssetSchema = z
  .object(assetFields)
  .partial()
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field is required.',
  });

// A cleared filter arrives as `?categoryId=` — an empty value means "not set".
const optionalFilter = (schema) =>
  z.preprocess((value) => (value === '' ? undefined : value), schema.optional());

const listAssetsSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
  search: z.string().trim().max(100).default(''),
  categoryId: optionalFilter(z.string().trim().min(1)),
});

const assetParamsSchema = z.object({
  id: z.string().trim().min(1),
});

module.exports = {
  assetParamsSchema,
  createAssetSchema,
  listAssetsSchema,
  updateAssetSchema,
};
