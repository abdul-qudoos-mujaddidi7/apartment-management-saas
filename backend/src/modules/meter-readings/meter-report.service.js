const { Prisma } = require('@prisma/client');
const prisma = require('../../lib/prisma');
const { readingWhere, readingSelect, formatReading } = require('./meter-reading.service');
const { listMeterReadingsSchema } = require('./meter-reading.validation');
const { z } = require('zod');

const reportSchema = listMeterReadingsSchema.extend({
  export: z.preprocess(value => value === true || value === 'true', z.boolean()).default(false),
}).refine(data => !data.dateFrom || !data.dateTo || data.dateFrom <= data.dateTo, {
  path: ['dateTo'], message: 'End date must not precede start date.',
});

// Cancelled invoices and voided payments must never reduce the report balance.
function reportReading(row) {
  const item = row.invoiceItem;
  const billed = item?.invoice && !item.invoice.deletedAt && item.invoice.status !== 'CANCELLED';
  const paid = billed ? (item.paymentAllocations || []).filter(a => !a.voidedAt)
    .reduce((sum, a) => sum.plus(a.appliedAmount ?? a.amount), new Prisma.Decimal(0)) : new Prisma.Decimal(0);
  const amount = new Prisma.Decimal(row.amount || 0);
  return { ...formatReading(row), paidAmount: Number(paid),
    outstanding: Number(Prisma.Decimal.max(0, amount.minus(paid))),
    billingStatus: row.readingKind === 'MOVE_IN' ? 'BASELINE' : !billed ? 'UNBILLED'
      : paid.gte(amount) ? 'PAID' : paid.gt(0) ? 'PARTIALLY_PAID' : 'BILLED' };
}

function summarize(rows) {
  const meters = new Set();
  const units = new Map();
  const currencies = new Map();
  const statuses = {};
  for (const source of rows) {
    const row = reportReading(source);
    meters.add(row.meterId);
    const unitKey = `${row.meter.utilityType}:${row.meter.unit}`;
    const unit = units.get(unitKey) || { utilityType: row.meter.utilityType, unit: row.meter.unit, consumption: new Prisma.Decimal(0) };
    unit.consumption = unit.consumption.plus(row.consumption);
    units.set(unitKey, unit);
    const currency = row.currency;
    const totals = currencies.get(currency) || { currency, charge: new Prisma.Decimal(0), paid: new Prisma.Decimal(0), outstanding: new Prisma.Decimal(0), unbilled: new Prisma.Decimal(0) };
    totals.charge = totals.charge.plus(source.amount || 0);
    totals.paid = totals.paid.plus(row.paidAmount);
    totals.outstanding = totals.outstanding.plus(row.outstanding);
    if (row.billingStatus === 'UNBILLED') totals.unbilled = totals.unbilled.plus(source.amount || 0);
    currencies.set(currency, totals);
    statuses[row.billingStatus] = (statuses[row.billingStatus] || 0) + 1;
  }
  return { readingCount: rows.length, meterCount: meters.size, statuses,
    consumption: [...units.values()].map(row => ({ ...row, consumption: Number(row.consumption) })),
    currencies: [...currencies.values()].map(row => ({ ...row, charge: Number(row.charge), paid: Number(row.paid), outstanding: Number(row.outstanding), unbilled: Number(row.unbilled) })) };
}

async function meterReport(organizationId, filters) {
  const where = readingWhere(organizationId, filters);
  if (filters.search) where.OR.push(
    { lease: { tenant: { firstName: { contains: filters.search } } } },
    { lease: { contractNumber: { contains: filters.search } } },
  );
  const select = readingSelect();
  // Summary covers the whole filtered result, independently of the current page.
  const summarySelect = { meterId: true, consumption: true, amount: true, currency: true,
    readingKind: true, meter: { select: { utilityType: true, unit: true } }, invoiceItem: select.invoiceItem };
  const [items, all] = await prisma.$transaction([
    prisma.meterReading.findMany({ where, select, orderBy: [{ readingDate: 'desc' }, { id: 'desc' }],
      ...(!filters.export ? { skip: (filters.page - 1) * filters.pageSize, take: filters.pageSize } : {}) }),
    prisma.meterReading.findMany({ where, select: summarySelect }),
  ]);
  return { items: items.map(reportReading), summary: summarize(all),
    pagination: { page: filters.page, pageSize: filters.pageSize, total: all.length, totalPages: Math.ceil(all.length / filters.pageSize) } };
}

module.exports = { meterReport, reportSchema, summarize, reportReading };
