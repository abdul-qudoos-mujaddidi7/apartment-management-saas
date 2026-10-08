const { Prisma } = require('@prisma/client');

const prisma = require('../../lib/prisma');
const { shamsiMonthKey, shamsiMonthLabel } = require('../../lib/shamsi');
const Decimal = Prisma.Decimal;
const writeTransaction = callback => prisma.$transaction(callback, { isolationLevel: 'ReadCommitted' });
const { calculateCharge, coversPeriod, assertLeaseOwnsInterval } = require('./reading-workflow');


function serviceError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function meterScope(organizationId) {
  return {
    deletedAt: null,
    apartment: {
      deletedAt: null,
      floor: {
        deletedAt: null,
        building: { organizationId, deletedAt: null },
      },
    },
  };
}

function readingScope(organizationId) {
  return { meter: meterScope(organizationId) };
}

function readingSelect() {
  return {
    id: true, meterId: true, readingDate: true, previousReading: true,
    currentReading: true, consumption: true, unitPrice: true, amount: true,
    notes: true, createdAt: true, updatedAt: true, leaseId: true, periodStart: true, currency: true, readingKind: true, resetBaseline: true,
    lease: { select: { id: true, contractNumber: true, tenant: { select: { firstName: true } } } },
    invoiceItem: {
      select: {
        id: true,
        amount: true,
        paymentAllocations: {
          where: { payment: { status: 'POSTED' } }, select: { appliedAmount: true, amount: true, voidedAt: true },
        },
        invoice: { select: { id: true, invoiceNumber: true, status: true, deletedAt: true } },
      },
    },
    meter: {
      select: {
        id: true, apartmentId: true, meterNumber: true, utilityType: true, unit: true, initialReading: true, installationDate: true, defaultUnitPrice: true,
        apartment: {
          select: {
            id: true, apartmentNumber: true, name: true,
            floor: {
              select: {
                id: true, floorNumber: true, name: true,
                building: { select: { id: true, name: true } },
              },
            },
          },
        },
      },
    },
  };
}

function formatReading(reading) {
  if (!reading) return reading;
  return {
    ...reading,
    previousReading: Number(reading.previousReading),
    currentReading: Number(reading.currentReading),
    consumption: Number(reading.consumption),
    unitPrice: Number(reading.unitPrice),
    amount: Number(reading.amount),
    paidAmount: Number((reading.invoiceItem?.paymentAllocations || []).filter(a => !a.voidedAt).reduce((sum, a) => sum.plus(a.appliedAmount ?? a.amount), new Decimal(0))),
    outstanding: isActivelyBilled(reading.invoiceItem) ? Math.max(0, Number(reading.amount) - Number((reading.invoiceItem?.paymentAllocations || []).filter(a => !a.voidedAt).reduce((sum, a) => sum.plus(a.appliedAmount ?? a.amount), new Decimal(0)))) : Number(reading.amount),
    billingStatus: billingStatus(reading.invoiceItem),
  };
}

function billingStatus(invoiceItem) {
  const invoice = invoiceItem?.invoice;
  if (!invoice || invoice.deletedAt || invoice.status === 'CANCELLED') return 'UNBILLED';

  // Derive status from item-level allocations
  const { Prisma } = require('@prisma/client');
  const Decimal = Prisma.Decimal;
  const paid = (invoiceItem.paymentAllocations || []).reduce((sum, alloc) => {
    if (alloc.voidedAt) return sum;
    return sum.plus(new Decimal(alloc.appliedAmount ?? alloc.amount));
  }, new Decimal(0));
  const amount = new Decimal(invoiceItem.amount || 0);
  if (paid.greaterThanOrEqualTo(amount)) return 'PAID';
  if (paid.isZero()) return 'BILLED';
  return 'PARTIALLY_PAID';
}

function isActivelyBilled(invoiceItem) {
  const invoice = invoiceItem?.invoice;
  return Boolean(invoice && !invoice.deletedAt && invoice.status !== 'CANCELLED');
}

