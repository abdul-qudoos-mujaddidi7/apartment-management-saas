const bcrypt = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const permissions = [
  {
    name: 'View organization',
    code: 'ORGANIZATION_VIEW',
    description: 'View organization details.',
  },
  {
    name: 'Manage organization',
    code: 'ORGANIZATION_MANAGE',
    description: 'Update organization settings.',
  },
  {
    name: 'View users',
    code: 'USER_VIEW',
    description: 'View organization users.',
  },
  {
    name: 'Manage users',
    code: 'USER_MANAGE',
    description: 'Invite, update, and remove organization users.',
  },
  {
    name: 'Manage roles',
    code: 'ROLE_MANAGE',
    description: 'Manage roles and their permissions.',
  },
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

async function main() {
  const seedAdminEmail = process.env.SEED_ADMIN_EMAIL || (process.env.NODE_ENV === 'production' ? null : 'admin@example.com');
  const seedAdminPassword = process.env.SEED_ADMIN_PASSWORD || (process.env.NODE_ENV === 'production' ? null : 'Admin@123456');

  if (!seedAdminEmail || !seedAdminPassword) {
    throw new Error('SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD must be configured before seeding.');
  }

  const passwordHash = await bcrypt.hash(seedAdminPassword, 12);

  const organization = await prisma.organization.upsert({
    where: { slug: 'demo-apartments' },
    update: { name: 'Demo Apartments', deletedAt: null },
    create: { name: 'Demo Apartments', slug: 'demo-apartments' },
  });

  const [adminRole, managerRole] = await Promise.all(
    ['ADMIN', 'MANAGER'].map((name) =>
      prisma.role.upsert({
        where: { name },
        update: { deletedAt: null },
        create: { name },
      }),
    ),
  );

  const seededPermissions = await Promise.all(
    permissions.map((permission) =>
      prisma.permission.upsert({
        where: { code: permission.code },
        update: { ...permission, deletedAt: null },
        create: permission,
      }),
    ),
  );

  await Promise.all(
    seededPermissions.map((permission) =>
      prisma.rolePermission.upsert({
        where: {
          roleId_permissionId: {
            roleId: adminRole.id,
            permissionId: permission.id,
          },
        },
        update: { deletedAt: null },
        create: { roleId: adminRole.id, permissionId: permission.id },
      }),
    ),
  );

  const managerPermissions = seededPermissions.filter((permission) =>
    [
      'ORGANIZATION_VIEW',
      'USER_VIEW',
      'ASSET_VIEW',
      'ASSET_CATEGORY_VIEW',
      'APARTMENT_ASSET_VIEW',
    ].includes(permission.code),
  );

  await Promise.all(
    managerPermissions.map((permission) =>
      prisma.rolePermission.upsert({
        where: {
          roleId_permissionId: {
            roleId: managerRole.id,
            permissionId: permission.id,
          },
        },
        update: { deletedAt: null },
        create: { roleId: managerRole.id, permissionId: permission.id },
      }),
    ),
  );

  await prisma.user.upsert({
    where: { email: seedAdminEmail },
    update: {
      firstName: 'Demo',
      lastName: 'Admin',
      passwordHash,
      organizationId: organization.id,
      roleId: adminRole.id,
      deletedAt: null,
    },
    create: {
      email: 'admin@example.com',
      firstName: 'Demo',
      lastName: 'Admin',
      passwordHash,
      organizationId: organization.id,
      roleId: adminRole.id,
    },
  });
}

main()
  .then(() => console.log('Demo organization and admin user seeded.'))
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
