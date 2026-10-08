const assert = require('node:assert/strict');
const test = require('node:test');
const { DEFAULT_ACCOUNTS, ensureDefaultAccounts, getAccountSummary } = require('./financial-account.service');

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

/** A summary client whose raw-SQL rows distinguish the by-year and by-source queries. */
function summaryClient(type = 'ASSET') {
  const queries = [];
  return {
    queries,
    financialAccount: {
      async findFirst({ where }) {
        assert.equal(where.id, 'account-1');
        assert.equal(where.organizationId, 'organization-1');
        assert.equal(where.deletedAt, null);
        return { id: 'account-1', organizationId: 'organization-1', name: 'Cash', type, deletedAt: null };
      },
    },
    async $queryRaw(strings, ...values) {
      const sql = strings.join('?');
      queries.push({ sql, values });
      assert.match(sql, /l\.accountId = \?/);
      assert.match(sql, /j\.organizationId = \?/);
      assert.match(sql, /j\.status = 'POSTED'/);
      assert.deepEqual(values, ['account-1', 'organization-1']);
      if (sql.includes('YEAR(')) {
        return [
          { year: 2026, entries: 3n, debit: '150.00', credit: '50.00' },
          { year: 2025, entries: 1n, debit: '0.00', credit: '10.00' },
        ];
      }
      return [
        { referenceType: 'INVOICE', entries: 2n, debit: '100.00', credit: '0.00' },
        { referenceType: 'PAYMENT', entries: 2n, debit: '50.00', credit: '60.00' },
      ];
    },
  };
}

test('account summary groups posted mirrors by year and source with organization scoping', async () => {
  const client = summaryClient('ASSET');
  const summary = await getAccountSummary('organization-1', 'account-1', client);

  assert.equal(summary.totals.entries, 4);
  assert.equal(summary.totals.debit, 150);
  assert.equal(summary.totals.credit, 60);
  assert.equal(summary.totals.net, 90); // ASSET runs debit - credit

  assert.deepEqual(summary.byYear, [
    { year: 2026, entries: 3, debit: 150, credit: 50, net: 100 },
    { year: 2025, entries: 1, debit: 0, credit: 10, net: -10 },
  ]);
  assert.deepEqual(summary.bySource, [
    { referenceType: 'INVOICE', entries: 2, debit: 100, credit: 0, net: 100 },
    { referenceType: 'PAYMENT', entries: 2, debit: 50, credit: 60, net: -10 },
  ]);
  assert.equal(client.queries.length, 2);
});

test('account summary net follows the account direction and missing accounts are rejected', async () => {
  const liability = await getAccountSummary('organization-1', 'account-1', summaryClient('LIABILITY'));
  assert.equal(liability.totals.net, -90); // LIABILITY runs credit - debit
  assert.equal(liability.byYear[0].net, -100);

  const missing = { financialAccount: { async findFirst() { return null; } }, async $queryRaw() { throw new Error('should not run'); } };
  await assert.rejects(getAccountSummary('organization-1', 'account-1', missing), (error) => error.code === 'ACCOUNT_NOT_FOUND');
});
