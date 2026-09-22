const prisma = require('../../lib/prisma');

/** Months of history the collections trend carries (current month included). */
const TREND_MONTHS = 6;
/** Leases ending within this window are surfaced as "needs attention". */
const EXPIRING_WINDOW_DAYS = 60;
/** How many rows each action list returns. */
const LIST_LIMIT = 5;

const APARTMENT_STATUSES = ['AVAILABLE', 'OCCUPIED', 'RESERVED', 'MAINTENANCE', 'INACTIVE'];

function startOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function addMonths(date, months) {
  return new Date(date.getFullYear(), date.getMonth() + months, 1);
}

function monthKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

// Prisma hands back Decimal instances; the API exposes plain numbers.
function toNumber(value) {
  return Number(value || 0);
}

function round(value, places = 2) {
  return Number(Number(value).toFixed(places));
}

function balanceOf(invoice) {
  return Math.max(toNumber(invoice.total) - toNumber(invoice.paidAmount), 0);
}

/**
 * Everything the dashboard needs, in one round trip, scoped to the caller's
 * organization. Aggregates are computed in SQL where Prisma can express them and
 * summed in JS where it cannot (invoice balances are `total - paidAmount`).
 */
async function getDashboard(organizationId) {
  const now = new Date();
  const monthStart = startOfMonth(now);
  const lastMonthStart = addMonths(monthStart, -1);
  const trendStart = addMonths(monthStart, -(TREND_MONTHS - 1));
  const expiringBy = new Date(now.getTime() + EXPIRING_WINDOW_DAYS * 86_400_000);

  const orgScope = { organizationId, deletedAt: null };
  // Payments are immutable: they are voided (voidedAt), never soft-deleted, so
  // they have no deletedAt column to scope on.
  const paymentScope = { organizationId };

  const [
    buildings,
    floors,
    apartments,
    tenants,
    activeLeases,
    apartmentGroups,
    billedInvoices,
    postedPayments,
    openInvoices,
    recentPayments,
    expiringLeases,
  ] = await prisma.$transaction([
    prisma.building.count({ where: orgScope }),
    // Floors carry no organizationId: ownership resolves through the building.
    prisma.floor.count({ where: { deletedAt: null, building: { organizationId, deletedAt: null } } }),
    prisma.apartment.count({ where: orgScope }),
    prisma.tenant.count({ where: orgScope }),
    prisma.lease.count({ where: { ...orgScope, status: 'ACTIVE' } }),
    prisma.apartment.groupBy({ by: ['status'], where: orgScope, _count: { _all: true } }),
    // Billed side of the trend, and this month's billable total.
    prisma.invoice.findMany({
      where: { ...orgScope, status: { not: 'CANCELLED' }, invoiceDate: { gte: trendStart } },
      select: { invoiceDate: true, total: true },
    }),
    // Collected side of the trend; voided receipts never count as income.
    prisma.payment.findMany({
      where: { ...paymentScope, status: 'POSTED', voidedAt: null, paymentDate: { gte: trendStart } },
      select: { paymentDate: true, amount: true },
    }),
    // Receivables: everything still owing, cancelled invoices excluded.
    prisma.invoice.findMany({
      where: { ...orgScope, status: { notIn: ['CANCELLED', 'PAID'] } },
      select: {
        id: true,
        invoiceNumber: true,
        invoiceDate: true,
        dueDate: true,
        status: true,
        total: true,
        paidAmount: true,
        lease: {
          select: {
            contractNumber: true,
            tenant: { select: { id: true, firstName: true, lastName: true, phone: true } },
            apartment: {
              select: {
                apartmentNumber: true,
                name: true,
                floor: { select: { name: true, building: { select: { name: true } } } },
              },
            },
          },
        },
      },
    }),
    prisma.payment.findMany({
      where: { ...paymentScope, status: 'POSTED', voidedAt: null },
      orderBy: [{ paymentDate: 'desc' }, { createdAt: 'desc' }],
      take: LIST_LIMIT,
      select: {
        id: true,
        paymentNumber: true,
        paymentDate: true,
        amount: true,
        paymentMethod: true,
        tenant: { select: { id: true, firstName: true, lastName: true } },
        lease: { select: { contractNumber: true } },
      },
    }),
    prisma.lease.findMany({
      where: { ...orgScope, status: 'ACTIVE', endDate: { gte: now, lte: expiringBy } },
      orderBy: { endDate: 'asc' },
      take: LIST_LIMIT,
      select: {
        id: true,
        contractNumber: true,
        endDate: true,
        monthlyRent: true,
        tenant: { select: { id: true, firstName: true, lastName: true, phone: true } },
        apartment: {
          select: {
            apartmentNumber: true,
            name: true,
            floor: { select: { name: true, building: { select: { name: true } } } },
          },
        },
      },
    }),
  ]);

  const statusCounts = Object.fromEntries(APARTMENT_STATUSES.map((status) => [status, 0]));
  for (const group of apartmentGroups) statusCounts[group.status] = group._count._all;

  const occupied = statusCounts.OCCUPIED;
  // Inactive units are out of service, so they are not counted as leasable.
  const leasable = Math.max(apartments - statusCounts.INACTIVE, 0);

  const trend = Array.from({ length: TREND_MONTHS }, (_, index) => {
    const month = addMonths(trendStart, index);
    return { month: monthKey(month), billed: 0, collected: 0 };
  });
  const trendByMonth = new Map(trend.map((entry) => [entry.month, entry]));

  for (const invoice of billedInvoices) {
    const bucket = trendByMonth.get(monthKey(new Date(invoice.invoiceDate)));
    if (bucket) bucket.billed += toNumber(invoice.total);
  }
  for (const payment of postedPayments) {
    const bucket = trendByMonth.get(monthKey(new Date(payment.paymentDate)));
    if (bucket) bucket.collected += toNumber(payment.amount);
  }

  const thisMonth = trendByMonth.get(monthKey(monthStart));
  const lastMonth = trendByMonth.get(monthKey(lastMonthStart));

  let outstanding = 0;
  let overdueAmount = 0;
  const overdue = [];
  for (const invoice of openInvoices) {
    const balance = balanceOf(invoice);
    if (balance <= 0) continue;
    outstanding += balance;
    const isOverdue = invoice.dueDate ? new Date(invoice.dueDate) < now : false;
    if (isOverdue) {
      overdueAmount += balance;
      overdue.push({ invoice, balance, dueDate: invoice.dueDate });
    }
  }
  overdue.sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));

  const collectedThisMonth = thisMonth ? thisMonth.collected : 0;
  const billedThisMonth = thisMonth ? thisMonth.billed : 0;

  return {
    portfolio: { buildings, floors, apartments, tenants, activeLeases },
    occupancy: {
      total: apartments,
      leasable,
      occupied,
      vacant: statusCounts.AVAILABLE,
      reserved: statusCounts.RESERVED,
      maintenance: statusCounts.MAINTENANCE,
      inactive: statusCounts.INACTIVE,
      rate: leasable > 0 ? round(occupied / leasable, 4) : 0,
    },
    money: {
      billedThisMonth,
      collectedThisMonth,
      collectedLastMonth: lastMonth ? lastMonth.collected : 0,
      outstanding,
      overdueAmount,
      overdueCount: overdue.length,
      // Share of this month's billings already collected.
      collectionRate: billedThisMonth > 0 ? round(collectedThisMonth / billedThisMonth, 4) : 0,
      currency: 'AFN',
    },
    trend: trend.map((entry) => ({
      month: entry.month,
      billed: round(entry.billed),
      collected: round(entry.collected),
    })),
    apartmentStatus: statusCounts,
    recentPayments: recentPayments.map((payment) => ({
      id: payment.id,
      paymentNumber: payment.paymentNumber,
      paymentDate: payment.paymentDate,
      amount: toNumber(payment.amount),
      paymentMethod: payment.paymentMethod,
      contractNumber: payment.lease?.contractNumber || null,
      tenant: payment.tenant,
    })),
    overdueInvoices: overdue.slice(0, LIST_LIMIT).map(({ invoice, balance }) => ({
      id: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      invoiceDate: invoice.invoiceDate,
      dueDate: invoice.dueDate,
      status: invoice.status,
      balance: round(balance),
      total: toNumber(invoice.total),
      paidAmount: toNumber(invoice.paidAmount),
      contractNumber: invoice.lease?.contractNumber || null,
      tenant: invoice.lease?.tenant || null,
      apartment: invoice.lease?.apartment || null,
    })),
    expiringLeases: expiringLeases.map((lease) => ({
      id: lease.id,
      contractNumber: lease.contractNumber,
      endDate: lease.endDate,
      monthlyRent: toNumber(lease.monthlyRent),
      daysLeft: Math.max(Math.ceil((new Date(lease.endDate) - now) / 86_400_000), 0),
      tenant: lease.tenant,
      apartment: lease.apartment,
    })),
  };
}

module.exports = { getDashboard };
