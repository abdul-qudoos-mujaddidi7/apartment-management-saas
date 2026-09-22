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
