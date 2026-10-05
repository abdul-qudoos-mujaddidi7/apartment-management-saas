#!/usr/bin/env node
// Read-only checks. Never changes data, applies migrations, or prints credentials.
require('dotenv').config({ quiet: true });
const prisma = require('../src/lib/prisma');

async function main() {
  const target = new URL(process.env.DATABASE_URL);
  console.log(JSON.stringify({ host: target.hostname, port: target.port || '3306', database: target.pathname.slice(1) }));
  const columns = await prisma.$queryRawUnsafe("SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'FinancialAccount' ORDER BY ORDINAL_POSITION");
  console.log(JSON.stringify({ accountColumns: columns.map(column => column.COLUMN_NAME) }));
  const indexes = await prisma.$queryRawUnsafe("SELECT INDEX_NAME, COLUMN_NAME, SEQ_IN_INDEX FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'FinancialAccount' ORDER BY INDEX_NAME, SEQ_IN_INDEX");
  console.log(JSON.stringify({ accountIndexes: indexes }, (_, value) => typeof value === 'bigint' ? value.toString() : value));
  const counts = await prisma.$queryRawUnsafe('SELECT (SELECT COUNT(*) FROM FinancialAccount) AS accounts, (SELECT COUNT(*) FROM JournalLine) AS journalLines, (SELECT COUNT(*) FROM Payment) AS payments, (SELECT COUNT(*) FROM SecurityDepositTransaction) AS depositTransactions');
  console.log(JSON.stringify({ counts: counts[0] }, (_, value) => typeof value === 'bigint' ? value.toString() : value));
  const migrations = await prisma.$queryRawUnsafe('SELECT migration_name, finished_at, rolled_back_at FROM _prisma_migrations ORDER BY started_at');
  console.log(JSON.stringify({ migrations }));
}

main().catch(() => {
  console.error('Read-only preflight failed. Check database access and migration history. No changes were made.');
  process.exitCode = 1;
}).finally(() => prisma.$disconnect());
