/**
 * payment-allocation.service.js
 *
 * Recalculates Invoice paidAmount and status by summing item-level allocations.
 */

const { Prisma } = require('@prisma/client');
const Decimal = Prisma.Decimal;
const { fromBase } = require('../../lib/money');
const { deriveInvoiceFromItems } = require('./payment-allocation-helpers');

/**
 * Recalculate a single Invoice's paidAmount and status from its items.
 */
async function recalculateInvoice(client, invoiceId) {
  const invoice = await client.invoice.findUnique({
    where: { id: invoiceId },
    select: { id: true, total: true, dueDate: true, status: true, exchangeRate: true },
  });
  if (!invoice || invoice.status === 'CANCELLED') return null;

  const items = await client.invoiceItem.findMany({
    where: { invoiceId },
    select: {
      id: true,
      amount: true,
      paymentAllocations: {
        where: { payment: { status: 'POSTED' } },
        select: { amount: true, appliedAmount: true, baseAppliedAmount: true, voidedAt: true },
      },
    },
  });

  // Total paid across all items, in the invoice's currency and in base.
  //
  // A line states its own currency, so the figure that spans an invoice at all
  // is the base one; the invoice-currency total is that read back at the rate
  // the invoice was posted at, which is what its own `total` is quoted in.
  // `appliedAmount` and `amount` are fallbacks for rows written before
  // allocations carried a base mirror.
  let basePaidAmount = new Decimal(0);
  for (const item of items) {
    for (const alloc of item.paymentAllocations) {
      if (alloc.voidedAt) continue;
      basePaidAmount = basePaidAmount.plus(new Decimal(alloc.baseAppliedAmount ?? alloc.amount));
    }
  }
  basePaidAmount = basePaidAmount.toDecimalPlaces(2);
  const paidAmount = fromBase(basePaidAmount, invoice.exchangeRate ?? 1);

  const status = deriveStatus(invoice, paidAmount);

  return client.invoice.update({
    where: { id: invoiceId },
    data: { paidAmount, basePaidAmount, status },
  });
}

function deriveStatus(invoice, paidAmount) {
  const total = new Decimal(invoice.total);
  if (paidAmount.greaterThanOrEqualTo(total)) return 'PAID';
  if (paidAmount.isZero()) return 'UNPAID';

  const today = new Date();
  const todayAtMidnight = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  if (invoice.dueDate && invoice.dueDate < todayAtMidnight) return 'OVERDUE';

  return 'PARTIALLY_PAID';
}

/**
 * Recalculate multiple Invoices.
 */
async function recalculateInvoices(client, invoiceIds) {
  const uniqueIds = [...new Set(invoiceIds)];
  return Promise.all(uniqueIds.map((invoiceId) => recalculateInvoice(client, invoiceId)));
}

/**
 * Derive paidAmount and balance for a single InvoiceItem.
 */
async function getItemPaymentInfo(client, invoiceItemId) {
  const aggregate = await client.paymentAllocation.aggregate({
    where: {
      invoiceItemId,
      voidedAt: null,
      payment: { status: 'POSTED' },
    },
    _sum: { amount: true },
  });
  return new Decimal(aggregate._sum.amount || 0).toDecimalPlaces(2);
}

module.exports = {
  recalculateInvoice,
  recalculateInvoices,
  getItemPaymentInfo,
};
