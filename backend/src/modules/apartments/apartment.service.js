const prisma = require('../../lib/prisma');

function createApartmentError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function apartmentSelect() {
  return {
    id: true,
    organizationId: true,
    floorId: true,
    apartmentNumber: true,
    name: true,
    type: true,
    area: true,
    bedrooms: true,
    bathrooms: true,
    monthlyRent: true,
    status: true,
    createdAt: true,
    updatedAt: true,
    floor: {
      select: {
        id: true,
        floorNumber: true,
        name: true,
        building: { select: { id: true, name: true, code: true } },
      },
    },
  };
}

// Prisma hands back Decimal instances; the API exposes plain numbers.
function formatApartment(apartment) {
  if (!apartment) return apartment;

  return {
    ...apartment,
    area: apartment.area === null || apartment.area === undefined ? null : Number(apartment.area),
    monthlyRent: Number(apartment.monthlyRent),
  };
}

// The floor must belong to the caller's organization (through its building).
async function assertFloorInOrganization(organizationId, floorId) {
  const floor = await prisma.floor.findFirst({
    where: { id: floorId, deletedAt: null, building: { organizationId, deletedAt: null } },
    select: { id: true },
  });

  if (!floor) {
    throw createApartmentError('FLOOR_NOT_FOUND', 'Floor not found.');
  }

  return floor;
}

async function listApartments(organizationId, { page, pageSize, search, floorId }) {
  const where = {
    organizationId,
    deletedAt: null,
    ...(floorId ? { floorId } : {}),
    ...(search
      ? {
          OR: [
            { name: { contains: search } },
            { apartmentNumber: { contains: search } },
          ],
        }
      : {}),
  };

  const [items, total] = await prisma.$transaction([
    prisma.apartment.findMany({
      where,
      select: apartmentSelect(),
      orderBy: [{ apartmentNumber: 'asc' }, { createdAt: 'asc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.apartment.count({ where }),
  ]);

  return {
    items: items.map(formatApartment),
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
    },
  };
}

async function getApartment(organizationId, apartmentId) {
  const apartment = await prisma.apartment.findFirst({
    where: { id: apartmentId, organizationId, deletedAt: null },
    select: apartmentSelect(),
  });

  if (!apartment) {
    throw createApartmentError('APARTMENT_NOT_FOUND', 'Apartment not found.');
  }

  return formatApartment(apartment);
}

async function createApartment(organizationId, data) {
  await assertFloorInOrganization(organizationId, data.floorId);

  try {
    const apartment = await prisma.apartment.create({
      data: { ...data, organizationId },
      select: apartmentSelect(),
    });

    return formatApartment(apartment);
  } catch (error) {
    if (error.code === 'P2002') {
      // The apartmentNumber unique index also covers soft-deleted rows, so re-adding a
      // number that was previously removed revives that row instead of failing.
      const removed = await prisma.apartment.findFirst({
        where: { floorId: data.floorId, apartmentNumber: data.apartmentNumber, deletedAt: { not: null } },
        select: { id: true },
      });

      if (removed) {
        const revived = await prisma.apartment.update({
          where: { id: removed.id },
          data: { ...data, organizationId, deletedAt: null },
          select: apartmentSelect(),
        });

        return formatApartment(revived);
      }

      throw createApartmentError('APARTMENT_NUMBER_EXISTS', 'Apartment number already exists on this floor.');
    }
    throw error;
  }
}

async function updateApartment(organizationId, apartmentId, data) {
  const apartment = await prisma.apartment.findFirst({
    where: { id: apartmentId, organizationId, deletedAt: null },
    select: { id: true },
  });

  if (!apartment) {
    throw createApartmentError('APARTMENT_NOT_FOUND', 'Apartment not found.');
  }

  if (data.floorId) {
    await assertFloorInOrganization(organizationId, data.floorId);
  }

  try {
    const updated = await prisma.apartment.update({
      where: { id: apartmentId },
      data,
      select: apartmentSelect(),
    });

    return formatApartment(updated);
  } catch (error) {
    if (error.code === 'P2002') {
      throw createApartmentError('APARTMENT_NUMBER_EXISTS', 'Apartment number already exists on this floor.');
    }
    throw error;
  }
}

async function softDeleteApartment(organizationId, apartmentId) {
  const result = await prisma.apartment.updateMany({
    where: { id: apartmentId, organizationId, deletedAt: null },
    data: { deletedAt: new Date() },
  });

  if (result.count === 0) {
    throw createApartmentError('APARTMENT_NOT_FOUND', 'Apartment not found.');
  }

  return { id: apartmentId };
}

module.exports = {
  assertFloorInOrganization,
  createApartment,
  getApartment,
  listApartments,
  softDeleteApartment,
  updateApartment,
};
