const prisma = require('../../lib/prisma');

const AppError = require('../../errors/AppError');
const {
  AFGHAN_MONTH_NAMES,
  MONTH_NAMES,
  shamsiMonthKey,
  shamsiMonthLength,
  shamsiToDate,
  toShamsi,
} = require('../../lib/shamsi');
const { removeUpload } = require('../../lib/uploads');
const { DEFAULT_CLAUSES, DEFAULT_SETTINGS } = require('./lease-contract.defaults');
const { formatDate, formatMoney, formatNumber, monthCount, optionalNumber, optionalText } = require('./lease-contract.format');
const {
  CONTRACT_LANGUAGES,
  PLACEHOLDER_GROUPS,
  clauseText,
  clauseTitle,
  renderText,
  tokensIn,
  unknownTokens,
} = require('./lease-contract.placeholders');

/**
 * The lease contract (قرارداد کرایه‌نامه) and the settings it is built from.
 *
 * Everything a contract prints falls into one of two kinds:
 *
 *   * the tenancy itself — the tenant, the apartment, the building, the lease
 *     terms — which is read from the records that own it, so a contract can
 *     never disagree with the lease it describes; and
 *   * the wording around it — the office header, the lessor, the title and the
 *     clauses — which lives in `LeaseContractSetting` and `LeaseContractClause`,
 *     one set per organization.
 *
 * Every function here takes the authenticated `organizationId` as its first
 * argument and puts it in the `where` clause. No caller may pass one in from a
 * request, and none of these functions would accept it if they did.
 */

const clauseSelect = {
  id: true,
  sortOrder: true,
  isEnabled: true,
  titleEn: true,
  titleFa: true,
  titlePs: true,
  bodyEn: true,
  bodyFa: true,
  bodyPs: true,
  createdAt: true,
  updatedAt: true,
};

const clauseOrder = [{ sortOrder: 'asc' }, { createdAt: 'asc' }];

/* Organizations created before the narrative contract shipped can still carry
   the original ten generic clauses and title. Present the new six-clause legal
   form without rewriting their database rows; a later migration can retire the
   old stock records, while anything the office actually customized is kept. */
const LEGACY_CLAUSE_TITLES = [
  'Rent payment',
  'Security deposit',
  'Utilities and service fees',
  'Maintenance and repairs',
  'Use of the apartment',
  'Subleasing',
  'Termination',
  'Handover of the apartment',
  'Dispute resolution',
  'Signatures',
];

const LEGACY_TITLES = {
  en: 'Lease Agreement',
  fa: 'قرارداد کرایه‌نامه',
  ps: 'د کرایې تړون',
};

function clausesForDocument(clauses) {
  const isLegacySet = clauses.length === LEGACY_CLAUSE_TITLES.length
    && clauses.every((clause, index) => clause.titleEn === LEGACY_CLAUSE_TITLES[index]);

  if (!isLegacySet) return clauses;

  return DEFAULT_CLAUSES.map((clause, index) => ({
    id: `default-contract-clause-${index + 1}`,
    sortOrder: index,
    isEnabled: true,
    ...clause,
  }));
}

function documentTitle(setting, language) {
  const column = `title${SECTION_SUFFIX[language]}`;
  const stored = setting[column];
  if (!stored || stored === LEGACY_TITLES[language]) return DEFAULT_SETTINGS[column];
  return stored;
}

/** The column each language of a templated section lives in. */
const SECTION_SUFFIX = { en: 'En', fa: 'Fa', ps: 'Ps' };

/**
 * The three texts the document is made of, around the numbered conditions.
 *
 *   * `preamble`  — the statement of tenancy;
 *   * `inventory` — the condition the unit is handed over in;
 *   * `notes`     — one note per line, numbered by the document.
 *
 * `termsTitle` and `notesTitle` head the two lists and are plain text.
 */
const CONTRACT_SECTIONS = ['preamble', 'inventory', 'termsTitle', 'notesTitle', 'notes'];

