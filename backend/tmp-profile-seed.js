/**
 * Scratch: builds one complete tenant file in the demo workspace (building →
 * floor → apartment → meter → reading → tenant → lease → invoice → payment →
 * deposit) so the profile page can be looked at with real data in it.
 * Prints every id it created so tmp-profile-cleanup.js can remove them.
 */
require('dotenv').config({ quiet: true });
const fs = require('node:fs');
const prisma = require('./src/lib/prisma');

const BASE = 'http://localhost:3001/api';
const TAG = 'ZZPF';
const MANIFEST = './.tmp-profile-scenario.json';

/** A USD rate is needed for a dollar lease; recorded so cleanup can remove it. */
async function ensureUsdRate(organizationId) {
  const currency = await prisma.currency.findFirst({ where: { organizationId, code: 'USD' } });
  if (!currency) throw new Error('the demo workspace does not trade USD');
  const existing = await prisma.exchangeRate.findFirst({
    where: { currencyId: currency.id, effectiveDate: { lte: new Date('2026-08-01') } },
  });
  if (existing) return null;
  const created = await prisma.exchangeRate.create({
    data: { organizationId, currencyId: currency.id, rate: 64, effectiveDate: new Date('2026-08-01') },
  });
  return created.id;
}
let cookie = '';

async function call(method, path, body) {
  const response = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const setCookie = response.headers.getSetCookie?.() || [];
  if (setCookie.length) cookie = setCookie.map((c) => c.split(';')[0]).join('; ');
  const data = await response.json().catch(() => ({}));
  return { status: response.status, data };
}

function must(label, result) {
  if (result.status >= 400) {
    throw new Error(`${label} → ${result.status} ${JSON.stringify(result.data)}`);
  }
  return result.data;
}

(async () => {
  must('login', await call('POST', '/auth/login', { email: 'admin@example.com', password: 'Admin@123456' }));

  const me = must('session', await call('GET', '/auth/me'));
  const organizationId = (me.user || me).organizationId;
  const createdRateId = await ensureUsdRate(organizationId);

  const accounts = must('accounts', await call('GET', '/financial-accounts'));
  const account = (accounts.items || accounts.accounts || []).find((a) => a.code === '1000')
    || (accounts.items || accounts.accounts || [])[0];
  if (!account) throw new Error('no financial account to receive money');

  const building = must('building', await call('POST', '/buildings', {
    name: `${TAG} Residence`, code: TAG, address: 'Kabul', status: 'ACTIVE',
  }));
  const buildingId = building.building.id;

  const floor = must('floor', await call('POST', '/floors', {
    buildingId, floorNumber: 1, name: 'Ground',
  }));

  const apartment = must('apartment', await call('POST', '/apartments', {
    floorId: floor.floor.id, apartmentNumber: `${TAG}-1`, name: 'Profile check flat',
    type: 'RESIDENTIAL', bedrooms: 2, bathrooms: 1, monthlyRent: 300, rentCurrency: 'USD',
  }));
  const apartmentId = apartment.apartment.id;

  const meter = must('meter', await call('POST', '/meters', {
    apartmentId, meterNumber: `${TAG}-ELEC`, utilityType: 'ELECTRICITY', unit: 'kWh', defaultUnitPrice: 5,
    initialReading: 1000, status: 'ACTIVE',
  }));
  const meterId = meter.meter.id;

  const tenant = must('tenant', await call('POST', '/tenants', {
    firstName: 'Zahra', lastName: 'Profilecheck', phone: '0799000111', email: 'zahra@example.com',
    nationalId: '1401-0000-111', address: 'Kabul, Karte Naw', emergencyContactName: 'Omid Profilecheck',
    emergencyContactPhone: '0799000222', notes: 'Reads meters on the 5th.', status: 'ACTIVE',
  }));
  const tenantId = tenant.tenant.id;

  const lease = must('lease', await call('POST', '/leases', {
    tenantId, apartmentId, contractNumber: `${TAG}-L1`,
    startDate: '2026-08-25', endDate: '2027-08-24',
    monthlyRent: 300, securityDeposit: 300, currency: 'USD', paymentDueDay: 5, status: 'ACTIVE',
    notes: 'Paid in dollars at the rate of the due date.',
  }));
  const leaseId = lease.lease.id;

  const reading = must('reading', await call('POST', '/meter-readings', {
    meterId, readingDate: '2026-09-22', currentReading: 1180, notes: 'Sunbula reading.',
  }));

  const invoice = must('invoice', await call('POST', '/invoices', {
    leaseId, invoiceDate: '2026-09-01', dueDate: '2026-09-05',
    items: [
      { type: 'RENT', description: 'Rent — Sunbula 1405', quantity: 1, unitPrice: 300 },
      { type: 'ELECTRICITY', description: 'Electricity', quantity: 180, unitPrice: 5 },
    ],
    notes: 'Rent and electricity.',
  }));
  const invoiceId = invoice.invoice.id;
  const item = (invoice.invoice.items || [])[0];

  must('payment', await call('POST', '/payments', {
    tenantId, leaseId, paymentDate: '2026-09-20', currency: 'USD',
    receiveAccountId: account.id, paymentMethod: 'CASH', amount: 200,
    reference: 'REC-1', notes: 'Part payment.',
    allocations: item ? [{ invoiceItemId: item.id, amount: 200 }] : [],
  }));

  must('deposit', await call('POST', `/security-deposits/${leaseId}/transactions`, {
    type: 'RECEIVED', amount: 300, currency: 'USD', transactionDate: '2026-08-25',
    accountId: account.id, reference: 'DEP-1', notes: 'Deposit received at signing.',
  }));

  console.log('created', JSON.stringify({
    buildingId, floorId: floor.floor.id, apartmentId, meterId, tenantId, leaseId, invoiceId,
    readingId: reading.meterReading.id,
  }));
  fs.writeFileSync(MANIFEST, JSON.stringify({ createdRateIds: createdRateId ? [createdRateId] : [] }));
  console.log('open the page at #/tenants/' + tenantId);
  await prisma.$disconnect();
})().catch(async (error) => {
  console.error(error.message);
  await prisma.$disconnect();
  process.exit(1);
});
