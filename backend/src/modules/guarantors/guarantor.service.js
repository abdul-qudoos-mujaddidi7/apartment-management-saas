const prisma = require('../../lib/prisma');
const AppError = require('../../errors/AppError');
const { resolveUpload, removeUpload } = require('../../lib/uploads');
const fs = require('fs');

function scope(organizationId) {
  if (!organizationId) throw new AppError('Authentication required.', 401, 'UNAUTHORIZED');
  return { organizationId, deletedAt: null };
}
async function lockGuarantor(tx, organizationId, id) {
  scope(organizationId);
  // Both assignment and deletion lock the same row, so deletion cannot race an assignment.
  const rows = await tx.$queryRaw`SELECT id FROM Guarantor WHERE id = ${id} AND organizationId = ${organizationId} AND deletedAt IS NULL FOR UPDATE`;
  if (!rows.length) throw new AppError('Guarantor not found.', 404, 'GUARANTOR_NOT_FOUND');
}
function validateDocument(organizationId, data) {
  if (!data.documentUrl) return;
  if (!data.documentUrl.startsWith(`/uploads/guarantors/${organizationId}/`) || !fs.existsSync(resolveUpload(data.documentUrl) || '')) {
    throw new AppError('Choose a document uploaded by your organization.', 400, 'INVALID_GUARANTOR_DOCUMENT');
  }
}
async function listGuarantors(org, { page, pageSize, search }) {
  const where = { ...scope(org), ...(search ? { OR: ['firstName', 'lastName', 'phone', 'alternatePhone', 'nationalId'].map(field => ({ [field]: { contains: search } })) } : {}) };
  const [items, total] = await prisma.$transaction([
    prisma.guarantor.findMany({ where, orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }, { id: 'asc' }], skip: (page - 1) * pageSize, take: pageSize }),
    prisma.guarantor.count({ where }),
  ]);
  return { items, pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) } };
}
async function getGuarantor(org, id) {
  const row = await prisma.guarantor.findFirst({ where: { id, ...scope(org) } });
  if (!row) throw new AppError('Guarantor not found.', 404, 'GUARANTOR_NOT_FOUND');
  return row;
}
async function getGuarantorProfile(org, id, { page, pageSize }, canViewLeases) {
  const guarantor = await getGuarantor(org, id);
  const where = { ...scope(org), guarantorId: id };
  const groups = await prisma.lease.groupBy({ by: ['status'], where, _count: { _all: true } });
  const counts = Object.fromEntries(groups.map(group => [group.status, group._count._all]));
  const summary = {
    totalLeases: groups.reduce((total, group) => total + group._count._all, 0),
    activeLeases: counts.ACTIVE || 0,
    draftLeases: counts.DRAFT || 0,
    closedLeases: (counts.EXPIRED || 0) + (counts.TERMINATED || 0),
  };
  const leases = canViewLeases ? await prisma.lease.findMany({
    where,
    select: {
      id: true, contractNumber: true, startDate: true, endDate: true, status: true,
      monthlyRent: true, currency: true,
      tenant: { select: { id: true, firstName: true, lastName: true, deletedAt: true } },
      apartment: { select: {
        apartmentNumber: true, name: true,
        floor: { select: { name: true, floorNumber: true, building: { select: { name: true } } } },
      } },
    },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    skip: (page - 1) * pageSize, take: pageSize,
  }) : [];
  return {
    guarantor, summary, canViewLeases,
    leases: leases.map(lease => ({ ...lease, monthlyRent: Number(lease.monthlyRent) })),
    pagination: { page, pageSize, total: summary.totalLeases, totalPages: Math.ceil(summary.totalLeases / pageSize) },
  };
}
async function createGuarantor(org, data) {
  scope(org); validateDocument(org, data);
  return prisma.guarantor.create({ data: { ...data, organizationId: org } });
}
async function updateGuarantor(org, id, data) {
  validateDocument(org, data);
  let previousDocument;
  const guarantor = await prisma.$transaction(async tx => {
    await lockGuarantor(tx, org, id);
    if ('documentUrl' in data) previousDocument = (await tx.guarantor.findFirst({ where: { id, ...scope(org) }, select: { documentUrl: true } })).documentUrl;
    await tx.guarantor.updateMany({ where: { id, ...scope(org) }, data });
    return tx.guarantor.findFirst({ where: { id, ...scope(org) } });
  });
  // Keep files held by another record, including soft-deleted records.
  if (previousDocument && previousDocument !== guarantor.documentUrl && !await prisma.guarantor.count({ where: { documentUrl: previousDocument } })) removeUpload(previousDocument);
  return guarantor;
}
async function softDeleteGuarantor(org, id) {
  return prisma.$transaction(async tx => {
    await lockGuarantor(tx, org, id);
    if (await tx.lease.count({ where: { guarantorId: id, deletedAt: null } })) {
      throw new AppError('Guarantor is referenced by a lease. Remove the assignment before deleting.', 409, 'GUARANTOR_IN_USE');
    }
    await tx.guarantor.updateMany({ where: { id, ...scope(org) }, data: { deletedAt: new Date() } });
    return { id };
  });
}
module.exports = { listGuarantors, getGuarantor, getGuarantorProfile, createGuarantor, updateGuarantor, softDeleteGuarantor, lockGuarantor };
