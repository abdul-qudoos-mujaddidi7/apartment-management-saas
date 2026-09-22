const { Prisma } = require('@prisma/client');

const prisma = require('../../lib/prisma');

const Decimal = Prisma.Decimal;

/* Reference type this module owns. Invoice and payment postings use `INVOICE`
   and `PAYMENT`, and are only ever reversed by the document that created them. */
const MANUAL_REFERENCE = 'MANUAL';

function financialError(code, message) {
  return Object.assign(new Error(message), { code });
}

function asMoney(value) {
  return new Decimal(value).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
}

async function nextJournalNumber(client, organizationId) {
  await client.$queryRaw`
    SELECT \`id\`
    FROM \`Organization\`
    WHERE \`id\` = ${organizationId}
    FOR UPDATE
  `;
  const count = await client.journal.count({ where: { organizationId } });
  return `JRN-${String(count + 1).padStart(6, '0')}`;
}

function validateLines(lines) {
  if (!Array.isArray(lines) || lines.length < 2) {
    throw financialError('INVALID_JOURNAL', 'A journal needs at least two lines.');
  }

  let debits = new Decimal(0);
  let credits = new Decimal(0);
  const normalized = lines.map((line) => {
    const debit = asMoney(line.debit || 0);
    const credit = asMoney(line.credit || 0);
    if (debit.isNegative() || credit.isNegative() || (!debit.isZero() && !credit.isZero())) {
      throw financialError('INVALID_JOURNAL_LINE', 'Each journal line must contain either a debit or a credit.');
    }
    if (debit.isZero() && credit.isZero()) {
      throw financialError('INVALID_JOURNAL_LINE', 'Journal lines cannot be zero.');
    }
    debits = debits.plus(debit);
    credits = credits.plus(credit);
    return { ...line, debit, credit };
  });

  if (!debits.equals(credits)) {
    throw financialError('UNBALANCED_JOURNAL', 'Journal debits must equal credits.');
  }
  return normalized;
}

/**
 * A line may be tagged to a tenant account. The tag is only meaningful for a
 * tenant of this organization — the receivable control account and the tenant
 * sub-ledger are both organization-scoped — so a line naming someone else's
 * tenant is rejected before anything is written. Document postings resolve
 * their tenant from the invoice or payment that owns them and call this too.
 */
async function assertTenantsInOrganization(client, organizationId, lines) {
  const tenantIds = [...new Set(lines.map((line) => line.tenantId).filter(Boolean))];
  if (tenantIds.length === 0) return;

  const found = await client.tenant.findMany({
    where: { id: { in: tenantIds }, organizationId, deletedAt: null },
    select: { id: true },
  });

  if (found.length !== tenantIds.length) {
    throw financialError(
      'INVALID_JOURNAL_LINE',
      'A journal line is tagged to a tenant account that is not in this organization.',
    );
  }
}

async function postJournal(client, organizationId, data) {
  const existing = await client.journal.findUnique({
    where: {
      organizationId_referenceType_referenceId: {
        organizationId,
        referenceType: data.referenceType,
        referenceId: data.referenceId,
      },
    },
  });
  if (existing) return existing;

  const lines = validateLines(data.lines);
  const journalNumber = await nextJournalNumber(client, organizationId);

  return client.journal.create({
    data: {
      organizationId,
      journalNumber,
      transactionDate: data.transactionDate,
      referenceType: data.referenceType,
      referenceId: data.referenceId,
      description: data.description || null,
      status: 'POSTED',
      lines: {
        create: lines.map((line) => ({
          accountId: line.accountId,
          tenantId: line.tenantId || null,
          debit: line.debit,
          credit: line.credit,
          description: line.description || null,
        })),
      },
    },
    include: { lines: true },
  });
}

async function voidJournalWithReversal(client, organizationId, referenceType, referenceId, transactionDate, description) {
  const original = await client.journal.findUnique({
    where: {
      organizationId_referenceType_referenceId: { organizationId, referenceType, referenceId },
    },
    include: { lines: true },
  });
  if (!original || original.status === 'VOIDED') return null;

  await client.journal.update({
    where: { id: original.id },
    data: { status: 'VOIDED', voidedAt: new Date(), voidReason: description || null },
  });

  return postJournal(client, organizationId, {
    transactionDate,
    referenceType: `${referenceType}_VOID`,
    referenceId,
    description: description || `Reversal of ${original.journalNumber}`,
    lines: original.lines.map((line) => ({
      accountId: line.accountId,
      tenantId: line.tenantId,
      debit: line.credit,
      credit: line.debit,
      description: description || `Reversal of ${original.journalNumber}`,
    })),
  });
}

/* --- Manual entries ----------------------------------------------------
 *
 * A manually entered journal is a first-class document: it owns a reference to
 * itself (`MANUAL` / its own number), it can be edited while it stands, and
 * voiding it leaves the original in place and posts an equal-and-opposite
 * entry, so the ledger shows what was corrected and not just that something
 * changed.
 */

const journalInclude = {
  lines: {
    include: {
      account: { select: { id: true, code: true, name: true, type: true } },
      tenant: { select: { id: true, firstName: true, lastName: true } },
    },
    orderBy: { createdAt: 'asc' },
  },
};

