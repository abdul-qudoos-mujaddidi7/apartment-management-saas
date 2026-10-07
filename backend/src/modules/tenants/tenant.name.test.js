const test = require('node:test');
const assert = require('node:assert/strict');
const prisma = require('../../lib/prisma');
const { createTenantSchema, updateTenantSchema } = require('./tenant.validation');
const { createTenant, updateTenant } = require('./tenant.service');

test('tenant registration requires a name and phone but no surname', () => {
  const data = createTenantSchema.parse({ firstName: ' Ali Ahmad ', phone: '0700000000', lastName: 'Legacy' });
  assert.equal(data.firstName, 'Ali Ahmad');
  assert.equal('lastName' in data, false);
  assert.equal(createTenantSchema.safeParse({ firstName: '', phone: '0700000000' }).success, false);
  assert.equal('lastName' in updateTenantSchema.parse({ firstName: 'Ali', lastName: 'Legacy' }), false);
});

test('creating a tenant omits the removed surname column and creates its account', async () => {
  const original = prisma.$transaction;
  let created;
  let account;
  prisma.$transaction = async callback => callback({
    tenant: { create: async ({ data, select }) => {
      created = data;
      assert.equal('lastName' in select, false);
      return { id: 'tenant-1', firstName: data.firstName };
    } },
    tenantAccount: { create: async ({ data }) => { account = data; } },
  });
  try {
    await createTenant('org-1', createTenantSchema.parse({ firstName: 'Ali Ahmad', phone: '0700000000' }));
    assert.equal('lastName' in created, false);
    assert.equal(created.organizationId, 'org-1');
    assert.deepEqual(account, { organizationId: 'org-1', tenantId: 'tenant-1', balance: 0 });
  } finally { prisma.$transaction = original; }
});

test('editing a tenant ignores legacy surname input and never queries the removed column', async () => {
  const original = { findFirst: prisma.tenant.findFirst, updateMany: prisma.tenant.updateMany };
  const stored = { id: 'tenant-1', firstName: 'Ali' };
  prisma.tenant.findFirst = async ({ select }) => {
    assert.equal('lastName' in select, false);
    return Object.fromEntries(Object.entries(stored).filter(([key]) => select[key]));
  };
  prisma.tenant.updateMany = async ({ data, where }) => {
    assert.deepEqual(where, { id: 'tenant-1', organizationId: 'org-1', deletedAt: null });
    assert.equal('lastName' in data, false);
    Object.assign(stored, data);
    return { count: 1 };
  };
  try {
    const updated = await updateTenant('org-1', 'tenant-1', updateTenantSchema.parse({ firstName: 'Ali Ahmad', lastName: 'Ignored' }));
    assert.equal(updated.firstName, 'Ali Ahmad');
    assert.equal('lastName' in updated, false);
    assert.equal('lastName' in stored, false);
  } finally { Object.assign(prisma.tenant, original); }
});
