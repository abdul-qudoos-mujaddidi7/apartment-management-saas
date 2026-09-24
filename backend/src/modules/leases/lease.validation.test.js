const assert = require('node:assert/strict');
const test = require('node:test');

const { createLeaseSchema, updateLeaseSchema } = require('./lease.validation');

const baseLease = {
  tenantId: 'tenant-1',
  apartmentId: 'apartment-1',
  contractNumber: 'L-2026-001',
  startDate: '2026-09-01',
  endDate: '2027-09-01',
  monthlyRent: 15000,
  paymentDueDay: 1,
};

test('defaults the service fee to zero on a new lease', () => {
  const result = createLeaseSchema.safeParse(baseLease);
  assert.equal(result.success, true);
  assert.equal(result.data.serviceFee, 0);
  // Absent means "the organization's reporting currency", resolved in the service.
  assert.equal(result.data.serviceFeeCurrency, undefined);
});

test('accepts a service fee stated in its own currency', () => {
  const result = createLeaseSchema.safeParse({
    ...baseLease,
    monthlyRent: 15000,
    currency: 'usd',
    serviceFee: 250,
    serviceFeeCurrency: 'afn',
  });
  assert.equal(result.success, true);
  assert.equal(result.data.currency, 'USD');
  assert.equal(result.data.serviceFee, 250);
  assert.equal(result.data.serviceFeeCurrency, 'AFN');
});

test('rejects a negative service fee and a malformed currency code', () => {
  assert.equal(createLeaseSchema.safeParse({ ...baseLease, serviceFee: -1 }).success, false);
  assert.equal(createLeaseSchema.safeParse({ ...baseLease, serviceFeeCurrency: 'DOLLARS' }).success, false);
});

/*
 * The defaults live on the create schema only. Zod fills a default in even after
 * `.partial()`, so a defaulted field on the update schema was reset by every
 * partial update — and activating a lease sent exactly one field, so it zeroed
 * the deposit and put the lease back in draft on the way.
 */
test('keeps a partial update from resetting the fee, the deposit or the status', () => {
  const result = updateLeaseSchema.safeParse({ status: 'ACTIVE' });
  assert.equal(result.success, true);
  assert.equal('serviceFee' in result.data, false);
  assert.equal('securityDeposit' in result.data, false);
  assert.equal('status' in result.data, true);
  // The currency codes are shaped through a preprocess, so they come back as an
  // explicit undefined instead of an absent key. The service reads that as "not
  // sent", and Prisma ignores undefined on write, so the stored code stands.
  assert.equal(result.data.serviceFeeCurrency, undefined);
  assert.equal(result.data.securityDepositCurrency, undefined);
  assert.equal(updateLeaseSchema.safeParse({ contractNumber: 'L-2026-002' }).data.status, undefined);
});
