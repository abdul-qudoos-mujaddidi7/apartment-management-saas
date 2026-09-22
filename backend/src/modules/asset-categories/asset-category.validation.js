const { z } = require('zod');

// Empty text is stored as NULL rather than as an empty string.
const optionalText = (max) =>
  z.preprocess(
    (value) => (typeof value === 'string' && !value.trim() ? null : value),
    z.string().trim().max(max).nullable().optional(),
  );

// organizationId is intentionally absent: it is always taken from the authenticated user.
const assetCategoryFields = {
  name: z.string().trim().min(1).max(191),
  code: optionalText(64),
  description: optionalText(2000),
};

const createAssetCategorySchema = z.object(assetCategoryFields);

const updateAssetCategorySchema = z
  .object(assetCategoryFields)
  .partial()
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field is required.',
  });

// A cleared filter arrives as `?search=` — an empty value means "not set".
const listAssetCategoriesSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
  search: z.string().trim().max(100).default(''),
});

const assetCategoryParamsSchema = z.object({
  id: z.string().trim().min(1),
});

module.exports = {
  assetCategoryParamsSchema,
  createAssetCategorySchema,
  listAssetCategoriesSchema,
  updateAssetCategorySchema,
};
