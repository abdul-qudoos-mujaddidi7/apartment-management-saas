const test = require('node:test');
const assert = require('node:assert/strict');

const {
  RENT_CYCLE_MONTHS,
  addMonths,
  billingPeriodStart,
  cycleCharges,
  initialNextInvoiceDate,
  isRentCycleMonths,
  normalizeRentCycle,
  paymentDueDate,
} = require('./rent-cycle');

const day = (text) => new Date(`${text}T00:00:00Z`);
const key = (value) => value.toISOString().slice(0, 10);

test('a month is added keeping the day, and clamped where the month is short', () => {
  assert.equal(key(addMonths(day('2026-01-15'), 1)), '2026-02-15');
  assert.equal(key(addMonths(day('2026-01-31'), 1)), '2026-02-28');
  assert.equal(key(addMonths(day('2024-01-31'), 1)), '2024-02-29');
  assert.equal(key(addMonths(day('2026-08-31'), 6)), '2027-02-28');
  assert.equal(key(addMonths(day('2026-12-15'), 1)), '2027-01-15');
  assert.equal(key(addMonths(day('2026-03-15'), -3)), '2025-12-15');
});

test('only 1, 2, 3, 4, 6 or 12 months are a valid cycle', () => {
  assert.deepEqual(RENT_CYCLE_MONTHS, [1, 2, 3, 4, 6, 12]);
  for (const months of RENT_CYCLE_MONTHS) assert.equal(isRentCycleMonths(months), true);
  for (const months of [0, 5, 7, 8, 9, 10, 11, 13, 'x', null, undefined]) {
    assert.equal(isRentCycleMonths(months), false);
  }
  // Anything unrecognised bills monthly rather than crashing a schedule.
  assert.equal(normalizeRentCycle(5), 1);
  assert.equal(normalizeRentCycle('6'), 6);
});

test('the first invoice falls one cycle after the lease starts', () => {
  assert.equal(key(initialNextInvoiceDate(day('2026-01-01'), 1)), '2026-02-01');
  assert.equal(key(initialNextInvoiceDate(day('2026-01-01'), 3)), '2026-04-01');
  assert.equal(key(initialNextInvoiceDate(day('2026-01-31'), 1)), '2026-02-28');
});

test('the billing period starts one cycle before the date it is billed for', () => {
  const periodEnd = day('2026-04-01');
  assert.equal(key(billingPeriodStart(periodEnd, 3)), '2026-01-01');
  assert.equal(key(billingPeriodStart(periodEnd, 1)), '2026-03-01');
});

test('a cycle charges rent and the fee multiplied by its months', () => {
  const charges = cycleCharges({ monthlyRent: 10000, serviceFee: 1000, rentCycleMonths: 3 });
  assert.equal(charges.months, 3);
  assert.equal(charges.rentTotal.toString(), '30000');
  assert.equal(charges.serviceFeeTotal.toString(), '3000');
  assert.equal(charges.invoiceTotal.toString(), '33000');
});

test('a monthly cycle charges exactly the monthly figures', () => {
  const charges = cycleCharges({ monthlyRent: '1200.50', serviceFee: '99.99', rentCycleMonths: 1 });
  assert.equal(charges.rentTotal.toString(), '1200.5');
  assert.equal(charges.serviceFeeTotal.toString(), '99.99');
  assert.equal(charges.invoiceTotal.toString(), '1300.49');
});

test('the payment due day is honoured, rolling forward once it has passed', () => {
  assert.equal(key(paymentDueDate(day('2026-04-01'), 5)), '2026-04-05');
  assert.equal(key(paymentDueDate(day('2026-04-20'), 5)), '2026-05-05');
  assert.equal(key(paymentDueDate(day('2026-04-01'), 28)), '2026-04-28');
});
