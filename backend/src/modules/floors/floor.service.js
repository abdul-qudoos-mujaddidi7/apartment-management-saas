const prisma = require('../../lib/prisma');

function createFloorError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function floorSelect() {
  return {
    id: true,
    buildingId: true,
    floorNumber: true,
    sortIndex: true,
    name: true,
    createdAt: true,
    updatedAt: true,
    building: {
      select: { id: true, name: true, code: true },
    },
    apartments: {
      where: { deletedAt: null },
      select: { status: true },
    },
  };
}

function formatFloor({ apartments = [], sortIndex, ...floor }) {
  const apartmentStatusCounts = apartments.reduce((counts, apartment) => {
    counts[apartment.status] = (counts[apartment.status] || 0) + 1;
    return counts;
  }, {});

  // `sortIndex` is an implementation detail of the ordering, not part of a floor.
  return {
    ...floor,
    totalApartments: apartments.length,
    apartmentStatusCounts,
  };
}

/** Where named floors sort: below every numbered one, in alphabetical order. */
const NAMED_FLOOR_SORT = -1000000;

/**
 * Turn a floor's own label into the key the list is ordered by, so "2" comes
 * before "10" and "Ground" sits under both. A real number keeps its value; any
 * other label lands on a single low key and is ordered by the label itself.
 */
function floorSortIndex(floorNumber) {
  const text = String(floorNumber).trim();
  if (!/^[+-]?\d+(\.\d+)?$/.test(text)) return NAMED_FLOOR_SORT;
  const value = Number(text);
  if (!Number.isFinite(value) || value < -2000000 || value > 2000000) return NAMED_FLOOR_SORT;
  return Math.trunc(value);
}

// Every floor query is scoped to the organization through the Building relationship.
function organizationScope(organizationId) {
  return {
    deletedAt: null,
    building: { organizationId, deletedAt: null },
  };
}

async function assertBuildingInOrganization(organizationId, buildingId) {
  const building = await prisma.building.findFirst({
    where: { id: buildingId, organizationId, deletedAt: null },
    select: { id: true },
  });

  if (!building) {
    throw createFloorError('BUILDING_NOT_FOUND', 'Building not found.');
  }

  return building;
}

async function listFloors(organizationId, { page, pageSize, search, buildingId }) {
  const where = {
    ...organizationScope(organizationId),
    ...(buildingId ? { buildingId } : {}),
    ...(search ? { OR: [{ name: { contains: search } }, { floorNumber: { contains: search } }] } : {}),
  };

  const [items, total] = await prisma.$transaction([
    prisma.floor.findMany({
      where,
      select: floorSelect(),
      // Numbers by value, named floors first in alphabetical order, and the
      // label itself breaks ties — see `floorSortIndex`.
      orderBy: [{ sortIndex: 'asc' }, { floorNumber: 'asc' }, { createdAt: 'asc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.floor.count({ where }),
  ]);

  return {
    items: items.map(formatFloor),
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
    },
  };
}

async function getFloor(organizationId, floorId) {
  const floor = await prisma.floor.findFirst({
    where: { id: floorId, ...organizationScope(organizationId) },
    select: floorSelect(),
  });

  if (!floor) {
    throw createFloorError('FLOOR_NOT_FOUND', 'Floor not found.');
  }

  return formatFloor(floor);
}

async function createFloor(organizationId, data) {
  await assertBuildingInOrganization(organizationId, data.buildingId);

  try {
    const floor = await prisma.floor.create({
      data: { ...data, sortIndex: floorSortIndex(data.floorNumber) },
      select: floorSelect(),
    });
    return formatFloor(floor);
  } catch (error) {
    if (error.code === 'P2002') {
      // The floorNumber unique index also covers soft-deleted rows, so re-adding a
      // number that was previously removed revives that row instead of failing.
      const removed = await prisma.floor.findFirst({
        where: { buildingId: data.buildingId, floorNumber: data.floorNumber, deletedAt: { not: null } },
        select: { id: true },
      });

      if (removed) {
        const floor = await prisma.floor.update({
          where: { id: removed.id },
          data: {
            name: data.name,
            sortIndex: floorSortIndex(data.floorNumber),
            deletedAt: null,
          },
          select: floorSelect(),
        });
        return formatFloor(floor);
      }

      throw createFloorError('FLOOR_NUMBER_EXISTS', 'Floor number already exists in this building.');
    }
    throw error;
  }
}

async function updateFloor(organizationId, floorId, data) {
  const floor = await prisma.floor.findFirst({
    where: { id: floorId, ...organizationScope(organizationId) },
    select: { id: true },
  });

  if (!floor) {
    throw createFloorError('FLOOR_NOT_FOUND', 'Floor not found.');
  }

  if (data.buildingId) {
    await assertBuildingInOrganization(organizationId, data.buildingId);
  }

  try {
    const floor = await prisma.floor.update({
      where: { id: floorId },
      data: {
        ...data,
        // Re-key the order whenever the label changes, so a floor renamed from
        // "Ground" to "3" moves to where a 3 belongs.
        ...(data.floorNumber === undefined ? {} : { sortIndex: floorSortIndex(data.floorNumber) }),
      },
      select: floorSelect(),
    });
    return formatFloor(floor);
  } catch (error) {
    if (error.code === 'P2002') {
      throw createFloorError('FLOOR_NUMBER_EXISTS', 'Floor number already exists in this building.');
    }
    throw error;
  }
}

async function softDeleteFloor(organizationId, floorId) {
  const result = await prisma.floor.updateMany({
    where: { id: floorId, ...organizationScope(organizationId) },
    data: { deletedAt: new Date() },
  });

  if (result.count === 0) {
    throw createFloorError('FLOOR_NOT_FOUND', 'Floor not found.');
  }

  return { id: floorId };
}

module.exports = {
  createFloor,
  getFloor,
  listFloors,
  softDeleteFloor,
  updateFloor,
};
