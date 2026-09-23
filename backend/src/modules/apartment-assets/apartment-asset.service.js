const prisma = require('../../lib/prisma');

const AppError = require('../../errors/AppError');

function apartmentAssetSelect() {
  return {
    id: true,
    organizationId: true,
    apartmentId: true,
    assetId: true,
    quantity: true,
    condition: true,
    serialNumber: true,
    modelNumber: true,
    purchaseDate: true,
    unitValue: true,
    notes: true,
    createdAt: true,
    updatedAt: true,
    asset: {
      select: {
        id: true,
        name: true,
        code: true,
        unit: true,
        category: { select: { id: true, name: true } },
      },
    },
    apartment: {
      select: {
        id: true,
        apartmentNumber: true,
        name: true,
        assetSetupCompletedAt: true,
        floor: {
          select: {
            id: true,
            floorNumber: true,
            name: true,
            building: { select: { id: true, name: true, code: true } },
          },
        },
      },
    },
  };
}

// Prisma hands back Decimal instances; the API exposes plain numbers.
function formatApartmentAsset(record) {
  if (!record) return record;

  const unitValue =
    record.unitValue === null || record.unitValue === undefined ? null : Number(record.unitValue);

  return {
    ...record,
    unitValue,
    totalValue: unitValue === null ? null : unitValue * record.quantity,
  };
}

// The apartment must belong to the caller's organization. Proof of ownership is
// the organizationId on the Apartment row itself, so a changed URL id can never
// reach another organization's data.
async function getApartmentContext(organizationId, apartmentId) {
  const apartment = await prisma.apartment.findFirst({
    where: { id: apartmentId, organizationId, deletedAt: null },
    select: {
      id: true,
      organizationId: true,
      apartmentNumber: true,
      name: true,
      type: true,
      status: true,
      assetSetupCompletedAt: true,
      floor: {
        select: {
          id: true,
          floorNumber: true,
          name: true,
          building: { select: { id: true, name: true, code: true } },
        },
      },
    },
  });

  if (!apartment) {
    throw new AppError('Apartment not found.', 404, 'APARTMENT_NOT_FOUND');
  }

  return apartment;
}

// Every active asset in the payload must belong to the caller's organization.
async function assertAssetsInOrganization(organizationId, assetIds) {
  const uniqueIds = [...new Set(assetIds)];

  if (uniqueIds.length === 0) return;

  const assets = await prisma.asset.findMany({
    where: { id: { in: uniqueIds }, organizationId, deletedAt: null },
    select: { id: true },
  });

  const found = new Set(assets.map((asset) => asset.id));
  const unknown = uniqueIds.filter((id) => !found.has(id));

  if (unknown.length > 0) {
    throw new AppError(
      'One or more selected assets do not belong to this organization.',
      400,
      'INVALID_ASSET',
    );
  }
}

/**
 * Serial numbers are unique among the organization's active apartment asset
 * records. `ignoreIds` holds the rows the incoming payload is replacing, so
 * re-saving the same row with its own serial stays valid.
 */
async function assertSerialNumbersAvailable(client, organizationId, rows, ignoreIds = []) {
  const serials = rows.map((row) => row.serialNumber).filter(Boolean);

  if (serials.length === 0) return;

  const uniqueSerials = new Set(serials);

  if (uniqueSerials.size !== serials.length) {
    throw new AppError(
      'The same serial number was entered more than once.',
      409,
      'SERIAL_NUMBER_EXISTS',
    );
  }

  const conflict = await client.apartmentAsset.findFirst({
    where: {
      organizationId,
      serialNumber: { in: [...uniqueSerials] },
      deletedAt: null,
      ...(ignoreIds.length > 0 ? { id: { notIn: ignoreIds } } : {}),
    },
    select: { serialNumber: true },
  });

  if (conflict) {
    throw new AppError(
      `Serial number ${conflict.serialNumber} is already registered to another asset.`,
      409,
      'SERIAL_NUMBER_EXISTS',
    );
  }
}

