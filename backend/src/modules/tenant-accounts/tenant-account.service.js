const { Prisma } = require('@prisma/client');

const prisma = require('../../lib/prisma');
const { asMoney } = require('../../lib/money');
const Decimal = Prisma.Decimal;

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

/**
 * Post to a tenant's sub-ledger.
 *
 * The entry's `debit`/`credit` are always *base-currency* amounts: the
 * sub-ledger is one running balance per tenant, and it has to reconcile against
 * the base-currency 1100 receivable control account. `currency` and
 * `exchangeRate` record which document produced the entry when that document
 * was issued in another currency, so the sub-ledger can still explain itself.
 */
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
      currency: (data.currency || 'AFN').toUpperCase(),
      exchangeRate: new Decimal(data.exchangeRate ?? 1),
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

// `data.amount` is a base-currency figure: the caller supplies the invoice's
// stored base total rather than re-converting a currency amount here.
async function replaceInvoiceLedgerEntry(client, organizationId, data) {
  const account = await getOrCreateTenantAccount(client, organizationId, data.tenantId);
  const existing = await client.tenantLedgerEntry.findUnique({
    where: { organizationId_referenceType_referenceId_type: { organizationId, referenceType: 'INVOICE', referenceId: data.invoiceId, type: 'INVOICE' } },
  });
  if (!existing) return postTenantLedgerEntry(client, organizationId, {
    tenantId: data.tenantId, type: 'INVOICE', transactionDate: data.transactionDate,
    referenceType: 'INVOICE', referenceId: data.invoiceId, description: data.description, debit: data.amount, credit: 0,
    currency: data.currency, exchangeRate: data.exchangeRate,
  });
  await client.tenantLedgerEntry.update({
    where: { id: existing.id },
    data: {
      transactionDate: data.transactionDate,
      description: data.description,
      debit: asMoney(data.amount),
      credit: 0,
      currency: (data.currency || existing.currency).toUpperCase(),
      exchangeRate: new Decimal(data.exchangeRate ?? existing.exchangeRate),
    },
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
    // The original is already in base currency, so swapping its sides reverses
    // it exactly, at the same recorded rate.
    debit: original.credit,
    credit: original.debit,
    currency: original.currency,
    exchangeRate: original.exchangeRate,
  });
}

function tenantSelect() {
  return { id: true, firstName: true, phone: true, status: true, nationalId: true, address: true, leases: { where: { deletedAt: null }, orderBy: { createdAt: 'desc' }, take: 1, select: { id: true, contractNumber: true, status: true, apartment: { select: { apartmentNumber: true, floor: { select: { name: true, floorNumber: true, building: { select: { name: true } } } } } } } } };
}

