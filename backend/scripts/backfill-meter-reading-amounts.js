require('dotenv').config();

const { Prisma } = require('@prisma/client');

const prisma = require('../src/lib/prisma');
const Decimal = Prisma.Decimal;

function money(value) {
  return new Decimal(value).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
}

async function main() {
  if (!process.argv.includes('--apply')) {
    console.log('Dry safety gate: no data changed. Re-run with --apply after backing up the database.');
    return;
  }

  // Migration defaults cannot distinguish an old missing price from a deliberate
  // zero price. Only fill legacy, unbilled zero-value readings when the meter now
  // has a positive configured rate. Billed financial history is never touched.
  const readings = await prisma.meterReading.findMany({
    where: {
      deletedAt: null,
      invoiceItem: null,
      unitPrice: 0,
      amount: 0,
      meter: { deletedAt: null, defaultUnitPrice: { gt: 0 } },
    },
    select: {
      id: true,
      consumption: true,
      meter: { select: { defaultUnitPrice: true } },
    },
  });

  let updated = 0;
  for (const reading of readings) {
    const unitPrice = new Decimal(reading.meter.defaultUnitPrice);
    const amount = money(new Decimal(reading.consumption).times(unitPrice));
    const result = await prisma.meterReading.updateMany({
      where: {
        id: reading.id,
        deletedAt: null,
        invoiceItem: null,
        unitPrice: 0,
        amount: 0,
      },
      data: { unitPrice, amount },
    });
    updated += result.count;
  }

  console.log(`Backfilled ${updated} unbilled meter reading amount(s).`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
