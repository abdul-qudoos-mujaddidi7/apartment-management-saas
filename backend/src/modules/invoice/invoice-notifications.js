const prisma = require('../../lib/prisma');
const { businessToday } = require('../../lib/business-date');

async function rentInvoiceNotifications(organizationId, { client = prisma, today = businessToday() } = {}) {
  if (!organizationId) throw new Error('An organization is required.');
  const day = new Date(`${today}T00:00:00Z`);
  const since = new Date(day.getTime() - 30 * 86400000);
  const invoices = await client.invoice.findMany({
    where: {
      organizationId, deletedAt: null, status: { not: 'CANCELLED' },
      billingPeriodStart: { not: null }, invoiceDate: { lte: day }, createdAt: { gte: since },
      items: { some: { type: 'RENT' } },
      lease: { organizationId, deletedAt: null, tenant: { deletedAt: null }, apartment: { deletedAt: null, floor: { deletedAt: null, building: { organizationId, deletedAt: null } } } },
    },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 50,
    select: {
      id: true, invoiceNumber: true, invoiceDate: true, billingPeriodStart: true, createdAt: true,
      lease: { select: { contractNumber: true, rentCycleMonths: true, tenant: { select: { firstName: true } }, apartment: { select: { apartmentNumber: true } } } },
    },
  });
  return invoices.map(invoice => ({ ...invoice, notificationId: `rent-invoice:${invoice.id}` }));
}
module.exports = { rentInvoiceNotifications };
