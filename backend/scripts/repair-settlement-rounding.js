require('dotenv').config();

/**
 * Repairs the sub-cent residue that pre-dates the settlement-rounding fix.
 *
 * The old allocation code rounded the applied amount to cents in the invoice's
 * currency and then converted that rounded figure back to base:
 *
 *     19,000 AFN / 64 = 296.875 USD -> 296.88 USD -> 19,000.32 AFN
 *
 * so the allocation credited the invoice with 0.32 AFN the tenant never paid.
 * The invoice then read as fully paid while the receivable kept 0.32 open, and
 * no document could ever clear it.
 *
 * The allocation mirrors are what settles an item, and the closing receipt now
 * takes the item's remaining base balance, so the repair moves the ledger to the
 * mirrors rather than the other way round:
 *
 *   - the receipt's base value becomes the base value it actually applied
 *   - the journal's cash debit and receivable credit carry the same value
 *   - the tenant sub-ledger credit follows, leaving 1100 at exactly zero
 *
 * Usage:
 *   node scripts/repair-settlement-rounding.js           # dry run, prints only
 *   node scripts/repair-settlement-rounding.js --apply   # writes, inside one tx
 */

const { Prisma } = require('@prisma/client');

const prisma = require('../src/lib/prisma');
const { asMoney } = require('../src/lib/money');
const { recalculateInvoices } = require('../src/modules/payments/payment-allocation.service');

const Decimal = Prisma.Decimal;
const APPLY = process.argv.includes('--apply');
const TOLERANCE = new Decimal('0.005');

const plan = [];
const notes = [];

async function rebuildTenantBalances(client, tenantAccountId) {
  const entries = await client.tenantLedgerEntry.findMany({
    where: { tenantAccountId },
    orderBy: [{ transactionDate: 'asc' }, { createdAt: 'asc' }],
    select: { id: true, debit: true, credit: true },
  });
  let balance = new Decimal(0);
  for (const entry of entries) {
    balance = balance.plus(asMoney(entry.debit)).minus(asMoney(entry.credit));
    await client.tenantLedgerEntry.update({
      where: { id: entry.id },
      data: { balanceAfter: balance.toDecimalPlaces(2) },
    });
  }
}

