/**
 * Scratch: removes everything tmp-profile-seed.js created, found by its tag so
 * a half-finished seed run is cleaned up too.
 */
require('dotenv').config({ quiet: true });
const fs = require('node:fs');
const prisma = require('./src/lib/prisma');

const TAG = 'ZZPF';
const MANIFEST = './.tmp-profile-scenario.json';

(async () => {
  const removed = {};
  const bump = (key, n) => { if (n) removed[key] = (removed[key] || 0) + n; };

  const building = await prisma.building.findFirst({ where: { code: TAG } });
  // One scratch tenant with nothing attached, used to look at the empty states.
  bump('emptyTenantAccounts', (await prisma.tenantAccount.deleteMany({ where: { tenant: { lastName: 'Emptycheck' } } })).count);
  bump('emptyTenants', (await prisma.tenant.deleteMany({ where: { lastName: 'Emptycheck' } })).count);
  const tenant = await prisma.tenant.findFirst({ where: { lastName: 'Profilecheck' } });

  const floors = building ? await prisma.floor.findMany({ where: { buildingId: building.id } }) : [];
  const floorIds = floors.map((f) => f.id);
  const apartments = floorIds.length ? await prisma.apartment.findMany({ where: { floorId: { in: floorIds } } }) : [];
  const apartmentIds = apartments.map((a) => a.id);
  const leases = apartmentIds.length ? await prisma.lease.findMany({ where: { apartmentId: { in: apartmentIds } } }) : [];
  const leaseIds = leases.map((l) => l.id);

  const invoices = leaseIds.length ? await prisma.invoice.findMany({ where: { leaseId: { in: leaseIds } } }) : [];
  const invoiceIds = invoices.map((i) => i.id);
  const payments = leaseIds.length ? await prisma.payment.findMany({ where: { leaseId: { in: leaseIds } } }) : [];
  const paymentIds = payments.map((p) => p.id);
  const deposits = leaseIds.length ? await prisma.securityDepositTransaction.findMany({ where: { leaseId: { in: leaseIds } } }) : [];
  const depositIds = deposits.map((d) => d.id);

  // Journals first: their lines are what the account balances are summed from.
  const referenceIds = [...invoiceIds, ...paymentIds, ...depositIds, ...leaseIds];
  if (referenceIds.length) {
    const journals = await prisma.journal.findMany({ where: { referenceId: { in: referenceIds } }, select: { id: true } });
    const journalIds = journals.map((j) => j.id);
    if (journalIds.length) {
      bump('journalLines', (await prisma.journalLine.deleteMany({ where: { journalId: { in: journalIds } } })).count);
      bump('journals', (await prisma.journal.deleteMany({ where: { id: { in: journalIds } } })).count);
    }
  }

  if (tenant) {
    const account = await prisma.tenantAccount.findFirst({ where: { tenantId: tenant.id } });
    if (account) {
      bump('tenantLedgerEntries', (await prisma.tenantLedgerEntry.deleteMany({ where: { tenantAccountId: account.id } })).count);
      bump('tenantAccounts', (await prisma.tenantAccount.deleteMany({ where: { id: account.id } })).count);
    }
  }

  if (invoiceIds.length) {
    bump('paymentAllocations', (await prisma.paymentAllocation.deleteMany({ where: { invoiceItem: { invoiceId: { in: invoiceIds } } } })).count);
    bump('invoiceItems', (await prisma.invoiceItem.deleteMany({ where: { invoiceId: { in: invoiceIds } } })).count);
  }

  if (paymentIds.length) bump('payments', (await prisma.payment.deleteMany({ where: { id: { in: paymentIds } } })).count);
  if (depositIds.length) bump('depositTransactions', (await prisma.securityDepositTransaction.deleteMany({ where: { id: { in: depositIds } } })).count);
  if (invoiceIds.length) bump('invoices', (await prisma.invoice.deleteMany({ where: { id: { in: invoiceIds } } })).count);
  if (leaseIds.length) bump('leases', (await prisma.lease.deleteMany({ where: { id: { in: leaseIds } } })).count);

  if (apartmentIds.length) {
    bump('meterReadings', (await prisma.meterReading.deleteMany({ where: { meter: { apartmentId: { in: apartmentIds } } } })).count);
    bump('meters', (await prisma.meter.deleteMany({ where: { apartmentId: { in: apartmentIds } } })).count);
    bump('apartmentSpaces', (await prisma.apartmentSpace.deleteMany({ where: { apartmentId: { in: apartmentIds } } })).count);
    bump('apartments', (await prisma.apartment.deleteMany({ where: { id: { in: apartmentIds } } })).count);
  }
  if (floorIds.length) bump('floors', (await prisma.floor.deleteMany({ where: { id: { in: floorIds } } })).count);
  if (building) bump('buildings', (await prisma.building.deleteMany({ where: { id: building.id } })).count);
  if (tenant) bump('tenants', (await prisma.tenant.deleteMany({ where: { id: tenant.id } })).count);

  // Rates the seed added are removed only when the seed recorded them.
  if (fs.existsSync(MANIFEST)) {
    const manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
    if (manifest.createdRateIds?.length) {
      bump('exchangeRates', (await prisma.exchangeRate.deleteMany({ where: { id: { in: manifest.createdRateIds } } })).count);
    }
    fs.rmSync(MANIFEST);
  }

  console.log('removed', JSON.stringify(removed), removed.tenants ? '' : '(nothing to remove)');
  await prisma.$disconnect();
})().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});