async function listTenantAccounts(organizationId, query) {
  const where = {
    organizationId,
    tenant: {
      deletedAt: null,
      ...(query.search ? { OR: [{ firstName: { contains: query.search } }, { phone: { contains: query.search } }] } : {}),
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
  const [totals, organization, recentEntries] = await Promise.all([
    prisma.tenantLedgerEntry.aggregate({ where: { organizationId, tenantAccountId: account.id }, _sum: { debit: true, credit: true }, _count: { _all: true } }),
    prisma.organization.findFirst({ where: { id: organizationId, deletedAt: null }, select: { baseCurrency: true } }),
    prisma.tenantLedgerEntry.findMany({ where: { organizationId, tenantAccountId: account.id }, orderBy: [{ transactionDate: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }], take: 5 }),
  ]);
  return { ...formatAccount(full), debit: Number(totals._sum.debit || 0), credit: Number(totals._sum.credit || 0), entries: totals._count._all, baseCurrency: organization?.baseCurrency || 'AFN', recentEntries: recentEntries.map(entry => ({ id: entry.id, referenceType: entry.referenceType, transactionDate: entry.transactionDate, description: entry.description, debit: Number(entry.debit), credit: Number(entry.credit) })) };
}

async function getTenantLedger(organizationId, tenantId, query) {
  return prisma.$transaction(async tx => {
    const account = await getOrCreateTenantAccount(tx, organizationId, tenantId);
    if (account.organizationId !== organizationId) throw tenantAccountError('TENANT_NOT_FOUND', 'Tenant not found.');
    const scope = { organizationId, tenantAccountId: account.id };
    const from = query.from ? new Date(`${query.from}T00:00:00Z`) : null;
    const until = query.to ? new Date(`${query.to}T00:00:00Z`) : null;
    if (until) until.setUTCDate(until.getUTCDate() + 1);
    const where = { ...scope, ...(from || until ? { transactionDate: { ...(from ? { gte: from } : {}), ...(until ? { lt: until } : {}) } } : {}) };
    const [items, total, sums, opening] = await Promise.all([
      tx.tenantLedgerEntry.findMany({ where, orderBy: [{ transactionDate: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }], skip: (query.page - 1) * query.pageSize, take: query.pageSize }),
      tx.tenantLedgerEntry.count({ where }),
      tx.tenantLedgerEntry.aggregate({ where, _sum: { debit: true, credit: true } }),
      from ? tx.tenantLedgerEntry.aggregate({ where: { ...scope, transactionDate: { lt: from } }, _sum: { debit: true, credit: true } }) : Promise.resolve({ _sum: { debit: 0, credit: 0 } }),
    ]);
    const openingBalance = asMoney(opening._sum.debit).minus(asMoney(opening._sum.credit));
    let balance = openingBalance;
    if (items.length) {
      const first = items[0];
      const preceding = await tx.tenantLedgerEntry.aggregate({ where: { ...scope, OR: [
        { transactionDate: { lt: first.transactionDate } },
        { transactionDate: first.transactionDate, createdAt: { lt: first.createdAt } },
        { transactionDate: first.transactionDate, createdAt: first.createdAt, id: { lt: first.id } },
      ] }, _sum: { debit: true, credit: true } });
      balance = asMoney(preceding._sum.debit).minus(asMoney(preceding._sum.credit));
    }
    const invoiceIds = items.filter(e => ['INVOICE','INVOICE_VOID'].includes(e.referenceType)).map(e => e.referenceId);
    const paymentIds = items.filter(e => ['PAYMENT','PAYMENT_VOID'].includes(e.referenceType)).map(e => e.referenceId);
    const [invoices, payments] = await Promise.all([
      invoiceIds.length ? tx.invoice.findMany({ where: { organizationId, id: { in: invoiceIds } }, select: { id: true, invoiceNumber: true } }) : [],
      paymentIds.length ? tx.payment.findMany({ where: { organizationId, id: { in: paymentIds } }, select: { id: true, paymentNumber: true } }) : [],
    ]);
    const references = new Map([...invoices.map(i => [`INVOICE:${i.id}`, i.invoiceNumber]), ...payments.map(p => [`PAYMENT:${p.id}`, p.paymentNumber])]);
    const rows = items.map(entry => {
      balance = balance.plus(asMoney(entry.debit)).minus(asMoney(entry.credit));
      return { ...entry, referenceNumber: references.get(`${entry.referenceType.replace('_VOID','')}:${entry.referenceId}`) || null, exchangeRate: Number(entry.exchangeRate), debit: Number(entry.debit), credit: Number(entry.credit), balanceAfter: Number(balance) };
    });
    return { items: rows, totals: { debit: Number(sums._sum.debit || 0), credit: Number(sums._sum.credit || 0), openingBalance: Number(openingBalance), closingBalance: Number(openingBalance.plus(asMoney(sums._sum.debit)).minus(asMoney(sums._sum.credit))) }, pagination: { page: query.page, pageSize: query.pageSize, total, totalPages: Math.ceil(total / query.pageSize) } };
  });
}

async function reconcileReceivables(client, organizationId) {
  const accounts = await client.tenantAccount.aggregate({ where: { organizationId }, _sum: { balance: true } });
  const receivable = await client.financialAccount.findFirst({ where: { organizationId, systemKey: 'ACCOUNTS_RECEIVABLE', deletedAt: null }, select: { id: true } });
  const gl = receivable ? await client.journalLine.aggregate({ where: { accountId: receivable.id, journal: { organizationId, status: 'POSTED' } }, _sum: { debit: true, credit: true } }) : { _sum: { debit: 0, credit: 0 } };
  const tenantBalance = asMoney(accounts._sum.balance);
  const receivableBalance = asMoney(gl._sum.debit).minus(asMoney(gl._sum.credit));
  return { tenantBalance, receivableBalance, matches: tenantBalance.equals(receivableBalance) };
}

// Kept as an alias for any older internal callers while new code uses the
// explicit tenant-account name.
const getOrCreateAccount = getOrCreateTenantAccount;

module.exports = { getOrCreateAccount, getOrCreateTenantAccount, getTenantAccount, getTenantLedger, listTenantAccounts, postTenantLedgerEntry, recalculateBalance, reconcileReceivables, replaceInvoiceLedgerEntry, reverseTenantLedgerEntry };