/**
 * One section's wording, in one language.
 *
 * A column can be in three states and they mean three different things:
 *
 *   * NULL — never written, so the shipped default is printed;
 *   * `''` — the office emptied it on purpose, so the section is left out;
 *   * anything else — exactly what the office wrote.
 *
 * The distinction matters because these are the document's own words. An office
 * that does not want a statement of tenancy should not have one appear back on
 * the next save just because the field was blank.
 */
function sectionWording(setting, section, language) {
  const column = `${section}${SECTION_SUFFIX[language]}`;
  const stored = setting?.[column];
  if (stored !== null && stored !== undefined) return stored;

  const fallback = DEFAULT_SETTINGS[column] ?? DEFAULT_SETTINGS[`${section}En`];
  return typeof fallback === 'string' ? fallback : '';
}

/**
 * The organization's settings row, created on first use.
 *
 * Same shape as the currency catalogue's own lazy initialization: the first read
 * or write makes sure the row exists, the `organizationId` unique index decides
 * which of two concurrent first requests wins, and the loser re-reads. Seeding
 * the default clauses happens here — and only here — so an organization that has
 * already edited its clauses never has them re-created underneath it.
 */
async function ensureSettings(organizationId) {
  const existing = await prisma.leaseContractSetting.findUnique({
    where: { organizationId },
    select: { id: true },
  });
  if (existing) return existing;

  try {
    return await prisma.$transaction(async (tx) => {
      // An organization that does not exist cannot own a settings row. The
      // foreign key would refuse the insert anyway, but as a 500; this answers
      // with the same 401 the currency catalogue gives.
      const organization = await tx.organization.findFirst({
        where: { id: organizationId, deletedAt: null },
        select: { id: true },
      });
      if (!organization) throw new AppError('Invalid organization.', 401, 'INVALID_ORGANIZATION');

      const created = await tx.leaseContractSetting.create({
        data: { organizationId, ...DEFAULT_SETTINGS },
        select: { id: true },
      });

      await tx.leaseContractClause.createMany({
        data: DEFAULT_CLAUSES.map((clause, index) => ({
          organizationId,
          sortOrder: index,
          isEnabled: true,
          titleEn: clause.titleEn,
          titleFa: clause.titleFa,
          titlePs: clause.titlePs,
          bodyEn: clause.bodyEn,
          bodyFa: clause.bodyFa,
          bodyPs: clause.bodyPs,
        })),
      });

      return created;
    });
  } catch (error) {
    // Two first requests raced; the unique index kept one and this one re-reads.
    if (error.code !== 'P2002') throw error;

    const raced = await prisma.leaseContractSetting.findUnique({
      where: { organizationId },
      select: { id: true },
    });
    if (!raced) throw error;
    return raced;
  }
}

/**
 * The shipped conditions, written into an organization that has none.
 *
 * `ensureSettings` seeds them with the settings row, which covers a new
 * organization. This covers the other case: an organization whose conditions were
 * retired by a release — the ones that shipped before the document was written
 * out in full — and which would otherwise be left with no terms at all until
 * somebody retyped them.
 *
 * Two simultaneous first reads can both find the list empty and both seed. The
 * cost is a duplicated set of conditions in the settings list, where they can be
 * deleted; the alternative, a unique constraint on clause text, is worse.
 */
async function ensureClauses(organizationId) {
  const live = await prisma.leaseContractClause.count({
    where: { organizationId, deletedAt: null },
  });
  if (live > 0) return;

  await prisma.leaseContractClause.createMany({
    data: DEFAULT_CLAUSES.map((clause, index) => ({
      organizationId,
      sortOrder: index,
      isEnabled: true,
      titleEn: clause.titleEn,
      titleFa: clause.titleFa,
      titlePs: clause.titlePs,
      bodyEn: clause.bodyEn,
      bodyFa: clause.bodyFa,
      bodyPs: clause.bodyPs,
    })),
  });
}

/** The stored settings row in the shape the settings form edits. */
async function getSettings(organizationId) {
  await ensureSettings(organizationId);
  await ensureClauses(organizationId);
  await ensureClauses(organizationId);

  const [setting, clauses] = await Promise.all([
    prisma.leaseContractSetting.findUnique({ where: { organizationId } }),
    prisma.leaseContractClause.findMany({
      where: { organizationId, deletedAt: null },
      select: clauseSelect,
      orderBy: clauseOrder,
    }),
  ]);

  return {
    settings: shapeSettings(setting),
    clauses: clauses.map(shapeClause),
    placeholders: PLACEHOLDER_GROUPS,
    languages: CONTRACT_LANGUAGES,
  };
}

