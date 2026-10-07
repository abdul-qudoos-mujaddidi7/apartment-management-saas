const test = require('node:test');
const assert = require('node:assert/strict');
const prisma = require('../../lib/prisma');
const { listTenantsSchema } = require('./tenant.validation');
const { listTenants } = require('./tenant.service');

test('tenant list keeps optional status filters and rejects unknown statuses', () => {
  for (const status of ['ACTIVE', 'INACTIVE']) {
    assert.equal(listTenantsSchema.parse({ status }).status, status);
  }
  assert.equal(listTenantsSchema.parse({}).status, undefined);
  for (const status of ['all', 'active', 'INVALID']) {
    assert.equal(listTenantsSchema.safeParse({ status }).success, false);
  }
});

test('tenant filters combine status, search, pagination and organization scope', async () => {
  const original = { findMany: prisma.tenant.findMany, count: prisma.tenant.count, transaction: prisma.$transaction };
  const fixtures = [
    { id: 'a1', firstName: 'Ali', lastName: 'First', phone: '070000001', status: 'ACTIVE', organizationId: 'own', deletedAt: null },
    { id: 'a2', firstName: 'Ali Second', lastName: 'Archived', phone: '070000002', status: 'ACTIVE', organizationId: 'own', deletedAt: null },
    { id: 'i1', firstName: 'Omar', lastName: 'Third', phone: '070000003', status: 'INACTIVE', organizationId: 'own', deletedAt: null },
    { id: 'foreign', firstName: 'Omar', status: 'INACTIVE', organizationId: 'other', deletedAt: null },
    { id: 'deleted', firstName: 'Omar', status: 'INACTIVE', organizationId: 'own', deletedAt: new Date() },
  ];
  let rowWhere;
  let countWhere;
  const matching = where => fixtures.filter(row => row.organizationId === where.organizationId
    && row.deletedAt === where.deletedAt && (!where.status || row.status === where.status)
    && (!where.OR || where.OR.some(condition => Object.entries(condition).some(([key, value]) => (row[key] || '').includes(value.contains)))));
  prisma.tenant.findMany = async ({ where, skip, take }) => { rowWhere = where; return matching(where).slice(skip, skip + take); };
  prisma.tenant.count = async ({ where }) => { countWhere = where; return matching(where).length; };
  prisma.$transaction = queries => Promise.all(queries);
  try {
    const all = await listTenants('own', listTenantsSchema.parse({}));
    assert.deepEqual(all.items.map(row => row.id), ['a1', 'a2', 'i1']);
    assert.equal(all.pagination.total, 3);
    const active = await listTenants('own', listTenantsSchema.parse({ status: 'ACTIVE', pageSize: 1, page: 2 }));
    assert.deepEqual(active.items.map(row => row.id), ['a2']);
    assert.equal(active.pagination.total, 2);
    assert.equal(active.pagination.totalPages, 2);
    assert.deepEqual(rowWhere, countWhere);
    const inactive = await listTenants('own', listTenantsSchema.parse({ status: 'INACTIVE' }));
    assert.deepEqual(inactive.items.map(row => row.id), ['i1']);
    assert.equal(inactive.pagination.total, 1);
    const search = await listTenants('own', listTenantsSchema.parse({ status: 'ACTIVE', search: 'Second' }));
    assert.deepEqual(search.items.map(row => row.id), ['a2']);
    assert.equal(search.pagination.total, 1);
    const archived = await listTenants('own', listTenantsSchema.parse({ search: 'Archived' }));
    assert.equal(archived.pagination.total, 0);
    const phone = await listTenants('own', listTenantsSchema.parse({ status: 'INACTIVE', search: '070000003' }));
    assert.deepEqual(phone.items.map(row => row.id), ['i1']);
    const empty = await listTenants('own', listTenantsSchema.parse({ status: 'INACTIVE', search: 'Ali' }));
    assert.deepEqual(empty.items, []);
    assert.equal(empty.pagination.total, 0);
    assert.equal(empty.pagination.totalPages, 0);
  } finally {
    prisma.tenant.findMany = original.findMany;
    prisma.tenant.count = original.count;
    prisma.$transaction = original.transaction;
  }
});
