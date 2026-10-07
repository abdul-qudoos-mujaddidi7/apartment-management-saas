const prisma = require('../../lib/prisma');

function createMeterError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function meterSelect() {
  return {
    id: true,
    apartmentId: true,
    meterNumber: true,
    utilityType: true,
    meterType: true,
    unit: true,
    defaultUnitPrice: true,
    initialReading: true,
    installationDate: true,
    status: true,
    notes: true,
    createdAt: true,
    updatedAt: true,
    apartment: {
      select: {
        id: true,
        apartmentNumber: true,
        name: true,
        floor: {
          select: {
            id: true,
            floorNumber: true,
            name: true,
            building: {
              select: { id: true, name: true, code: true },
            },
          },
        },
      },
    },
  };
}

// Prisma hands back Decimal instances; the API exposes plain numbers.
function formatMeter(meter) {
  if (!meter) return meter;

  return {
    ...meter,
    initialReading:
      meter.initialReading === null || meter.initialReading === undefined
        ? null
        : Number(meter.initialReading),
    defaultUnitPrice: Number(meter.defaultUnitPrice),
  };
}

// A meter carries no organizationId: ownership is always resolved through
// Apartment -> Floor -> Building, so a foreign key can never be trusted alone.
function organizationScope(organizationId) {
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

// The apartment must belong to the caller's organization before a meter is written to it.
async function assertApartmentInOrganization(organizationId, apartmentId) {
  const apartment = await prisma.apartment.findFirst({
    where: {
      id: apartmentId,
      deletedAt: null,
      floor: {
        deletedAt: null,
        building: { organizationId, deletedAt: null },
      },
    },
    select: { id: true },
  });

  if (!apartment) {
    throw createMeterError('APARTMENT_NOT_FOUND', 'Apartment not found.');
  }

  return apartment;
}

async function listMeters(organizationId, filters) {
  const {
    page,
    pageSize,
    search,
    buildingId,
    floorId,
    apartmentId,
    utilityType,
    status,
  } = filters;

  // Building and floor are filters over the apartment's ancestors, so they live
  // inside the same scoped tree the ownership check uses.
  const apartmentFilter = {
    deletedAt: null,
    ...(apartmentId ? { id: apartmentId } : {}),
    floor: {
      deletedAt: null,
      ...(floorId ? { id: floorId } : {}),
      building: {
        organizationId,
        deletedAt: null,
        ...(buildingId ? { id: buildingId } : {}),
      },
    },
  };

  const where = {
    deletedAt: null,
    apartment: apartmentFilter,
    ...(utilityType ? { utilityType } : {}),
    ...(status ? { status } : {}),
    ...(search
      ? {
          OR: [
            { meterNumber: { contains: search } },
            { apartment: { apartmentNumber: { contains: search } } },
            { apartment: { name: { contains: search } } },
          ],
        }
      : {}),
  };

  const [items, total] = await prisma.$transaction([
    prisma.meter.findMany({
      where,
      select: meterSelect(),
      orderBy: [{ meterNumber: 'asc' }, { createdAt: 'asc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.meter.count({ where }),
  ]);

  return {
    items: items.map(formatMeter),
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
    },
  };
}

async function getMeter(organizationId, meterId) {
  const meter = await prisma.meter.findFirst({
    where: { id: meterId, ...organizationScope(organizationId) },
    select: meterSelect(),
  });

  if (!meter) {
    throw createMeterError('METER_NOT_FOUND', 'Meter not found.');
  }

  return formatMeter(meter);
}

async function createMeter(organizationId, data) {
  await assertApartmentInOrganization(organizationId, data.apartmentId);

  try {
    const meter = await prisma.meter.create({
      data,
      select: meterSelect(),
    });

    return formatMeter(meter);
  } catch (error) {
    if (error.code === 'P2002') {
      // The meterNumber unique index also covers soft-deleted rows, so re-adding a
      // number that was previously removed revives that row instead of failing.
      const removed = await prisma.meter.findFirst({
        where: {
          apartmentId: data.apartmentId,
          meterNumber: data.meterNumber,
          deletedAt: { not: null },
        },
        select: { id: true },
      });

      if (removed) {
        if (await prisma.meterReading.count({ where: { meterId: removed.id } })) throw createMeterError('METER_HAS_READINGS', 'This meter number has reading history. Restore its status through the existing meter instead of replacing its history.');
        const revived = await prisma.meter.update({
          where: { id: removed.id },
          data: { ...data, deletedAt: null },
          select: meterSelect(),
        });

        return formatMeter(revived);
      }

      throw createMeterError('METER_NUMBER_EXISTS', 'Meter number already exists on this apartment.');
    }

    throw error;
  }
}

async function updateMeter(organizationId, meterId, data) {
  return prisma.$transaction(async (tx) => {
  await tx.$queryRaw`SELECT id FROM Meter WHERE id = ${meterId} FOR UPDATE`;
  const meter = await tx.meter.findFirst({
    where: { id: meterId, ...organizationScope(organizationId) },
    select: { id: true, apartmentId: true, meterNumber: true, initialReading: true, installationDate: true, utilityType: true, unit: true },
  });

  if (!meter) {
    throw createMeterError('METER_NOT_FOUND', 'Meter not found.');
  }

  const hasHistory = await tx.meterReading.count({ where: { meterId } });
  const changed = ['apartmentId', 'meterNumber', 'utilityType', 'unit', 'initialReading', 'installationDate'].some(key => {
    if (data[key] === undefined) return false;
    if (key === 'installationDate') return (data[key]?.toISOString() || null) !== (meter[key]?.toISOString() || null);
    return String(data[key] ?? '') !== String(meter[key] ?? '');
  });
  if (hasHistory && changed) throw createMeterError('METER_HAS_READINGS', 'Meter assignment and initial baseline cannot change after readings exist. Use a handover or reset reading, or install a separate replacement meter.');

  if (data.apartmentId) {
    await assertApartmentInOrganization(organizationId, data.apartmentId);
  }

  try {
    const updated = await tx.meter.update({
      where: { id: meterId },
      data,
      select: meterSelect(),
    });

    return formatMeter(updated);
  } catch (error) {
    if (error.code === 'P2002') {
      throw createMeterError('METER_NUMBER_EXISTS', 'Meter number already exists on this apartment.');
    }

    throw error;
  }
  }, { isolationLevel: 'ReadCommitted' });
}

async function softDeleteMeter(organizationId, meterId) {
  return prisma.$transaction(async tx => {
  await tx.$queryRaw`SELECT id FROM Meter WHERE id = ${meterId} FOR UPDATE`;
  const meter = await tx.meter.findFirst({ where: { id: meterId, ...organizationScope(organizationId) }, select: { id: true } });
  if (!meter) throw createMeterError('METER_NOT_FOUND', 'Meter not found.');
  if (await tx.meterReading.count({ where: { meterId } })) throw createMeterError('METER_HAS_READINGS', 'A meter with reading history cannot be deleted. Set its status to inactive instead.');
  const result = await tx.meter.updateMany({
    where: { id: meterId, ...organizationScope(organizationId) },
    data: { deletedAt: new Date() },
  });

  if (result.count === 0) {
    throw createMeterError('METER_NOT_FOUND', 'Meter not found.');
  }

  return { id: meterId };
  }, { isolationLevel: 'ReadCommitted' });
}

module.exports = {
  createMeter,
  getMeter,
  listMeters,
  softDeleteMeter,
  updateMeter,
};