/**
 * A meter is read once a month — one reading per meter, per apartment, per
 * month — and the month is a **Shamsi** one, because that is the calendar every
 * date in this application is shown in. A Shamsi month does not line up with a
 * Gregorian one (Sunbula 1405 runs from 2026-08-23 to 2026-09-22), so keying the
 * rule on the Gregorian month would allow two readings in one month the user can
 * see and refuse one in the next.
 *
 * The unique index on (meterId, periodMonth) is what actually holds the rule;
 * this check turns it into a message, and also catches rows written before the
 * column existed, which have no periodMonth of their own.
 */
async function assertMonthIsFree(client, meterId, readingDate, ignoreId = null) {
  const periodMonth = shamsiMonthKey(readingDate);
  if (!periodMonth) throw serviceError('INVALID_READING_DATE', 'The reading date is not a valid date.');

  const readings = await client.meterReading.findMany({
    where: {
      meterId,
      deletedAt: null,
      ...(ignoreId ? { id: { not: ignoreId } } : {}),
    },
    select: { id: true, readingDate: true, periodMonth: true, readingKind: true },
  });

  const clash = readings.find(
    (reading) => (!reading.readingKind || reading.readingKind === 'BILLING') && (reading.periodMonth || shamsiMonthKey(reading.readingDate)) === periodMonth,
  );

  if (clash) {
    throw serviceError(
      'METER_READING_MONTH_EXISTS',
      `This meter already has a reading for ${shamsiMonthLabel(periodMonth)}. A meter is read once a month.`,
    );
  }

  return periodMonth;
}

async function assertMeterInOrganization(client, organizationId, meterId, requireActive = false) {
  const meter = await client.meter.findFirst({
    where: {
      id: meterId,
      ...meterScope(organizationId),
      ...(requireActive ? { status: 'ACTIVE' } : {}),
    },
    select: { id: true, apartmentId: true, installationDate: true, initialReading: true, defaultUnitPrice: true },
  });
  if (!meter) throw serviceError('METER_NOT_FOUND', 'Meter not found.');
  return meter;
}

async function assertPeriodStart(client, meter, date, start, kind, ignoreId = null) {
  const prior = await client.meterReading.findFirst({ where: { meterId: meter.id, deletedAt: null, readingDate: { lt: date }, ...(ignoreId ? { id: { not: ignoreId } } : {}) }, orderBy: { readingDate: 'desc' }, select: { readingDate: true } });
  const expected = kind === 'MOVE_IN' ? date : prior?.readingDate || meter.installationDate || start;
  if (!start || !expected || start.toISOString().slice(0,10) !== expected.toISOString().slice(0,10)) throw serviceError('INVALID_READING_PERIOD', 'The usage period must start at the previous reading or installation date.');
}

