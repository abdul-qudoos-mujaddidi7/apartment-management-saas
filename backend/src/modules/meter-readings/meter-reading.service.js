const { Prisma } = require('@prisma/client');

const prisma = require('../../lib/prisma');
const Decimal = Prisma.Decimal;

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
    notes: true, createdAt: true, updatedAt: true,
    invoiceItem: {
      select: {
        id: true,
        amount: true,
        paymentAllocations: {
          select: { amount: true, voidedAt: true },
        },
        invoice: { select: { status: true, deletedAt: true } },
      },
    },
    meter: {
      select: {
        id: true, meterNumber: true, utilityType: true, unit: true,
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
    return sum.plus(new Decimal(alloc.amount));
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

async function assertMeterInOrganization(client, organizationId, meterId, requireActive = false) {
  const meter = await client.meter.findFirst({
    where: {
      id: meterId,
      ...meterScope(organizationId),
      ...(requireActive ? { status: 'ACTIVE' } : {}),
    },
    select: { id: true, initialReading: true, defaultUnitPrice: true },
  });
  if (!meter) throw serviceError('METER_NOT_FOUND', 'Meter not found.');
  return meter;
}

// Rebuild the complete sequence after every write. This makes historical
// inserts, edits, and removals safe and avoids trusting browser calculations.
async function recalculateMeterReadings(meterId, client) {
  const meter = await client.meter.findUnique({
    where: { id: meterId },
    select: { initialReading: true },
  });
  let previous = new Decimal(meter?.initialReading || 0);
  const readings = await client.meterReading.findMany({
    where: { meterId, deletedAt: null },
    orderBy: [{ readingDate: 'asc' }, { createdAt: 'asc' }],      select: {
        id: true,
        previousReading: true,
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
    const consumption = current.minus(previous);
    const amount = consumption.times(new Decimal(reading.unitPrice)).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
    const changed = !new Decimal(reading.previousReading).equals(previous)
      || !new Decimal(reading.consumption).equals(consumption)
      || !new Decimal(reading.amount).equals(amount);

    if (changed && isActivelyBilled(reading.invoiceItem)) {
      throw serviceError('METER_READING_ALREADY_BILLED', 'A billed meter reading cannot be changed. Cancel the invoice first to release it.');
    }

    if (changed) {
      await client.meterReading.update({
        where: { id: reading.id },
        data: { previousReading: previous, consumption, amount },
      });
    }
    previous = current;
  }
}

async function listMeterReadings(organizationId, filters) {
  const { page, pageSize, search, buildingId, floorId, apartmentId, meterId, utilityType, unbilled, dateFrom, dateTo } = filters;
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
  return prisma.$transaction(async (tx) => {
    const meter = await assertMeterInOrganization(tx, organizationId, data.meterId, true);
    const active = await tx.meterReading.findFirst({
      where: { meterId: data.meterId, readingDate: data.readingDate, deletedAt: null }, select: { id: true },
    });
    if (active) throw serviceError('METER_READING_DATE_EXISTS', 'A reading already exists for this date.');
    const removed = await tx.meterReading.findFirst({
      where: { meterId: data.meterId, readingDate: data.readingDate, deletedAt: { not: null } }, select: { id: true },
    });
    const payload = { currentReading: new Decimal(data.currentReading), notes: data.notes ?? null, deletedAt: null };
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
  return prisma.$transaction(async (tx) => {
    const existing = await tx.meterReading.findFirst({
      where: { id, deletedAt: null, ...readingScope(organizationId) },
      select: {
        id: true, meterId: true, readingDate: true, currentReading: true, notes: true,
        invoiceItem: { select: { id: true, invoice: { select: { status: true, deletedAt: true } } } },
      },
    });
    if (!existing) throw serviceError('METER_READING_NOT_FOUND', 'Meter reading not found.');
    if (isActivelyBilled(existing.invoiceItem)) {
      throw serviceError('METER_READING_ALREADY_BILLED', 'A billed meter reading cannot be changed. Cancel the invoice first to release it.');
    }
    const nextDate = data.readingDate || existing.readingDate;
    const conflict = await tx.meterReading.findFirst({
      where: { meterId: existing.meterId, readingDate: nextDate, deletedAt: null, id: { not: id } }, select: { id: true },
    });
    if (conflict) throw serviceError('METER_READING_DATE_EXISTS', 'A reading already exists for this date.');
    const payload = {
      readingDate: nextDate,
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
      await tx.meterReading.update({ where: { id }, data: { deletedAt: new Date() } });
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
  return prisma.$transaction(async (tx) => {
    const reading = await tx.meterReading.findFirst({
      where: { id, deletedAt: null, ...readingScope(organizationId) },
      select: { id: true, meterId: true, invoiceItem: { select: { id: true, invoice: { select: { status: true, deletedAt: true } } } } },
    });
    if (!reading) throw serviceError('METER_READING_NOT_FOUND', 'Meter reading not found.');
    if (isActivelyBilled(reading.invoiceItem)) {
      throw serviceError('METER_READING_ALREADY_BILLED', 'A billed meter reading cannot be deleted. Cancel the invoice first to release it.');
    }
    await tx.meterReading.update({ where: { id }, data: { deletedAt: new Date() } });
    await recalculateMeterReadings(reading.meterId, tx);
    return { id };
  });
}

module.exports = {
  createMeterReading, getMeterReading, listMeterReadings, recalculateMeterReadings,
  softDeleteMeterReading, updateMeterReading,
};
