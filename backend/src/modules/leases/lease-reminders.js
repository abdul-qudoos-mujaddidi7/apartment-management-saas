const prisma = require('../../lib/prisma');
const { businessToday, reminderFor } = require('../../lib/business-date');
async function expiringLeases(organizationId) {
  const today = businessToday();
  const leases = await prisma.lease.findMany({
    where: { organizationId, status: 'ACTIVE', deletedAt: null,
      endDate: { gte: new Date(`${today}T00:00:00Z`), lte: new Date(Date.parse(today) + 32 * 86400000) },
      tenant: { deletedAt: null }, apartment: { deletedAt: null } },
    orderBy: [{ endDate: 'asc' }, { id: 'asc' }],
    select: { id: true, contractNumber: true, status: true, endDate: true, monthlyRent: true, currency: true,
      tenant: { select: { id: true, firstName: true } },
      apartment: { select: { id: true, apartmentNumber: true, name: true, floor: { select: { name: true, building: { select: { name: true } } } } } } },
  });
  // Derived notifications: one stable key per lease/expiry, with no stale rows
  // after termination or renewal and no scheduler dependency for catch-up.
  return leases.map(lease => reminderFor(lease, today)).filter(Boolean).map(lease => ({ ...lease, monthlyRent: Number(lease.monthlyRent) }));
}
module.exports = { expiringLeases };