// Rebuild the complete sequence after every write. This makes historical
// inserts, edits, and removals safe and avoids trusting browser calculations.
async function recalculateMeterReadings(meterId, client) {
  const meter = await client.meter.findUnique({
    where: { id: meterId },
    select: { initialReading: true, installationDate: true, apartmentId: true },
  });
  let previous = new Decimal(meter?.initialReading || 0);
  let previousDate = meter?.installationDate;
  const readings = await client.meterReading.findMany({
    where: { meterId, deletedAt: null },
    orderBy: [{ readingDate: 'asc' }, { createdAt: 'asc' }],      select: {
        id: true,
        previousReading: true, readingDate: true, periodStart: true, leaseId: true, readingKind: true, resetBaseline: true,
        currentReading: true,
        consumption: true,
        unitPrice: true,
        amount: true,
        invoiceItem: {
          select: {
            id: true,
            amount: true,
            paymentAllocations: { select: { amount: true, voidedAt: true } },
            invoice: { select: { status: true, deletedAt: true } },
          },
        },
      },
  });

  for (const reading of readings) {
    const current = new Decimal(reading.currentReading);
    if (current.lessThan(previous)) {
      throw serviceError('CURRENT_READING_TOO_LOW', 'Current reading cannot be lower than the previous reading.');
    }
    const { consumption, amount } = calculateCharge(reading.readingKind === 'MOVE_IN' ? current : previous, current, reading.unitPrice);
    const start = reading.readingKind === 'MOVE_IN' ? reading.readingDate : previousDate || reading.periodStart || (isActivelyBilled(reading.invoiceItem) ? reading.readingDate : null);
    if (!start || start > reading.readingDate) throw serviceError('INVALID_READING_PERIOD', 'A valid initial installation or period start date is required.');
    if (reading.leaseId && (reading.periodStart || !isActivelyBilled(reading.invoiceItem))) {
      const lease = await client.lease.findFirst({ where: { id: reading.leaseId, apartmentId: meter.apartmentId, deletedAt: null } });
      if (!lease || !await assertLeaseOwnsInterval(client, lease.organizationId, lease, start, reading.readingDate)) throw serviceError('INVALID_READING_LEASE', 'The lease must cover the complete usage period. Record a handover reading to split usage between tenants.');
    }
    const frozenPrevious = reading.readingKind === 'MOVE_IN' ? current : previous;
    const changed = (reading.periodStart && start.toISOString().slice(0,10) !== reading.periodStart.toISOString().slice(0,10)) || !new Decimal(reading.previousReading).equals(frozenPrevious)
      || !new Decimal(reading.consumption).equals(consumption)
      || !new Decimal(reading.amount).equals(amount);

    if (changed && isActivelyBilled(reading.invoiceItem)) {
      throw serviceError('METER_READING_ALREADY_BILLED', 'A billed meter reading cannot be changed. Cancel the invoice first to release it.');
    }

    if (changed || (!reading.periodStart && !isActivelyBilled(reading.invoiceItem))) {
      await client.meterReading.update({
        where: { id: reading.id },
        data: { previousReading: frozenPrevious, consumption, amount, periodStart: start },
      });
    }
    previous = reading.readingKind === 'RESET' ? new Decimal(reading.resetBaseline) : current;
    previousDate = reading.readingDate;
  }
}

function readingWhere(organizationId, filters) {
  const { search, buildingId, floorId, apartmentId, meterId, utilityType, unbilled, dateFrom, dateTo } = filters;
  const where = {
    deletedAt: null,
    meter: {
      ...meterScope(organizationId),
      ...(meterId ? { id: meterId } : {}),
      ...(utilityType ? { utilityType } : {}),
      apartment: {
        deletedAt: null,
        ...(apartmentId ? { id: apartmentId } : {}),
        floor: {
          deletedAt: null,
          ...(floorId ? { id: floorId } : {}),
          building: { organizationId, deletedAt: null, ...(buildingId ? { id: buildingId } : {}) },
        },
      },
    },
    ...(unbilled ? { invoiceItem: null } : {}),
    ...(dateFrom || dateTo ? { readingDate: { ...(dateFrom ? { gte: dateFrom } : {}), ...(dateTo ? { lte: dateTo } : {}) } } : {}),
    ...(search ? {
      OR: [
        { meter: { meterNumber: { contains: search } } },
        { meter: { apartment: { apartmentNumber: { contains: search } } } },
        { meter: { apartment: { name: { contains: search } } } },
        { meter: { apartment: { floor: { building: { name: { contains: search } } } } } },
      ],
    } : {}),
  };
  return where;
}

async function listMeterReadings(organizationId, filters) {
  const { page, pageSize } = filters;
  const where = readingWhere(organizationId, filters);
  const [items, total] = await prisma.$transaction([
    prisma.meterReading.findMany({
      where, select: readingSelect(), orderBy: [{ readingDate: 'desc' }, { createdAt: 'desc' }],
      skip: (page - 1) * pageSize, take: pageSize,
    }),
    prisma.meterReading.count({ where }),
  ]);
  return { items: items.map(formatReading), pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) } };
}

async function getMeterReading(organizationId, id) {
  const reading = await prisma.meterReading.findFirst({
    where: { id, deletedAt: null, ...readingScope(organizationId) }, select: readingSelect(),
  });
  if (!reading) throw serviceError('METER_READING_NOT_FOUND', 'Meter reading not found.');
  return formatReading(reading);
}

async function getReadingFromTransaction(client, id) {
  return formatReading(await client.meterReading.findUnique({ where: { id }, select: readingSelect() }));
}

