#!/usr/bin/env node
/**
 * Point-in-time dump of every row in the database to a JSON file.
 *
 * Development sometimes needs the schema rebuilt from scratch — a squashed
 * baseline, a broken migration history, a migration that has to be reapplied.
 * Tables can be recreated from prisma/schema.prisma; the rows cannot. So take
 * the rows off the database first.
 *
 *   node scripts/dump-database.js                      # .backup/full/<db>-<timestamp>.json
 *   node scripts/dump-database.js --out path/to.json
 *
 * Every value is stored JSON-safe: DateTime as an ISO-8601 string, Decimal as a
 * string (exact digits, never a float), BigInt as a string, Bytes as base64.
 * scripts/restore-database.js reads the same file back, inserting parents
 * before children.
 */

require('dotenv').config({ quiet: true });

const fs = require('fs');
const path = require('path');
const { Prisma } = require('@prisma/client');
const prisma = require('../src/lib/prisma');

function readArg(flag) {
  const index = process.argv.indexOf(flag);
  return index === -1 ? null : process.argv[index + 1] || null;
}

function databaseName() {
  const url = process.env.DATABASE_URL || '';
  const withoutQuery = url.split('?')[0];
  return withoutQuery.slice(withoutQuery.lastIndexOf('/') + 1) || 'database';
}

/** JSON-safe representation of a single column value. */
function normalise(value) {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'bigint') return value.toString();
  if (Buffer.isBuffer(value)) return { $binary: value.toString('base64') };
  if (Prisma.Decimal.isDecimal(value)) return value.toString();
  return value;
}

function normaliseRow(row) {
  const out = {};
  for (const [column, value] of Object.entries(row)) {
    out[column] = normalise(value);
  }
  return out;
}

/** Prisma model -> its camelCase client delegate (JournalLine -> journalLine). */
function delegateFor(modelName) {
  return modelName.charAt(0).toLowerCase() + modelName.slice(1);
}

async function main() {
  const models = Prisma.dmmf.datamodel.models;
  if (!models.length) throw new Error('No models found in the generated Prisma client.');

  const tables = {};
  const counts = {};
  let total = 0;

  for (const model of models) {
    const rows = await prisma[delegateFor(model.name)].findMany();
    tables[model.name] = rows.map(normaliseRow);
    counts[model.name] = rows.length;
    total += rows.length;
  }

  const dump = {
    meta: {
      database: databaseName(),
      createdAt: new Date().toISOString(),
      models: models.length,
      rows: total,
      schema: 'prisma/schema.prisma',
    },
    counts,
    tables,
  };

  const dir = path.join(__dirname, '..', '.backup', 'full');
  fs.mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const out = readArg('--out') || path.join(dir, `${databaseName()}-${stamp}.json`);
  fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(dump, null, 2));

  const width = Math.max(...models.map((model) => model.name.length));
  for (const model of models) {
    console.log(`${String(counts[model.name]).padStart(6)}  ${model.name.padEnd(width)}`);
  }
  console.log(`\n${String(total).padStart(6)}  TOTAL across ${models.length} models`);
  console.log(`\nBackup written to ${path.relative(process.cwd(), path.resolve(out))}`);
  console.log(`Size: ${(fs.statSync(out).size / 1024).toFixed(1)} KB`);

  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect().catch(() => {});
  process.exit(1);
});
