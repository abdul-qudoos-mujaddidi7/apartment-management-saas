const { Prisma } = require('@prisma/client');
const { dateKey } = require('../../lib/business-date');
const Decimal = Prisma.Decimal;
function calculateCharge(previous, current, rate) {
  const consumption = new Decimal(current).minus(previous);
  if (consumption.isNegative()) throw Object.assign(new Error('Current reading cannot be lower than the previous reading.'), { code: 'CURRENT_READING_TOO_LOW' });
  const amount = consumption.times(rate).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  if (amount.greaterThan('9999999999999.99')) throw Object.assign(new Error('Charge exceeds the supported amount.'), { code: 'INVALID_READING_PERIOD' });
  return { consumption, amount };
}
function coversPeriod(lease, start, end) {
  return lease.status !== 'DRAFT' && !lease.deletedAt && dateKey(lease.startDate) <= dateKey(start) && dateKey(lease.endDate) >= dateKey(end);
}
async function assertLeaseOwnsInterval(client, organizationId, lease, start, end) {
  if (!coversPeriod(lease, start, end)) return false;
  // A successor's move-in date is a hard handover boundary, even when an old
  // terminated contract still carries its originally agreed future end date.
  const successor = await client.lease.findFirst({ where: {
    organizationId, apartmentId: lease.apartmentId, deletedAt: null,
    id: { not: lease.id }, status: { not: 'DRAFT' },
    startDate: { gte: lease.startDate, lt: end },
  }, select: { id: true } });
  return !successor;
}
module.exports = { calculateCharge, coversPeriod, assertLeaseOwnsInterval };
