require('dotenv').config({ quiet: true });

/*
 * Meter readings written before `periodMonth` existed have no month, and the
 * unique index that holds the "one reading a meter per month" rule cannot see
 * them. Their month is derivable from their date, so this fills it in.
 *
 * A dry run by default. Deleted readings are left alone on purpose: a NULL
 * month is what releases a month for the meter to be read again.
 *
 *   node scripts/backfill-meter-reading-months.js
 *   node scripts/backfill-meter-reading-months.js --apply
 */

const prisma = require('../src/lib/prisma');
const { shamsiMonthKey, shamsiMonthLabel } = require('../src/lib/shamsi');

const apply = process.argv.includes('--apply');

(async () => {
  const readings = await prisma.meterReading.findMany({
    where: { deletedAt: null, periodMonth: null },
    select: {
      id: true,
      readingDate: true,
      meterId: true,
      meter: { select: { meterNumber: true, apartment: { select: { apartmentNumber: true } } } },
    },
    orderBy: { readingDate: 'asc' },
  });

  if (!readings.length) {
    console.log('Nothing to backfill: every reading still standing already has its month.');
    return prisma.$disconnect();
  }

  // A meter with two readings in one month cannot be repaired by filling in a
  // month — one of them has to go, and that is the user's call.
  const byMeterAndMonth = new Map();
  for (const reading of readings) {
    const month = shamsiMonthKey(reading.readingDate);
    const key = `${reading.meterId}:${month}`;
    if (!byMeterAndMonth.has(key)) byMeterAndMonth.set(key, []);
    byMeterAndMonth.get(key).push({ ...reading, month });
  }

  const repairable = [];
  const conflicting = [];
  for (const group of byMeterAndMonth.values()) {
    if (group.length > 1) conflicting.push(group);
    else repairable.push(group[0]);
  }

  console.log(`${readings.length} reading(s) without a month, across ${byMeterAndMonth.size} meter-month(s).`);
  for (const reading of repairable) {
    console.log(`  fill   ${reading.meter.apartment.apartmentNumber}/${reading.meter.meterNumber} ${reading.readingDate.toISOString().slice(0, 10)} → ${reading.month} (${shamsiMonthLabel(reading.month)})`);
  }
  for (const group of conflicting) {
    console.log(`  skip   ${group.length} readings in one meter-month, which needs a decision:`);
    for (const reading of group) {
      console.log(`           ${reading.meter.apartment.apartmentNumber}/${reading.meter.meterNumber} ${reading.readingDate.toISOString().slice(0, 10)}`);
    }
  }

  if (!apply) {
    console.log('\nDry run. Re-run with --apply to fill in the months above.');
    return prisma.$disconnect();
  }

  if (repairable.length) {
    await prisma.$transaction(
      repairable.map((reading) => prisma.meterReading.update({
        where: { id: reading.id },
        data: { periodMonth: reading.month },
      })),
    );
  }

  const left = await prisma.meterReading.count({ where: { deletedAt: null, periodMonth: null } });
  console.log(`\nFilled ${repairable.length} month(s). ${left} reading(s) still without one.`);
  return prisma.$disconnect();
})().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});
