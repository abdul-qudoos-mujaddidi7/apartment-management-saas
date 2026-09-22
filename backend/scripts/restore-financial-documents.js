require('dotenv').config();

const fs = require('fs');
const path = require('path');

const prisma = require('../src/lib/prisma');

/*
 * Restores invoice, invoice-item, journal and journal-line rows that a backup
 * has and the database does not.
 *
 * A backup in `.backup/` is a point-in-time dump of every table, taken before a
 * schema change. This script is strictly additive: it inserts only rows whose id
 * is missing, so anything created after the backup — including work happening
 * while you read this — is left untouched, and re-running it changes nothing.
 *
 * The dumps predate multi-currency, so rows are restored the way that migration
 * filled them: the document is in the organization's reporting currency, the
 * rate is 1, and every base-currency mirror equals its own-currency twin. An
 * organization that bills in a foreign currency should be re-priced by hand
 * afterwards; nothing here invents a historical rate.
 *
 *   node scripts/restore-financial-documents.js                  # dry run
 *   node scripts/restore-financial-documents.js --apply
 *   node scripts/restore-financial-documents.js some-backup.json --apply
 */

const apply = process.argv.includes('--apply');

function resolveBackup(argv) {
  const named = argv.find((arg) => arg.endsWith('.json'));
  if (named) return path.resolve(named);

  const dir = path.join(__dirname, '..', '.backup');
  const files = fs.readdirSync(dir).filter((file) => file.endsWith('.json')).sort();
  if (!files.length) throw new Error(`No backup found in ${dir}`);
  return path.join(dir, files[files.length - 1]);
}

async function idsOf(model) {
  const rows = await model.findMany({ select: { id: true } });
  return new Set(rows.map((row) => row.id));
}

async function main() {
  const file = resolveBackup(process.argv.slice(2));
  const backup = JSON.parse(fs.readFileSync(file, 'utf8'));
  console.log(`Backup: ${path.basename(file)}`);
  console.log(`Mode:   ${apply ? 'APPLY (writing)' : 'dry run (nothing written)'}\n`);

  const organizations = await prisma.organization.findMany({ select: { id: true, baseCurrency: true } });
  const baseByOrg = new Map(organizations.map((org) => [org.id, org.baseCurrency || 'AFN']));

  const [liveInvoices, liveItems, liveJournals, liveLines] = await Promise.all([
    idsOf(prisma.invoice),
    idsOf(prisma.invoiceItem),
    idsOf(prisma.journal),
    idsOf(prisma.journalLine),
  ]);

  const missing = (rows, live) => (rows || []).filter((row) => !live.has(row.id));

  const invoices = missing(backup.invoice, liveInvoices).map((row) => ({
    ...row,
    currency: baseByOrg.get(row.organizationId) || 'AFN',
    exchangeRate: '1',
    baseSubtotal: row.subtotal,
    baseTotal: row.total,
    basePaidAmount: row.paidAmount,
  }));

  const invoiceIds = new Set([...liveInvoices, ...invoices.map((row) => row.id)]);
  const items = missing(backup.invoiceitem, liveItems).filter((row) => invoiceIds.has(row.invoiceId));

  const journals = missing(backup.journal, liveJournals).map((row) => ({
    ...row,
    currency: baseByOrg.get(row.organizationId) || 'AFN',
    exchangeRate: '1',
  }));

  const journalIds = new Set([...liveJournals, ...journals.map((row) => row.id)]);
  const lines = missing(backup.journalline, liveLines)
    .filter((row) => journalIds.has(row.journalId))
    .map((row) => ({ ...row, baseDebit: row.debit, baseCredit: row.credit }));

  const skippedItems = missing(backup.invoiceitem, liveItems).length - items.length;
  const skippedLines = missing(backup.journalline, liveLines).length - lines.length;

  console.log(`invoices      ${String(backup.invoice.length).padStart(4)} in backup, ${String(invoices.length).padStart(4)} missing`);
  console.log(`invoice items ${String(backup.invoiceitem.length).padStart(4)} in backup, ${String(items.length).padStart(4)} missing`);
  console.log(`journals      ${String(backup.journal.length).padStart(4)} in backup, ${String(journals.length).padStart(4)} missing`);
  console.log(`journal lines ${String(backup.journalline.length).padStart(4)} in backup, ${String(lines.length).padStart(4)} missing`);
  if (skippedItems) console.log(`  (skipping ${skippedItems} item(s) whose invoice does not exist)`);
  if (skippedLines) console.log(`  (skipping ${skippedLines} line(s) whose journal does not exist)`);

  const byOrg = {};
  for (const row of invoices) byOrg[row.organizationId] = (byOrg[row.organizationId] || 0) + 1;
  if (Object.keys(byOrg).length) {
    const names = new Map(organizations.map((org) => [org.id, org.id]));
    const all = await prisma.organization.findMany({ select: { id: true, name: true } });
    for (const org of all) names.set(org.id, org.name);
    console.log('\ninvoices per organization:');
    for (const [orgId, count] of Object.entries(byOrg)) console.log(`  ${String(names.get(orgId)).padEnd(28)} ${count}`);
  }

  if (!apply) {
    console.log('\nNothing was written. Re-run with --apply to restore these rows.');
    return;
  }

  /* Parents before children: items need their invoice, lines need their journal. */
  const written = {};
  if (invoices.length) written.invoices = (await prisma.invoice.createMany({ data: invoices })).count;
  if (items.length) written.invoiceItems = (await prisma.invoiceItem.createMany({ data: items })).count;
  if (journals.length) written.journals = (await prisma.journal.createMany({ data: journals })).count;
  if (lines.length) written.journalLines = (await prisma.journalLine.createMany({ data: lines })).count;

  console.log('\nRestored:', JSON.stringify(written));
  console.log('Next: npm run check:currency');
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
