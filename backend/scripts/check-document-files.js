require('dotenv').config();

/**
 * Read-only audit of the files records point at.
 *
 *   node scripts/check-document-files.js
 *
 * Uploaded documents live on disk, not in the database, so the two can drift
 * apart without anything failing: a restore from an older dump brings the rows
 * back but not the files, an uploads folder can be moved or lost, and a file
 * swept by mistake leaves a row pointing at nothing. Neither side complains on
 * its own — a missing file only shows up as a broken image, and an orphan file
 * only shows up as disk that fills up.
 *
 * This reports both directions and exits non-zero when something is wrong, so
 * it can be put in a cron or a deploy check. It never deletes anything.
 */

const fs = require('fs');
const path = require('path');

const prisma = require('../src/lib/prisma');
const { UPLOAD_ROOT, resolveUpload } = require('../src/lib/uploads');

/**
 * Every column across the schema that holds a stored file path.
 *
 * Soft-deleted rows are read too, on purpose: a deleted record keeps its
 * documents so the deletion can be undone, so a file they hold is not an
 * orphan. And every organization is scanned — a file can belong to a record
 * that is invisible from whichever account happens to run this.
 */
const DOCUMENT_SOURCES = [
  {
    model: 'tenant',
    fields: ['photoUrl', 'idCardFrontUrl', 'idCardBackUrl'],
    select: {
      id: true,
      firstName: true,
      lastName: true,
      deletedAt: true,
      organization: { select: { name: true } },
    },
    label: (row) =>
      `${row.firstName} ${row.lastName}${row.deletedAt ? ' (deleted)' : ''} · ${row.organization?.name || 'unknown organization'}`,
  },
];

function listFiles(directory) {
  if (!fs.existsSync(directory)) return [];

  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) return listFiles(absolute);
    return [absolute];
  });
}

async function main() {
  const referenced = new Map();
  const heldForDeletedRecords = new Map();
  const missing = [];

  for (const source of DOCUMENT_SOURCES) {
    const rows = await prisma[source.model].findMany({
      select: { ...source.select, ...Object.fromEntries(source.fields.map((field) => [field, true])) },
    });

    for (const row of rows) {
      for (const field of source.fields) {
        const url = row[field];
        if (!url) continue;

        referenced.set(url, `${source.model}:${row.id}`);
        if (row.deletedAt) heldForDeletedRecords.set(url, source.label(row));
        if (!resolveUpload(url) || !fs.existsSync(resolveUpload(url))) {
          missing.push({ record: `${source.model} "${source.label(row)}"`, field, url });
        }
      }
    }
  }

  const onDisk = listFiles(UPLOAD_ROOT);
  const orphans = [];
  const retained = [];
  for (const absolute of onDisk) {
    const url = `/uploads/${path.relative(UPLOAD_ROOT, absolute).split(path.sep).join('/')}`;
    if (referenced.has(url)) continue;
    if (heldForDeletedRecords.has(url)) retained.push({ url, record: heldForDeletedRecords.get(url) });
    else orphans.push(absolute);
  }

  console.log(`Stored documents referenced by a record: ${referenced.size}`);
  console.log(`Files on disk:                           ${onDisk.length}`);

  if (missing.length === 0) {
    console.log('\nEvery referenced file is present.');
  } else {
    console.log(`\n${missing.length} referenced file(s) are missing:`);
    for (const item of missing) console.log(`  ${item.record} · ${item.field}\n    ${item.url}`);
    console.log('\nThe records above still point at these paths. Upload the documents again');
    console.log('from the record, or clear the fields if they are no longer needed.');
  }

  if (retained.length) {
    console.log(`\n${retained.length} file(s) belong to a deleted record and are kept so it can be restored:`);
    for (const item of retained) console.log(`  ${item.url}\n    held for ${item.record}`);
  }

  if (orphans.length === 0) {
    console.log('\nNo orphan files on disk.');
  } else {
    console.log(`\n${orphans.length} file(s) on disk are referenced by nothing at all:`);
    for (const absolute of orphans) console.log(`  /uploads/${path.relative(UPLOAD_ROOT, absolute).split(path.sep).join('/')}`);
    console.log('\nThis scan covers every organization, so these are safe to remove — but only from');
    console.log('a script that deletes the files listed here, never by clearing the directory.');
  }

  await prisma.$disconnect();
  process.exit(missing.length === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
