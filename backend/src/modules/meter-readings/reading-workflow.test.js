const test = require('node:test');
const assert = require('node:assert/strict');
const { calculateCharge, coversPeriod } = require('./reading-workflow');
const { recalculateMeterReadings, assertMonthIsFree } = require('./meter-reading.service');
const { createMeterReadingSchema } = require('./meter-reading.validation');
const day = value => new Date(value + 'T00:00:00Z');
test('electricity uses decimal arithmetic and two-place monetary rounding', () => {
  const result = calculateCharge('100.005', '100.105', '0.35');
  assert.equal(result.consumption.toString(), '0.1');
  assert.equal(result.amount.toString(), '0.04');
  assert.throws(() => calculateCharge(5, 4, 2), { code: 'CURRENT_READING_TOO_LOW' });
  assert.throws(() => calculateCharge(0, '999999999999', '99999999999'), { code: 'INVALID_READING_PERIOD' });
});
test('historical lease covers its usage, current tenant cannot inherit old usage', () => {
  const old = { startDate: day('2026-01-01'), endDate: day('2026-02-15'), status: 'TERMINATED' };
  const current = { startDate: day('2026-02-15'), endDate: day('2027-02-15'), status: 'ACTIVE' };
  assert.equal(coversPeriod(old, day('2026-02-01'), day('2026-02-15')), true);
  assert.equal(coversPeriod(current, day('2026-02-01'), day('2026-03-01')), false);
  assert.equal(coversPeriod(current, day('2026-02-15'), day('2026-03-01')), true);
});
function sequenceClient(rows, leases = {}) {
  return {
    meter: { findUnique: async () => ({ initialReading: 100, installationDate: day('2026-01-01'), apartmentId: 'a1' }) },
    lease: { findFirst: async ({ where }) => typeof where.id === 'string' ? leases[where.id] : null },
    meterReading: { findMany: async () => rows, update: async ({ where, data }) => Object.assign(rows.find(r => r.id === where.id), data) },
  };
}
const row = (id, date, current, extra = {}) => ({ id, readingDate: day(date), previousReading: 0, currentReading: current, consumption: 0, unitPrice: 2, amount: 0, readingKind: 'BILLING', ...extra });
test('handover bills outgoing usage and starts incoming usage from that exact baseline', async () => {
  const old = { startDate: day('2026-01-01'), endDate: day('2026-01-15'), status: 'TERMINATED' };
  const current = { startDate: day('2026-01-15'), endDate: day('2027-01-15'), status: 'ACTIVE' };
  const rows = [row('out', '2026-01-15', 120, { leaseId: 'old', readingKind: 'HANDOVER' }), row('new', '2026-02-01', 150, { leaseId: 'new' })];
  await recalculateMeterReadings('m1', sequenceClient(rows, { old, new: current }));
  assert.equal(rows[0].amount.toString(), '40');
  assert.equal(rows[1].previousReading.toString(), '120');
  assert.equal(rows[1].consumption.toString(), '30');
  assert.equal(rows[1].periodStart.toISOString().slice(0,10), '2026-01-15');
  const invalid = [row('cross', '2026-02-01', 150, { leaseId: 'new' })];
  await assert.rejects(recalculateMeterReadings('m1', sequenceClient(invalid, { new: current })), { code: 'INVALID_READING_LEASE' });
});
test('reset preserves old consumption and starts new register at explicit baseline', async () => {
  const rows = [row('reset', '2026-01-15', 130, { readingKind: 'RESET', resetBaseline: 5 }), row('next', '2026-02-01', 15)];
  await recalculateMeterReadings('m1', sequenceClient(rows));
  assert.equal(rows[0].consumption.toString(), '30');
  assert.equal(rows[1].previousReading.toString(), '5');
  assert.equal(rows[1].amount.toString(), '20');
});
test('move-in baseline does not bill vacancy consumption to incoming tenant', async () => {
  const rows = [row('in', '2026-01-15', 130, { readingKind: 'MOVE_IN' }), row('next', '2026-02-01', 140)];
  await recalculateMeterReadings('m1', sequenceClient(rows));
  assert.equal(rows[0].amount.toString(), '0');
  assert.equal(rows[0].consumption.toString(), '0');
  assert.equal(rows[1].amount.toString(), '20');
});
test('historical changes cannot rewrite issued reading snapshots', async () => {
  const rows = [row('billed', '2026-02-01', 140, { previousReading: 90, consumption: 50, amount: 100, invoiceItem: { invoice: { status: 'UNPAID', deletedAt: null } } })];
  await assert.rejects(recalculateMeterReadings('m1', sequenceClient(rows)), { code: 'METER_READING_ALREADY_BILLED' });
  assert.equal(rows[0].amount, 100);
});
test('handover events do not occupy monthly billing key, duplicate monthly bills are rejected', async () => {
  const client = { meterReading: { findMany: async () => [row('out', '2026-01-15', 120, { readingKind: 'HANDOVER' })] } };
  assert.equal(await assertMonthIsFree(client, 'm1', day('2026-01-18')), '1404-10');
  client.meterReading.findMany = async () => [row('monthly', '2026-01-15', 120)];
  await assert.rejects(assertMonthIsFree(client, 'm1', day('2026-01-18')), { code: 'METER_READING_MONTH_EXISTS' });
});
test('backend rejects blank values, invalid calendar dates, missing reset reason, and excess precision', () => {
  const data = { meterId: 'm1', leaseId: 'l1', periodStart: '2026-01-01', readingDate: '2026-02-01', currentReading: 150, unitPrice: 2.1234, currency: 'AFN' };
  assert.equal(createMeterReadingSchema.safeParse(data).success, true);
  for (const patch of [{ currentReading: '' }, { readingDate: '2026-02-30' }, { readingKind: 'RESET', resetBaseline: 0 }, { unitPrice: 1.12345 }, { currentReading: 1.1234 }]) assert.equal(createMeterReadingSchema.safeParse({ ...data, ...patch }).success, false);
});
