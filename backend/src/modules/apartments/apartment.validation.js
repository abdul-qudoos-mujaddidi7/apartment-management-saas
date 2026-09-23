const { z } = require('zod');

const apartmentTypes = [
  'RESIDENTIAL',
  'COMMERCIAL',
  'OFFICE',
  'OTHER',
];

const apartmentStatuses = ['AVAILABLE', 'OCCUPIED', 'RESERVED', 'MAINTENANCE', 'INACTIVE'];

const apartmentSpaceSchema = z.object({
  name: z.string().trim().min(1, 'Space name is required.').max(100),
  quantity: z.coerce.number().int().min(1, 'Quantity must be at least 1.').max(1000),
});

const spacesSchema = z.array(apartmentSpaceSchema).max(50).superRefine((spaces, context) => {
  const names = new Map();
  spaces.forEach((space, index) => {
    const normalizedName = space.name.trim().toLocaleLowerCase('en-US');
    if (names.has(normalizedName)) {
      context.addIssue({
        code: 'custom',
        path: [index, 'name'],
        message: 'This space already exists.',
      });
    } else {
      names.set(normalizedName, index);
    }
  });
});

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
  bedrooms: z.coerce.number().int().min(0).max(100),
  bathrooms: z.coerce.number().int().min(0).max(100),
  spaces: spacesSchema.optional(),
  monthlyRent: z.coerce.number().min(0).max(1000000000),
  /*
   * The currency the rent is stated in. Empty or absent means the organization's
   * reporting currency, so a client that does not send one keeps working; the
   * service rejects a code the organization does not trade in.
   */
  rentCurrency: z.preprocess(
    (value) => (value === '' || value === null || value === undefined
      ? undefined
      : String(value).trim().toUpperCase()),
    z.string().regex(/^[A-Z]{3}$/, 'Use a three-letter currency code such as USD.').optional(),
  ),
  status: z.enum(apartmentStatuses),
};

/*
 * The defaults belong to a *new* apartment. They are applied here and not in
 * `apartmentFields`, because Zod fills a default in even when the field is
 * absent after `.partial()` — so a partial update would reset every defaulted
 * field, and renaming an apartment zeroed its rent, bedrooms and bathrooms.
 */
const createApartmentSchema = z.object({
  ...apartmentFields,
  bedrooms: apartmentFields.bedrooms.default(0),
  bathrooms: apartmentFields.bathrooms.default(0),
  monthlyRent: apartmentFields.monthlyRent.default(0),
  status: apartmentFields.status.default('AVAILABLE'),
});

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
  status: z.enum(apartmentStatuses).optional(),
});

module.exports = {
  apartmentStatuses,
  apartmentTypes,
  createApartmentSchema,
  listApartmentsSchema,
  updateApartmentSchema,
};
