const { Prisma } = require('@prisma/client');

const prisma = require('../../lib/prisma');
const Decimal = Prisma.Decimal;

function asMoney(value) {
  return new Decimal(value || 0).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
}

function tenantAccountError(code, message) {
  return Object.assign(new Error(message), { code });
}

async function getOrCreateTenantAccount(client, organizationId, tenantId) {
  const tenant = await client.tenant.findFirst({
    where: { id: tenantId, organizationId, deletedAt: null },
    select: { id: true },
  });
  if (!tenant) throw tenantAccountError('TENANT_NOT_FOUND', 'Tenant not found.');

  return client.tenantAccount.upsert({
    where: { organizationId_tenantId: { organizationId, tenantId } },
    update: {},
    create: { organizationId, tenantId, balance: 0 },
  });
}

async function recalculateBalance(client, accountId) {
  const account = await client.tenantAccount.findUnique({ where: { id: accountId } });
  const totals = await client.tenantLedgerEntry.aggregate({
    where: { tenantAccountId: accountId },
    _sum: { debit: true, credit: true },
  });
  const balance = asMoney(totals._sum.debit).minus(asMoney(totals._sum.credit));
  return client.tenantAccount.update({ where: { id: account.id }, data: { balance } });
}

async function postTenantLedgerEntry(client, organizationId, data) {
  const existing = await client.tenantLedgerEntry.findUnique({
    where: {
      organizationId_referenceType_referenceId_type: {
        organizationId,
        referenceType: data.referenceType,
        referenceId: data.referenceId,
        type: data.type,
      },
    },
  });
  if (existing) return existing;

  const debit = asMoney(data.debit);
  const credit = asMoney(data.credit);
  if ((!debit.isZero() && !credit.isZero()) || (debit.isZero() && credit.isZero())) {
    throw tenantAccountError('INVALID_TENANT_LEDGER_ENTRY', 'A tenant ledger entry must have either a debit or credit.');
  }

  const account = await getOrCreateTenantAccount(client, organizationId, data.tenantId);
  const currentBalance = asMoney(account.balance);
  const balanceAfter = currentBalance.plus(debit).minus(credit);
  if (balanceAfter.isNegative()) {
    throw tenantAccountError('TENANT_BALANCE_NEGATIVE', 'Tenant receivable balance cannot become negative.');
  }

  const entry = await client.tenantLedgerEntry.create({
    data: {
      organizationId,
      tenantAccountId: account.id,
      type: data.type,
      transactionDate: data.transactionDate,
      referenceType: data.referenceType,
      referenceId: data.referenceId,
      description: data.description || null,
      debit,
      credit,
      balanceAfter,
    },
  });
  await client.tenantAccount.update({ where: { id: account.id }, data: { balance: balanceAfter } });
  return entry;
}

async function replaceInvoiceLedgerEntry(client, organizationId, data) {
  const account = await getOrCreateTenantAccount(client, organizationId, data.tenantId);
  const existing = await client.tenantLedgerEntry.findUnique({
    where: { organizationId_referenceType_referenceId_type: { organizationId, referenceType: 'INVOICE', referenceId: data.invoiceId, type: 'INVOICE' } },
  });
  if (!existing) return postTenantLedgerEntry(client, organizationId, {
    tenantId: data.tenantId, type: 'INVOICE', transactionDate: data.transactionDate,
    referenceType: 'INVOICE', referenceId: data.invoiceId, description: data.description, debit: data.amount, credit: 0,
  });
  await client.tenantLedgerEntry.update({
    where: { id: existing.id },
    data: { transactionDate: data.transactionDate, description: data.description, debit: asMoney(data.amount), credit: 0 },
  });
  await recalculateBalance(client, account.id);
  return client.tenantLedgerEntry.findUnique({ where: { id: existing.id } });
}

async function reverseTenantLedgerEntry(client, organizationId, referenceType, referenceId, transactionDate, description) {
  const original = await client.tenantLedgerEntry.findUnique({
    where: { organizationId_referenceType_referenceId_type: { organizationId, referenceType, referenceId, type: referenceType === 'PAYMENT' ? 'PAYMENT' : 'INVOICE' } },
    include: { tenantAccount: true },
  });
  if (!original) return null;
  return postTenantLedgerEntry(client, organizationId, {
    tenantId: original.tenantAccount.tenantId,
    type: 'REVERSAL',
    transactionDate,
    referenceType: `${referenceType}_VOID`,
    referenceId,
    description: description || `Reversal of ${referenceType}`,
    debit: original.credit,
    credit: original.debit,
  });
}

