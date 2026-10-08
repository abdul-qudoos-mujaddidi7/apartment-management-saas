const { Prisma } = require('@prisma/client');

const Decimal = Prisma.Decimal;

const DEFAULT_ACCOUNTS = [
  ['CASH', 'Cash', 'ASSET'],
  ['ACCOUNTS_RECEIVABLE', 'Accounts Receivable', 'ASSET'],
  ['SECURITY_DEPOSIT_LIABILITY', 'Security Deposit Liability', 'LIABILITY'],
  ['RENT_INCOME', 'Rent Income', 'INCOME'],
  ['SECURITY_DEPOSIT_FORFEITED', 'Security Deposit Forfeited', 'INCOME'],
  ['FOREIGN_EXCHANGE_DIFFERENCE', 'Foreign Exchange Difference', 'INCOME'],
  ['ELECTRICITY_INCOME', 'Electricity Income', 'INCOME'],
  ['WATER_INCOME', 'Water Income', 'INCOME'],
  ['GAS_INCOME', 'Gas Income', 'INCOME'],
  ['SERVICE_FEE_INCOME', 'Service Fee Income', 'INCOME'],
  ['OTHER_INCOME', 'Other Income', 'INCOME'],
  ['BUILDING_EXPENSES', 'Building Expenses', 'EXPENSE'],
];

async function ensureDefaultAccounts(client, organizationId) {
  await client.financialAccount.createMany({
    data: DEFAULT_ACCOUNTS.map(([systemKey, name, type]) => ({
      organizationId,
      systemKey,
      name,
      type,
      isSystem: true,
      isActive: true,
    })),
    skipDuplicates: true,
  });

  const accounts = await client.financialAccount.findMany({
    where: {
      organizationId,
      deletedAt: null,
      systemKey: { in: DEFAULT_ACCOUNTS.map(([systemKey]) => systemKey) },
    },
  });

  const byRole = Object.fromEntries(accounts.map((account) => [account.systemKey, account]));
  for (const [systemKey] of DEFAULT_ACCOUNTS) {
    if (!byRole[systemKey]) {
      throw new Error(`Default account ${systemKey} could not be created.`);
    }
  }

  return byRole;
}

async function listFinancialAccounts(organizationId) {
  // Financial accounts are initialized lazily on the first financial read or
  // write. The unique organization/systemKey constraint makes this safe under load.
  await ensureDefaultAccounts(require('../../lib/prisma'), organizationId);
  const prisma = require('../../lib/prisma');
  const accounts = await prisma.financialAccount.findMany({
    where: { organizationId, deletedAt: null, isActive: true },
    orderBy: [{ type: 'asc' }, { name: 'asc' }, { id: 'asc' }],
  });

  return accounts.map((account) => ({
    ...account,
    openingBalance: Number(new Decimal(0)),
  }));
}

function accountBalance(account, debit, credit) {
  const debits = new Decimal(debit || 0);
  const credits = new Decimal(credit || 0);
  return ['ASSET', 'EXPENSE'].includes(account.type) ? debits.minus(credits) : credits.minus(debits);
}

/**
 * Account balances are summed from the base-currency mirrors (`baseDebit` /
 * `baseCredit`), never from the document-currency columns: different journals
 * may be written in different currencies, and adding those together would be
 * meaningless. Each line contributes exactly what it was worth in the
 * organization's base currency on the day it posted.
 */
async function listAccountsWithBalances(organizationId, options = {}) {
  const prisma = require('../../lib/prisma');
  await ensureDefaultAccounts(prisma, organizationId);
  const accounts = await prisma.financialAccount.findMany({ where: { organizationId, deletedAt: null }, orderBy: [{ type: 'asc' }, { name: 'asc' }, { id: 'asc' }] });
  const grouped = await prisma.journalLine.groupBy({
    by: ['accountId'],
    where: { account: { organizationId }, journal: { organizationId, status: 'POSTED' } },
    _sum: { debit: true, credit: true, baseDebit: true, baseCredit: true },
  });
  const totals = Object.fromEntries(grouped.map((row) => [row.accountId, row._sum]));
  return accounts.map((account) => {
    const row = totals[account.id] || {};
    return {
      ...account,
      // Document-currency movement, kept so the register can explain a mixed-currency ledger.
      debit: Number(row.debit || 0),
      credit: Number(row.credit || 0),
      baseDebit: Number(row.baseDebit || 0),
      baseCredit: Number(row.baseCredit || 0),
      baseCurrency: options.baseCurrency || null,
      balance: Number(accountBalance(account, row.baseDebit, row.baseCredit)),
    };
  });
}

async function getAccount(organizationId, id) {
  const accounts = await listAccountsWithBalances(organizationId);
  const account = accounts.find((item) => item.id === id);
  if (!account) throw Object.assign(new Error('Account not found.'), { code: 'ACCOUNT_NOT_FOUND' });
  return account;
}

