const assert = require('node:assert/strict');
const test = require('node:test');
const { DEFAULT_ACCOUNTS, ensureDefaultAccounts } = require('./financial-account.service');

test('initializing migrated accounts reuses existing IDs and never creates numeric codes', async () => {
  const existing = DEFAULT_ACCOUNTS.map(([systemKey, name, type], index) => ({ id: `existing-${index}`, organizationId: 'organization-1', systemKey, name, type, deletedAt: null }));
  let created = 0;
  const client = { financialAccount: {
    async createMany({ data, skipDuplicates }) {
      assert.equal(skipDuplicates, true);
      for (const account of data) {
        assert.equal(Object.hasOwn(account, 'code'), false);
        assert.equal(account.organizationId, 'organization-1');
        if (!existing.some(row => row.organizationId === account.organizationId && row.systemKey === account.systemKey)) { existing.push({ id: `new-${created++}`, ...account }); }
      }
    },
    async findMany({ where }) {
      return existing.filter(row => row.organizationId === where.organizationId && !row.deletedAt && where.systemKey.in.includes(row.systemKey));
    },
  } };
  const first = await ensureDefaultAccounts(client, 'organization-1');
  const second = await ensureDefaultAccounts(client, 'organization-1');
  assert.equal(created, 0);
  assert.equal(first.CASH.id, 'existing-0');
  assert.equal(first.ACCOUNTS_RECEIVABLE.id, 'existing-1');
  assert.equal(first.SECURITY_DEPOSIT_LIABILITY.id, 'existing-2');
  assert.deepEqual(first, second);
});

test('initializing a different organization cannot reuse another organization’s accounts', async () => {
  const client = { financialAccount: { async createMany() {}, async findMany() { return []; } } };
  await assert.rejects(ensureDefaultAccounts(client, 'other-organization'), /Default account CASH could not be created/);
});
