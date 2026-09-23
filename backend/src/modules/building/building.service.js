const prisma = require('../../lib/prisma');

const AppError = require('../../errors/AppError');

function buildingSelect() {
  return {
    id: true,
    organizationId: true,
    name: true,
    code: true,
    address: true,
    status: true,
    createdAt: true,
    updatedAt: true,
    // Floors are the single source of truth for how many floors a building has.
    _count: {
      select: { floors: { where: { deletedAt: null } } },
    },
  };
}

function formatBuilding({ _count, ...building }) {
  return { ...building, totalFloors: _count?.floors ?? 0 };
}

async function listBuildings(organizationId, { page, pageSize, search }) {
  const where = {
    organizationId,
    deletedAt: null,
    ...(search
      ? {
          OR: [
            { name: { contains: search } },
            { code: { contains: search } },
            { address: { contains: search } },
          ],
        }
      : {}),
  };

  const [items, total] = await prisma.$transaction([
    prisma.building.findMany({
      where,
      select: buildingSelect(),
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.building.count({ where }),
  ]);

  return {
    items: items.map(formatBuilding),
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
    },
  };
}

async function getBuilding(organizationId, buildingId) {
  const building = await prisma.building.findFirst({
    where: { id: buildingId, organizationId, deletedAt: null },
    select: buildingSelect(),
  });

  if (!building) {
    throw new AppError('Building not found.', 404, 'BUILDING_NOT_FOUND');
  }

  // Apartment counts are aggregated here rather than derived from the floors
  // list, which the client pages through: a page of floors is not the building.
  const totalApartments = await prisma.apartment.count({
    where: { deletedAt: null, floor: { buildingId, deletedAt: null } },
  });

  return { ...formatBuilding(building), totalApartments };
}

async function createBuilding(organizationId, data) {
  try {
    const building = await prisma.building.create({
      data: { ...data, organizationId },
      select: buildingSelect(),
    });

    return formatBuilding(building);
  } catch (error) {
    if (error.code === 'P2002') {
      throw new AppError(
        'Building code already exists in this organization.',
        409,
        'BUILDING_CODE_EXISTS',
      );
    }
    throw error;
  }
}

async function updateBuilding(organizationId, buildingId, data) {
  try {
    const building = await prisma.building.update({
      where: { id: buildingId, organizationId, deletedAt: null },
      data,
      select: buildingSelect(),
    });

    return formatBuilding(building);
  } catch (error) {
    if (error.code === 'P2002') {
      throw new AppError(
        'Building code already exists in this organization.',
        409,
        'BUILDING_CODE_EXISTS',
      );
    }
    if (error.code === 'P2025') {
      throw new AppError('Building not found.', 404, 'BUILDING_NOT_FOUND');
    }
    throw error;
  }
}

async function softDeleteBuilding(organizationId, buildingId) {
  try {
    return await prisma.building.update({
      where: { id: buildingId, organizationId, deletedAt: null },
      data: { deletedAt: new Date() },
      select: { id: true },
    });
  } catch (error) {
    if (error.code === 'P2025') {
      throw new AppError('Building not found.', 404, 'BUILDING_NOT_FOUND');
    }
    throw error;
  }
}

module.exports = {
  createBuilding,
  getBuilding,
  listBuildings,
  softDeleteBuilding,
  updateBuilding,
};
