const { test } = require('node:test');
const assert = require('node:assert/strict');
const prisma = require('../../lib/prisma');
const { listJournalsSchema } = require('./journal.validation');
const { listJournals } = require('./journal.service');

const MANUAL_ROW = {
  id: 'journal-1',
  journalNumber: 'JRN-000001',
  transactionDate: new Date('2026-10-01T00:00:00Z'),
  currency: 'AFN',
  exchangeRate: 1,
  referenceType: 'MANUAL',
  referenceId: 'JRN-000001',
  description: 'Rent adjustment',
  status: 'POSTED',
  voidedAt: null,
  voidReason: null,
  createdAt: new Date('2026-10-01T08:00:00Z'),
  updatedAt: new Date('2026-10-01T08:00:00Z'),
  lines: [
    {
      id: 'line-1',
      accountId: 'receivable',
      account: { id: 'receivable', name: 'Accounts receivable', type: 'ASSET' },
      tenantId: 'tenant-1',
      tenant: { id: 'tenant-1', firstName: 'Sample tenant' },
      description: null,
      debit: 100,
      credit: 0,
      baseDebit: 100,
      baseCredit: 0,
    },
    {
      id: 'line-2',
      accountId: 'income',
      account: { id: 'income', name: 'Rent income', type: 'INCOME' },
      tenantId: null,
      tenant: null,
      description: null,
      debit: 0,
      credit: 100,
      baseDebit: 0,
      baseCredit: 100,
    },
  ],
};

/** Runs listJournals against a stubbed table, handing back the filter it used. */
async function listWithStub(query) {
  const original = { findMany: prisma.journal.findMany, count: prisma.journal.count, transaction: prisma.$transaction };
  let where = null;
  prisma.journal.findMany = async (args) => { where = args.where; return [MANUAL_ROW]; };
  prisma.journal.count = async () => 1;
  prisma.$transaction = async (operations) => Promise.all(operations);
  try {
    const result = await listJournals('org', query);
    return { where, result };
  } finally {
    prisma.journal.findMany = original.findMany;
    prisma.journal.count = original.count;
    prisma.$transaction = original.transaction;
  }
}

test('the journal list can be scoped to one tenant account', async () => {
  const { where, result } = await listWithStub({ page: 1, pageSize: 10, tenantId: 'tenant-1' });

  assert.deepEqual(where.lines, { some: { tenantId: 'tenant-1' } });
  assert.equal(where.organizationId, 'org');
  assert.equal(result.pagination.total, 1);
  // The row still arrives as API numbers, and the tenant tag survives the trip.
  assert.equal(result.items[0].debitTotal, 100);
  assert.equal(result.items[0].creditTotal, 100);
  assert.equal(result.items[0].isManual, true);
  assert.equal(result.items[0].lines[0].tenant.firstName, 'Sample tenant');
  assert.equal(result.items[0].lines[0].baseDebit, 100);
});

test('a tenant and an account filter narrow the same line relation', async () => {
  // Two `lines: { some }` keys would collide in one object and silently drop the
  // first filter, so both conditions have to share a single clause.
  const { where } = await listWithStub({ page: 1, pageSize: 10, tenantId: 'tenant-1', accountId: 'receivable' });

  assert.deepEqual(where.lines, { some: { accountId: 'receivable', tenantId: 'tenant-1' } });
});

test('the list filter accepts a tenant and rejects a blank one', () => {
  assert.equal(listJournalsSchema.safeParse({ tenantId: 'tenant-1' }).success, true);
  assert.equal(listJournalsSchema.safeParse({}).success, true);
  assert.equal(listJournalsSchema.safeParse({ tenantId: '   ' }).success, false);
  assert.equal(listJournalsSchema.safeParse({ tenantId: '' }).success, true);
});
