require('dotenv').config();

const prisma = require('../src/lib/prisma');

/**
 * Adds the Assets & Furniture permissions to an existing installation.
 *
 * `prisma/seed.js` also carries this list, but running the full seed re-upserts
 * the demo admin user (including its password), which is not acceptable on a
 * database whose password has since changed. This script only touches
 * Permission and RolePermission rows. Keep the list in sync with seed.js.
 */
const assetPermissions = [
  {
    name: 'View assets',
    code: 'ASSET_VIEW',
    description: 'View the master asset catalogue.',
  },
  {
    name: 'Manage assets',
    code: 'ASSET_CREATE',
    description: 'Add assets to the master catalogue.',
  },
  {
    name: 'Update assets',
    code: 'ASSET_UPDATE',
    description: 'Edit master asset details.',
  },
  {
    name: 'Delete assets',
    code: 'ASSET_DELETE',
    description: 'Remove assets from the master catalogue.',
  },
  {
    name: 'View asset categories',
    code: 'ASSET_CATEGORY_VIEW',
    description: 'View asset categories.',
  },
  {
    name: 'Create asset categories',
    code: 'ASSET_CATEGORY_CREATE',
    description: 'Add asset categories.',
  },
  {
    name: 'Update asset categories',
    code: 'ASSET_CATEGORY_UPDATE',
    description: 'Edit asset categories.',
  },
  {
    name: 'Delete asset categories',
    code: 'ASSET_CATEGORY_DELETE',
    description: 'Remove asset categories.',
  },
  {
    name: 'View apartment assets',
    code: 'APARTMENT_ASSET_VIEW',
    description: 'View the assets and furniture registered to apartments.',
  },
  {
    name: 'Register apartment assets',
    code: 'APARTMENT_ASSET_CREATE',
    description: 'Register assets and furniture to apartments.',
  },
  {
    name: 'Update apartment assets',
    code: 'APARTMENT_ASSET_UPDATE',
    description: 'Edit registered apartment assets.',
  },
  {
    name: 'Delete apartment assets',
    code: 'APARTMENT_ASSET_DELETE',
    description: 'Remove registered apartment assets.',
  },
];

// Read-only rights the MANAGER role receives, mirroring the filters in seed.js.
const managerCodes = ['ASSET_VIEW', 'ASSET_CATEGORY_VIEW', 'APARTMENT_ASSET_VIEW'];

async function main() {
  if (!process.argv.includes('--apply')) {
    console.log(
      `Dry run: would upsert ${assetPermissions.length} permissions and grant them to ADMIN ` +
        `(plus ${managerCodes.length} view rights to MANAGER). Re-run with --apply to write.`,
    );
    return;
  }

  const [adminRole, managerRole] = await Promise.all(
    ['ADMIN', 'MANAGER'].map((name) =>
      prisma.role.upsert({
        where: { name },
        update: { deletedAt: null },
        create: { name },
      }),
    ),
  );

  const seeded = [];

  for (const permission of assetPermissions) {
    seeded.push(
      await prisma.permission.upsert({
        where: { code: permission.code },
        update: { ...permission, deletedAt: null },
        create: permission,
      }),
    );
  }

  for (const permission of seeded) {
    await prisma.rolePermission.upsert({
      where: {
        roleId_permissionId: {
          roleId: adminRole.id,
          permissionId: permission.id,
        },
      },
      update: { deletedAt: null },
      create: { roleId: adminRole.id, permissionId: permission.id },
    });

    if (managerCodes.includes(permission.code)) {
      await prisma.rolePermission.upsert({
        where: {
          roleId_permissionId: {
            roleId: managerRole.id,
            permissionId: permission.id,
          },
        },
        update: { deletedAt: null },
        create: { roleId: managerRole.id, permissionId: permission.id },
      });
    }
  }

  console.log(
    `Seeded ${seeded.length} asset permissions; granted all to ADMIN and the view rights to MANAGER.`,
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