async function getAccountLedger(organizationId, id, query) {
  const prisma = require('../../lib/prisma');
  const account = await getAccount(organizationId, id);
  const range = {};
  if (query.from) range.gte = new Date(`${query.from}T00:00:00.000Z`);
  if (query.to) range.lte = new Date(`${query.to}T23:59:59.999Z`);
  const journalWhere = { organizationId, ...(Object.keys(range).length ? { transactionDate: range } : {}) };
  const where = { accountId: id, journal: journalWhere };
  const orderBy = [{ journal: { transactionDate: 'asc' } }, { createdAt: 'asc' }];
  const [items, total, movements] = await prisma.$transaction([
    prisma.journalLine.findMany({ where, include: { journal: { select: { journalNumber: true, transactionDate: true, currency: true, exchangeRate: true, description: true, status: true, referenceType: true, referenceId: true } }, tenant: { select: { firstName: true } } }, orderBy, skip: (query.page - 1) * query.pageSize, take: query.pageSize }),
    prisma.journalLine.count({ where }),
    // The running balance must be true for a page in the middle of the history —
    // and for a date-filtered statement — so the cumulative sum is walked from
    // the account's very first line, ignoring the range filter. Only the two
    // mirrored figures travel here, not the whole rows.
    prisma.journalLine.findMany({ where: { accountId: id, journal: { organizationId } }, select: { id: true, baseDebit: true, baseCredit: true }, orderBy }),
  ]);
  const positive = ['ASSET', 'EXPENSE'].includes(account.type);
  const balances = new Map();
  let running = new Decimal(0);
  for (const line of movements) {
    const debit = new Decimal(line.baseDebit || 0);
    const credit = new Decimal(line.baseCredit || 0);
    running = running.plus(positive ? debit.minus(credit) : credit.minus(debit));
    balances.set(line.id, Number(running));
  }
  return {
    items: items.map((line) => ({
      ...line,
      debit: Number(line.debit),
      credit: Number(line.credit),
      baseDebit: Number(line.baseDebit),
      baseCredit: Number(line.baseCredit),
      balanceAfter: balances.get(line.id) ?? 0,
    })),
    pagination: { page: query.page, pageSize: query.pageSize, total, totalPages: Math.ceil(total / query.pageSize) },
  };
}

/**
 * Per-year and per-source totals for one account, taken from the posted
 * base-currency mirrors only, so they agree with the balance on the register.
 * The grouping runs in SQL so the size of the account's history never lands in
 * memory. `net` follows the account's own direction, exactly like
 * `accountBalance`.
 */
async function getAccountSummary(organizationId, id, client) {
  const prisma = client || require('../../lib/prisma');
  const account = await prisma.financialAccount.findFirst({ where: { id, organizationId, deletedAt: null } });
  if (!account) throw Object.assign(new Error('Account not found.'), { code: 'ACCOUNT_NOT_FOUND' });
  const [yearRows, sourceRows] = await Promise.all([
    prisma.$queryRaw`
      SELECT YEAR(j.transactionDate) AS year, COUNT(*) AS entries,
             COALESCE(SUM(l.baseDebit), 0) AS debit, COALESCE(SUM(l.baseCredit), 0) AS credit
      FROM \`JournalLine\` l JOIN \`Journal\` j ON j.id = l.journalId
      WHERE l.accountId = ${id} AND j.organizationId = ${organizationId} AND j.status = 'POSTED'
      GROUP BY YEAR(j.transactionDate) ORDER BY year ASC`,
    prisma.$queryRaw`
      SELECT j.referenceType AS referenceType, COUNT(*) AS entries,
             COALESCE(SUM(l.baseDebit), 0) AS debit, COALESCE(SUM(l.baseCredit), 0) AS credit
      FROM \`JournalLine\` l JOIN \`Journal\` j ON j.id = l.journalId
      WHERE l.accountId = ${id} AND j.organizationId = ${organizationId} AND j.status = 'POSTED'
      GROUP BY j.referenceType ORDER BY referenceType ASC`,
  ]);
  const shape = (row) => ({
    entries: Number(row.entries),
    debit: Number(row.debit),
    credit: Number(row.credit),
    net: Number(accountBalance(account, row.debit, row.credit)),
  });
  const totals = sourceRows.reduce((sum, row) => ({ entries: sum.entries + Number(row.entries), debit: sum.debit + Number(row.debit), credit: sum.credit + Number(row.credit) }), { entries: 0, debit: 0, credit: 0 });
  return {
    totals: { ...totals, net: Number(accountBalance(account, totals.debit, totals.credit)) },
    byYear: yearRows.map((row) => ({ year: Number(row.year), ...shape(row) })),
    bySource: sourceRows.map((row) => ({ referenceType: row.referenceType, ...shape(row) })),
  };
}

module.exports = {
  DEFAULT_ACCOUNTS,
  ensureDefaultAccounts,
  listFinancialAccounts,
  listAccountsWithBalances,
  getAccount,
  getAccountLedger,
  getAccountSummary,
};
