/** Preserve invoice context while reporting only the selected charge's currency and totals. */
export function invoiceItemDocument(invoice, item) {
  const amount = Number(item.amount || 0);
  const paid = Number(item.paidAmount || 0);
  return {
    ...invoice,
    itemOnly: true,
    items: [item],
    currency: item.currency || invoice.currency,
    total: amount,
    paidAmount: paid,
    itemBalance: item.balance == null ? Math.max(0, amount - paid) : Number(item.balance),
    status: invoice.status === 'CANCELLED' ? 'CANCELLED' : item.paymentStatus || (paid >= amount ? 'PAID' : paid > 0 ? 'PARTIALLY_PAID' : 'UNPAID'),
  };
}