async function createMeterReading(organizationId, data) {
  return writeTransaction(async (tx) => {
    const meter = await assertMeterInOrganization(tx, organizationId, data.meterId, true);
    await tx.$queryRaw`SELECT id FROM Meter WHERE id = ${meter.id} FOR UPDATE`;
    await assertPeriodStart(tx, meter, data.readingDate, data.periodStart, data.readingKind);
    const lease = await tx.lease.findFirst({ where: { id: data.leaseId, organizationId, apartmentId: meter.apartmentId, deletedAt: null } });
    if (!lease || !coversPeriod(lease, data.periodStart, data.readingDate)) throw serviceError('INVALID_READING_LEASE', 'Select a lease covering the entire billing period. Use a handover reading when tenants change.');
    if (data.readingKind === 'MOVE_IN') {
      if (lease.startDate.toISOString().slice(0,10) !== data.readingDate.toISOString().slice(0,10)) throw serviceError('INVALID_READING_LEASE', 'A move-in baseline must be dated on the lease start date.');
      const prior = await tx.meterReading.findFirst({ where: { meterId: meter.id, deletedAt: null, readingDate: { lt: data.readingDate } }, orderBy: { readingDate: 'desc' } });
      const from = prior?.readingDate || meter.installationDate;
      if (from) {
        const outgoing = await tx.lease.findFirst({ where: { organizationId, apartmentId: meter.apartmentId, id: { not: lease.id }, deletedAt: null, status: { not: 'DRAFT' }, startDate: { lt: data.readingDate }, endDate: { gt: from } } });
        if (outgoing) throw serviceError('INVALID_READING_LEASE', 'Record the outgoing tenant handover reading first. A move-in baseline cannot discard another tenant\'s usage.');
      }
    }
    const org = await tx.organization.findUnique({ where: { id: organizationId }, select: { baseCurrency: true } });
    const currency = await tx.currency.findFirst({ where: { organizationId, code: data.currency, isActive: true, deletedAt: null } });
    if (!currency && data.currency !== org.baseCurrency) throw serviceError('INVALID_READING_CURRENCY', 'Currency is not enabled.');
    const active = await tx.meterReading.findFirst({
      where: { meterId: data.meterId, readingDate: data.readingDate, deletedAt: null }, select: { id: true },
    });
    if (active) throw serviceError('METER_READING_DATE_EXISTS', 'A reading already exists for this date.');
    const periodMonth = data.readingKind === 'BILLING' ? await assertMonthIsFree(tx, data.meterId, data.readingDate) : null;
    const removed = await tx.meterReading.findFirst({
      where: { meterId: data.meterId, readingDate: data.readingDate, deletedAt: { not: null } }, select: { id: true },
    });
    const payload = { leaseId: data.leaseId, periodStart: data.periodStart, currency: data.currency, readingKind: data.readingKind, resetBaseline: data.resetBaseline ?? null, unitPrice: new Decimal(data.unitPrice), periodMonth, currentReading: new Decimal(data.currentReading), notes: data.notes ?? null, deletedAt: null };
    const reading = removed
      ? await tx.meterReading.update({ where: { id: removed.id }, data: payload })
      : await tx.meterReading.create({
          data: {
            meterId: data.meterId,
            readingDate: data.readingDate,
            previousReading: 0,
            consumption: 0,
            unitPrice: meter.defaultUnitPrice,
            amount: 0,
            ...payload,
          },
        });
    await recalculateMeterReadings(data.meterId, tx);
    return getReadingFromTransaction(tx, reading.id);
  });
}

