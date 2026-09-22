const prisma = require('../../lib/prisma');

const AppError = require('../../errors/AppError');

function tenantSelect() {
  return {
    id: true,
    organizationId: true,
    firstName: true,
    lastName: true,
    phone: true,
    alternatePhone: true,
    email: true,
    nationalId: true,
    address: true,
    emergencyContactName: true,
    emergencyContactPhone: true,
    notes: true,
    status: true,
    createdAt: true,
    updatedAt: true,
  };
}

async function listTenants(organizationId, { page, pageSize, search }) {
  const where = {
    organizationId,
    deletedAt: null,
    ...(search
      ? {
          OR: [
            { firstName: { contains: search } },
            { lastName: { contains: search } },
            { phone: { contains: search } },
            { alternatePhone: { contains: search } },
          ],
        }
      : {}),
  };

  const [items, total] = await prisma.$transaction([
    prisma.tenant.findMany({
      where,
      select: tenantSelect(),
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }, { createdAt: 'asc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.tenant.count({ where }),
  ]);

  return { items, pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) } };
}

async function getTenant(organizationId, tenantId) {
  const tenant = await prisma.tenant.findFirst({
    where: { id: tenantId, organizationId, deletedAt: null },
    select: tenantSelect(),
  });

  if (!tenant) throw new AppError('Tenant not found.', 404, 'TENANT_NOT_FOUND');
  return tenant;
}

async function createTenant(organizationId, data) {
  return prisma.$transaction(async (tx) => {
    const tenant = await tx.tenant.create({
      data: { ...data, organizationId },
      select: tenantSelect(),
    });

    // Keep the tenant and receivables account inseparable: if account creation
    // fails, Prisma rolls the tenant creation back as part of this transaction.
    await tx.tenantAccount.create({
      data: { organizationId, tenantId: tenant.id, balance: 0 },
    });

    return tenant;
  });
}

async function updateTenant(organizationId, tenantId, data) {
  // updateMany keeps the tenant and organization constraints in the write itself.
  const result = await prisma.tenant.updateMany({
    where: { id: tenantId, organizationId, deletedAt: null },
    data,
  });

  if (result.count === 0) throw new AppError('Tenant not found.', 404, 'TENANT_NOT_FOUND');
  return getTenant(organizationId, tenantId);
}

async function softDeleteTenant(organizationId, tenantId) {
  const result = await prisma.tenant.updateMany({
    where: { id: tenantId, organizationId, deletedAt: null },
    data: { deletedAt: new Date() },
  });

  if (result.count === 0) throw new AppError('Tenant not found.', 404, 'TENANT_NOT_FOUND');
  return { id: tenantId };
}

module.exports = { createTenant, getTenant, listTenants, softDeleteTenant, updateTenant };