function shapeSettings(setting) {
  return {
    officeName: setting.officeName,
    officeAddress: setting.officeAddress,
    officePhone: setting.officePhone,
    officeEmail: setting.officeEmail,
    licenseNumber: setting.licenseNumber,
    logoUrl: setting.logoUrl,

    defaultLanguage: setting.defaultLanguage,

    titleEn: setting.titleEn,
    titleFa: setting.titleFa,
    titlePs: setting.titlePs,

    // The body of the document. A NULL column is sent as the wording that will
    // actually be printed for it, so the form opens on the real text rather than
    // on an empty box that means something different from blank.
    preambleEn: sectionWording(setting, 'preamble', 'en'),
    preambleFa: sectionWording(setting, 'preamble', 'fa'),
    preamblePs: sectionWording(setting, 'preamble', 'ps'),
    inventoryEn: sectionWording(setting, 'inventory', 'en'),
    inventoryFa: sectionWording(setting, 'inventory', 'fa'),
    inventoryPs: sectionWording(setting, 'inventory', 'ps'),
    notesEn: sectionWording(setting, 'notes', 'en'),
    notesFa: sectionWording(setting, 'notes', 'fa'),
    notesPs: sectionWording(setting, 'notes', 'ps'),
    termsTitleEn: sectionWording(setting, 'termsTitle', 'en'),
    termsTitleFa: sectionWording(setting, 'termsTitle', 'fa'),
    termsTitlePs: sectionWording(setting, 'termsTitle', 'ps'),
    notesTitleEn: sectionWording(setting, 'notesTitle', 'en'),
    notesTitleFa: sectionWording(setting, 'notesTitle', 'fa'),
    notesTitlePs: sectionWording(setting, 'notesTitle', 'ps'),

    lessorName: setting.lessorName,
    lessorPhone: setting.lessorPhone,
    lessorNationalId: setting.lessorNationalId,
    lessorAddress: setting.lessorAddress,
    lessorPhotoUrl: setting.lessorPhotoUrl,

    contractNumberPrefix: setting.contractNumberPrefix,
    footerText: setting.footerText,

    lessorSignatureLabel: setting.lessorSignatureLabel,
    tenantSignatureLabel: setting.tenantSignatureLabel,
    witnessSignatureLabel: setting.witnessSignatureLabel,

    showTenantPhoto: setting.showTenantPhoto,
    showLessorPhoto: setting.showLessorPhoto,

    updatedAt: setting.updatedAt,
  };
}

function shapeClause(clause) {
  return {
    id: clause.id,
    sortOrder: clause.sortOrder,
    isEnabled: clause.isEnabled,
    titleEn: clause.titleEn,
    titleFa: clause.titleFa,
    titlePs: clause.titlePs,
    bodyEn: clause.bodyEn,
    bodyFa: clause.bodyFa,
    bodyPs: clause.bodyPs,
    createdAt: clause.createdAt,
    updatedAt: clause.updatedAt,
  };
}

/** The document fields a replaced upload is retired from, once the row moved on. */
const settingDocumentFields = ['logoUrl', 'lessorPhotoUrl'];

async function updateSettings(organizationId, data) {
  await ensureSettings(organizationId);

  const previous = await prisma.leaseContractSetting.findUnique({ where: { organizationId } });

  const setting = await prisma.leaseContractSetting.update({
    where: { organizationId },
    data,
  });

  // A replaced logo or lessor photo is deleted from disk, and only if the row is
  // no longer pointing at it — re-sending an unchanged form changes nothing.
  for (const field of settingDocumentFields) {
    if (!(field in data)) continue;
    const stored = previous?.[field];
    if (!stored || stored === data[field]) continue;
    removeUpload(stored);
  }

  return shapeSettings(setting);
}