async function updateMeterReading(organizationId, id, data) {
  return writeTransaction(async (tx) => {
    const existing = await tx.meterReading.findFirst({
      where: { id, deletedAt: null, ...readingScope(organizationId) },
      select: {
        id: true, meterId: true, readingDate: true, currentReading: true, notes: true, readingKind: true, leaseId: true, periodStart: true,
        invoiceItem: { select: { id: true, invoice: { select: { status: true, deletedAt: true } } } },
      },
    });
    if (!existing) throw serviceError('METER_READING_NOT_FOUND', 'Meter reading not found.');
    await tx.$queryRaw`SELECT id FROM Meter WHERE id = ${existing.meterId} FOR UPDATE`;
    if (data.currency) {
      const org = await tx.organization.findUnique({ where: { id: organizationId }, select: { baseCurrency: true } });
      if (data.currency !== org.baseCurrency && !await tx.currency.findFirst({ where: { organizationId, code: data.currency, isActive: true, deletedAt: null } })) throw serviceError('INVALID_READING_CURRENCY', 'Currency is not enabled.');
    }
    if (existing.readingKind === 'MOVE_IN' && (data.readingDate || data.leaseId || data.periodStart)) throw serviceError('INVALID_READING_LEASE', 'Move-in baselines cannot be reassigned or moved. Delete and recreate an unbilled baseline.');
    if (isActivelyBilled(existing.invoiceItem)) {
      throw serviceError('METER_READING_ALREADY_BILLED', 'A billed meter reading cannot be changed. Cancel the invoice first to release it.');
    }
    const nextDate = data.readingDate || existing.readingDate;
    if (data.readingDate || data.periodStart) {
      const meter = await assertMeterInOrganization(tx, organizationId, existing.meterId);
      await assertPeriodStart(tx, meter, nextDate, data.periodStart || existing.periodStart, existing.readingKind, id);
    }
    const conflict = await tx.meterReading.findFirst({
      where: { meterId: existing.meterId, readingDate: nextDate, deletedAt: null, id: { not: id } }, select: { id: true },
    });
    if (conflict) throw serviceError('METER_READING_DATE_EXISTS', 'A reading already exists for this date.');
    // Moving a reading into a month that already has one is the same duplicate,
    // and the unique index would refuse it anyway — with a message no one can act on.
    const periodMonth = existing.readingKind === 'BILLING' ? await assertMonthIsFree(tx, existing.meterId, nextDate, id) : null;
    const payload = {
      ...data,
      readingDate: nextDate,
      periodMonth,
      currentReading: data.currentReading === undefined ? existing.currentReading : new Decimal(data.currentReading),
      notes: data.notes === undefined ? existing.notes : data.notes,
    };
    const removed = await tx.meterReading.findFirst({
      where: { meterId: existing.meterId, readingDate: nextDate, deletedAt: { not: null } }, select: { id: true },
    });
    let resultId = id;
    if (removed) {
      // A MySQL unique index includes soft-deleted rows, so reviving the old
      // date row is the safe way to reuse its date without dropping history.
      await tx.meterReading.update({ where: { id }, data: { deletedAt: new Date(), periodMonth: null } });
      await tx.meterReading.update({ where: { id: removed.id }, data: { ...payload, deletedAt: null } });
      resultId = removed.id;
    } else {
      await tx.meterReading.update({ where: { id }, data: payload });
    }
    await recalculateMeterReadings(existing.meterId, tx);
    return getReadingFromTransaction(tx, resultId);
  });
}

async function softDeleteMeterReading(organizationId, id) {
  return writeTransaction(async (tx) => {
    const reading = await tx.meterReading.findFirst({
      where: { id, deletedAt: null, ...readingScope(organizationId) },
      select: { id: true, meterId: true, invoiceItem: { select: { id: true, invoice: { select: { status: true, deletedAt: true } } } } },
    });
    if (!reading) throw serviceError('METER_READING_NOT_FOUND', 'Meter reading not found.');
    await tx.$queryRaw`SELECT id FROM Meter WHERE id = ${reading.meterId} FOR UPDATE`;
    if (isActivelyBilled(reading.invoiceItem)) {
      throw serviceError('METER_READING_ALREADY_BILLED', 'A billed meter reading cannot be deleted. Cancel the invoice first to release it.');
    }
    // Clearing the month is what releases it: the unique index ignores NULLs, so
    // the meter can be read again for that month once this reading is gone.
    await tx.meterReading.update({ where: { id }, data: { deletedAt: new Date(), periodMonth: null } });
    await recalculateMeterReadings(reading.meterId, tx);
    return { id };
  });
}

module.exports = {
  readingWhere, readingSelect, formatReading,
  assertMonthIsFree, createMeterReading, getMeterReading, listMeterReadings, recalculateMeterReadings,
  softDeleteMeterReading, updateMeterReading,
};
