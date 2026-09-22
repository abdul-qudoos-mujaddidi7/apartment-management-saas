#!/usr/bin/env node
/**
 * Restore rows written by scripts/dump-database.js onto a freshly created schema.
 *
 * The intended use is rebuilding the schema from scratch (a squashed baseline, or
 * a dev database that has drifted): dump first, recreate the schema, then restore
 * the rows onto the fresh, correct schema.
 *
 *   node scripts/restore-database.js                     # dry run, latest dump
 *   node scripts/restore-database.js --apply             # actually insert
 *   node scripts/restore-database.js some-dump.json --apply
 *
 * Models are inserted parents-first, derived from the foreign keys in the
 * generated client, so nothing is inserted ahead of what it points at. Values are
 * converted back from their JSON-safe form (ISO-8601 -> Date, decimal string ->
 * Decimal, base64 -> Buffer) before they reach Prisma.
 *
 * A row whose required parent is missing from the dump is *not* inserted — the
 * fresh schema enforces the foreign keys the old one may have been missing — and
 * is reported so the loss is visible rather than silent. Because a skipped row
 * also strands its own children, the plan is built in insert order: only rows
 * that really will exist count as parents.
 *
 * Refuses to run against a database that already holds rows: this is a restore
 * onto a fresh schema, not a merge.
 */

require('dotenv').config({ quiet: true });

const fs = require('fs');
const path = require('path');
const { Prisma } = require('@prisma/client');
const prisma = require('../src/lib/prisma');

const APPLY = process.argv.includes('--apply');
const BATCH = 200;

function findDump() {
  const named = process.argv.find((arg) => arg.endsWith('.json'));
  if (named) return path.resolve(named);
  const dir = path.join(__dirname, '..', '.backup', 'full');
  if (!fs.existsSync(dir)) throw new Error(`No dumps found in ${dir} — run scripts/dump-database.js first`);
  const files = fs.readdirSync(dir).filter((file) => file.endsWith('.json')).sort();
  if (!files.length) throw new Error(`No dumps found in ${dir} — run scripts/dump-database.js first`);
  return path.join(dir, files[files.length - 1]);
}

function delegateFor(modelName) {
  return modelName.charAt(0).toLowerCase() + modelName.slice(1);
}

/** Relations that require a parent row (own columns, not a list side). */
function requiredRelations(model) {
  return model.fields.filter(
    (field) =>
      field.kind === 'object' &&
      !field.isList &&
      field.relationFromFields?.length &&
      field.relationToFields?.length,
  );
}

/** Parents before children, using the relations of every model. */
function insertOrder(models) {
  const byName = new Map(models.map((model) => [model.name, model]));
  const parents = new Map(
    models.map((model) => [
      model.name,
      requiredRelations(model)
        .map((field) => field.type)
        .filter((name) => name !== model.name && byName.has(name)),
    ]),
  );

  const order = [];
  const seen = new Set();
  const visit = (name, trail) => {
    if (seen.has(name)) return;
    if (trail.includes(name)) throw new Error(`Circular relation: ${[...trail, name].join(' -> ')}`);
    for (const parent of parents.get(name) || []) visit(parent, [...trail, name]);
    seen.add(name);
    order.push(name);
  };
  for (const model of models) visit(model.name, []);
  return order;
}

/** JSON-safe value -> the type Prisma expects for that field. */
function coerce(value, fieldType) {
  if (value === null || value === undefined) return null;
  switch (fieldType) {
    case 'DateTime':
      return new Date(value);
    case 'Decimal':
      return new Prisma.Decimal(value);
    case 'BigInt':
      return BigInt(value);
    case 'Bytes':
      return Buffer.from(value.$binary, 'base64');
    default:
      return value;
  }
}

