/**
 * payment-allocation-helpers.js
 *
 * Derived (not persisted) helpers for item-level payment allocation.
 * All calculations use Prisma Decimal for safe money arithmetic.
 */

const { Prisma } = require('@prisma/client');
const Decimal = Prisma.Decimal;

/**
 * Derive the payment status for a single InvoiceItem.
 *
 *  UNPAID        — paidAmount == 0
 *  PARTIALLY_PAID — 0 < paidAmount < amount
 *  PAID          — paidAmount >= amount
 */
function deriveItemStatus(amount, paidAmount) {
  if (paidAmount.greaterThanOrEqualTo(amount)) return 'PAID';
  if (paidAmount.isZero()) return 'UNPAID';
  return 'PARTIALLY_PAID';
}

/**
 * Compute the outstanding balance for an InvoiceItem.
 */
function deriveItemBalance(amount, paidAmount) {
  return amount.minus(paidAmount).toDecimalPlaces(2);
}

/**
 * Sum all valid (POSTED, non-voided) payment allocations for an InvoiceItem.
 */
function sumItemAllocations(allocations) {
  return allocations.reduce((total, alloc) => {
    if (alloc.voidedAt) return total;
    return total.plus(new Decimal(alloc.amount));
  }, new Decimal(0)).toDecimalPlaces(2);
}

/**
 * Derive Invoice-level paidAmount and status from its items.
 *
 * @param {Array} items — InvoiceItems each with a `paymentAllocations` array
 * @param {string|null} dueDate — optional due date for OVERDUE check
 * @returns {{ paidAmount: Decimal, status: string }}
 */
function deriveInvoiceFromItems(items, dueDate) {
  const paidAmount = items.reduce((total, item) => {
    return total.plus(sumItemAllocations(item.paymentAllocations || []));
  }, new Decimal(0)).toDecimalPlaces(2);

  const total = items.reduce((sum, item) => {
    return sum.plus(new Decimal(item.amount));
  }, new Decimal(0)).toDecimalPlaces(2);

  let status;
  if (paidAmount.greaterThanOrEqualTo(total)) {
    status = 'PAID';
  } else if (paidAmount.isZero()) {
    status = 'UNPAID';
  } else {
    status = 'PARTIALLY_PAID';
  }

  // Check overdue
  if (status !== 'PAID' && status !== 'CANCELLED' && dueDate) {
    const today = new Date();
    const todayAtMidnight = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
    if (new Date(dueDate) < todayAtMidnight && paidAmount.lessThan(total)) {
      status = 'OVERDUE';
    }
  }

  return { paidAmount, status };
}

module.exports = {
  deriveItemStatus,
  deriveItemBalance,
  sumItemAllocations,
  deriveInvoiceFromItems,
};
