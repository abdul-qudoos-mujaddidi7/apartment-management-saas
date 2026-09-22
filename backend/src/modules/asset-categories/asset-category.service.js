const prisma = require('../../lib/prisma');

const AppError = require('../../errors/AppError');

function assetCategorySelect() {
  return {
    id: true,
    organizationId: true,
    name: true,
    code: true,
    description: true,
    createdAt: true,
    updatedAt: true,
    // How many active master assets point at this category.
    _count: {
      select: { assets: { where: { deletedAt: null } } },
    },
  };
}

function formatAssetCategory({ _count, ...category }) {
  return { ...category, assetCount: _count?.assets ?? 0 };
}

async function listAssetCategories(organizationId, { page, pageSize, search }) {
  const where = {
    organizationId,
    deletedAt: null,
    ...(search ? { name: { contains: search } } : {}),
  };

  const [items, total] = await prisma.$transaction([
    prisma.assetCategory.findMany({
      where,
      select: assetCategorySelect(),
      orderBy: [{ name: 'asc' }, { createdAt: 'asc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.assetCategory.count({ where }),
  ]);

  return {
    items: items.map(formatAssetCategory),
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
    },
  };
}

async function getAssetCategory(organizationId, categoryId) {
  const category = await prisma.assetCategory.findFirst({
    where: { id: categoryId, organizationId, deletedAt: null },
    select: assetCategorySelect(),
  });

  if (!category) {
    throw new AppError('Asset category not found.', 404, 'ASSET_CATEGORY_NOT_FOUND');
  }

  return formatAssetCategory(category);
}

async function createAssetCategory(organizationId, data) {
  const category = await prisma.assetCategory.create({
    data: { ...data, organizationId },
    select: assetCategorySelect(),
  });

  return formatAssetCategory(category);
}

async function updateAssetCategory(organizationId, categoryId, data) {
  try {
    const category = await prisma.assetCategory.update({
      where: { id: categoryId, organizationId, deletedAt: null },
      data,
      select: assetCategorySelect(),
    });

    return formatAssetCategory(category);
  } catch (error) {
    if (error.code === 'P2025') {
      throw new AppError('Asset category not found.', 404, 'ASSET_CATEGORY_NOT_FOUND');
    }
    throw error;
  }
}

// Soft delete only: category rows are referenced by master assets and by the
// apartment asset records those assets were used on, so nothing is ever removed.
async function softDeleteAssetCategory(organizationId, categoryId) {
  try {
    return await prisma.assetCategory.update({
      where: { id: categoryId, organizationId, deletedAt: null },
      data: { deletedAt: new Date() },
      select: { id: true },
    });
  } catch (error) {
    if (error.code === 'P2025') {
      throw new AppError('Asset category not found.', 404, 'ASSET_CATEGORY_NOT_FOUND');
    }
    throw error;
  }
}

module.exports = {
  createAssetCategory,
  getAssetCategory,
  listAssetCategories,
  softDeleteAssetCategory,
  updateAssetCategory,
};
