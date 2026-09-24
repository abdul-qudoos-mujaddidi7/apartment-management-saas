/**
 * Which currency an invoice line is stated in.
 *
 * These are the whole rule, and they are the reason an invoice no longer has a
 * currency of its own: every charge keeps the currency it was agreed in, and the
 * invoice adds its lines up in the base currency.
 */
const test = require('node:test');
const assert = require('node:assert/strict');

const { lineCurrency } = require('./invoice-line-currency');

const lease = {
  currency: 'USD',
  serviceFeeCurrency: 'EUR',
};

test('rent is stated in the lease rent currency', () => {
  assert.equal(lineCurrency({ type: 'RENT' }, lease, 'AFN'), 'USD');
});

test('the service fee keeps its own currency, not the rent currency', () => {
  assert.equal(lineCurrency({ type: 'SERVICE_FEE' }, lease, 'AFN'), 'EUR');
});

test('a fee with no currency of its own falls back to the rent currency', () => {
  assert.equal(lineCurrency({ type: 'SERVICE_FEE' }, { currency: 'USD' }, 'AFN'), 'USD');
});

test('a meter reading is billed in the base currency the meter is priced in', () => {
  const item = { type: 'ELECTRICITY', meterReadingId: 'reading-1' };
  assert.equal(lineCurrency(item, lease, 'AFN'), 'AFN');
});

test('a utility typed by hand is billed in the base currency', () => {
  assert.equal(lineCurrency({ type: 'WATER' }, lease, 'AFN'), 'AFN');
});

test('any other charge is billed in the base currency', () => {
  assert.equal(lineCurrency({ type: 'OTHER' }, lease, 'AFN'), 'AFN');
});

test('a lease with no currencies of its own bills in the base currency', () => {
  assert.equal(lineCurrency({ type: 'RENT' }, {}, 'AFN'), 'AFN');
  assert.equal(lineCurrency({ type: 'RENT' }, null, 'AFN'), 'AFN');
});

test('a missing base currency still names one', () => {
  assert.equal(lineCurrency({ type: 'OTHER' }, lease, undefined), 'AFN');
});
