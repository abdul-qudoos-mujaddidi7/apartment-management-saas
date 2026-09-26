const { z } = require('zod');

const { uploadUrlSchema } = require('../uploads/upload.validation');
const { CONTRACT_LANGUAGES, PLACEHOLDER_TOKENS } = require('./lease-contract.placeholders');

const PLACEHOLDER_SET = new Set(PLACEHOLDER_TOKENS);
const TOKEN_PATTERN = /\{\{\s*([A-Za-z0-9_]+(?:\.[A-Za-z0-9_]+)*)\s*\}\}/g;

/** A blank optional input becomes NULL in MySQL rather than an empty string. */
const optionalText = (max) =>
  z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? null : value),
    z.string().trim().max(max).nullable().optional(),
  );

/** A title that is either absent (keep what is stored) or a real, non-empty one. */
const optionalTitle = () =>
  z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
    z.string().trim().min(1).max(191).optional(),
  );

/**
 * Every `{{token}}` in a piece of contract text has to be one the contract can
 * resolve, so a typo is refused while the text is still being written rather
 * than discovered as a visible `{{typo}}` in a signed contract.
 */
function usesOnlyKnownPlaceholders(value) {
  if (typeof value !== 'string') return true;

  for (const match of value.matchAll(TOKEN_PATTERN)) {
    if (!PLACEHOLDER_SET.has(match[1])) return false;
  }
  return true;
}

/**
 * A section of the document's own body: the statement of tenancy, the condition
 * the unit is handed over in, the notes, and the two headings above them.
 *
 * Blank is a real value here, not a cleared field — it is how an office says it
 * wants no such section — so an empty string is stored as it arrives, while a
 * column left NULL still means the shipped wording. See `sectionWording` in the
 * service for the three states a column can be in.
 */
const sectionText = (max) =>
  z
    .string()
    .trim()
    .max(max)
    .refine(usesOnlyKnownPlaceholders, {
      message: 'This text uses a placeholder the contract cannot resolve.',
    })
    .optional();

const contractLanguageSchema = z.enum(CONTRACT_LANGUAGES);

const contractSettingFields = {
  officeName: optionalText(191),
  // The office's own address, which is never the building's — the two are
  // separate columns because they are separate facts.
  officeAddress: optionalText(1000),
  officePhone: optionalText(64),
  officeEmail: z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? null : value),
    z.string().trim().email().max(191).nullable().optional(),
  ),
  licenseNumber: optionalText(191),
  logoUrl: uploadUrlSchema,

  defaultLanguage: contractLanguageSchema.optional(),

  titleEn: optionalTitle(),
  titleFa: optionalTitle(),
  titlePs: optionalTitle(),

  // The body of the document itself. Long enough for several paragraphs, and
  // multi-line: the notes are one note per line.
  preambleEn: sectionText(20000),
  preambleFa: sectionText(20000),
  preamblePs: sectionText(20000),
  inventoryEn: sectionText(20000),
  inventoryFa: sectionText(20000),
  inventoryPs: sectionText(20000),
  notesEn: sectionText(20000),
  notesFa: sectionText(20000),
  notesPs: sectionText(20000),
  termsTitleEn: sectionText(191),
  termsTitleFa: sectionText(191),
  termsTitlePs: sectionText(191),
  notesTitleEn: sectionText(191),
  notesTitleFa: sectionText(191),
  notesTitlePs: sectionText(191),

  lessorName: optionalText(191),
  lessorPhone: optionalText(64),
  lessorNationalId: optionalText(64),
  lessorAddress: optionalText(1000),
  lessorPhotoUrl: uploadUrlSchema,

  contractNumberPrefix: optionalText(32),
  footerText: optionalText(2000),

  lessorSignatureLabel: optionalText(191),
  tenantSignatureLabel: optionalText(191),
  witnessSignatureLabel: optionalText(191),

  showTenantPhoto: z.boolean().optional(),
  showLessorPhoto: z.boolean().optional(),
};

const updateContractSettingsSchema = z
  .object(contractSettingFields)
  .partial()
  .refine((data) => Object.keys(data).length > 0, { message: 'At least one field is required.' });

/**
 * Clause text may name placeholders, and only placeholders this application can
 * resolve. An unknown one is refused when the clause is saved rather than left
 * to surface later as a visible `{{typo}}` in a printed contract.
 */
const clauseBody = (max) =>
  z
    .string()
    .trim()
    .min(1, 'A clause needs text.')
    .max(max)
    .refine(usesOnlyKnownPlaceholders, {
      message: 'This clause uses a placeholder the contract cannot resolve.',
    });

const optionalClauseBody = (max) =>
  z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? null : value),
    clauseBody(max).nullable().optional(),
  );