async function listClauses(organizationId) {
  const clauses = await prisma.leaseContractClause.findMany({
    where: { organizationId, deletedAt: null },
    select: clauseSelect,
    orderBy: clauseOrder,
  });

  return clauses.map(shapeClause);
}

async function getClause(organizationId, clauseId) {
  const clause = await prisma.leaseContractClause.findFirst({
    where: { id: clauseId, organizationId, deletedAt: null },
    select: clauseSelect,
  });

  if (!clause) throw new AppError('Clause not found.', 404, 'CONTRACT_CLAUSE_NOT_FOUND');
  return clause;
}

/** New clauses land at the bottom, unless the caller says otherwise. */
async function nextSortOrder(organizationId) {
  const last = await prisma.leaseContractClause.findFirst({
    where: { organizationId, deletedAt: null },
    select: { sortOrder: true },
    orderBy: { sortOrder: 'desc' },
  });

  return last ? last.sortOrder + 1 : 0;
}

/**
 * The tokens a clause names that the contract cannot resolve. Reported back on
 * save so a typo is corrected while the clause is still being written.
 */
function unresolvedTokens(clause) {
  const unknown = new Set();
  for (const language of CONTRACT_LANGUAGES) {
    for (const token of unknownTokens(clauseText(clause, language))) unknown.add(token);
  }
  return [...unknown];
}

async function createClause(organizationId, data) {
  await ensureSettings(organizationId);

  const clause = await prisma.leaseContractClause.create({
    data: {
      ...data,
      sortOrder: data.sortOrder ?? (await nextSortOrder(organizationId)),
      organizationId,
    },
    select: clauseSelect,
  });

  return { clause: shapeClause(clause), unknownPlaceholders: unresolvedTokens(clause) };
}

async function updateClause(organizationId, clauseId, data) {
  const result = await prisma.leaseContractClause.updateMany({
    where: { id: clauseId, organizationId, deletedAt: null },
    data,
  });

  if (result.count === 0) throw new AppError('Clause not found.', 404, 'CONTRACT_CLAUSE_NOT_FOUND');

  const clause = await getClause(organizationId, clauseId);
  return { clause: shapeClause(clause), unknownPlaceholders: unresolvedTokens(clause) };
}

async function deleteClause(organizationId, clauseId) {
  const result = await prisma.leaseContractClause.updateMany({
    where: { id: clauseId, organizationId, deletedAt: null },
    data: { deletedAt: new Date() },
  });

  if (result.count === 0) throw new AppError('Clause not found.', 404, 'CONTRACT_CLAUSE_NOT_FOUND');
  return { id: clauseId };
}

/**
 * Rewrite the display order from a whole list of ids, so the order that arrives
 * is the order that is stored — no read-modify-write that two saves could
 * interleave. An id that is not one of this organization's clauses fails the
 * request rather than being skipped.
 */
async function reorderClauses(organizationId, order) {
  const owned = await prisma.leaseContractClause.count({
    where: { id: { in: order }, organizationId, deletedAt: null },
  });

  if (owned !== order.length) {
    throw new AppError('That list does not match this organization’s clauses.', 400, 'CONTRACT_CLAUSE_ORDER_INVALID');
  }

  await prisma.$transaction(
    order.map((id, index) =>
      prisma.leaseContractClause.updateMany({
        where: { id, organizationId, deletedAt: null },
        data: { sortOrder: index },
      }),
    ),
  );

  return listClauses(organizationId);
}

