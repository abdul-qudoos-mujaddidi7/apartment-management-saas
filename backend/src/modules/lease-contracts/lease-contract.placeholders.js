/**
 * The placeholders a contract clause may carry, and the only way one is ever
 * replaced.
 *
 * A clause is written once, in Settings, and printed for every lease, so it has
 * to be able to name things it cannot know at the time it is written:
 * `{{tenant.fullName}}`, `{{lease.monthlyRent}}`, `{{building.address}}`.
 *
 * Three rules hold this together:
 *
 *   1. The vocabulary below is closed. A token outside it is never resolved —
 *      it is reported instead, so a typo shows up as a visible `{{typo}}` in the
 *      preview rather than as a silently blank term in a signed contract.
 *   2. Values come from the lease's own records, read under the authenticated
 *      organization, never from the request.
 *   3. The result is plain text. It is handed to the browser as a JSON string
 *      and drawn with a text interpolation, so a value containing `<` or a
 *      script tag is displayed, not executed — nothing here is ever HTML.
 */

/** The languages a contract is printed in — the frontend's own locale codes. */
const CONTRACT_LANGUAGES = ['en', 'fa', 'ps'];

/**
 * Every token a clause may use, grouped as the settings page lists them. The
 * label is what the help panel shows beside the token.
 */
const PLACEHOLDER_GROUPS = [
  {
    key: 'tenant',
    tokens: [
      ['tenant.fullName', 'Tenant full name'],
      ['tenant.firstName', 'Tenant first name'],
      ['tenant.lastName', 'Tenant last name'],
      ['tenant.fatherName', 'Tenant father name'],
      ['tenant.phone', 'Tenant phone'],
      ['tenant.alternatePhone', 'Tenant alternate phone'],
      ['tenant.email', 'Tenant email'],
      ['tenant.nationalId', 'Tenant national ID'],
      ['tenant.address', 'Tenant address'],
      ['tenant.emergencyContactName', 'Emergency contact name'],
      ['tenant.emergencyContactPhone', 'Emergency contact phone'],
    ],
  },
  {
    key: 'lease',
    tokens: [
      ['lease.contractNumber', 'Contract number'],
      ['lease.startDate', 'Lease start date'],
      ['lease.endDate', 'Lease end date'],
      ['lease.monthlyRent', 'Monthly rent'],
      ['lease.securityDeposit', 'Security deposit'],
      ['lease.serviceFee', 'Monthly service fee'],
      ['lease.paymentDueDay', 'Payment due day'],
      ['lease.durationMonths', 'Lease length in months'],
      ['lease.currency', 'Rent currency'],
      ['lease.status', 'Lease status'],
    ],
  },
  {
    key: 'apartment',
    tokens: [
      ['apartment.apartmentNumber', 'Apartment number'],
      ['apartment.name', 'Apartment name'],
      ['apartment.type', 'Apartment type'],
      ['apartment.area', 'Area'],
      ['apartment.bedrooms', 'Bedrooms'],
      ['apartment.bathrooms', 'Bathrooms'],
    ],
  },
  {
    key: 'building',
    tokens: [
      ['building.name', 'Building name'],
      ['building.code', 'Building code'],
      ['building.address', 'Building address'],
      ['floor.name', 'Floor name'],
      ['floor.floorNumber', 'Floor number'],
    ],
  },
  {
    key: 'contract',
    tokens: [
      ['organization.name', 'Organization name'],
      ['contract.officeName', 'Office / business name'],
      ['contract.officeAddress', 'Office address'],
      ['contract.officePhone', 'Office phone'],
      ['contract.officeEmail', 'Office email'],
      ['contract.licenseNumber', 'License / registration number'],
      ['contract.lessorName', 'Lessor / owner name'],
      ['contract.lessorPhone', 'Lessor / owner phone'],
      ['contract.lessorNationalId', 'Lessor / owner national ID'],
      ['contract.lessorAddress', 'Lessor / owner address'],
    ],
  },
];

/** The flat allowlist the resolver checks a token against. */
const PLACEHOLDER_TOKENS = PLACEHOLDER_GROUPS.flatMap((group) =>
  group.tokens.map(([token]) => token),
);

const TOKEN_SET = new Set(PLACEHOLDER_TOKENS);

/**
 * `{{ token }}`, with optional inner whitespace. A token is a dotted path of
 * letters, digits and underscores — deliberately narrow, so a stray `{{` in
 * ordinary prose cannot swallow a whole paragraph.
 */
const TOKEN_PATTERN = /\{\{\s*([A-Za-z0-9_]+(?:\.[A-Za-z0-9_]+)*)\s*\}\}/g;

/** Every token a piece of text names, in order, with duplicates removed. */
function tokensIn(text) {
  if (typeof text !== 'string' || !text) return [];

  const found = new Set();
  for (const match of text.matchAll(TOKEN_PATTERN)) found.add(match[1]);
  return [...found];
}

/**
 * The tokens a piece of text names that this application does not know. These
 * are what a save reports back to the settings page and what a contract lists,
 * so the mistake is visible while the document can still be fixed.
 */
function unknownTokens(text) {
  return tokensIn(text).filter((token) => !TOKEN_SET.has(token));
}

/**
 * Every unknown token across a set of clause rows, for one language — used when
 * a clause is saved so the warning names the language it is in.
 */
function unknownTokensInClauses(clauses, language) {
  const unknown = new Set();
  for (const clause of clauses) {
    for (const token of unknownTokens(clauseText(clause, language))) unknown.add(token);
  }
  return [...unknown];
}

/**
 * A stored translation is only a translation if it says something: a value that
 * is absent, or holds nothing but whitespace, falls through to the next one.
 */
function firstText(...candidates) {
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim() !== '') return candidate;
  }
  return '';
}

/** The text of one clause in one language, with the English body as fallback. */
function clauseText(clause, language) {
  if (!clause) return '';
  if (language === 'fa') return firstText(clause.bodyFa, clause.bodyEn);
  if (language === 'ps') return firstText(clause.bodyPs, clause.bodyEn);
  return firstText(clause.bodyEn);
}

/** The title of one clause in one language, with the English title as fallback. */
function clauseTitle(clause, language) {
  if (!clause) return '';
  if (language === 'fa') return firstText(clause.titleFa, clause.titleEn);
  if (language === 'ps') return firstText(clause.titlePs, clause.titleEn);
  return firstText(clause.titleEn);
}

/**
 * Replace every known token with its value.
 *
 * A token with no value is left in place rather than blanked, for the same
 * reason an unknown one is: an empty gap in a contract reads as a term that was
 * omitted on purpose, while a visible token reads as a term that still has to be
 * filled in.
 */
function renderText(text, values) {
  if (typeof text !== 'string' || !text) return '';

  return text.replace(TOKEN_PATTERN, (whole, token) => {
    const value = values?.[token];
    if (value === undefined || value === null || value === '') return whole;
    return String(value);
  });
}

module.exports = {
  CONTRACT_LANGUAGES,
  PLACEHOLDER_GROUPS,
  PLACEHOLDER_TOKENS,
  clauseText,
  clauseTitle,
  renderText,
  tokensIn,
  unknownTokens,
  unknownTokensInClauses,
};