async function listApartmentAssets(organizationId, apartmentId) {
  const apartment = await getApartmentContext(organizationId, apartmentId);

  const items = await prisma.apartmentAsset.findMany({
    where: { organizationId, apartmentId, deletedAt: null },
    select: apartmentAssetSelect(),
    orderBy: [{ createdAt: 'asc' }],
  });

  return {
    apartment,
    items: items.map(formatApartmentAsset),
    summary: summarize(items),
  };
}

/**
 * Totals for the module page.
 *
 * Total value is quantity x unit value, which Prisma aggregate cannot express,
 * so the summary reads only the three columns it needs instead of the whole
 * record set.
 */
function summarize(rows) {
  let totalQuantity = 0;
  let totalValue = 0;
  let damagedCount = 0;
  let missingSerialCount = 0;

  for (const row of rows) {
    totalQuantity += row.quantity;

    if (row.unitValue !== null && row.unitValue !== undefined) {
      totalValue += Number(row.unitValue) * row.quantity;
    }

    if (row.condition === 'DAMAGED' || row.condition === 'BROKEN') {
      damagedCount += 1;
    }

    if (!row.serialNumber) {
      missingSerialCount += 1;
    }
  }

  return {
    totalRecords: rows.length,
    totalQuantity,
    totalValue,
    damagedCount,
    missingSerialCount,
  };
}

// Building -> floor -> apartment filters all live inside the same scoped tree
// the ownership check uses, so a foreign id simply matches nothing.
function apartmentScopedWhere(organizationId, filters = {}) {
  const { buildingId, floorId, apartmentId, setup } = filters;

  return {
    organizationId,
    ...(apartmentId ? { apartmentId } : {}),
    apartment: {
      ...(apartmentId ? { id: apartmentId } : {}),
      deletedAt: null,
      ...(setup && setup !== 'all'
        ? { assetSetupCompletedAt: setup === 'completed' ? { not: null } : null }
        : {}),
      floor: {
        deletedAt: null,
        ...(floorId ? { id: floorId } : {}),
        building: {
          organizationId,
          deletedAt: null,
          ...(buildingId ? { id: buildingId } : {}),
        },
      },
    },
  };
}

