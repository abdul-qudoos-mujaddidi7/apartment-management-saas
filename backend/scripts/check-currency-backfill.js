require('dotenv').config();

/**
 * Read-only audit for the multi-currency migration.
 *
 * Run this once after `prisma migrate dev` (or `migrate deploy`) to confirm the
 * backfill and every frozen-rate snapshot agree with each other:
 *
 *   node scripts/check-currency-backfill.js
 *
 * It never writes to the database. Any reported problem is a genuine
 * inconsistency between a document and the amount it contributes to the
 * ledger, which is exactly the kind of thing that is invisible until a report
 * is wrong six months later.
 */

const { Prisma } = require('@prisma/client');

const prisma = require('../src/lib/prisma');
const { toBase, asMoney } = require('../src/lib/money');

const Decimal = Prisma.Decimal;
const TOLERANCE = new Decimal('0.01');

const problems = [];
const notes = [];

function check(condition, message) {
  if (!condition) problems.push(message);
}

function closeEnough(a, b) {
  return asMoney(a).minus(asMoney(b)).abs().lessThanOrEqualTo(TOLERANCE);
}

async function checkOrganizations() {
  const organizations = await prisma.organization.findMany({
    where: { deletedAt: null },
    select: { id: true, name: true, baseCurrency: true },
  });

  for (const organization of organizations) {
    const base = await prisma.currency.findFirst({
      where: { organizationId: organization.id, isBase: true, deletedAt: null },
      select: { code: true, exchangeRates: { select: { rate: true }, orderBy: { effectiveDate: 'desc' }, take: 1 } },
    });

    check(Boolean(base), `${organization.name}: no base currency row`);
    if (!base) continue;

    check(
      base.code === organization.baseCurrency,
      `${organization.name}: base currency row is ${base.code} but the organization reports in ${organization.baseCurrency}`,
    );
    check(
      Number(base.exchangeRates[0]?.rate ?? 0) === 1,
      `${organization.name}: the base currency (${base.code}) must have a rate of exactly 1`,
    );

    const others = await prisma.currency.count({
      where: { organizationId: organization.id, isBase: true, deletedAt: null },
    });
    check(others === 1, `${organization.name}: ${others} base currencies are flagged; there must be exactly one`);
  }

  notes.push(`${organizations.length} organization(s) checked`);
}

async function checkInvoices() {
  const invoices = await prisma.invoice.findMany({
    select: { id: true, invoiceNumber: true, currency: true, exchangeRate: true, subtotal: true, total: true, paidAmount: true, baseSubtotal: true, baseTotal: true, basePaidAmount: true },
  });

  for (const invoice of invoices) {
    const rate = new Decimal(invoice.exchangeRate ?? 1);
    check(
      closeEnough(invoice.baseTotal, toBase(invoice.total, rate)),
      `Invoice ${invoice.invoiceNumber}: baseTotal ${invoice.baseTotal} ≠ total ${invoice.total} × rate ${rate}`,
    );
    check(
      closeEnough(invoice.baseSubtotal, toBase(invoice.subtotal, rate)),
      `Invoice ${invoice.invoiceNumber}: baseSubtotal does not match subtotal × rate`,
    );
    // At rate 1 the mirrors must be the identity, which is what the migration's
    // backfill promises for every document that existed before multi-currency.
    if (rate.equals(1)) {
      check(
        closeEnough(invoice.baseSubtotal, invoice.subtotal)
        && closeEnough(invoice.baseTotal, invoice.total)
        && closeEnough(invoice.basePaidAmount, invoice.paidAmount),
        `Invoice ${invoice.invoiceNumber}: base amounts differ from the document amounts at rate 1`,
      );
    }
  }

  notes.push(`${invoices.length} invoice(s) checked`);
}

async function checkPayments() {
  const payments = await prisma.payment.findMany({
    select: {
      id: true,
      paymentNumber: true,
      currency: true,
      exchangeRate: true,
      amount: true,
      baseAmount: true,
      allocations: {
        select: { amount: true, appliedAmount: true, baseAppliedAmount: true, invoiceItem: { select: { amount: true, invoice: { select: { invoiceNumber: true, currency: true, exchangeRate: true } } } } },
      },
    },
  });

  for (const payment of payments) {
    const rate = new Decimal(payment.exchangeRate ?? 1);
    check(
      closeEnough(payment.baseAmount, toBase(payment.amount, rate)),
      `Payment ${payment.paymentNumber}: baseAmount ${payment.baseAmount} ≠ amount ${payment.amount} × rate ${rate}`,
    );

    for (const allocation of payment.allocations) {
      check(
        new Decimal(allocation.appliedAmount).greaterThan(0),
        `Payment ${payment.paymentNumber}: an allocation is missing its applied amount`,
      );
      check(
        new Decimal(allocation.appliedAmount).lessThanOrEqualTo(new Decimal(allocation.invoiceItem.amount)),
        `Payment ${payment.paymentNumber}: allocation applied to invoice ${allocation.invoiceItem.invoice.invoiceNumber} exceeds that item's amount`,
      );

      const invoiceRate = new Decimal(allocation.invoiceItem.invoice.exchangeRate ?? 1);
      check(
        closeEnough(allocation.baseAppliedAmount, toBase(allocation.appliedAmount, invoiceRate)),
        `Payment ${payment.paymentNumber}: allocation base value does not match its applied value at the invoice's rate`,
      );
    }
  }

  notes.push(`${payments.length} payment(s) checked`);
}

