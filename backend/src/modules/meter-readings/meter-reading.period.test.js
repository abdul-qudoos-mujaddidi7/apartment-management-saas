const test = require('node:test');
const assert = require('node:assert/strict');

const { shamsiMonthKey, shamsiMonthLabel } = require('../../lib/shamsi');
const { assertMonthIsFree } = require('./meter-reading.service');

const day = (iso) => new Date(`${iso}T00:00:00.000Z`);

test('a Shamsi month key is the month the user sees, not the Gregorian one', () => {
  // Sunbula 1405 runs from 2026-08-23 to 2026-09-22: one Shamsi month spanning
  // two Gregorian months, which is exactly why the rule cannot key on those.
  assert.equal(shamsiMonthKey(day('2026-08-23')), '1405-06');
  assert.equal(shamsiMonthKey(day('2026-09-22')), '1405-06');

  // The days either side of it belong to the neighbouring months.
  assert.equal(shamsiMonthKey(day('2026-08-22')), '1405-05');
  assert.equal(shamsiMonthKey(day('2026-09-23')), '1405-07');
});

test('the Shamsi year rolls over in March, not January', () => {
  assert.equal(shamsiMonthKey(day('2026-03-20')), '1404-12');
  assert.equal(shamsiMonthKey(day('2026-03-21')), '1405-01');
  assert.equal(shamsiMonthKey(day('2026-01-15')), '1404-10');
});

test('the same day read at any time of that day shares one month', () => {
  assert.equal(shamsiMonthKey(new Date('2026-09-22T00:00:00.000Z')), '1405-06');
  assert.equal(shamsiMonthKey(new Date('2026-09-22T00:00:00.000Z')), shamsiMonthKey(day('2026-09-22')));
  assert.equal(shamsiMonthKey('not a date'), null);
});

test('a month key reads back as the month a person would name', () => {
  assert.equal(shamsiMonthLabel('1405-06'), 'Sunbula 1405');
  assert.equal(shamsiMonthLabel('1405-07'), 'Mizan 1405');
  assert.equal(shamsiMonthLabel('rubbish'), 'rubbish');
});

test('a second reading in the same month is refused, naming the month', async () => {
  const existing = {
    id: 'r1',
    readingDate: day('2026-08-25'),
    periodMonth: '1405-06',
  };
  const client = { meterReading: { findMany: async () => [existing] } };

  await assert.rejects(
    () => assertMonthIsFree(client, 'meter-1', day('2026-09-10')),
    (error) => {
      assert.equal(error.code, 'METER_READING_MONTH_EXISTS');
      assert.match(error.message, /Sunbula 1405/);
      return true;
    },
  );
});

test('a reading in the next month is allowed, and returns its month', async () => {
  const existing = {
    id: 'r1',
    readingDate: day('2026-08-25'),
    periodMonth: '1405-06',
  };
  const client = { meterReading: { findMany: async () => [existing] } };

  assert.equal(await assertMonthIsFree(client, 'meter-1', day('2026-09-25')), '1405-07');
});

test('a reading written before the month column existed is still counted', async () => {
  // Nothing has a periodMonth until it is written once, so the rule falls back
  // to the date on the row rather than treating it as a free month.
  const { periodMonth, ...legacy } = {
    id: 'r1',
    readingDate: day('2026-09-01'),
    periodMonth: null,
  };
  const client = { meterReading: { findMany: async () => [legacy] } };

  await assert.rejects(
    () => assertMonthIsFree(client, 'meter-1', day('2026-08-23')),
    (error) => error.code === 'METER_READING_MONTH_EXISTS',
  );
});

test('editing a reading does not clash with its own month', async () => {
  const rows = [];
  const client = {
    meterReading: {
      // The service excludes the record being edited from the query itself.
      findMany: async ({ where }) => (where.id?.not ? rows.filter((row) => row.id !== where.id.not) : rows),
    },
  };

  assert.equal(await assertMonthIsFree(client, 'meter-1', day('2026-09-10'), 'r1'), '1405-06');
});
