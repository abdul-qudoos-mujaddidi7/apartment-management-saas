const test = require('node:test');
const assert = require('node:assert/strict');
const { rentDateReadingItems } = require('./invoice-generation.service');

test('rent invoices select same-date unbilled readings from their lease and organization', async () => {
  const date = new Date('2026-10-08T00:00:00Z');
  const client = { meterReading: { findMany: async ({ where }) => {
    assert.equal(where.leaseId, 'lease1');
    assert.equal(where.readingDate, date);
    assert.equal(where.deletedAt, null);
    assert.equal(where.invoiceItem, null);
    assert.deepEqual(where.readingKind, { not: 'MOVE_IN' });
    assert.equal(where.meter.apartment.floor.building.organizationId, 'org1');
    return [{ id: 'water1', meter: { utilityType: 'WATER' } }, { id: 'electric1', meter: { utilityType: 'ELECTRICITY' } }];
  } } };
  assert.deepEqual(await rentDateReadingItems(client, 'org1', 'lease1', date), [
    { type: 'WATER', meterReadingId: 'water1' }, { type: 'ELECTRICITY', meterReadingId: 'electric1' },
  ]);
});