async function main() {
  const payments = await prisma.payment.findMany({
    where: { status: 'POSTED' },
    select: {
      id: true, paymentNumber: true, organizationId: true, tenantId: true,
      paymentDate: true, currency: true, exchangeRate: true, amount: true, baseAmount: true,
      organization: { select: { name: true, baseCurrency: true } },
      tenant: { select: { firstName: true, lastName: true } },
      allocations: {
        where: { voidedAt: null },
        select: {
          id: true, amount: true, appliedAmount: true, baseAppliedAmount: true,
          invoiceItem: { select: { invoiceId: true, invoice: { select: { invoiceNumber: true, status: true } } } },
        },
      },
    },
    orderBy: { paymentDate: 'asc' },
  });

  for (const payment of payments) {
    const rate = new Decimal(payment.exchangeRate ?? 1);
    const nominalBase = asMoney(new Decimal(payment.amount).times(rate));
    const mirrorBase = payment.allocations.reduce(
      (total, allocation) => total.plus(asMoney(allocation.baseAppliedAmount ?? allocation.amount)),
      new Decimal(0),
    );

    const journal = await prisma.journal.findFirst({
      where: { referenceType: 'PAYMENT', referenceId: payment.id, status: 'POSTED' },
      select: {
        id: true,
        lines: { select: { id: true, baseDebit: true, baseCredit: true, account: { select: { code: true } } } },
      },
    });
    if (!journal) {
      notes.push(`${payment.paymentNumber}: no posted journal, skipped`);
      continue;
    }

    const arLines = journal.lines.filter((line) => line.account.code === '1100');
    const unallocatedLines = journal.lines.filter((line) => line.account.code === '4000');
    const receiveLines = journal.lines.filter((line) => line.baseDebit !== null
      && !['1100', '4000'].includes(line.account.code));
    if (!arLines.length || !receiveLines.length) {
      notes.push(`${payment.paymentNumber}: unexpected journal shape, skipped`);
      continue;
    }

    const arCredit = arLines.reduce((total, line) => total.plus(asMoney(line.baseCredit)), new Decimal(0));
    const unallocatedCredit = unallocatedLines.reduce((total, line) => total.plus(asMoney(line.baseCredit)), new Decimal(0));
    const cashDebit = receiveLines.reduce((total, line) => total.plus(asMoney(line.baseDebit)), new Decimal(0));

    const delta = mirrorBase.minus(arCredit);
    if (delta.abs().lessThan(TOLERANCE)) continue;
    if (delta.lessThan(0)) {
      notes.push(`${payment.paymentNumber}: ledger credits ${arCredit} more than the allocations applied (${mirrorBase}); reported only`);
      continue;
    }

    if (payment.allocations.some((allocation) => allocation.invoiceItem.invoice.status === 'CANCELLED')) {
      notes.push(`${payment.paymentNumber}: touches a cancelled invoice, reported only`);
      continue;
    }

    const newReceiptBase = mirrorBase.plus(Decimal.max(nominalBase.minus(mirrorBase), 0));
    const newUnallocated = Decimal.max(nominalBase.minus(mirrorBase), 0);
    const cashDelta = newReceiptBase.minus(cashDebit);
    const unallocatedDelta = newUnallocated.minus(unallocatedCredit);
    const invoiceIds = [...new Set(payment.allocations.map((allocation) => allocation.invoiceItem.invoiceId))];

    const ledgerEntry = await prisma.tenantLedgerEntry.findFirst({
      where: { referenceType: 'PAYMENT', referenceId: payment.id, type: 'PAYMENT' },
      select: { id: true, credit: true, tenantAccountId: true },
    });

    plan.push({
      organization: payment.organization.name,
      tenant: `${payment.tenant.firstName} ${payment.tenant.lastName}`,
      paymentNumber: payment.paymentNumber,
      currency: payment.currency,
      amount: Number(payment.amount),
      invoices: payment.allocations.map((a) => a.invoiceItem.invoice.invoiceNumber).join(', '),
      nominalBase,
      mirrorBase,
      arCredit,
      delta,
      newReceiptBase,
      paymentId: payment.id,
      newBaseAmount: newReceiptBase,
      receiveLineId: receiveLines[0].id,
      newCashDebit: newReceiptBase,
      cashDelta,
      arLineId: arLines[0].id,
      newArCredit: arCredit.plus(delta),
      arDelta: delta,
      unallocatedLineId: unallocatedLines.length ? unallocatedLines[0].id : null,
      newUnallocatedCredit: unallocatedCredit.plus(unallocatedDelta),
      unallocatedDelta,
      ledgerEntryId: ledgerEntry ? ledgerEntry.id : null,
      ledgerDelta: delta,
      tenantAccountId: ledgerEntry ? ledgerEntry.tenantAccountId : null,
      invoiceIds,
    });
  }

  if (!plan.length) {
    console.log('Nothing to repair — every posted receipt already matches its allocations.');
    for (const note of notes) console.log(`  note: ${note}`);
    return;
  }

  console.log(`${APPLY ? 'Applying' : 'Dry run:'} ${plan.length} receipt(s) to repair\n`);
  for (const item of plan) {
    console.log(
      `${item.organization} | ${item.tenant} | ${item.paymentNumber} (${item.amount} ${item.currency}) -> ${item.invoices}\n`
      + `  allocations applied ${item.mirrorBase} base but the ledger credited ${item.arCredit}`
      + `\n  raise ledger by ${item.delta}: receipt base ${item.nominalBase} -> ${item.newBaseAmount},`
      + ` cash +${item.cashDelta}, receivable +${item.arDelta}, unallocated +${item.unallocatedDelta}, tenant sub-ledger +${item.ledgerDelta}`,
    );
  }
  for (const note of notes) console.log(`  note: ${note}`);

  if (!APPLY) {
    console.log('\nRe-run with --apply to write these changes.');
    return;
  }

  await prisma.$transaction(async (tx) => {
    for (const item of plan) {
      await tx.payment.update({ where: { id: item.paymentId }, data: { baseAmount: item.newBaseAmount } });
      await tx.journalLine.update({
        where: { id: item.receiveLineId },
        data: { baseDebit: asMoney(item.newCashDebit) },
      });
      await tx.journalLine.update({
        where: { id: item.arLineId },
        data: { baseCredit: asMoney(item.newArCredit) },
      });
      if (item.unallocatedLineId && !item.unallocatedDelta.isZero()) {
        await tx.journalLine.update({
          where: { id: item.unallocatedLineId },
          data: { baseCredit: asMoney(item.newUnallocatedCredit) },
        });
      }
      if (item.ledgerEntryId) {
        const entry = await tx.tenantLedgerEntry.findUnique({ where: { id: item.ledgerEntryId }, select: { credit: true } });
        await tx.tenantLedgerEntry.update({
          where: { id: item.ledgerEntryId },
          data: { credit: asMoney(new Decimal(entry.credit).plus(item.ledgerDelta)) },
        });
      }
      await recalculateInvoices(tx, item.invoiceIds);
    }
    const tenantAccounts = [...new Set(plan.map((item) => item.tenantAccountId).filter(Boolean))];
    for (const tenantAccountId of tenantAccounts) await rebuildTenantBalances(tx, tenantAccountId);
  }, { timeout: 60000 });

  console.log('\nRepair applied.');
}

main()
  .catch((error) => {
    console.error('repair failed:', error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
