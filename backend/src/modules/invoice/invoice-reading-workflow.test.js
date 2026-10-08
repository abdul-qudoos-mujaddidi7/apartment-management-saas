const test = require('node:test');
const assert = require('node:assert/strict');
const currencyService = require('../currency/currency.service');
const originalPrice = currencyService.priceDocument;
currencyService.priceDocument = async (_client, _org, { currency }) => ({ currency, exchangeRate: currency === 'USD' ? 70 : 1 });
const { prepareInvoiceItems } = require('./invoice.service');
currencyService.priceDocument = originalPrice;
const day = text => new Date(text + 'T00:00:00Z');
const lease = { id: 'historical', apartmentId: 'a1', startDate: day('2026-01-01'), endDate: day('2026-02-15'), status: 'TERMINATED' };
const reading = { id: 'r1', meterId: 'm1', leaseId: lease.id, periodStart: day('2026-02-01'), readingDate: day('2026-02-15'), readingKind: 'HANDOVER', consumption: '20.125', unitPrice: '2.1234', amount: '42.74', currency: 'USD', meter: { utilityType: 'ELECTRICITY', meterNumber: '005', unit: 'kWh' } };
function clientFor(record = reading) {
  const locks = [];
  const client = {
    locks,
    $queryRaw: async strings => { locks.push(strings.join('?')); return []; },
    lease: { findFirst: async () => null },
    meterReading: {
      findMany: async ({ where }) => { assert.equal(where.meter.apartment.organizationId, 'org1'); return [{ meterId: 'm1' }]; },
      findFirst: async ({ where }) => {
        assert.equal(where.deletedAt, null);
        assert.equal(where.invoiceItem, null);
        assert.equal(where.meter.apartmentId, 'a1');
        assert.equal(where.meter.apartment.floor.building.organizationId, 'org1');
        return record;
      },
    },
  };
  return client;
}
const prepare = (client, selected = lease, items = [{ type: 'ELECTRICITY', meterReadingId: 'r1', quantity: 999, unitPrice: 999, amount: 999 }]) => prepareInvoiceItems(client, 'org1', selected, items, { baseCurrency: 'AFN', date: day('2026-03-01') });
test('utility invoice freezes recorded rate, quantity, amount and currency instead of trusting browser values', async () => {
  const client = clientFor();
  const [item] = await prepare(client);
  assert.equal(item.currency, 'USD');
  assert.equal(item.quantity.toString(), '20.125');
  assert.equal(item.unitPrice.toString(), '2.1234');
  assert.equal(item.amount.toString(), '42.74');
  assert.equal(item.exchangeRate, 70);
  assert.equal(item.baseAmount.toString(), '2991.8');
  assert.match(client.locks[0], /FROM Meter/);
  assert.match(client.locks[1], /MeterReading/);
  assert.match(item.description, /Meter 005/);
});
test('already billed readings and duplicate references cannot create another charge', async () => {
  await assert.rejects(prepare(clientFor(null)), { code: 'METER_READING_NOT_AVAILABLE' });
  await assert.rejects(prepare(clientFor(), lease, [{ type: 'ELECTRICITY', meterReadingId: 'r1' }, { type: 'ELECTRICITY', meterReadingId: 'r1' }]), { code: 'METER_READING_NOT_AVAILABLE' });
});
test('invoice edits reuse their own reading without accepting another invoice reading', async () => {
  const client = clientFor();
  client.meterReading.findFirst = async ({ where }) => {
    assert.deepEqual(where.OR, [{ invoiceItem: null }, { invoiceItem: { invoiceId: 'invoice1' } }]);
    return reading;
  };
  const items = await prepareInvoiceItems(client, 'org1', lease, [{ type: 'ELECTRICITY', meterReadingId: 'r1' }], { baseCurrency: 'AFN', date: day('2026-03-01'), existingInvoiceId: 'invoice1' });
  assert.equal(items[0].meterReadingId, 'r1');
  client.meterReading.findFirst = async () => null;
  await assert.rejects(prepareInvoiceItems(client, 'org1', lease, [{ type: 'ELECTRICITY', meterReadingId: 'r1' }], { baseCurrency: 'AFN', date: day('2026-03-01'), existingInvoiceId: 'invoice1' }), { code: 'METER_READING_NOT_AVAILABLE' });
});
test('current tenant cannot receive historical consumption and incoming baselines cannot be invoiced', async () => {
  await assert.rejects(prepare(clientFor(), { ...lease, id: 'current', startDate: day('2026-02-15') }), { code: 'METER_READING_NOT_AVAILABLE' });
  await assert.rejects(prepare(clientFor({ ...reading, readingKind: 'MOVE_IN' })), { code: 'METER_READING_NOT_AVAILABLE' });
});
test('successor lease creates a boundary even if terminated contract end date was not shortened', async () => {
  const client = clientFor({ ...reading, readingDate: day('2026-02-16') });
  client.lease.findFirst = async () => ({ id: 'incoming' });
  await assert.rejects(prepare(client, { ...lease, endDate: day('2026-12-31') }), { code: 'METER_READING_NOT_AVAILABLE' });
});