async function listRecords(organizationId, filters) {
  const { page, pageSize, search, categoryId, assetId, condition } = filters;

  const where = {
    deletedAt: null,
    ...apartmentScopedWhere(organizationId, filters),
    ...(condition ? { condition } : {}),
    ...(assetId ? { assetId } : {}),
    ...(categoryId ? { asset: { categoryId } } : {}),
    ...(search
      ? {
          OR: [
            { asset: { name: { contains: search } } },
            { serialNumber: { contains: search } },
            { modelNumber: { contains: search } },
            { apartment: { apartmentNumber: { contains: search } } },
            { apartment: { name: { contains: search } } },
          ],
        }
      : {}),
  };

  const [items, total, summaryRows] = await prisma.$transaction([
    prisma.apartmentAsset.findMany({
      where,
      select: apartmentAssetSelect(),
      orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.apartmentAsset.count({ where }),
    prisma.apartmentAsset.findMany({
      where,
      select: { quantity: true, unitValue: true, condition: true, serialNumber: true },
    }),
  ]);

  return {
    items: items.map(formatApartmentAsset),
    summary: summarize(summaryRows),
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
    },
  };
}

/**
 * Atomic save of one apartment's asset list.
 *
 * The payload is the apartment's complete desired list: rows carrying an id are
 * updated, rows without one are created, and active rows that are missing from
 * the payload are soft deleted. `complete` stamps assetSetupCompletedAt and
 * `advance` returns the next apartment that still needs its assets registered.
 */
async function saveApartmentAssets(organizationId, apartmentId, { assets, complete, advance }) {
  const apartment = await getApartmentContext(organizationId, apartmentId);

  await assertAssetsInOrganization(
    organizationId,
    assets.map((row) => row.assetId),
  );

  const payloadIds = assets.filter((row) => row.id).map((row) => row.id);

  const savedItems = await prisma.$transaction(async (transaction) => {
    const existing = await transaction.apartmentAsset.findMany({
      where: { organizationId, apartmentId, deletedAt: null },
      select: { id: true },
    });

    const knownIds = new Set(existing.map((row) => row.id));
    const foreignId = payloadIds.find((id) => !knownIds.has(id));

    if (foreignId) {
      throw new AppError('Apartment asset not found.', 404, 'APARTMENT_ASSET_NOT_FOUND');
    }

    await assertSerialNumbersAvailable(transaction, organizationId, assets, payloadIds);

    const written = [];

    for (const row of assets) {
      const { id, ...data } = row;

      if (id) {
        written.push(
          await transaction.apartmentAsset.update({
            where: { id },
            data,
            select: apartmentAssetSelect(),
          }),
        );
      } else {
        written.push(
          await transaction.apartmentAsset.create({
            data: { ...data, organizationId, apartmentId },
            select: apartmentAssetSelect(),
          }),
        );
      }
    }

    const removedIds = existing
      .filter((row) => !payloadIds.includes(row.id))
      .map((row) => row.id);

    if (removedIds.length > 0) {
      await transaction.apartmentAsset.updateMany({
        where: { id: { in: removedIds }, organizationId, apartmentId, deletedAt: null },
        data: { deletedAt: new Date() },
      });
    }

    if (complete) {
      await transaction.apartment.update({
        where: { id: apartmentId },
        data: { assetSetupCompletedAt: new Date() },
      });
    }

    return written;
  });

  const nextApartment = advance ? await findNextApartment(organizationId, apartmentId) : null;

  return {
    apartment,
    items: savedItems.map(formatApartmentAsset),
    nextApartment,
  };
}

async function getApartmentAsset(organizationId, apartmentAssetId) {
  const record = await prisma.apartmentAsset.findFirst({
    where: { id: apartmentAssetId, organizationId, deletedAt: null },
    select: apartmentAssetSelect(),
  });

  if (!record) {
    throw new AppError('Apartment asset not found.', 404, 'APARTMENT_ASSET_NOT_FOUND');
  }

  return formatApartmentAsset(record);
}

async function updateApartmentAsset(organizationId, apartmentAssetId, data) {
  if (data.assetId) {
    await assertAssetsInOrganization(organizationId, [data.assetId]);
  }

  if (data.serialNumber) {
    await assertSerialNumbersAvailable(prisma, organizationId, [data], [apartmentAssetId]);
  }

  try {
    const record = await prisma.apartmentAsset.update({
      where: { id: apartmentAssetId, organizationId, deletedAt: null },
      data,
      select: apartmentAssetSelect(),
    });

    return formatApartmentAsset(record);
  } catch (error) {
    if (error.code === 'P2025') {
      throw new AppError('Apartment asset not found.', 404, 'APARTMENT_ASSET_NOT_FOUND');
    }
    throw error;
  }
}

// Soft delete only: the row keeps the apartment's asset history intact.
async function softDeleteApartmentAsset(organizationId, apartmentAssetId) {
  try {
    return await prisma.apartmentAsset.update({
      where: { id: apartmentAssetId, organizationId, deletedAt: null },
      data: { deletedAt: new Date() },
      select: { id: true },
    });
  } catch (error) {
    if (error.code === 'P2025') {
      throw new AppError('Apartment asset not found.', 404, 'APARTMENT_ASSET_NOT_FOUND');
    }
    throw error;
  }
}

async function setApartmentSetupCompleted(organizationId, apartmentId, completed) {
  await getApartmentContext(organizationId, apartmentId);

  const apartment = await prisma.apartment.update({
    where: { id: apartmentId },
    data: { assetSetupCompletedAt: completed ? new Date() : null },
    select: {
      id: true,
      apartmentNumber: true,
      name: true,
      assetSetupCompletedAt: true,
      floor: {
        select: {
          id: true,
          floorNumber: true,
          name: true,
          building: { select: { id: true, name: true, code: true } },
        },
      },
    },
  });

  return {
    apartment,
    nextApartment: await findNextApartment(organizationId, apartmentId),
  };
}

function compareStrings(a, b) {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

/**
 * Floors in the order the Floors list shows them: by the ordering key the floor
 * carries (numbers by value, named floors first), then by the label itself. A
 * floor number is free text, so comparing the labels directly would put "10"
 * before "2" and a "Ground" in wherever G happens to fall.
 */
function compareFloors(a, b) {
  return (a.sortIndex ?? 0) - (b.sortIndex ?? 0) || compareStrings(a.floorNumber, b.floorNumber);
}

/**
 * The next apartment in real property order.
 *
 * Order is building (creation order), then floor number, then apartment number —
 * never `id + 1`. Only apartments whose asset registration is still pending
 * (assetSetupCompletedAt IS NULL) and that are not soft deleted are candidates,
 * and the current apartment is always excluded so a skipped apartment is not
 * returned as its own successor.
 */
async function findNextApartment(organizationId, currentApartmentId) {
  const current = await prisma.apartment.findFirst({
    where: { id: currentApartmentId, organizationId, deletedAt: null },
    select: {
      id: true,
      apartmentNumber: true,
      floor: {
        select: {
          floorNumber: true,
          sortIndex: true,
          building: { select: { id: true, createdAt: true } },
        },
      },
    },
  });

  if (!current) return null;

  const pending = await prisma.apartment.findMany({
    where: {
      organizationId,
      deletedAt: null,
      assetSetupCompletedAt: null,
      id: { not: currentApartmentId },
      floor: { deletedAt: null, building: { organizationId, deletedAt: null } },
    },
    select: {
      id: true,
      apartmentNumber: true,
      name: true,
      floor: {
        select: {
          id: true,
          floorNumber: true,
          sortIndex: true,
          name: true,
          building: { select: { id: true, name: true, code: true, createdAt: true } },
        },
      },
    },
  });

  const ordered = pending
    .map((apartment) => ({
      apartment,
      builtAt: apartment.floor.building.createdAt.getTime(),
    }))
    .sort(
      (a, b) =>
        a.builtAt - b.builtAt ||
        compareStrings(a.apartment.floor.building.id, b.apartment.floor.building.id) ||
        compareFloors(a.apartment.floor, b.apartment.floor) ||
        compareStrings(a.apartment.apartmentNumber, b.apartment.apartmentNumber) ||
        compareStrings(a.apartment.id, b.apartment.id),
    );

  const currentKey = {
    builtAt: current.floor.building.createdAt.getTime(),
    buildingId: current.floor.building.id,
    floor: current.floor,
    apartmentNumber: current.apartmentNumber,
    id: current.id,
  };

  const next =
    ordered.find((entry) => {
      const floorOrder = compareFloors(entry.apartment.floor, currentKey.floor);
      const sameBuilding = entry.apartment.floor.building.id === currentKey.buildingId;
      return (
        entry.builtAt > currentKey.builtAt ||
        (entry.builtAt === currentKey.builtAt &&
          compareStrings(entry.apartment.floor.building.id, currentKey.buildingId) > 0) ||
        (entry.builtAt === currentKey.builtAt && sameBuilding && floorOrder > 0) ||
        (entry.builtAt === currentKey.builtAt && sameBuilding && floorOrder === 0 &&
          compareStrings(entry.apartment.apartmentNumber, currentKey.apartmentNumber) > 0)
      );
    })?.apartment ?? null;

  if (!next) return null;

  return {
    id: next.id,
    apartmentNumber: next.apartmentNumber,
    name: next.name,
    floorId: next.floor.id,
    floorNumber: next.floor.floorNumber,
    floorName: next.floor.name,
    buildingId: next.floor.building.id,
    buildingName: next.floor.building.name,
  };
}

module.exports = {
  findNextApartment,
  getApartmentAsset,
  getApartmentContext,
  listApartmentAssets,
  listRecords,
  saveApartmentAssets,
  setApartmentSetupCompleted,
  softDeleteApartmentAsset,
  updateApartmentAsset,
};
