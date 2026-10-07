const test = require('node:test');
const assert = require('node:assert/strict');
const prisma = require('../../lib/prisma');
const { buildingListQuerySchema } = require('./building.validation');
const { listBuildings } = require('./building.service');

test('building list validates optional status filters without dropping them', () => {
  for (const status of ['ACTIVE', 'INACTIVE']) {
    assert.equal(buildingListQuerySchema.parse({ status }).status, status);
  }
  assert.equal(buildingListQuerySchema.parse({}).status, undefined);
  for (const status of ['all', 'active', 'INVALID']) {
    assert.equal(buildingListQuerySchema.safeParse({ status }).success, false);
  }
});

test('building status filters apply to rows and pagination alongside search and organization scope', async () => {
  const original = { findMany: prisma.building.findMany, count: prisma.building.count, transaction: prisma.$transaction };
  const fixtures = [
    { id: 'a1', name: 'North Active', code: 'A1', status: 'ACTIVE', organizationId: 'own', deletedAt: null },
    { id: 'a2', name: 'South Active', code: 'A2', status: 'ACTIVE', organizationId: 'own', deletedAt: null },
    { id: 'i1', name: 'North Inactive', code: 'I1', status: 'INACTIVE', organizationId: 'own', deletedAt: null },
    { id: 'foreign', name: 'North Foreign', status: 'INACTIVE', organizationId: 'other', deletedAt: null },
    { id: 'deleted', name: 'North Deleted', status: 'INACTIVE', organizationId: 'own', deletedAt: new Date() },
  ];
  let rowWhere;
  let countWhere;
  const matching = where => fixtures.filter(row => row.organizationId === where.organizationId
    && row.deletedAt === where.deletedAt && (!where.status || row.status === where.status)
    && (!where.OR || where.OR.some(condition => Object.entries(condition).some(([key, value]) => (row[key] || '').includes(value.contains)))));
  prisma.building.findMany = async ({ where, skip, take }) => {
    rowWhere = where;
    return matching(where).slice(skip, skip + take).map(row => ({ ...row, _count: { floors: 2 } }));
  };
  prisma.building.count = async ({ where }) => { countWhere = where; return matching(where).length; };
  prisma.$transaction = queries => Promise.all(queries);
  try {
    const all = await listBuildings('own', buildingListQuerySchema.parse({}));
    assert.deepEqual(all.items.map(row => row.id), ['a1', 'a2', 'i1']);
    assert.equal(all.pagination.total, 3);
    const active = await listBuildings('own', buildingListQuerySchema.parse({ status: 'ACTIVE', pageSize: 1, page: 2 }));
    assert.deepEqual(active.items.map(row => row.id), ['a2']);
    assert.equal(active.pagination.total, 2);
    assert.equal(active.pagination.totalPages, 2);
    assert.equal(active.items[0].totalFloors, 2);
    assert.deepEqual(rowWhere, countWhere);
    const inactive = await listBuildings('own', buildingListQuerySchema.parse({ status: 'INACTIVE' }));
    assert.deepEqual(inactive.items.map(row => row.id), ['i1']);
    assert.equal(inactive.pagination.total, 1);
    const search = await listBuildings('own', buildingListQuerySchema.parse({ status: 'ACTIVE', search: 'North' }));
    assert.deepEqual(search.items.map(row => row.id), ['a1']);
    assert.equal(search.pagination.total, 1);
    const empty = await listBuildings('own', buildingListQuerySchema.parse({ status: 'INACTIVE', search: 'South' }));
    assert.deepEqual(empty.items, []);
    assert.equal(empty.pagination.total, 0);
    assert.equal(empty.pagination.totalPages, 0);
  } finally {
    prisma.building.findMany = original.findMany;
    prisma.building.count = original.count;
    prisma.$transaction = original.transaction;
  }
});