/** The lease, with everything a contract prints, or a 404. */
async function loadLeaseForContract(organizationId, leaseId) {
  const lease = await prisma.lease.findFirst({
    where: {
      id: leaseId,
      organizationId,
      deletedAt: null,
      // A contract is only ever issued for a tenancy that still exists: a
      // soft-deleted tenant, apartment, floor or building must not print.
      tenant: { deletedAt: null },
      apartment: {
        deletedAt: null,
        floor: { deletedAt: null, building: { organizationId, deletedAt: null } },
      },
    },
    select: {
      id: true,
      contractNumber: true,
      startDate: true,
      endDate: true,
      monthlyRent: true,
      securityDeposit: true,
      currency: true,
      securityDepositCurrency: true,
      serviceFee: true,
      serviceFeeCurrency: true,
      paymentDueDay: true,
      status: true,
      notes: true,
      tenant: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          phone: true,
          alternatePhone: true,
          email: true,
          nationalId: true,
          fatherName: true,
          address: true,
          emergencyContactName: true,
          emergencyContactPhone: true,
          photoUrl: true,
          idCardFrontUrl: true,
          status: true,
        },
      },
      apartment: {
        select: {
          id: true,
          apartmentNumber: true,
          name: true,
          type: true,
          area: true,
          bedrooms: true,
          bathrooms: true,
          // The meters the unit is fitted with, which is what the contract's
          // utility table is drawn from: a utility that is not metered is not
          // charged per unit, so it has no row to print.
          meters: {
            where: { deletedAt: null, status: 'ACTIVE' },
            select: { utilityType: true, unit: true, defaultUnitPrice: true },
            orderBy: { utilityType: 'asc' },
          },
          floor: {
            select: {
              id: true,
              name: true,
              floorNumber: true,
              building: { select: { id: true, name: true, code: true, address: true } },
            },
          },
        },
      },
    },
  });

  if (!lease) throw new AppError('Lease not found.', 404, 'LEASE_NOT_FOUND');
  return lease;
}

/** `DBA-` + `1001` → `DBA-1001`; a number that already carries its prefix is left alone. */
function numberedContract(contractNumber, prefix) {
  const clean = optionalText(prefix);
  if (!clean) return contractNumber;
  return contractNumber.startsWith(clean) ? contractNumber : `${clean}${contractNumber}`;
}

/**
 * Everything a `{{token}}` may resolve to, taken from this lease's own records
 * and the organization's contract settings — never from the request.
 */
function contractValues({ organization, setting, lease }) {
  const tenant = lease.tenant;
  const apartment = lease.apartment;
  const building = apartment.floor.building;
  const duration = monthCount(lease.startDate, lease.endDate);

  return {
    'organization.name': organization.name,

    'contract.officeName': optionalText(setting.officeName),
    'contract.officeAddress': optionalText(setting.officeAddress),
    'contract.officePhone': optionalText(setting.officePhone),
    'contract.officeEmail': optionalText(setting.officeEmail),
    'contract.licenseNumber': optionalText(setting.licenseNumber),
    'contract.lessorName': optionalText(setting.lessorName),
    'contract.lessorPhone': optionalText(setting.lessorPhone),
    'contract.lessorNationalId': optionalText(setting.lessorNationalId),
    'contract.lessorAddress': optionalText(setting.lessorAddress),

    'tenant.fullName': `${tenant.firstName} ${tenant.lastName}`.trim(),
    'tenant.firstName': tenant.firstName,
    'tenant.lastName': tenant.lastName,
    'tenant.fatherName': optionalText(tenant.fatherName),
    'tenant.phone': tenant.phone,
    'tenant.alternatePhone': optionalText(tenant.alternatePhone),
    'tenant.email': optionalText(tenant.email),
    'tenant.nationalId': optionalText(tenant.nationalId),
    'tenant.address': optionalText(tenant.address),
    'tenant.emergencyContactName': optionalText(tenant.emergencyContactName),
    'tenant.emergencyContactPhone': optionalText(tenant.emergencyContactPhone),

    'lease.contractNumber': numberedContract(lease.contractNumber, setting.contractNumberPrefix),
    'lease.startDate': formatDate(lease.startDate),
    'lease.endDate': formatDate(lease.endDate),
    'lease.monthlyRent': formatMoney(lease.monthlyRent, lease.currency),
    'lease.securityDeposit': formatMoney(
      lease.securityDeposit,
      lease.securityDepositCurrency || lease.currency,
    ),
    'lease.serviceFee': formatMoney(lease.serviceFee, lease.serviceFeeCurrency || lease.currency),
    'lease.paymentDueDay': String(lease.paymentDueDay),
    'lease.durationMonths': duration === null ? null : String(duration),
    'lease.currency': lease.currency,
    'lease.status': lease.status,

    'apartment.apartmentNumber': apartment.apartmentNumber,
    'apartment.name': apartment.name,
    'apartment.type': apartment.type,
    'apartment.area': optionalNumber(apartment.area) === null ? null : String(apartment.area),
    'apartment.bedrooms': String(apartment.bedrooms),
    'apartment.bathrooms': String(apartment.bathrooms),

    'building.name': building.name,
    'building.code': building.code,
    'building.address': optionalText(building.address),
    'floor.name': apartment.floor.name,
    'floor.floorNumber': apartment.floor.floorNumber,
  };
}

