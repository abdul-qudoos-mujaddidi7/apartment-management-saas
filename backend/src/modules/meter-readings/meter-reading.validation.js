const { z } = require('zod');

const utilityTypes = ['ELECTRICITY', 'WATER', 'GAS'];

const requiredDate = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .transform((value) => new Date(`${value}T00:00:00.000Z`))
  .refine((value) => !Number.isNaN(value.getTime()), 'Invalid date.');

const optionalText = z.preprocess(
  (value) => (typeof value === 'string' && !value.trim() ? null : value),
  z.string().trim().max(5000).nullable().optional(),
);

const currentReading = z.coerce.number().finite().min(0).max(999999999999);
const optionalFilter = (schema) =>
  z.preprocess((value) => (value === '' ? undefined : value), schema.optional());

const createMeterReadingSchema = z.object({
  meterId: z.string().trim().min(1),
  readingDate: requiredDate,
  currentReading,
  notes: optionalText,
});

const updateMeterReadingSchema = z
  .object({
    readingDate: requiredDate.optional(),
    currentReading: currentReading.optional(),
    notes: optionalText,
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field is required.',
  });

const listMeterReadingsSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(10),
  search: z.string().trim().max(100).default(''),
  buildingId: optionalFilter(z.string().trim().min(1)),
  floorId: optionalFilter(z.string().trim().min(1)),
  apartmentId: optionalFilter(z.string().trim().min(1)),
  meterId: optionalFilter(z.string().trim().min(1)),
  utilityType: optionalFilter(z.enum(utilityTypes)),
  unbilled: z.preprocess((value) => value === 'true' || value === true, z.boolean()).default(false),
  dateFrom: optionalFilter(requiredDate),
  dateTo: optionalFilter(requiredDate),
});

module.exports = {
  createMeterReadingSchema,
  listMeterReadingsSchema,
  updateMeterReadingSchema,
};
