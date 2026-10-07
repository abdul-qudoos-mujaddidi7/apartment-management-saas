const assert = require('node:assert/strict');
const test = require('node:test');

const { createLeaseSchema, leaseTypes, updateLeaseSchema } = require('./lease.validation');

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

test('defaults a new lease to a monthly rent cycle', () => {
  const result = createLeaseSchema.safeParse(baseLease);
  assert.equal(result.success, true);
  assert.equal(result.data.rentCycleMonths, 1);
});

test('lease type supports the allowed choices and defaults new leases to Rent', () => {
  const defaulted = createLeaseSchema.safeParse(baseLease);
  assert.equal(defaulted.success, true);
  assert.equal(defaulted.data.leaseType, 'RENT');

  for (const leaseType of leaseTypes) {
    const result = createLeaseSchema.safeParse({ ...baseLease, leaseType });
    assert.equal(result.success, true, `${leaseType} should be accepted`);
    assert.equal(result.data.leaseType, leaseType);
  }
  assert.equal(createLeaseSchema.safeParse({ ...baseLease, leaseType: 'SALE' }).success, false);

  const update = updateLeaseSchema.safeParse({ leaseType: 'FOR_SALE' });
  assert.equal(update.success, true);
  assert.equal(update.data.leaseType, 'FOR_SALE');
  assert.equal('leaseType' in updateLeaseSchema.safeParse({ status: 'ACTIVE' }).data, false);
});

test('accepts only 1, 2, 3, 4, 6 or 12 month rent cycles', () => {
  for (const months of [1, 2, 3, 4, 6, 12]) {
    const result = createLeaseSchema.safeParse({ ...baseLease, rentCycleMonths: months });
    assert.equal(result.success, true, `${months} should be a valid cycle`);
    assert.equal(result.data.rentCycleMonths, months);
  }
  for (const months of [0, 5, 7, 13, 24, -1]) {
    assert.equal(createLeaseSchema.safeParse({ ...baseLease, rentCycleMonths: months }).success, false);
  }
});

test('a partial update does not reset the rent cycle', () => {
  const result = updateLeaseSchema.safeParse({ status: 'ACTIVE' });
  assert.equal(result.success, true);
  assert.equal('rentCycleMonths' in result.data, false);
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
