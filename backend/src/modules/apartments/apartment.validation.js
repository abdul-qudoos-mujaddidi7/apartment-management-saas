const { z } = require('zod');

const apartmentTypes = [
  'STUDIO',
  'ONE_BEDROOM',
  'TWO_BEDROOM',
  'THREE_BEDROOM',
  'FOUR_BEDROOM_PLUS',
  'DUPLEX',
  'PENTHOUSE',
  'OFFICE',
  'SHOP',
];

const apartmentStatuses = ['AVAILABLE', 'OCCUPIED', 'RESERVED', 'MAINTENANCE', 'INACTIVE'];

// Treats '' / null / undefined as "no value" instead of coercing them to 0.
const optionalNumber = (schema) =>
  z.preprocess((value) => {
    if (value === '' || value === null || value === undefined) return null;

    const parsed = typeof value === 'number' ? value : Number(value);
    return Number.isNaN(parsed) ? value : parsed;
  }, schema.nullable());

// organizationId is intentionally absent: it is always taken from the authenticated user.
const apartmentFields = {
  floorId: z.string().trim().min(1),
  apartmentNumber: z.string().trim().min(1).max(64),
  name: z.string().trim().min(1).max(191),
  type: z.enum(apartmentTypes),
  area: optionalNumber(z.number().min(0).max(1000000)),
  bedrooms: z.coerce.number().int().min(0).max(100).default(0),
  bathrooms: z.coerce.number().int().min(0).max(100).default(0),
  monthlyRent: z.coerce.number().min(0).max(1000000000).default(0),
  status: z.enum(apartmentStatuses).default('AVAILABLE'),
};

const createApartmentSchema = z.object(apartmentFields);

const updateApartmentSchema = z
  .object(apartmentFields)
  .partial()
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field is required.',
  });

const listApartmentsSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(10),
  search: z.string().trim().max(100).default(''),
  floorId: z.string().trim().min(1).optional(),
});

module.exports = {
  apartmentStatuses,
  apartmentTypes,
  createApartmentSchema,
  listApartmentsSchema,
  updateApartmentSchema,
};
