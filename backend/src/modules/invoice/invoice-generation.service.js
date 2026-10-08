const { Prisma } = require('@prisma/client');

const prisma = require('../../lib/prisma');
const { businessToday } = require('../../lib/business-date');
const { toDateOnly } = require('../../lib/money');
const {
  addMonths,
  billingPeriodStart,
  cycleCharges,
  normalizeRentCycle,
  paymentDueDate,
} = require('../../lib/rent-cycle');
const { createInvoiceWithinTransaction } = require('./invoice.service');

const Decimal = Prisma.Decimal;

/**
 * Automatic rent-cycle invoicing.
 *
 * A lease bills one invoice per cycle. When a cycle closes — the next invoice
 * date arrives — an invoice is raised for it and the schedule moves on by the
 * same number of months. Only ACTIVE leases are billed: a DRAFT lease has not
 * begun, and an EXPIRED or TERMINATED one is done, so neither generates money.
 *
 * Generation is idempotent twice over. Each run takes a row lock on the lease
 * and advances its schedule in the same transaction that posts the invoice, so
 * two schedulers cannot both bill a cycle; and the invoice's own
 * `(leaseId, billingPeriodStart)` unique index is the database backstop if they
 * race anyway.
 *
 * There is no external cron and no scheduler package: `startInvoiceScheduler`
 * is a plain in-process interval, and it also catches up, so billing resumes by
 * itself after the server has been down. It is the same "no scheduler
 * dependency for catch-up" shape the lease reminders use.
 */

/** A lease the scheduler is allowed to bill, optionally within one organization. */
function billableLeaseWhere(organizationId) {
  return {
    status: 'ACTIVE',
    deletedAt: null,
    tenant: { deletedAt: null },
    apartment: {
      deletedAt: null,
      floor: {
        deletedAt: null,
        building: { deletedAt: null, ...(organizationId ? { organizationId } : {}) },
      },
    },
    ...(organizationId ? { organizationId } : {}),
  };
}

/**
 * The two charges one cycle invoices: a cycle of rent, and a cycle of the
 * service fee. Each is stated in the currency the lease agrees it in; the
 * service fee line is left out when the lease carries no fee, rather than
 * billing a zero.
 */
function cycleInvoiceItems(lease, charges) {
  const label = charges.months === 1 ? 'month' : 'months';
  const items = [
    {
      type: 'RENT',
      description: `Rent (${charges.months} ${label})`,
      quantity: charges.months,
      unitPrice: Number(lease.monthlyRent),
    },
  ];
  if (new Decimal(lease.serviceFee || 0).greaterThan(0)) {
    items.push({
      type: 'SERVICE_FEE',
      description: `Service fee (${charges.months} ${label})`,
      quantity: charges.months,
      unitPrice: Number(lease.serviceFee),
    });
  }
  return items;
}

async function rentDateReadingItems(tx, organizationId, leaseId, invoiceDate) {
  const readings = await tx.meterReading.findMany({
    where: {
      leaseId, readingDate: invoiceDate, deletedAt: null, invoiceItem: null,
      readingKind: { not: 'MOVE_IN' },
      meter: { deletedAt: null, apartment: { deletedAt: null, floor: { deletedAt: null, building: { organizationId, deletedAt: null } } } },
    },
    select: { id: true, meter: { select: { utilityType: true } } },
    orderBy: { id: 'asc' },
  });
  return readings.map(reading => ({ type: reading.meter.utilityType, meterReadingId: reading.id }));
}

/**
 * Raise the next invoice for one lease and move its schedule on, atomically.
 *
 * Returns `{ advanced: false }` when the lease has nothing left to bill this
 * run, and `{ advanced: true, invoice }` after it has moved the schedule on —
 * `invoice` is null when the period had already been billed, which is the only
 * case where advancing moves past a cycle without raising one. A cycle that
 * would run past the lease's own end date is never billed, and the schedule is
 * closed so a lease that has quietly outlived its term stops being scanned.
 */
