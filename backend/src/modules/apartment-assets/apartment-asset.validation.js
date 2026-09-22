const { z } = require('zod');

const assetConditions = ['NEW', 'GOOD', 'FAIR', 'DAMAGED', 'BROKEN'];

// Treats '' / null / undefined as "no value" instead of coercing them to 0.
const optionalNumber = (schema) =>
  z.preprocess((value) => {
    if (value === '' || value === null || value === undefined) return null;

    const parsed = typeof value === 'number' ? value : Number(value);
    return Number.isNaN(parsed) ? value : parsed;
  }, schema.nullable());

// An empty date input means "not set". Anything unparseable is left untouched so
// Zod reports it as a field error instead of storing an Invalid Date.
const optionalDate = (schema) =>
  z.preprocess((value) => {
    if (value === '' || value === null || value === undefined) return null;

    const parsed = value instanceof Date ? value : new Date(value);
    return Number.isNaN(parsed.getTime()) ? value : parsed;
  }, schema.nullable());

// Empty text is stored as NULL rather than as an empty string.
const optionalText = (max) =>
  z.preprocess(
    (value) => (typeof value === 'string' && !value.trim() ? null : value),
    z.string().trim().max(max).nullable().optional(),
  );

// `Boolean('false')` is true, so a plain coerce would turn a JSON "false" into
// true. Only the values that genuinely mean "on" are accepted as true.
const booleanFlag = (defaultValue = false) =>
  z.preprocess((value) => {
    if (typeof value === 'boolean') return value;
    if (value === 'true' || value === '1' || value === 1) return true;
    if (
      value === 'false' ||
      value === '0' ||
      value === 0 ||
      value === '' ||
      value === null ||
      value === undefined
    ) {
      return false;
    }
    return value;
  }, z.boolean()).default(defaultValue);

const optionalFilter = (schema) =>
  z.preprocess((value) => (value === '' ? undefined : value), schema.optional());

// organizationId is intentionally absent: it is always taken from the authenticated user.
const apartmentAssetFields = {
  assetId: z.string().trim().min(1),
  quantity: z.coerce.number().int().min(1).max(1000000).default(1),
  condition: z.enum(assetConditions).default('GOOD'),
  serialNumber: optionalText(191),
  modelNumber: optionalText(191),
  purchaseDate: optionalDate(z.date()),
  unitValue: optionalNumber(z.number().min(0).max(999999999999)),
  notes: optionalText(5000),
};

// A row that already exists is sent with its id so the save updates it in place
// instead of creating a duplicate.
const apartmentAssetRowSchema = z.object({
  id: z.string().trim().min(1).optional(),
  ...apartmentAssetFields,
});

// The bulk save replaces the apartment's asset list atomically: rows with an id
// are updated, rows without one are created, and rows missing from the payload
// are soft deleted.
const saveApartmentAssetsSchema = z.object({
  assets: z.array(apartmentAssetRowSchema).max(500).default([]),
  complete: booleanFlag(false),
  advance: booleanFlag(false),
});

const updateApartmentAssetSchema = z
  .object(apartmentAssetFields)
  .partial()
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field is required.',
  });

const completeApartmentAssetsSchema = z.object({
  completed: booleanFlag(true),
});

const listApartmentAssetsSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(100).default(''),
  buildingId: optionalFilter(z.string().trim().min(1)),
  floorId: optionalFilter(z.string().trim().min(1)),
  apartmentId: optionalFilter(z.string().trim().min(1)),
  categoryId: optionalFilter(z.string().trim().min(1)),
  assetId: optionalFilter(z.string().trim().min(1)),
  condition: optionalFilter(z.enum(assetConditions)),
  setup: z.enum(['all', 'pending', 'completed']).default('all'),
});

const apartmentAssetParamsSchema = z.object({
  apartmentId: z.string().trim().min(1),
  id: z.string().trim().min(1),
});

const apartmentParamsSchema = z.object({
  apartmentId: z.string().trim().min(1),
});

const apartmentAssetRecordParamsSchema = z.object({
  id: z.string().trim().min(1),
});

module.exports = {
  apartmentAssetParamsSchema,
  apartmentAssetRecordParamsSchema,
  apartmentParamsSchema,
  assetConditions,
  completeApartmentAssetsSchema,
  listApartmentAssetsSchema,
  saveApartmentAssetsSchema,
  updateApartmentAssetSchema,
};