function tenantSelect() {
  return { id: true, firstName: true, lastName: true, phone: true, leases: { where: { deletedAt: null }, orderBy: { createdAt: 'desc' }, take: 1, select: { contractNumber: true, apartment: { select: { apartmentNumber: true, floor: { select: { name: true, floorNumber: true, building: { select: { name: true } } } } } } } } };
}

async function listTenantAccounts(organizationId, query) {
  const where = {
    organizationId,
    tenant: {
      deletedAt: null,
      ...(query.search ? { OR: [{ firstName: { contains: query.search } }, { lastName: { contains: query.search } }, { phone: { contains: query.search } }] } : {}),
      ...(query.buildingId || query.apartmentId ? { leases: { some: { deletedAt: null, ...(query.apartmentId ? { apartmentId: query.apartmentId } : {}), ...(query.buildingId ? { apartment: { floor: { buildingId: query.buildingId } } } : {}) } } } : {}),
    },
  };
  const [items, total] = await prisma.$transaction([
    prisma.tenantAccount.findMany({ where, include: { tenant: { select: tenantSelect() } }, orderBy: { updatedAt: 'desc' }, skip: (query.page - 1) * query.pageSize, take: query.pageSize }),
    prisma.tenantAccount.count({ where }),
  ]);
  return { items: items.map(formatAccount), pagination: { page: query.page, pageSize: query.pageSize, total, totalPages: Math.ceil(total / query.pageSize) } };
}

function formatAccount(account) {
  return { ...account, balance: Number(account.balance) };
}

async function getTenantAccount(organizationId, tenantId) {
  const account = await getOrCreateTenantAccount(prisma, organizationId, tenantId);
  const full = await prisma.tenantAccount.findFirst({ where: { id: account.id, organizationId }, include: { tenant: { select: tenantSelect() } } });
  return formatAccount(full);
}

async function getTenantLedger(organizationId, tenantId, query) {
  const account = await getOrCreateTenantAccount(prisma, organizationId, tenantId);
  if (account.organizationId !== organizationId) throw tenantAccountError('TENANT_NOT_FOUND', 'Tenant not found.');
  const [items, total] = await prisma.$transaction([
    prisma.tenantLedgerEntry.findMany({ where: { organizationId, tenantAccountId: account.id }, orderBy: [{ transactionDate: 'asc' }, { createdAt: 'asc' }], skip: (query.page - 1) * query.pageSize, take: query.pageSize }),
    prisma.tenantLedgerEntry.count({ where: { organizationId, tenantAccountId: account.id } }),
  ]);
  return { items: items.map((entry) => ({ ...entry, debit: Number(entry.debit), credit: Number(entry.credit), balanceAfter: Number(entry.balanceAfter) })), pagination: { page: query.page, pageSize: query.pageSize, total, totalPages: Math.ceil(total / query.pageSize) } };
}

async function reconcileReceivables(client, organizationId) {
  const accounts = await client.tenantAccount.aggregate({ where: { organizationId }, _sum: { balance: true } });
  const receivable = await client.financialAccount.findFirst({ where: { organizationId, code: '1100', deletedAt: null }, select: { id: true } });
  const gl = receivable ? await client.journalLine.aggregate({ where: { accountId: receivable.id, journal: { organizationId, status: 'POSTED' } }, _sum: { debit: true, credit: true } }) : { _sum: { debit: 0, credit: 0 } };
  const tenantBalance = asMoney(accounts._sum.balance);
  const receivableBalance = asMoney(gl._sum.debit).minus(asMoney(gl._sum.credit));
  return { tenantBalance, receivableBalance, matches: tenantBalance.equals(receivableBalance) };
}

// Kept as an alias for any older internal callers while new code uses the
// explicit tenant-account name.
const getOrCreateAccount = getOrCreateTenantAccount;

module.exports = { getOrCreateAccount, getOrCreateTenantAccount, getTenantAccount, getTenantLedger, listTenantAccounts, postTenantLedgerEntry, recalculateBalance, reconcileReceivables, replaceInvoiceLedgerEntry, reverseTenantLedgerEntry };
