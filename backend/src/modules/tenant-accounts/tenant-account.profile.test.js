const { test } = require('node:test');
const assert = require('node:assert/strict');
const prisma = require('../../lib/prisma');
const { ledgerSchema } = require('./tenant-account.validation');
const { getTenantLedger } = require('./tenant-account.service');

test('statement dates must be real calendar dates and ordered', () => {
  assert.equal(ledgerSchema.safeParse({ from: '2026-02-29' }).success, false);
  assert.equal(ledgerSchema.safeParse({ from: '2026-03-01', to: '2026-02-01' }).success, false);
  assert.equal(ledgerSchema.safeParse({ from: '2026-02-01', to: '2026-02-01' }).success, true);
  assert.equal(ledgerSchema.safeParse({}).success, true);
});

test('dated statements include opening totals and rebuild paginated balances after earlier edits', async () => {
  const original = prisma.$transaction;
  const start = new Date('2026-02-01T00:00:00Z');
  const date = new Date('2026-02-02T00:00:00Z');
  const created = new Date('2026-02-02T12:00:00Z');
  const checkScope = where => { assert.equal(where.organizationId,'org'); assert.equal(where.tenantAccountId,'account'); };
  const tx = {
    tenant: { findFirst: async ({ where }) => { assert.deepEqual(where,{ id: 'tenant', organizationId: 'org', deletedAt: null }); return { id: 'tenant' }; } },
    tenantAccount: { upsert: async () => ({ id: 'account', organizationId: 'org' }) },
    invoice: { findMany: async () => { throw new Error('Unexpected invoice query'); } },
    payment: { findMany: async ({ where }) => { assert.equal(where.organizationId,'org'); return [{ id: 'payment', paymentNumber: 'PAY-7' }]; } },
    tenantLedgerEntry: {
      findMany: async ({ where, orderBy, skip, take }) => {
        checkScope(where); assert.deepEqual(where.transactionDate,{ gte: start, lt: new Date('2026-02-03T00:00:00Z') });
        assert.deepEqual(orderBy,[{ transactionDate: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }]); assert.equal(skip,1); assert.equal(take,1);
        return [{ id: 'entry', transactionDate: date, createdAt: created, debit: 0, credit: 5, balanceAfter: 999, exchangeRate: 1, referenceType: 'PAYMENT', referenceId: 'payment' }];
      },
      count: async ({ where }) => { checkScope(where); return 2; },
      aggregate: async ({ where }) => {
        checkScope(where);
        if (where.OR) { assert.deepEqual(where.OR[2],{ transactionDate: date, createdAt: created, id: { lt: 'entry' } }); return { _sum: { debit: 130, credit: 20 } }; }
        if (where.transactionDate.lt && !where.transactionDate.gte) { assert.deepEqual(where.transactionDate.lt,start); return { _sum: { debit: 100, credit: 20 } }; }
        return { _sum: { debit: 30, credit: 5 } };
      },
    },
  };
  prisma.$transaction = async callback => callback(tx);
  try {
    const result = await getTenantLedger('org','tenant',{ page: 2, pageSize: 1, from: '2026-02-01', to: '2026-02-02' });
    assert.deepEqual(result.totals,{ debit: 30, credit: 5, openingBalance: 80, closingBalance: 105 });
    assert.equal(result.items[0].balanceAfter,105);
    assert.equal(result.items[0].referenceNumber,'PAY-7');
    assert.equal(result.pagination.totalPages,2);
  } finally { prisma.$transaction = original; }
});

test('a tenant outside the authenticated organization cannot load a statement', async () => {
  const original = prisma.$transaction;
  prisma.$transaction = async callback => callback({ tenant: { findFirst: async ({ where }) => { assert.equal(where.organizationId,'org'); assert.equal(where.id,'foreign-tenant'); return null; } } });
  try { await assert.rejects(getTenantLedger('org','foreign-tenant',{ page: 1, pageSize: 20 }),{ code: 'TENANT_NOT_FOUND' }); }
  finally { prisma.$transaction = original; }
});
