const test = require('node:test');
const assert = require('node:assert/strict');
const { rentInvoiceNotifications } = require('./invoice-notifications');

test('rent notifications show generated invoices with stable links and organization scope', async () => {
  const invoice = { id: 'invoice1', invoiceNumber: 'INV1', invoiceDate: new Date('2026-10-08'), billingPeriodStart: new Date('2026-09-08'), lease: { tenant: { firstName: 'Tenant' } } };
  const client = { invoice: { findMany: async ({ where, take, orderBy }) => {
    assert.equal(where.organizationId, 'org1');
    assert.equal(where.lease.apartment.floor.building.organizationId, 'org1');
    assert.equal(where.deletedAt, null);
    assert.deepEqual(where.status, { not: 'CANCELLED' });
    assert.deepEqual(where.billingPeriodStart, { not: null });
    assert.deepEqual(where.items, { some: { type: 'RENT' } });
    assert.equal(where.invoiceDate.lte.toISOString(), '2026-10-08T00:00:00.000Z');
    assert.equal(where.createdAt.gte.toISOString(), '2026-09-08T00:00:00.000Z');
    assert.equal(take, 50);
    assert.deepEqual(orderBy, [{ createdAt: 'desc' }, { id: 'desc' }]);
    return [invoice];
  } } };
  const [notification] = await rentInvoiceNotifications('org1', { client, today: '2026-10-08' });
  assert.equal(notification.id, 'invoice1');
  assert.equal(notification.notificationId, 'rent-invoice:invoice1');
  await assert.rejects(rentInvoiceNotifications(null, { client }), /organization is required/);
});
