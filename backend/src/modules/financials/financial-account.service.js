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
  await getAccount(organizationId, id);
  const where = { accountId: id, journal: { organizationId } };
  const [items, total] = await prisma.$transaction([
    prisma.journalLine.findMany({ where, include: { journal: { select: { journalNumber: true, transactionDate: true, currency: true, exchangeRate: true, description: true, status: true, referenceType: true, referenceId: true } }, tenant: { select: { firstName: true, lastName: true } } }, orderBy: [{ journal: { transactionDate: 'asc' } }, { createdAt: 'asc' }], skip: (query.page - 1) * query.pageSize, take: query.pageSize }),
    prisma.journalLine.count({ where }),
  ]);
  return {
    items: items.map((line) => ({
      ...line,
      debit: Number(line.debit),
      credit: Number(line.credit),
      baseDebit: Number(line.baseDebit),
      baseCredit: Number(line.baseCredit),
    })),
    pagination: { page: query.page, pageSize: query.pageSize, total, totalPages: Math.ceil(total / query.pageSize) },
  };
}

module.exports = {
  DEFAULT_ACCOUNTS,
  ensureDefaultAccounts,
  listFinancialAccounts,
  listAccountsWithBalances,
  getAccount,
  getAccountLedger,
};
