const test = require('node:test');
const assert = require('node:assert/strict');
const prisma = require('../../lib/prisma');
const { meterReport, reportSchema, summarize, reportReading } = require('./meter-report.service');
const row = overrides => ({ meterId: 'm1', meter: { utilityType: 'ELECTRICITY', unit: 'kWh' },
  currency: 'AFN', amount: '12.30', consumption: '1.125', readingKind: 'BILLING', ...overrides });
const billed = (status = 'POSTED', overrides = {}) => ({ amount: '12.30', invoice: { status: 'UNPAID', deletedAt: null },
  paymentAllocations: [{ amount: '10', appliedAmount: '2.30', voidedAt: null }], ...overrides });

test('report balances use applied amounts and ignore cancelled invoices and voided allocations', () => {
  const partial = reportReading(row({ invoiceItem: billed() }));
  assert.equal(partial.paidAmount, 2.3);
  assert.equal(partial.outstanding, 10);
  assert.equal(partial.billingStatus, 'PARTIALLY_PAID');
  const cancelled = reportReading(row({ invoiceItem: billed('POSTED', { invoice: { status: 'CANCELLED' } }) }));
  assert.equal(cancelled.paidAmount, 0);
  assert.equal(cancelled.outstanding, 12.3);
  assert.equal(cancelled.billingStatus, 'UNBILLED');
  const voided = reportReading(row({ invoiceItem: billed('POSTED', { paymentAllocations: [{ amount: 12.3, voidedAt: new Date() }] }) }));
  assert.equal(voided.paidAmount, 0);
  assert.equal(voided.billingStatus, 'BILLED');
  const paid = reportReading(row({ invoiceItem: billed('POSTED', { paymentAllocations: [{ appliedAmount: '12.30' }] }) }));
  assert.equal(paid.outstanding, 0);
  assert.equal(paid.billingStatus, 'PAID');
});

test('report totals keep currencies and units separate and do not bill move-in baselines', () => {
  const summary = summarize([
    row({ amount: '0.10', consumption: '0.001' }), row({ amount: '0.20', consumption: '0.002' }),
    row({ meterId: 'm2', currency: 'USD', amount: '4.50', consumption: '2.500' }),
    row({ meterId: 'm3', meter: { utilityType: 'WATER', unit: 'm³' }, amount: 0, consumption: 0, readingKind: 'MOVE_IN' }),
  ]);
  assert.equal(summary.readingCount, 4);
  assert.equal(summary.meterCount, 3);
  assert.equal(summary.consumption.length, 2);
  assert.equal(summary.consumption[0].consumption, 2.503);
  assert.equal(summary.currencies[0].charge, 0.3);
  assert.equal(summary.currencies[0].unbilled, 0.3);
  assert.equal(summary.currencies[1].charge, 4.5);
  assert.equal(summary.statuses.BASELINE, 1);
  assert.deepEqual(summarize([]), { readingCount: 0, meterCount: 0, statuses: {}, consumption: [], currencies: [] });
});

test('report validates calendar dates, date ranges, utility types and page limits', () => {
  for (const query of [{ dateFrom: '2026-02-30' }, { dateFrom: '2026-10-07', dateTo: '2026-10-01' }, { utilityType: 'INVALID' }, { pageSize: 101 }]) {
    assert.equal(reportSchema.safeParse(query).success, false);
  }
  assert.equal(reportSchema.parse({ export: 'false' }).export, false);
  assert.equal(reportSchema.parse({ export: 'true' }).export, true);
});

test('report scopes detail and summary queries identically and export includes all filtered rows', async () => {
  const original = { findMany: prisma.meterReading.findMany, transaction: prisma.$transaction };
  const queries = [];
  prisma.meterReading.findMany = async query => { queries.push(query); return [row({ id: 'r1' }), row({ id: 'r2' })]; };
  prisma.$transaction = queries => Promise.all(queries);
  try {
    const filters = reportSchema.parse({ page: 2, pageSize: 1, utilityType: 'GAS', meterId: 'm1', buildingId: 'b1', search: 'Ali', dateFrom: '2026-01-01' });
    const result = await meterReport('org1', filters);
    assert.equal(result.summary.readingCount, 2);
    assert.equal(result.pagination.totalPages, 2);
    assert.deepEqual(queries[0].where, queries[1].where);
    assert.equal(queries[0].skip, 1);
    assert.equal(queries[0].take, 1);
    const where = queries[0].where;
    assert.equal(where.deletedAt, null);
    assert.equal(where.meter.deletedAt, null);
    assert.equal(where.meter.utilityType, 'GAS');
    assert.equal(where.meter.id, 'm1');
    assert.equal(where.meter.apartment.floor.building.organizationId, 'org1');
    assert.equal(where.meter.apartment.floor.building.id, 'b1');
    assert.equal(where.meter.apartment.floor.building.deletedAt, null);
    assert.equal(where.OR.some(term => term.lease?.tenant?.firstName?.contains === 'Ali'), true);
    queries.length = 0;
    await meterReport('org1', { ...filters, export: true });
    assert.equal('take' in queries[0], false);
    assert.equal('skip' in queries[0], false);
  } finally { prisma.meterReading.findMany = original.findMany; prisma.$transaction = original.transaction; }
});
