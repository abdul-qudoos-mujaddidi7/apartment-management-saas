require('dotenv').config();

const prisma = require('../src/lib/prisma');
const {
  getOrCreateTenantAccount,
  recalculateBalance,
} = require('../src/modules/tenant-accounts/tenant-account.service');

async function main() {
  if (!process.argv.includes('--apply')) {
    console.log('Dry safety gate: no data changed. Re-run with --apply after backing up the database.');
    return;
  }

  const tenants = await prisma.tenant.findMany({
    where: { deletedAt: null },
    select: { id: true, organizationId: true },
  });

  for (const tenant of tenants) {
    await prisma.$transaction(async (tx) => {
      const account = await getOrCreateTenantAccount(tx, tenant.organizationId, tenant.id);

      // The account may already exist. Recalculate from immutable ledger rows
      // rather than resetting its balance, so historical receivables remain intact.
      await recalculateBalance(tx, account.id);
    });
  }

  console.log(`Backfilled and reconciled ${tenants.length} active tenant account(s).`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
