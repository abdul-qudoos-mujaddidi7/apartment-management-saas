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
    name: true,
    createdAt: true,
    updatedAt: true,
    building: {
      select: { id: true, name: true, code: true },
    },
  };
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
    ...(search ? { name: { contains: search } } : {}),
  };

  const [items, total] = await prisma.$transaction([
    prisma.floor.findMany({
      where,
      select: floorSelect(),
      orderBy: [{ floorNumber: 'asc' }, { createdAt: 'asc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.floor.count({ where }),
  ]);

  return {
    items,
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

  return floor;
}

async function createFloor(organizationId, data) {
  await assertBuildingInOrganization(organizationId, data.buildingId);

  try {
    return await prisma.floor.create({
      data,
      select: floorSelect(),
    });
  } catch (error) {
    if (error.code === 'P2002') {
      // The floorNumber unique index also covers soft-deleted rows, so re-adding a
      // number that was previously removed revives that row instead of failing.
      const removed = await prisma.floor.findFirst({
        where: { buildingId: data.buildingId, floorNumber: data.floorNumber, deletedAt: { not: null } },
        select: { id: true },
      });

      if (removed) {
        return prisma.floor.update({
          where: { id: removed.id },
          data: { name: data.name, deletedAt: null },
          select: floorSelect(),
        });
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
    return await prisma.floor.update({
      where: { id: floorId },
      data,
      select: floorSelect(),
    });
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
