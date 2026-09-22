const { z } = require('zod');

const utilityTypes = ['ELECTRICITY', 'WATER', 'GAS'];

const meterStatuses = ['ACTIVE', 'INACTIVE', 'REPLACED'];

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

// organizationId is intentionally absent: it is always taken from the authenticated user.
const meterFields = {
  apartmentId: z.string().trim().min(1),
  meterNumber: z.string().trim().min(1).max(64),
  utilityType: z.enum(utilityTypes),
  unit: z.string().trim().min(1).max(16),
  defaultUnitPrice: z.coerce.number().finite().min(0).max(999999999999).default(0),
  initialReading: optionalNumber(z.number().min(0).max(999999999999)),
  installationDate: optionalDate(z.date()),
  status: z.enum(meterStatuses).default('ACTIVE'),
  notes: optionalText(5000),
};

const createMeterSchema = z.object(meterFields);

const updateMeterSchema = z
  .object(meterFields)
  .partial()
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field is required.',
  });

// A cleared filter arrives as `?buildingId=&status=` — an empty value means
// "not set", not an invalid one.
const optionalFilter = (schema) =>
  z.preprocess((value) => (value === '' ? undefined : value), schema.optional());

const listMetersSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(10),
  search: z.string().trim().max(100).default(''),
  buildingId: optionalFilter(z.string().trim().min(1)),
  floorId: optionalFilter(z.string().trim().min(1)),
  apartmentId: optionalFilter(z.string().trim().min(1)),
  utilityType: optionalFilter(z.enum(utilityTypes)),
  status: optionalFilter(z.enum(meterStatuses)),
});

module.exports = {
  createMeterSchema,
  listMetersSchema,
  meterStatuses,
  updateMeterSchema,
  utilityTypes,
};