async function runCycleForLease(leaseId, asOf) {
  return prisma.$transaction(async (tx) => {
    // One biller at a time for this lease. `createInvoiceWithinTransaction`
    // takes the organization lock later, so locks are always lease then
    // organization and can never run the other way round.
    await tx.$queryRaw`SELECT id FROM \`Lease\` WHERE id = ${leaseId} FOR UPDATE`;

    const lease = await tx.lease.findFirst({
      where: { id: leaseId, deletedAt: null, status: 'ACTIVE' },
      select: {
        id: true, organizationId: true, startDate: true, endDate: true,
        monthlyRent: true, serviceFee: true, rentCycleMonths: true,
        nextInvoiceDate: true, lastInvoiceDate: true, paymentDueDay: true,
      },
    });
    if (!lease || !lease.nextInvoiceDate) return { advanced: false };

    const periodEnd = toDateOnly(lease.nextInvoiceDate);
    if (!periodEnd || periodEnd > asOf) return { advanced: false };

    const leaseEnd = toDateOnly(lease.endDate);
    if (leaseEnd && periodEnd > leaseEnd) {
      // The term is over before this cycle would close: stop billing, and close
      // the schedule so the lease is no longer a candidate on every run.
      await tx.lease.updateMany({ where: { id: leaseId }, data: { nextInvoiceDate: null } });
      return { advanced: false };
    }

    const cycle = normalizeRentCycle(lease.rentCycleMonths);
    const periodStart = billingPeriodStart(periodEnd, cycle);

    // A period may already have been billed even though the schedule still
    // points at it — the crash window between posting and advancing. Never bill
    // it twice; just move the schedule on.
    const existing = await tx.invoice.findFirst({
      where: { leaseId, billingPeriodStart: periodStart },
      select: { id: true },
    });

    let invoice = null;
    if (!existing) {
      invoice = await createInvoiceWithinTransaction(tx, lease.organizationId, {
        leaseId,
        invoiceDate: periodEnd,
        dueDate: paymentDueDate(periodEnd, lease.paymentDueDay),
        notes: null,
        billingPeriodStart: periodStart,
        items: [...cycleInvoiceItems(lease, cycleCharges(lease)), ...await rentDateReadingItems(tx, lease.organizationId, leaseId, periodEnd)],
      });
    }

    await tx.lease.updateMany({
      where: { id: leaseId },
      data: { nextInvoiceDate: addMonths(periodEnd, cycle), lastInvoiceDate: periodEnd },
    });

    return { advanced: true, invoice };
  });
}

/**
 * Generate every invoice that has come due.
 *
 * Each lease is caught up one cycle at a time, up to `maxCatchUpPerLease`, so a
 * server that was down for a while raises each missed invoice rather than only
 * the latest, while one bad lease can never loop forever. Pass an
 * `organizationId` to bill a single organization; omit it to sweep every
 * organization the scheduler can see.
 */
async function generateDueInvoices({ organizationId = null, asOf, maxCatchUpPerLease = 24 } = {}) {
  const today = toDateOnly(asOf || businessToday());
  if (!today) throw new Error('A valid as-of date is required to generate invoices.');

  const invoices = [];
  const seen = new Set();
  let batches = 0;

  while (batches < 1000) {
    batches += 1;
    const due = await prisma.lease.findMany({
      where: {
        ...billableLeaseWhere(organizationId),
        nextInvoiceDate: { lte: today },
        ...(seen.size ? { id: { notIn: [...seen] } } : {}),
      },
      orderBy: [{ nextInvoiceDate: 'asc' }, { id: 'asc' }],
      take: 200,
      select: { id: true },
    });
    if (!due.length) break;

    for (const { id } of due) {
      seen.add(id);
      for (let cycle = 0; cycle < maxCatchUpPerLease; cycle += 1) {
        const outcome = await runCycleForLease(id, today);
        if (!outcome.advanced) break;
        if (outcome.invoice) invoices.push(outcome.invoice);
      }
    }
  }

  return invoices;
}

/**
 * Run generation on a timer for as long as this process lives.
 *
 * The first pass is shortly after boot so a restart catches up immediately, and
 * an interval covers the leases that come due while the server is up. A single
 * timer never overlaps itself, and a failure is logged rather than allowed to
 * take the server down.
 */
const DEFAULT_INTERVAL_MS = Number(process.env.INVOICE_SCHEDULER_INTERVAL_MS || 15 * 60 * 1000);

function startInvoiceScheduler({ intervalMs = DEFAULT_INTERVAL_MS, onError = console.error } = {}) {
  if (String(process.env.INVOICE_SCHEDULER || '').toLowerCase() === 'off') return null;

  let running = false;
  async function tick() {
    if (running) return;
    running = true;
    try {
      const created = await generateDueInvoices();
      if (created.length) console.log(`Generated ${created.length} rent-cycle invoice(s).`);
    } catch (error) {
      onError('[invoice-scheduler] Unable to generate due invoices.', error);
    } finally {
      running = false;
    }
  }

  const startup = setTimeout(tick, 5000);
  if (startup.unref) startup.unref();
  const timer = setInterval(tick, intervalMs);
  if (timer.unref) timer.unref();
  return timer;
}

module.exports = {
  rentDateReadingItems,
  cycleInvoiceItems,
  generateDueInvoices,
  runCycleForLease,
  startInvoiceScheduler,
};