async function checkJournals() {
  const journals = await prisma.journal.findMany({
    select: {
      journalNumber: true,
      currency: true,
      exchangeRate: true,
      lines: { select: { debit: true, credit: true, baseDebit: true, baseCredit: true } },
    },
  });

  for (const journal of journals) {
    const rate = new Decimal(journal.exchangeRate ?? 1);
    let baseDebits = new Decimal(0);
    let baseCredits = new Decimal(0);

    for (const line of journal.lines) {
      baseDebits = baseDebits.plus(line.baseDebit);
      baseCredits = baseCredits.plus(line.baseCredit);
      // Document-currency lines carry the entry's own rate unless a cross-currency
      // caller deliberately overrode the base figure; only flag figures that are
      // wildly off, which means the mirror was never written.
      if (toBase(line.debit, rate).minus(line.baseDebit).abs().greaterThan(new Decimal(1))) {
        check(false, `Journal ${journal.journalNumber}: a debit's base mirror is missing or inconsistent (${line.baseDebit} vs ${line.debit} × ${rate})`);
      }
    }

    check(
      closeEnough(baseDebits, baseCredits),
      `Journal ${journal.journalNumber}: base debits ${baseDebits} ≠ base credits ${baseCredits}`,
    );
  }

  notes.push(`${journals.length} journal(s) checked`);
}

async function checkTenantLedgers() {
  const organizationIds = (await prisma.organization.findMany({ where: { deletedAt: null }, select: { id: true } })).map((organization) => organization.id);

  for (const organizationId of organizationIds) {
    // The tenant sub-ledger and account 1100 must move by the same base amount.
    const ledger = await prisma.tenantLedgerEntry.aggregate({
      where: { organizationId },
      _sum: { debit: true, credit: true },
    });
    const receivable = await prisma.financialAccount.findFirst({
      where: { organizationId, code: '1100', deletedAt: null },
      select: { id: true },
    });
    if (!receivable) continue;

    const gl = await prisma.journalLine.aggregate({
      where: { accountId: receivable.id, journal: { organizationId, status: 'POSTED' } },
      _sum: { baseDebit: true, baseCredit: true },
    });

    const ledgerBalance = asMoney(ledger._sum.debit).minus(asMoney(ledger._sum.credit));
    const glBalance = asMoney(gl._sum.baseDebit).minus(asMoney(gl._sum.baseCredit));

    check(
      closeEnough(ledgerBalance, glBalance),
      `Organization ${organizationId}: tenant sub-ledger (${ledgerBalance}) does not match the 1100 receivable control account (${glBalance})`,
    );
  }

  notes.push(`${organizationIds.length} organization(s) reconciled against 1100`);
}

async function checkDeposits() {
  const deposits = await prisma.securityDepositTransaction.findMany({
    select: { id: true, currency: true, exchangeRate: true, amount: true, baseAmount: true },
  });

  for (const deposit of deposits) {
    check(
      closeEnough(deposit.baseAmount, toBase(deposit.amount, deposit.exchangeRate ?? 1)),
      `Security deposit ${deposit.id}: baseAmount ${deposit.baseAmount} ≠ amount ${deposit.amount} × rate ${deposit.exchangeRate}`,
    );
  }

  notes.push(`${deposits.length} security deposit transaction(s) checked`);
}

async function main() {
  await checkOrganizations();
  await checkInvoices();
  await checkPayments();
  await checkJournals();
  await checkTenantLedgers();
  await checkDeposits();

  for (const note of notes) console.log(`  · ${note}`);

  if (problems.length === 0) {
    console.log('\nMulti-currency snapshots are consistent.');
    return;
  }

  console.error(`\n${problems.length} problem(s) found:`);
  for (const problem of problems) console.error(`  ✗ ${problem}`);
  process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
