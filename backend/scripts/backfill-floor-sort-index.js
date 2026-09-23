#!/usr/bin/env node
/**
 * Backfill `Floor.sortIndex`.
 *
 * Floors used to be numbered with an integer column, so the list could simply
 * be ordered by it. The column is now free text ("1", "2", "B1", "Ground") and
 * ordering moved to `sortIndex`, which the API keeps up to date on every write.
 * A database restored from a dump taken before that column existed lands with
 * every row on the default 0, which would shuffle the floors; this script
 * re-derives the key from each label.
 *
 * Run from backend/ with a dry run first:
 *   node scripts/backfill-floor-sort-index.js
 *   node scripts/backfill-floor-sort-index.js --apply
 */

const prisma = require('../src/lib/prisma');

const APPLY = process.argv.includes('--apply');
const NAMED_FLOOR_SORT = -1000000;

function sortIndexFor(floorNumber) {
  const text = String(floorNumber).trim();
  if (!/^[+-]?\d+(\.\d+)?$/.test(text)) return NAMED_FLOOR_SORT;
  const value = Number(text);
  if (!Number.isFinite(value) || value < -2000000 || value > 2000000) return NAMED_FLOOR_SORT;
  return Math.trunc(value);
}

async function main() {
  const floors = await prisma.floor.findMany({
    select: { id: true, floorNumber: true, sortIndex: true },
    orderBy: [{ buildingId: 'asc' }, { floorNumber: 'asc' }],
  });

  const changes = floors
    .map((floor) => ({ ...floor, expected: sortIndexFor(floor.floorNumber) }))
    .filter((floor) => floor.sortIndex !== floor.expected);

  console.log(`${floors.length} floors read, ${changes.length} need a sort key.`);
  for (const floor of changes) {
    console.log(`  ${floor.floorNumber}: ${floor.sortIndex} -> ${floor.expected}`);
  }

  if (!APPLY) {
    console.log('\nDry run. Re-run with --apply to write these keys.');
    return;
  }

  for (const floor of changes) {
    await prisma.floor.update({ where: { id: floor.id }, data: { sortIndex: floor.expected } });
  }
  console.log(`\nApplied: ${changes.length} floors updated.`);
}

main()
  .catch((error) => {
    console.error('Backfill failed:', error.message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
