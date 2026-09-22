const prisma = require('../../lib/prisma');

const AppError = require('../../errors/AppError');

function assetSelect() {
  return {
    id: true,
    organizationId: true,
    categoryId: true,
    name: true,
    code: true,
    unit: true,
    description: true,
    createdAt: true,
    updatedAt: true,
    category: {
      select: { id: true, name: true, code: true },
    },
    // How many active apartment records use this asset.
    _count: {
      select: { apartmentAssets: { where: { deletedAt: null } } },
    },
  };
}

function formatAsset({ _count, ...asset }) {
  return { ...asset, usageCount: _count?.apartmentAssets ?? 0 };
}

// A category can only be attached when it belongs to the caller's organization.
async function assertCategoryInOrganization(organizationId, categoryId) {
  if (!categoryId) return;

  const category = await prisma.assetCategory.findFirst({
    where: { id: categoryId, organizationId, deletedAt: null },
    select: { id: true },
  });

  if (!category) {
    throw new AppError('Asset category not found.', 404, 'ASSET_CATEGORY_NOT_FOUND');
  }
}

async function listAssets(organizationId, { page, pageSize, search, categoryId }) {
  const where = {
    organizationId,
    deletedAt: null,
    ...(categoryId ? { categoryId } : {}),
    ...(search
      ? {
          OR: [
            { name: { contains: search } },
            { code: { contains: search } },
          ],
        }
      : {}),
  };

  const [items, total] = await prisma.$transaction([
    prisma.asset.findMany({
      where,
      select: assetSelect(),
      orderBy: [{ name: 'asc' }, { createdAt: 'asc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.asset.count({ where }),
  ]);

  return {
    items: items.map(formatAsset),
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
    },
  };
}

async function getAsset(organizationId, assetId) {
  const asset = await prisma.asset.findFirst({
    where: { id: assetId, organizationId, deletedAt: null },
    select: assetSelect(),
  });

  if (!asset) {
    throw new AppError('Asset not found.', 404, 'ASSET_NOT_FOUND');
  }

  return formatAsset(asset);
}

async function createAsset(organizationId, data) {
  if (data.categoryId) {
    await assertCategoryInOrganization(organizationId, data.categoryId);
  }

  const asset = await prisma.asset.create({
    data: { ...data, organizationId },
    select: assetSelect(),
  });

  return formatAsset(asset);
}

async function updateAsset(organizationId, assetId, data) {
  if (data.categoryId) {
    await assertCategoryInOrganization(organizationId, data.categoryId);
  }

  try {
    const asset = await prisma.asset.update({
      where: { id: assetId, organizationId, deletedAt: null },
      data,
      select: assetSelect(),
    });

    return formatAsset(asset);
  } catch (error) {
    if (error.code === 'P2025') {
      throw new AppError('Asset not found.', 404, 'ASSET_NOT_FOUND');
    }
    throw error;
  }
}

// Soft delete only. Historical apartment asset records keep pointing at this
// master asset so past inventory stays readable.
async function softDeleteAsset(organizationId, assetId) {
  try {
    return await prisma.asset.update({
      where: { id: assetId, organizationId, deletedAt: null },
      data: { deletedAt: new Date() },
      select: { id: true },
    });
  } catch (error) {
    if (error.code === 'P2025') {
      throw new AppError('Asset not found.', 404, 'ASSET_NOT_FOUND');
    }
    throw error;
  }
}

module.exports = {
  assertCategoryInOrganization,
  createAsset,
  getAsset,
  listAssets,
  softDeleteAsset,
  updateAsset,
};