const clauseFields = {
  titleEn: optionalText(191),
  titleFa: optionalText(191),
  titlePs: optionalText(191),
  bodyEn: clauseBody(8000),
  bodyFa: optionalClauseBody(8000),
  bodyPs: optionalClauseBody(8000),
  sortOrder: z.coerce.number().int().min(0).max(9999).optional(),
  isEnabled: z.boolean().optional(),
};

const createClauseSchema = z.object(clauseFields);

// `bodyEn` is never nullable on update either: it is the column the other two
// languages fall back to, so it can be rewritten but never emptied.
const updateClauseSchema = z
  .object({ ...clauseFields, bodyEn: clauseBody(8000).optional() })
  .partial()
  .refine((data) => Object.keys(data).length > 0, { message: 'At least one field is required.' });

/** The whole display order in one request, so two saves cannot interleave. */
const clauseOrderSchema = z.object({
  order: z.array(z.string().trim().min(1)).min(1).max(500),
});

const clauseIdParamsSchema = z.object({ id: z.string().trim().min(1) });

const leaseParamsSchema = z.object({ leaseId: z.string().trim().min(1) });

/**
 * The wording the printed document puts around the data.
 *
 * The API keeps no translation table of its own: the document is drawn from the
 * same dictionaries the interface uses, and the browser — which already has
 * them — sends the words with the request.
 *
 * That is safe because these are words, not data: they name the fields, they
 * never decide what a field holds. Every one of them is escaped on the way into
 * the document (see `lease-contract.document.js`), and a listed set of keys
 * means a client cannot propose a label the document has nowhere to place.
 */
const documentLabel = z.string().trim().max(200);

/**
 * Every string the document prints that is not data and not a stored template:
 * the field captions, the section headings of the surrounding chrome, and the
 * words on the signature lines.
 *
 * The set is closed, so a client cannot propose a label the document has nowhere
 * to place. The three signature captions are the fallback for an office that has
 * not written its own — a Dari contract names its signers in Dari either way.
 *
 * The document is a *form*: it is laid out in sections, and each section is
 * captioned. Those captions arrive with the request for the same reason the
 * others do — the API keeps no translation table, and the browser already holds
 * the dictionaries — and are escaped on the way into the markup like every other
 * value.
 */
const documentLabelsSchema = z.object({
  /* The parties, and the terms the document states about them. */
  lessor: documentLabel,
  tenant: documentLabel,
  leaseStartDate: documentLabel,
  startDate: documentLabel,
  endDate: documentLabel,
  period: documentLabel,
  months: documentLabel,
  securityDeposit: documentLabel,

  /* The unit. */
  building: documentLabel,
  buildingAddress: documentLabel,
  /* How one language separates the parts of a list — `،` in Dari and Pashto,
     `,` in English. It is a word the document prints, so it travels with the
     words rather than being guessed from the language code in two places. */
  addressSeparator: documentLabel,
  floor: documentLabel,
  apartmentNumber: documentLabel,
  area: documentLabel,
  bedrooms: documentLabel,
  bathrooms: documentLabel,

  /* The section headings. */
  premisesTitle: documentLabel,
  premisesHint: documentLabel,
  statementTitle: documentLabel,
  rentScheduleTitle: documentLabel,
  utilitiesTitle: documentLabel,
  termTitle: documentLabel,
  maintenanceTitle: documentLabel,
  signaturesTitle: documentLabel,

  /* The rent schedule, and the charges the unit carries. */
  month: documentLabel,
  rentAmount: documentLabel,
  dueDate: documentLabel,
  paymentStatus: documentLabel,
  service: documentLabel,
  paidBy: documentLabel,
  serviceFee: documentLabel,
  utilities: z.object({
    ELECTRICITY: documentLabel,
    WATER: documentLabel,
    GAS: documentLabel,
  }),

  /* How a billed month stands, as the workspace's own invoice statuses. */
  invoiceStatuses: z.object({
    UNPAID: documentLabel,
    PARTIALLY_PAID: documentLabel,
    PAID: documentLabel,
    OVERDUE: documentLabel,
    CANCELLED: documentLabel,
  }),

  /* The document's own identity, and the words on its signature lines. */
  contractNumber: documentLabel,
  issuedOn: documentLabel,
  lessorSignature: documentLabel,
  tenantSignature: documentLabel,
  witnessSignature: documentLabel,
  officeAddress: documentLabel,
  lessorPhoto: documentLabel,
  tenantPhoto: documentLabel,
  logo: documentLabel,
  signatureName: documentLabel,
  stamp: documentLabel,
  notes: documentLabel,
});

const contractPdfSchema = z.object({
  language: contractLanguageSchema.optional(),
  disposition: z.enum(['inline', 'attachment']).default('inline'),
  labels: documentLabelsSchema,
});

module.exports = {
  clauseIdParamsSchema,
  clauseOrderSchema,
  contractLanguageSchema,
  contractPdfSchema,
  contractSettingFields,
  createClauseSchema,
  leaseParamsSchema,
  updateClauseSchema,
  updateContractSettingsSchema,
};