/** Prisma hands back Decimal for money; the API speaks numbers. */
function formatJournal(journal) {
  if (!journal) return journal;

  const lines = (journal.lines || []).map((line) => ({
    id: line.id,
    accountId: line.accountId,
    account: line.account || null,
    tenantId: line.tenantId || null,
    tenant: line.tenant || null,
    description: line.description || null,
    debit: Number(line.debit),
    credit: Number(line.credit),
  }));

  return {
    id: journal.id,
    journalNumber: journal.journalNumber,
    transactionDate: journal.transactionDate,
    referenceType: journal.referenceType,
    referenceId: journal.referenceId,
    description: journal.description || null,
    status: journal.status,
    voidedAt: journal.voidedAt || null,
    voidReason: journal.voidReason || null,
    createdAt: journal.createdAt,
    updatedAt: journal.updatedAt,
    isManual: journal.referenceType === MANUAL_REFERENCE,
    lines,
    debitTotal: lines.reduce((total, line) => total + line.debit, 0),
    creditTotal: lines.reduce((total, line) => total + line.credit, 0),
  };
}

function buildLineData(lines, fallbackDescription = null) {
  return lines.map((line) => ({
    accountId: line.accountId,
    tenantId: line.tenantId || null,
    debit: line.debit,
    credit: line.credit,
    description: line.description || fallbackDescription,
  }));
}

async function listJournals(organizationId, query) {
  const where = {
    organizationId,
    ...(query.status ? { status: query.status } : {}),
    ...(query.referenceType ? { referenceType: query.referenceType } : {}),
    ...(query.accountId ? { lines: { some: { accountId: query.accountId } } } : {}),
    ...(query.dateFrom || query.dateTo ? {
      transactionDate: {
        ...(query.dateFrom ? { gte: query.dateFrom } : {}),
        ...(query.dateTo ? { lte: query.dateTo } : {}),
      },
    } : {}),
    ...(query.search ? {
      OR: [
        { journalNumber: { contains: query.search } },
        { description: { contains: query.search } },
        { referenceType: { contains: query.search } },
        { lines: { some: { description: { contains: query.search } } } },
        { lines: { some: { account: { code: { contains: query.search } } } } },
        { lines: { some: { account: { name: { contains: query.search } } } } },
      ],
    } : {}),
  };

  const [items, total] = await prisma.$transaction([
    prisma.journal.findMany({
      where,
      include: journalInclude,
      orderBy: [{ transactionDate: 'desc' }, { createdAt: 'desc' }],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.journal.count({ where }),
  ]);

  return {
    items: items.map(formatJournal),
    pagination: { page: query.page, pageSize: query.pageSize, total, totalPages: Math.ceil(total / query.pageSize) },
  };
}

async function getJournalEntry(organizationId, id) {
  const journal = await prisma.journal.findFirst({
    where: { id, organizationId },
    include: journalInclude,
  });
  if (!journal) throw financialError('JOURNAL_NOT_FOUND', 'Journal entry not found.');
  return formatJournal(journal);
}

async function createManualJournal(organizationId, data) {
  return prisma.$transaction(async (tx) => {
    const lines = validateLines(data.lines);
    await assertTenantsInOrganization(tx, organizationId, lines);
    const journalNumber = await nextJournalNumber(tx, organizationId);

    const journal = await tx.journal.create({
      data: {
        organizationId,
        journalNumber,
        transactionDate: data.transactionDate,
        referenceType: MANUAL_REFERENCE,
        referenceId: journalNumber,
        description: data.description || null,
        status: 'POSTED',
        lines: { create: buildLineData(lines, data.description || null) },
      },
      include: journalInclude,
    });

    return formatJournal(journal);
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

/** Only manual, still-standing entries are editable — documents own the rest. */
async function editableJournal(client, organizationId, id) {
  const journal = await client.journal.findFirst({
    where: { id, organizationId },
    select: { id: true, journalNumber: true, referenceType: true, status: true },
  });
  if (!journal) throw financialError('JOURNAL_NOT_FOUND', 'Journal entry not found.');
  if (journal.referenceType !== MANUAL_REFERENCE) {
    throw financialError('JOURNAL_NOT_MANUAL', 'Only manual journal entries can be changed here.');
  }
  if (journal.status === 'VOIDED') {
    throw financialError('JOURNAL_VOIDED', 'Voided journal entries cannot be changed.');
  }
  return journal;
}

async function updateManualJournal(organizationId, id, data) {
  return prisma.$transaction(async (tx) => {
    await editableJournal(tx, organizationId, id);
    const lines = validateLines(data.lines);
    await assertTenantsInOrganization(tx, organizationId, lines);

    // Lines are replaced wholesale: a corrected entry is one document, not a
    // pile of edits, and the number stays with the entry.
    await tx.journalLine.deleteMany({ where: { journalId: id } });

    const journal = await tx.journal.update({
      where: { id },
      data: {
        transactionDate: data.transactionDate,
        description: data.description || null,
        lines: { create: buildLineData(lines, data.description || null) },
      },
      include: journalInclude,
    });

    return formatJournal(journal);
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

/**
 * Void by flag, not by reversal.
 *
 * Account balances are summed from POSTED journals only (see
 * `listAccountsWithBalances`), so flagging the entry is enough to remove its
 * effect from the books. Posting a reversing entry as well would cancel it
 * twice — the flagged original stops counting while its reversal keeps
 * counting, and the account would swing the wrong way. The entry itself is the
 * audit trail: it stays in the list as VOIDED with who and why.
 */
async function voidManualJournal(organizationId, id, voidReason) {
  return prisma.$transaction(async (tx) => {
    const journal = await editableJournal(tx, organizationId, id);

    await tx.journal.update({
      where: { id: journal.id },
      data: { status: 'VOIDED', voidedAt: new Date(), voidReason },
    });

    const updated = await tx.journal.findUnique({ where: { id: journal.id }, include: journalInclude });
    return formatJournal(updated);
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

module.exports = {
  MANUAL_REFERENCE,
  asMoney,
  assertTenantsInOrganization,
  createManualJournal,
  financialError,
  formatJournal,
  getJournalEntry,
  listJournals,
  postJournal,
  updateManualJournal,
  validateLines,
  voidJournalWithReversal,
  voidManualJournal,
};
