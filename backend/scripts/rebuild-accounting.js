require('dotenv').config();

const prisma = require('../src/lib/prisma');
const { rebuildOrganization } = require('../src/modules/financials/accounting-backfill.service');

async function main() {
  if (!process.argv.includes('--apply')) {
    console.log('Dry safety gate: no data changed. Re-run with --apply after backing up the database.');
    return;
  }
  const organizations = await prisma.organization.findMany({ where: { deletedAt: null }, select: { id: true, name: true } });
  for (const organization of organizations) {
    const result = await rebuildOrganization(organization.id);
    console.log(`${organization.name}:`, result);
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
