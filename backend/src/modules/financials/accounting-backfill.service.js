const { Prisma } = require('@prisma/client');

const prisma = require('../../lib/prisma');
const Decimal = Prisma.Decimal;
const { ensureDefaultAccounts } = require('./financial-account.service');
const { postJournal } = require('./journal.service');
const { postTenantLedgerEntry, recalculateBalance, reconcileReceivables } = require('../tenant-accounts/tenant-account.service');

const incomeCode = { RENT: '4000', ELECTRICITY: '4010', WATER: '4020', GAS: '4030' };

async function backfillInvoice(tx, invoice) {
  const accounts = await ensureDefaultAccounts(tx, invoice.organizationId);
  // The sub-ledger is base currency, so it takes the invoice's stored base total;
  // the journal keeps the invoice's own currency and frozen rate.
  await postTenantLedgerEntry(tx, invoice.organizationId, {
    tenantId: invoice.lease.tenantId, type: 'INVOICE', transactionDate: invoice.invoiceDate,
    referenceType: 'INVOICE', referenceId: invoice.id, description: `Invoice ${invoice.invoiceNumber}`,
    debit: invoice.baseTotal ?? invoice.total, credit: 0,
    currency: invoice.currency, exchangeRate: invoice.exchangeRate,
  });
  const income = invoice.items.reduce((totals, item) => {
    const code = incomeCode[item.type];
    if (!code) return totals;
    totals[code] = (totals[code] || new Decimal(0)).plus(item.amount);
    return totals;
  }, {});
  await postJournal(tx, invoice.organizationId, {
    transactionDate: invoice.invoiceDate, referenceType: 'INVOICE', referenceId: invoice.id,
    description: `Invoice ${invoice.invoiceNumber}`,
    currency: invoice.currency, exchangeRate: invoice.exchangeRate,
    lines: [
      { accountId: accounts['1100'].id, tenantId: invoice.lease.tenantId, debit: invoice.total, credit: 0 },
      ...Object.entries(income).map(([code, amount]) => ({ accountId: accounts[code].id, debit: 0, credit: amount })),
    ],
  });
}

async function backfillPayment(tx, payment) {
  const accounts = await ensureDefaultAccounts(tx, payment.organizationId);
  const allocated = payment.allocations.reduce((total, allocation) => total.plus(allocation.appliedAmount ?? allocation.amount), new Decimal(0));
  const remaining = new Decimal(payment.amount).minus(payment.allocations.reduce((total, allocation) => total.plus(allocation.amount), new Decimal(0)));
  const allocatedBase = payment.allocations.reduce((total, allocation) => total.plus(allocation.baseAppliedAmount ?? allocation.amount), new Decimal(0));
  const baseAmount = new Decimal(payment.baseAmount ?? payment.amount);
  await postJournal(tx, payment.organizationId, {
    transactionDate: payment.paymentDate, referenceType: 'PAYMENT', referenceId: payment.id,
    description: `Payment ${payment.paymentNumber}`,
    currency: payment.currency, exchangeRate: payment.exchangeRate,
    lines: [
      { accountId: payment.receiveAccountId, tenantId: payment.tenantId, debit: payment.amount, credit: 0 },
      ...(allocated.greaterThan(0) ? [{
        accountId: accounts['1100'].id, tenantId: payment.tenantId, debit: 0, credit: allocated,
        baseCredit: allocatedBase,
      }] : []),
      ...(remaining.greaterThan(0) ? [{
        accountId: accounts['4000'].id, tenantId: payment.tenantId, debit: 0, credit: remaining,
        baseCredit: baseAmount.minus(allocatedBase),
        description: 'Unallocated payment',
      }] : []),
    ],
  });
  if (allocated.greaterThan(0)) {
    await postTenantLedgerEntry(tx, payment.organizationId, {
      tenantId: payment.tenantId, type: 'PAYMENT', transactionDate: payment.paymentDate,
      referenceType: 'PAYMENT', referenceId: payment.id, description: `Payment ${payment.paymentNumber}`,
      debit: 0, credit: allocatedBase,
      currency: payment.currency, exchangeRate: payment.exchangeRate,
    });
  }
}

async function rebuildOrganization(organizationId) {
  return prisma.$transaction(async (tx) => {
    await ensureDefaultAccounts(tx, organizationId);
    const invoices = await tx.invoice.findMany({
      where: { organizationId, deletedAt: null, status: { not: 'CANCELLED' } },
      include: { items: true, lease: { select: { tenantId: true } } },
    });
    const payments = await tx.payment.findMany({
      where: { organizationId, status: 'POSTED' },
      include: { allocations: { where: { voidedAt: null } } },
    });
    for (const invoice of invoices) await backfillInvoice(tx, invoice);
    for (const payment of payments) await backfillPayment(tx, payment);
    const tenantAccounts = await tx.tenantAccount.findMany({ where: { organizationId }, select: { id: true } });
    for (const account of tenantAccounts) await recalculateBalance(tx, account.id);
    const reconciliation = await reconcileReceivables(tx, organizationId);
    return { invoices: invoices.length, payments: payments.length, reconciliation: { tenantBalance: Number(reconciliation.tenantBalance), receivableBalance: Number(reconciliation.receivableBalance), matches: reconciliation.matches } };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

module.exports = { rebuildOrganization };