async function main() {
  const file = findDump();
  const dump = JSON.parse(fs.readFileSync(file, 'utf8'));
  const models = Prisma.dmmf.datamodel.models;
  const byName = new Map(models.map((model) => [model.name, model]));
  const order = insertOrder(models);
  const scalarTypes = new Map(
    models.map((model) => [
      model.name,
      new Map(model.fields.filter((f) => f.kind === 'scalar').map((f) => [f.name, f.type])),
    ]),
  );

  console.log(`Dump:  ${path.relative(process.cwd(), file)}`);
  console.log(`Taken: ${dump.meta.createdAt} (${dump.meta.rows} rows, database "${dump.meta.database}")`);
  console.log(`Mode:  ${APPLY ? 'APPLY' : 'DRY RUN (pass --apply to insert)'}\n`);

  const occupied = [];
  for (const name of order) {
    const count = await prisma[delegateFor(name)].count();
    if (count > 0) occupied.push(`${name} (${count})`);
  }
  if (occupied.length) {
    console.error(`Database is not empty — refusing to restore into it:\n  ${occupied.join('\n  ')}`);
    console.error('\nRecreate the schema first, then restore onto the empty result.');
    process.exit(1);
  }

  // Key sets of rows that will really exist, computed as the plan walks the order.
  const keptRows = new Map();
  const keySets = new Map();
  const keysFor = (modelName, relationToFields) => {
    const cacheKey = `${modelName}|${relationToFields.join(',')}`;
    if (!keySets.has(cacheKey)) {
      keySets.set(
        cacheKey,
        new Set(
          (keptRows.get(modelName) || []).map((row) =>
            JSON.stringify(relationToFields.map((column) => row[column] ?? null)),
          ),
        ),
      );
    }
    return keySets.get(cacheKey);
  };
  const invalidate = (modelName) => {
    for (const cacheKey of [...keySets.keys()]) {
      if (cacheKey.startsWith(`${modelName}|`)) keySets.delete(cacheKey);
    }
  };

  const plan = [];
  const losses = new Map();
  for (const name of order) {
    const model = byName.get(name);
    const relations = requiredRelations(model);
    const typeMap = scalarTypes.get(name);
    const kept = [];
    const dropped = [];

    for (const row of dump.tables[name] || []) {
      let reason = null;
      for (const field of relations) {
        const tuple = field.relationFromFields.map((column) => row[column] ?? null);
        if (tuple.every((value) => value === null)) continue; // relation is optional and unset
        if (tuple.some((value) => value === null)) {
          reason = `${field.name}: partially null (${field.relationFromFields.join(', ')})`;
          break;
        }
        if (!keysFor(field.type, field.relationToFields).has(JSON.stringify(tuple))) {
          reason = `${field.name} -> ${field.type}(${tuple.join(', ')}) does not exist`;
          break;
        }
      }
      if (reason) dropped.push({ row, reason });
      else kept.push(row);
    }

    keptRows.set(name, kept);
    invalidate(name);
    if (dropped.length) losses.set(name, dropped);
    plan.push({ name, model, rows: kept, typeMap });
  }

  let total = 0;
  console.log('=== rows to restore ===');
  for (const { name, rows } of plan) {
    total += rows.length;
    console.log(`${String(rows.length).padStart(6)}  ${name}${losses.has(name) ? `   (${losses.get(name).length} skipped)` : ''}`);
  }
  console.log(`${String(total).padStart(6)}  TOTAL ${APPLY ? '' : 'to restore'}`);

  if (losses.size) {
    const skipped = [...losses.values()].reduce((sum, rows) => sum + rows.length, 0);
    console.log(`\n=== ${skipped} row(s) cannot exist on the corrected schema ===`);
    for (const [name, rows] of losses) {
      console.log(`\n${name} (${rows.length}):`);
      const reasons = new Map();
      for (const { reason } of rows) reasons.set(reason, (reasons.get(reason) || 0) + 1);
      for (const [reason, count] of [...reasons].sort((a, b) => b[1] - a[1])) {
        console.log(`  ${String(count).padStart(4)} x  ${reason}`);
      }
    }
  }

  if (APPLY) {
    console.log('\n=== inserting ===');
    let inserted = 0;
    for (const { name, rows, typeMap } of plan) {
      const data = rows.map((row) => {
        const out = {};
        for (const [column, value] of Object.entries(row)) {
          const type = typeMap.get(column);
          out[column] = type ? coerce(value, type) : value;
        }
        return out;
      });
      for (let index = 0; index < data.length; index += BATCH) {
        await prisma[delegateFor(name)].createMany({ data: data.slice(index, index + BATCH) });
      }
      inserted += data.length;
      console.log(`${String(data.length).padStart(6)}  ${name}`);
    }
    console.log(`${String(inserted).padStart(6)}  inserted`);

    console.log('\n=== verifying against the dump ===');
    let mismatches = 0;
    for (const { name, rows } of plan) {
      const actual = await prisma[delegateFor(name)].count();
      if (rows.length !== actual) {
        mismatches += 1;
        console.log(`  MISMATCH ${name}: planned ${rows.length}, found ${actual}`);
      }
    }
    console.log(mismatches ? `  ${mismatches} table(s) do not match` : '  every table matches the plan');
    if (mismatches) process.exitCode = 1;
  }

  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect().catch(() => {});
  process.exit(1);
});
