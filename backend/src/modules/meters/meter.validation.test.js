const test = require('node:test');
const assert = require('node:assert/strict');
const { createMeterSchema, meterTypes, updateMeterSchema } = require('./meter.validation');
const meter = { apartmentId: 'a1', meterNumber: '005', utilityType: 'ELECTRICITY', unit: 'kWh', initialReading: 0, installationDate: '2026-01-01' };
test('new electricity meters need a dated initial reading and preserve meter-number padding', () => {
  const result = createMeterSchema.safeParse(meter);
  assert.equal(result.success, true);
  assert.equal(result.data.meterNumber, '005');
  assert.equal(result.data.initialReading, 0);
  assert.equal(createMeterSchema.safeParse({ ...meter, initialReading: '' }).success, false);
  assert.equal(createMeterSchema.safeParse({ ...meter, installationDate: '' }).success, false);
  assert.equal(createMeterSchema.safeParse({ ...meter, defaultUnitPrice: 1.12345 }).success, false);
  assert.equal(updateMeterSchema.safeParse({ status: 'INACTIVE' }).success, true);
});

test('meter type supports the configured categories and defaults legacy clients to Other', () => {
  const created = createMeterSchema.safeParse(meter);
  assert.equal(created.success, true);
  assert.equal(created.data.meterType, 'OTHER');

  for (const meterType of meterTypes) {
    assert.equal(createMeterSchema.safeParse({ ...meter, meterType }).success, true, `${meterType} should be accepted`);
  }
  assert.equal(createMeterSchema.safeParse({ ...meter, meterType: 'RETAIL' }).success, false);

  const updated = updateMeterSchema.safeParse({ meterType: 'OFFICE' });
  assert.equal(updated.success, true);
  assert.equal(updated.data.meterType, 'OFFICE');
});
