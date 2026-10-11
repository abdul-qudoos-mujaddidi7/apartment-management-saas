const { test } = require('node:test');
const assert = require('node:assert/strict');
const { Prisma } = require('@prisma/client');
const prisma = require('../../lib/prisma');
const { getContract } = require('./lease-contract.service');

test('contract tenant selection matches the current tenant schema', async () => {
  const fields = new Set(Prisma.dmmf.datamodel.models.find(model => model.name === 'Tenant').fields.map(field => field.name));
  let queried = false;
  const originalOrganization = prisma.organization.findFirst;
  const originalLease = prisma.lease.findFirst;
  prisma.organization.findFirst = async () => ({ id: 'organization', name: 'Office' });
  prisma.lease.findFirst = async query => {
    queried = true;
    assert.equal(query.where.organizationId, 'organization');
    for (const field of Object.keys(query.select.tenant.select)) {
      assert.ok(fields.has(field), `Unknown tenant field in contract query: ${field}`);
    }
    return null;
  };
  try {
    await assert.rejects(getContract('organization', 'lease'), { code: 'LEASE_NOT_FOUND' });
    assert.ok(queried);
  } finally {
    prisma.organization.findFirst = originalOrganization;
    prisma.lease.findFirst = originalLease;
  }
});
