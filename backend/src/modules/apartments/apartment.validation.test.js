const assert = require('node:assert/strict');
const test = require('node:test');

const { createApartmentSchema, updateApartmentSchema } = require('./apartment.validation');

const baseApartment = {
  floorId: 'floor-1',
  apartmentNumber: 'A-101',
  name: 'Apartment 101',
  type: 'RESIDENTIAL',
  monthlyRent: 15000,
};

test('allows an apartment without spaces', () => {
  assert.equal(createApartmentSchema.safeParse({ ...baseApartment, spaces: [] }).success, true);
});

test('accepts one, multiple, and custom spaces', () => {
  const cases = [
    [{ name: 'Bedroom', quantity: 3 }],
    [{ name: 'Bedroom', quantity: 2 }, { name: 'Bathroom', quantity: 2 }, { name: 'Kitchen', quantity: 1 }],
    [{ name: 'Guest Room', quantity: 1 }],
  ];
  cases.forEach((spaces) => assert.equal(createApartmentSchema.safeParse({ ...baseApartment, spaces }).success, true));
});

test('rejects zero and negative quantities', () => {
  [0, -1].forEach((quantity) => {
    const result = createApartmentSchema.safeParse({ ...baseApartment, spaces: [{ name: 'Kitchen', quantity }] });
    assert.equal(result.success, false);
    assert.match(result.error.issues[0].message, /at least 1/i);
  });
});

test('rejects duplicate names case-insensitively', () => {
  const result = createApartmentSchema.safeParse({
    ...baseApartment,
    spaces: [{ name: 'Bedroom', quantity: 1 }, { name: ' bedroom ', quantity: 2 }],
  });
  assert.equal(result.success, false);
  assert.match(result.error.issues.at(-1).message, /already exists/i);
});

test('validates spaces during partial apartment updates', () => {
  assert.equal(updateApartmentSchema.safeParse({ spaces: [{ name: 'Balcony', quantity: 2 }] }).success, true);
  assert.equal(updateApartmentSchema.safeParse({ spaces: [{ name: '', quantity: 1 }] }).success, false);
});

test('defaults the deposit and the service fee to zero on a new apartment', () => {
  const result = createApartmentSchema.safeParse(baseApartment);
  assert.equal(result.success, true);
  assert.equal(result.data.securityDeposit, 0);
  assert.equal(result.data.serviceFee, 0);
  // Absent means "the organization's reporting currency", resolved in the service.
  assert.equal(result.data.securityDepositCurrency, undefined);
  assert.equal(result.data.serviceFeeCurrency, undefined);
});

test('accepts a deposit and a service fee stated in their own currencies', () => {
  const result = createApartmentSchema.safeParse({
    ...baseApartment,
    monthlyRent: 15000,
    rentCurrency: 'afn',
    securityDeposit: 200000,
    securityDepositCurrency: 'usd',
    serviceFee: 500,
    serviceFeeCurrency: 'AFN',
  });
  assert.equal(result.success, true);
  assert.equal(result.data.rentCurrency, 'AFN');
  assert.equal(result.data.securityDeposit, 200000);
  assert.equal(result.data.securityDepositCurrency, 'USD');
  assert.equal(result.data.serviceFee, 500);
  assert.equal(result.data.serviceFeeCurrency, 'AFN');
});

test('rejects a negative deposit or service fee', () => {
  assert.equal(createApartmentSchema.safeParse({ ...baseApartment, securityDeposit: -1 }).success, false);
  assert.equal(createApartmentSchema.safeParse({ ...baseApartment, serviceFee: -1 }).success, false);
});

test('rejects a currency code that is not three letters', () => {
  assert.equal(
    createApartmentSchema.safeParse({ ...baseApartment, securityDepositCurrency: 'DOLLARS' }).success,
    false,
  );
  assert.equal(createApartmentSchema.safeParse({ ...baseApartment, serviceFeeCurrency: 'A1' }).success, false);
});

/*
 * The defaults live on the create schema only. Zod fills a default in even
 * after `.partial()`, so a defaulted field on the update schema would reset
 * every apartment's deposit and service fee the moment its name was edited.
 */
test('keeps a partial update from resetting the deposit and the service fee', () => {
  const result = updateApartmentSchema.safeParse({ name: 'Renamed' });
  assert.equal(result.success, true);
  assert.equal('securityDeposit' in result.data, false);
  assert.equal('serviceFee' in result.data, false);
  assert.equal('monthlyRent' in result.data, false);
});