/** One Shamsi month, named the way each language names it: `میزان 1405`. */
function monthLabel(key) {
  const match = /^(\d{4})-(\d{2})$/.exec(String(key || ''));
  const year = match ? Number(match[1]) : 0;
  const month = match ? Number(match[2]) : 0;
  if (month < 1 || month > 12) return { en: '', fa: '', ps: '' };

  return {
    en: `${MONTH_NAMES[month - 1]} ${year}`,
    fa: `${AFGHAN_MONTH_NAMES[month - 1]} ${year}`,
    ps: `${AFGHAN_MONTH_NAMES[month - 1]} ${year}`,
  };
}

/**
 * The months of the term, one row each: the month the rent falls in, the rent
 * due in it, the day it falls due, and the invoice that month has been billed
 * on — if it has been.
 *
 * The months are *Shamsi*, because that is the month the office and the tenant
 * both count in; it is the same month a meter reading is filed under, and a
 * schedule numbered in Gregorian months would disagree with every other date in
 * the workspace. The first row falls due on the lease's own start date, which is
 * the day the first month's rent is handed over, and every row after it on the
 * lease's payment day.
 *
 * An invoice is matched to a row by its own Shamsi month rather than by
 * arithmetic — the office, not the calendar, decides which month a bill was
 * raised for — and where a month has been billed more than once, the latest
 * bill is the one that speaks for it.
 */
function buildRentSchedule(lease, invoices) {
  const months = monthCount(lease.startDate, lease.endDate);
  if (!months) return [];

  const billed = new Map();
  for (const invoice of invoices) {
    const key = shamsiMonthKey(invoice.invoiceDate);
    const previous = billed.get(key);
    if (!previous || previous.invoiceDate < invoice.invoiceDate) billed.set(key, invoice);
  }

  const start = toShamsi(lease.startDate);
  if (!start) return [];

  const paymentDay = Math.max(Number(lease.paymentDueDay) || 1, 1);
  const rent = formatMoney(lease.monthlyRent, lease.currency);
  const rows = [];

  for (let index = 0; index < months; index += 1) {
    const year = start.jy + Math.floor((start.jm - 1 + index) / 12);
    const month = ((start.jm - 1 + index) % 12) + 1;
    const day = Math.min(paymentDay, shamsiMonthLength(year, month));

    // The day the rent is due, as the office would write it: the first month on
    // the day the tenancy began, every month after it on the payment day.
    const dueDate = index === 0 ? new Date(lease.startDate) : shamsiToDate(year, month, day);
    const key = shamsiMonthKey(dueDate);
    const invoice = billed.get(key);

    rows.push({
      key,
      month: monthLabel(key),
      amountLabel: rent,
      dueDateLabel: formatDate(invoice?.dueDate || dueDate),
      status: invoice ? invoice.status : null,
    });
  }

  return rows;
}

/**
 * What the unit charges month by month, and who it is charged to.
 *
 * Both kinds of row are things this application actually bills: the lease's own
 * service fee, and every meter the apartment is fitted with, at the meter's own
 * standing price per unit — the same price a reading is charged at. The payer is
 * the tenant in every row, because the tenant is who they are billed to and the
 * document prints the same word the interface uses for them.
 */
function utilityRows(lease, apartment) {
  const rows = [];

  if (Number(lease.serviceFee) > 0) {
    rows.push({
      key: 'SERVICE_FEE',
      detail: formatMoney(lease.serviceFee, lease.serviceFeeCurrency || lease.currency),
    });
  }

  for (const meter of apartment.meters) {
    const price = optionalNumber(meter.defaultUnitPrice);
    rows.push({
      key: meter.utilityType,
      detail: price === null || price === 0 ? null : `${formatNumber(price, 2)} / ${meter.unit}`,
    });
  }

  return rows;
}

