/**
 * payment-allocation.service.js
 *
 * Recalculates Invoice paidAmount and status by summing item-level allocations.
 */

const { Prisma } = require('@prisma/client');
const Decimal = Prisma.Decimal;
const { deriveInvoiceFromItems } = require('./payment-allocation-helpers');

/**
 * Recalculate a single Invoice's paidAmount and status from its items.
 */
async function recalculateInvoice(client, invoiceId) {
  const invoice = await client.invoice.findUnique({
    where: { id: invoiceId },
    select: { id: true, total: true, dueDate: true, status: true },
  });
  if (!invoice || invoice.status === 'CANCELLED') return null;

  const items = await client.invoiceItem.findMany({
    where: { invoiceId },
    select: {
      id: true,
      amount: true,
      paymentAllocations: {
        where: { payment: { status: 'POSTED' } },
        select: { amount: true, voidedAt: true },
      },
    },
  });

  // Compute total paid across all items
  const paidAmount = items.reduce((total, item) => {
    const itemPaid = item.paymentAllocations.reduce((sum, alloc) => {
      if (alloc.voidedAt) return sum;
      return sum.plus(new Decimal(alloc.amount));
    }, new Decimal(0));
    return total.plus(itemPaid);
  }, new Decimal(0)).toDecimalPlaces(2);

  const status = deriveStatus(invoice, paidAmount);

  return client.invoice.update({
    where: { id: invoiceId },
    data: { paidAmount, status },
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
