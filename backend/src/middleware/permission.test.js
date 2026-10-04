const test = require('node:test');
const assert = require('node:assert/strict');
const prisma = require('../lib/prisma');
const { hasPermission, requirePermission } = require('./permission');
test('permissions require a live role grant and do not trust request body organization or role names', async () => {
  const original = prisma.rolePermission.findFirst;
  let grant = null;
  prisma.rolePermission.findFirst = async ({ where }) => {
    assert.equal(where.roleId, 'r1');
    assert.equal(where.deletedAt, null);
    assert.equal(where.role.deletedAt, null);
    assert.equal(where.permission.deletedAt, null);
    assert.equal(where.permission.code, 'LEASE_VIEW');
    return grant;
  };
  try {
    assert.equal(await hasPermission({}, 'LEASE_VIEW'), false);
    const user = { organizations: [{ role: { id: 'r1', name: 'ADMIN' } }] };
    assert.equal(await hasPermission(user, 'LEASE_VIEW'), false);
    let status;
    await requirePermission('LEASE_VIEW')({ user, body: { organizationId: 'foreign' } }, { status(value) { status = value; return this; }, json() {} }, () => assert.fail('Ungrantable request was allowed'));
    assert.equal(status, 403);
    grant = { id: 'grant1' };
    assert.equal(await hasPermission(user, 'LEASE_VIEW'), true);
  } finally { prisma.rolePermission.findFirst = original; }
});