/**
 * One lease's whole contract, ready to print.
 *
 * Every text that depends on the language is returned in all three at once, so
 * switching language in the preview is instant and cannot fetch a different
 * tenant's data by mistake.
 */
async function getContract(organizationId, leaseId) {
  const [organization, lease] = await Promise.all([
    prisma.organization.findFirst({
      where: { id: organizationId, deletedAt: null },
      select: { id: true, name: true },
    }),
    loadLeaseForContract(organizationId, leaseId),
  ]);

  if (!organization) throw new AppError('Invalid organization.', 401, 'INVALID_ORGANIZATION');

  // Reading the settings first guarantees a row exists, so a contract opened
  // before the settings page was ever visited still has a header and a title.
  await ensureSettings(organizationId);
  const setting = await prisma.leaseContractSetting.findUnique({ where: { organizationId } });

  const [clauses, invoices] = await Promise.all([
    prisma.leaseContractClause.findMany({
      where: { organizationId, deletedAt: null, isEnabled: true },
      select: clauseSelect,
      orderBy: clauseOrder,
    }),
    // What the rent schedule reports as billed. Only the few columns the
    // schedule prints are read, and only for this lease.
    prisma.invoice.findMany({
      where: { organizationId, leaseId: lease.id, deletedAt: null },
      select: { invoiceDate: true, dueDate: true, status: true },
      orderBy: { invoiceDate: 'asc' },
    }),
  ]);

  const values = contractValues({ organization, setting, lease });
  const tenant = lease.tenant;
  const apartment = lease.apartment;
  const building = apartment.floor.building;
  const rentCurrency = lease.currency;
  const depositCurrency = lease.securityDepositCurrency || lease.currency;
  const feeCurrency = lease.serviceFeeCurrency || lease.currency;

  const unresolved = new Set();
  // A token that is real but has nothing to say — an office with no name, a
  // tenant with no national ID — is reported separately from a misspelled one:
  // both leave their token visible in the text, and both should be visible
  // before the contract is printed rather than discovered on paper.
  const missing = new Set();

  /**
   * Resolve one piece of text against this lease, reporting what did not fill in.
   *
   * The three sections of the document and every clause go through here, so a
   * token that cannot be filled is reported wherever it was written.
   */
  const resolve = (text) => {
    for (const token of tokensIn(text)) {
      const value = values[token];
      if (value === undefined) unresolved.add(token);
      else if (value === null || value === '') missing.add(token);
    }

    return renderText(text, values);
  };

  const renderedClauses = clausesForDocument(clauses).map((clause, index) => {
    const text = {};
    const title = {};

    for (const language of CONTRACT_LANGUAGES) {
      text[language] = resolve(clauseText(clause, language));
      title[language] = clauseTitle(clause, language);
    }

    return { id: clause.id, number: index + 1, sortOrder: clause.sortOrder, title, body: text };
  });

  /*
   * The document's own wording, in all three languages at once — the preview
   * switches language without refetching, and a section is resolved once per
   * language so a token that has no value is reported even when the reader never
   * opens that language.
   */
  const body = Object.fromEntries(
    CONTRACT_SECTIONS.map((section) => [
      section,
      Object.fromEntries(
        CONTRACT_LANGUAGES.map((language) => [
          language,
          resolve(sectionWording(setting, section, language)),
        ]),
      ),
    ]),
  );

  /*
   * When the document was drawn. The label is written here rather than in the
   * two renderers, so the date the preview shows and the date the PDF prints
   * are one value produced once, not two that agree until they do not.
   */
  const generatedAt = new Date();

  return {
    language: CONTRACT_LANGUAGES.includes(setting.defaultLanguage) ? setting.defaultLanguage : 'fa',
    languages: CONTRACT_LANGUAGES,
    generatedAt: generatedAt.toISOString(),
    generatedAtLabel: formatDate(generatedAt),

    title: {
      en: documentTitle(setting, 'en'),
      fa: documentTitle(setting, 'fa'),
      ps: documentTitle(setting, 'ps'),
    },

    organization: { name: organization.name },

    // The letterhead: the *office's* own address, never the building's.
    office: {
      name: optionalText(setting.officeName),
      address: optionalText(setting.officeAddress),
      phone: optionalText(setting.officePhone),
      email: optionalText(setting.officeEmail),
      licenseNumber: optionalText(setting.licenseNumber),
      logoUrl: setting.logoUrl,
    },

    lessor: {
      name: optionalText(setting.lessorName),
      phone: optionalText(setting.lessorPhone),
      nationalId: optionalText(setting.lessorNationalId),
      address: optionalText(setting.lessorAddress),
      photoUrl: setting.lessorPhotoUrl,
      signatureLabel: optionalText(setting.lessorSignatureLabel),
    },

    tenant: {
      fullName: `${tenant.firstName} ${tenant.lastName}`.trim(),
      firstName: tenant.firstName,
      lastName: tenant.lastName,
      phone: tenant.phone,
      alternatePhone: optionalText(tenant.alternatePhone),
      email: optionalText(tenant.email),
      nationalId: optionalText(tenant.nationalId),
      fatherName: optionalText(tenant.fatherName),
      address: optionalText(tenant.address),
      emergencyContactName: optionalText(tenant.emergencyContactName),
      emergencyContactPhone: optionalText(tenant.emergencyContactPhone),
      // The identity photograph stands in for the portrait when none was filed.
      photoUrl: tenant.photoUrl,
      idPhotoUrl: tenant.idCardFrontUrl,
      signatureLabel: optionalText(setting.tenantSignatureLabel),
    },

    lease: {
      contractNumber: lease.contractNumber,
      contractNumberLabel: numberedContract(lease.contractNumber, setting.contractNumberPrefix),
      startDate: lease.startDate,
      startDateLabel: formatDate(lease.startDate),
      endDate: lease.endDate,
      endDateLabel: formatDate(lease.endDate),
      monthlyRent: Number(lease.monthlyRent),
      monthlyRentLabel: formatMoney(lease.monthlyRent, rentCurrency),
      currency: rentCurrency,
      securityDeposit: Number(lease.securityDeposit),
      securityDepositLabel: formatMoney(lease.securityDeposit, depositCurrency),
      securityDepositCurrency: depositCurrency,
      serviceFee: Number(lease.serviceFee),
      serviceFeeLabel: formatMoney(lease.serviceFee, feeCurrency),
      serviceFeeCurrency: feeCurrency,
      paymentDueDay: lease.paymentDueDay,
      durationMonths: monthCount(lease.startDate, lease.endDate),
      status: lease.status,
      notes: optionalText(lease.notes) || '',
    },

    apartment: {
      apartmentNumber: apartment.apartmentNumber,
      name: apartment.name,
      type: apartment.type,
      area: optionalNumber(apartment.area),
      areaLabel: optionalNumber(apartment.area) === null ? null : `${formatNumber(apartment.area)} m²`,
      bedrooms: apartment.bedrooms,
      bathrooms: apartment.bathrooms,
    },

    floor: { name: apartment.floor.name, floorNumber: apartment.floor.floorNumber },

    // The rented property's address, which is the building's own.
    building: {
      name: building.name,
      code: building.code,
      address: optionalText(building.address),
    },

    photos: {
      showTenantPhoto: setting.showTenantPhoto,
      showLessorPhoto: setting.showLessorPhoto,
    },

    body,

    // The two tables the document draws, from this lease's own records: the
    // months of the term and what falls due in each, and the charges the unit
    // carries month by month.
    schedule: buildRentSchedule(lease, invoices),
    utilities: utilityRows(lease, apartment),

    footerText: optionalText(setting.footerText) || '',
    signatureLabels: {
      lessor: optionalText(setting.lessorSignatureLabel),
      tenant: optionalText(setting.tenantSignatureLabel),
      witness: optionalText(setting.witnessSignatureLabel),
    },

    clauses: renderedClauses,
    unknownPlaceholders: [...unresolved],
    missingPlaceholders: [...missing],
  };
}

module.exports = {
  createClause,
  deleteClause,
  getClause,
  getContract,
  getSettings,
  listClauses,
  reorderClauses,
  updateClause,
  updateSettings,
};
