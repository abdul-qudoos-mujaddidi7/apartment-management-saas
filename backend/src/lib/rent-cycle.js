const { Prisma } = require('@prisma/client');

const Decimal = Prisma.Decimal;
const { asMoney, toDateOnly } = require('./money');

/**
 * The billing cycle a lease rents on.
 *
 * A lease bills one invoice per cycle. The cycle is a whole number of months —
 * monthly, quarterly, every four or six months, or yearly — and it does two
 * things at once: it says how much one invoice charges (rent and the service
 * fee are multiplied by it) and how far the schedule moves on after each
 * invoice is raised.
 */
const RENT_CYCLE_MONTHS = [1, 2, 3, 4, 6, 12];

const isRentCycleMonths = (value) => RENT_CYCLE_MONTHS.includes(Number(value));

/** A cycle read from a stored row, falling back to monthly for anything odd. */
const normalizeRentCycle = (value) => (isRentCycleMonths(value) ? Number(value) : 1);

/**
 * A date moved on by whole calendar months.
 *
 * The day is kept where the target month is long enough and clamped where it is
 * not — 31 January plus one month is the last day of February, not the 3rd of
 * March. Dates in this application are stored as UTC midnights, so the
 * arithmetic never leaves UTC and the day the office typed is the day it gets
 * back.
 */
function addMonths(value, months) {
  const date = toDateOnly(value);
  if (!date) return null;

  const day = date.getUTCDate();
  const month = date.getUTCMonth() + Number(months);
  const firstOfTarget = new Date(Date.UTC(date.getUTCFullYear(), month, 1));
  const lastDayOfTarget = new Date(Date.UTC(firstOfTarget.getUTCFullYear(), firstOfTarget.getUTCMonth() + 1, 0)).getUTCDate();

  return new Date(Date.UTC(
    firstOfTarget.getUTCFullYear(),
    firstOfTarget.getUTCMonth(),
    Math.min(day, lastDayOfTarget),
  ));
}

/**
 * When the first invoice of a lease falls due: the start date plus one cycle.
 *
 * Billing is in arrears — a cycle is invoiced once its months have been served
 * — so a lease that begins today on a three-month cycle is first billed three
 * months from now. Every later invoice is this date pushed on by the same
 * cycle.
 */
function initialNextInvoiceDate(startDate, rentCycleMonths) {
  return addMonths(startDate, normalizeRentCycle(rentCycleMonths));
}

/** The first day of the period an invoice dated `periodEnd` covers. */
function billingPeriodStart(periodEnd, rentCycleMonths) {
  return addMonths(periodEnd, -normalizeRentCycle(rentCycleMonths));
}

/**
 * What one cycle charges, in the currency each figure is stated in.
 *
 * The two charges are deliberately kept apart rather than summed here, because
 * rent and the service fee may be agreed in different currencies; the invoice
 * adds them up in the organization's reporting currency when it posts them.
 * When both are stated in the same currency — the ordinary case — their sum is
 * exactly the invoice total.
 */
function cycleCharges(lease) {
  const months = normalizeRentCycle(lease?.rentCycleMonths);
  const rentTotal = asMoney(new Decimal(lease?.monthlyRent || 0).times(months));
  const serviceFeeTotal = asMoney(new Decimal(lease?.serviceFee || 0).times(months));
  return { months, rentTotal, serviceFeeTotal, invoiceTotal: rentTotal.plus(serviceFeeTotal) };
}

/**
 * The day the money for a period is due: the lease's payment due day within the
 * month the period closes, rolled to the next month if that day has already
 * passed.
 */
function paymentDueDate(periodEnd, paymentDueDay) {
  const date = toDateOnly(periodEnd);
  if (!date) return null;
  const day = Math.min(Math.max(Number(paymentDueDay) || 1, 1), 28);
  const sameMonth = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), day));
  return sameMonth < date ? addMonths(sameMonth, 1) : sameMonth;
}

module.exports = {
  RENT_CYCLE_MONTHS,
  addMonths,
  billingPeriodStart,
  cycleCharges,
  initialNextInvoiceDate,
  isRentCycleMonths,
  normalizeRentCycle,
  paymentDueDate,
};
