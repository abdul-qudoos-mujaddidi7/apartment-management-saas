const assert = require('node:assert/strict');
const test = require('node:test');

const { createInvoiceSchema, itemTypes } = require('./invoice.validation');
const { incomeAccountRoles } = require('./invoice-income');
const { DEFAULT_ACCOUNTS } = require('../financials/financial-account.service');

const baseInvoice = {
  leaseId: 'lease-1',
  invoiceDate: '2026-09-24',
  items: [{ type: 'RENT', description: 'Monthly rent', quantity: 1, unitPrice: 15000 }],
};

test('accepts a service fee billed as its own line', () => {
  const result = createInvoiceSchema.safeParse({
    ...baseInvoice,
    items: [
      { type: 'RENT', description: 'Monthly rent', quantity: 1, unitPrice: 15000 },
      { type: 'SERVICE_FEE', description: 'Monthly service fee', quantity: 1, unitPrice: 500 },
    ],
  });
  assert.equal(result.success, true);
});

test('still describes a service fee line the ordinary way', () => {
  // A service fee is not a meter reading: it needs its own wording, quantity
  // and price like any other charge the user types.
  const result = createInvoiceSchema.safeParse({
    ...baseInvoice,
    items: [{ type: 'SERVICE_FEE', quantity: 1, unitPrice: 500 }],
  });
  assert.equal(result.success, false);
  assert.ok(result.error.issues.some((issue) => issue.path.join('.') === 'items.0.description'));
});

test('rejects an unknown charge type', () => {
  assert.equal(
    createInvoiceSchema.safeParse({
      ...baseInvoice,
      items: [{ type: 'MAINTENANCE', description: 'x', quantity: 1, unitPrice: 1 }],
    }).success,
    false,
  );
});

/*
 * Every type the API accepts has to credit an income account: the posting debits
 * the tenant's receivable, and an entry whose credits do not match is refused by
 * the ledger — so a missing role turns that charge type into a 500 at the moment
 * the invoice is raised.
 */
test('gives every charge type an income account that exists in the chart', () => {
  const roles = new Set(DEFAULT_ACCOUNTS.map(([role]) => role));
  itemTypes.forEach((type) => {
    const role = incomeAccountRoles[type];
    assert.ok(role, `${type} has no income account.`);
    assert.ok(roles.has(role), `${type} credits account ${role}, which is not a default account.`);
  });
});

test('credits each charge type to its own account', () => {
  const used = itemTypes.map((type) => incomeAccountRoles[type]);
  assert.equal(new Set(used).size, used.length);
  // The service fee is not rent: it is billed and read on its own income line.
  assert.notEqual(incomeAccountRoles.SERVICE_FEE, incomeAccountRoles.RENT);
});
