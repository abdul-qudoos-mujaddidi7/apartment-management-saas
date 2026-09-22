/**
 * Minimal single-lease fixture for driving dashboard flows.
 *
 *   node .freebuff/mini-fixture.mjs create   -> writes .freebuff/mini-fixture.json
 *   node .freebuff/mini-fixture.mjs remove   -> deletes the fixture and everything it posted
 *
 * Nothing else in the database is touched: every delete is by id, and the
 * invoice/payment services' journals and ledger entries are removed too.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const root = path.join(import.meta.dirname, '..');
const prisma = require(path.join(root, 'backend', 'src', 'lib', 'prisma'));
const FILE = path.join(import.meta.dirname, 'mini-fixture.json');
const API = 'http://localhost:3001/api';
const mode = process.argv[2] || 'create';

let cookie = '';
async function call(method, route, body) {
  const response = await fetch(API + route, {
    method,
    headers: { 'Content-Type': 'application/json', ...(cookie ? { cookie } : {}) },
    body: body ? JSON.stringify(body) : undefined
  });
  for (const raw of response.headers.getSetCookie?.() || []) {
    const [pair] = raw.split(';');
    const [name] = pair.split('=');
    cookie = cookie.split('; ').filter((part) => part && !part.startsWith(`${name}=`)).concat(pair).join('; ');
  }
  const text = await response.text();
  let json; try { json = JSON.parse(text); } catch { json = text.slice(0, 200); }
  return { status: response.status, json };
}

const pick = (response, key) => {
  const value = response.json?.[key];
  if (!value) console.log('  !!', response.status, JSON.stringify(response.json).slice(0, 260));
  return value;
};

if (mode === 'create') {
  await call('POST', '/auth/login', { email: 'admin@example.com', password: 'Admin@123456' });
  const accounts = pick(await call('GET', '/accounts?page=1&pageSize=50'), 'items') || [];
  const cash = accounts.find((account) => account.code === '1000');
  const stamp = Date.now().toString().slice(-6);

  const building = pick(await call('POST', '/buildings', { name: 'ZZ Flow Fixture', code: `ZZF-${stamp}`, status: 'ACTIVE' }), 'building');
  const floor = pick(await call('POST', '/floors', { buildingId: building.id, floorNumber: 1, name: 'Ground' }), 'floor');
  const apartment = pick(await call('POST', '/apartments', { floorId: floor.id, apartmentNumber: 'F-1', name: 'Flow unit', type: 'ONE_BEDROOM', status: 'OCCUPIED', area: 55, bedrooms: 1, bathrooms: 1, monthlyRent: 12000 }), 'apartment');
  const tenant = pick(await call('POST', '/tenants', { firstName: 'Flow', lastName: 'Tenant', phone: `078${stamp}`, status: 'ACTIVE' }), 'tenant');
  const lease = pick(await call('POST', '/leases', { tenantId: tenant.id, apartmentId: apartment.id, contractNumber: `ZZF-L-${stamp}`, startDate: '2026-01-01', endDate: '2027-01-01', monthlyRent: 12000, securityDeposit: 24000, paymentDueDay: 5, status: 'ACTIVE' }), 'lease');

  fs.writeFileSync(FILE, JSON.stringify({
    buildingId: building?.id, floorId: floor?.id, apartmentId: apartment?.id,
    tenantId: tenant?.id, leaseId: lease?.id, receiveAccountId: cash?.id
  }, null, 1));
  console.log('created', JSON.stringify({ lease: lease?.contractNumber, apartment: apartment?.apartmentNumber, tenant: `${tenant?.firstName} ${tenant?.lastName}` }));
}

if (mode === 'remove') {
  const ids = JSON.parse(fs.readFileSync(FILE, 'utf8'));

  const invoices = await prisma.invoice.findMany({ where: { leaseId: ids.leaseId }, select: { id: true } });
  const payments = await prisma.payment.findMany({ where: { leaseId: ids.leaseId }, select: { id: true } });
  const invoiceIds = invoices.map((row) => row.id);
  const paymentIds = payments.map((row) => row.id);
  const journals = await prisma.journal.findMany({
    where: { referenceId: { in: [...invoiceIds, ...paymentIds] } },
    select: { id: true }
  });
  const journalIds = journals.map((row) => row.id);

  const removed = await prisma.$transaction([
    prisma.paymentAllocation.deleteMany({ where: { paymentId: { in: paymentIds } } }),
    prisma.journalLine.deleteMany({ where: { journalId: { in: journalIds } } }),
    prisma.journal.deleteMany({ where: { id: { in: journalIds } } }),
    prisma.tenantLedgerEntry.deleteMany({ where: { tenantAccount: { tenantId: ids.tenantId } } }),
    prisma.tenantAccount.deleteMany({ where: { tenantId: ids.tenantId } }),
    prisma.securityDepositTransaction.deleteMany({ where: { leaseId: ids.leaseId } }),
    prisma.payment.deleteMany({ where: { id: { in: paymentIds } } }),
    prisma.invoiceItem.deleteMany({ where: { invoiceId: { in: invoiceIds } } }),
    prisma.invoice.deleteMany({ where: { id: { in: invoiceIds } } }),
    prisma.lease.deleteMany({ where: { id: ids.leaseId } }),
    prisma.apartment.deleteMany({ where: { id: ids.apartmentId } }),
    prisma.floor.deleteMany({ where: { id: ids.floorId } }),
    prisma.building.deleteMany({ where: { id: ids.buildingId } }),
    prisma.tenant.deleteMany({ where: { id: ids.tenantId } })
  ]);

  fs.rmSync(FILE, { force: true });
  console.log('removed rows (allocations, lines, journals, ledger, accounts, deposits, payments, items, invoices, leases, apartments, floors, buildings, tenants):', removed.map((r) => r.count).join(', '));
}

await prisma.$disconnect();
