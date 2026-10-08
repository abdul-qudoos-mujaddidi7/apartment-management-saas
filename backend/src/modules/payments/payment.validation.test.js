const test = require('node:test');
const assert = require('node:assert/strict');
const { createPaymentSchema } = require('./payment.validation');

const receipt = {
  tenantId: 'tenant-1',
  paymentDate: '2026-10-08',
  receiveAccountId: 'account-1',
  amount: 300,
};

test('payment creation accepts a receiving account without a payment method', () => {
  const result = createPaymentSchema.parse(receipt);
  assert.equal(result.receiveAccountId, 'account-1');
  assert.equal(result.amount, 300);
  assert.equal(Object.hasOwn(result, 'paymentMethod'), false);
});

test('legacy payment method input is discarded', () => {
  const result = createPaymentSchema.parse({ ...receipt, paymentMethod: 'CASH' });
  assert.equal(Object.hasOwn(result, 'paymentMethod'), false);
});

test('payment creation still requires the receiving account', () => {
  const { receiveAccountId, ...missingAccount } = receipt;
  assert.equal(createPaymentSchema.safeParse(missingAccount).success, false);
});
