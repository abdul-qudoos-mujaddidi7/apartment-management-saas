const prisma = require('../../lib/prisma');

const AppError = require('../../errors/AppError');
const { removeUpload } = require('../../lib/uploads');
const { shamsiMonthKey, shamsiMonthLabel } = require('../../lib/shamsi');
const { getTenantAccount } = require('../tenant-accounts/tenant-account.service');
const securityDepositService = require('../security-deposits/security-deposit.service');
const { tenantDocumentFields } = require('./tenant.validation');

const asNumber = (value) => (value === null || value === undefined ? 0 : Number(value));

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
    fatherName: true,
    photoUrl: true,
    idCardFrontUrl: true,
    idCardBackUrl: true,
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

/**
 * A tenant's profile: everything the organization knows about one person, in a
 * single answer.
 *
 * Nothing here is a second copy of the truth. The receivable comes from the
 * tenant's own account, the deposit from the deposit sub-ledger's own summary,
 * and the month a meter was last read from the reading itself — so the profile
 * cannot drift away from the pages that own those figures.
 *
 * Every money total is stated in the base currency, because the individual
 * documents are not: a tenant can hold a USD lease and an AFN deposit, and
 * adding those two together has no meaning.
 */
async function getTenantProfile(organizationId, tenantId) {
  const tenant = await getTenant(organizationId, tenantId);
  const organization = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { baseCurrency: true },
  });

  const [leases, account, ledger, invoices, payments, deposits, billed, collected] = await Promise.all([
    prisma.lease.findMany({
      where: { organizationId, tenantId, deletedAt: null },
      select: {
        id: true, contractNumber: true, startDate: true, endDate: true,
        monthlyRent: true, securityDeposit: true, currency: true,
        paymentDueDay: true, status: true, notes: true,
        apartment: {
          select: {
            id: true, apartmentNumber: true, name: true, type: true, status: true,
            floor: {
              select: {
                id: true, name: true, floorNumber: true,
                building: { select: { id: true, name: true, code: true, address: true } },
              },
            },
          },
        },
      },
      orderBy: [{ startDate: 'desc' }, { createdAt: 'desc' }],
    }),
    getTenantAccount(organizationId, tenantId),
    prisma.tenantLedgerEntry.findMany({
      where: { organizationId, tenantAccount: { tenantId } },
      orderBy: [{ transactionDate: 'desc' }, { createdAt: 'desc' }],
      take: 12,
      select: {
        id: true, type: true, transactionDate: true, description: true,
        debit: true, credit: true, balanceAfter: true, referenceType: true,
      },
    }),
    prisma.invoice.findMany({
      where: {
        organizationId,
        deletedAt: null,
        status: { not: 'CANCELLED' },
        lease: { tenantId, deletedAt: null },
      },
      select: {
        id: true, invoiceNumber: true, invoiceDate: true, dueDate: true,
        currency: true, total: true, paidAmount: true, baseTotal: true, basePaidAmount: true, status: true,
      },
      orderBy: [{ invoiceDate: 'desc' }, { createdAt: 'desc' }],
      take: 10,
    }),
    prisma.payment.findMany({
      where: { organizationId, tenantId },
      select: {
        id: true, paymentNumber: true, paymentDate: true, currency: true,
        amount: true, baseAmount: true, paymentMethod: true, reference: true, status: true,
        receiveAccount: { select: { code: true, name: true } },
      },
      orderBy: [{ paymentDate: 'desc' }, { createdAt: 'desc' }],
      take: 10,
    }),
    securityDepositService.list(organizationId, { page: 1, pageSize: 10, search: '', tenantId }),
    prisma.invoice.aggregate({
      where: {
        organizationId,
        deletedAt: null,
        status: { not: 'CANCELLED' },
        lease: { tenantId, deletedAt: null },
      },
      _sum: { baseTotal: true, basePaidAmount: true },
    }),
    prisma.payment.aggregate({
      where: { organizationId, tenantId, status: 'POSTED' },
      _sum: { baseAmount: true },
    }),
  ]);

  const currentLease = leases.find((lease) => lease.status === 'ACTIVE') || leases[0] || null;
  const thisMonth = shamsiMonthKey(new Date());

  // The meters on the apartment the tenant occupies today, each with the last
  // reading taken from it — and whether that was this month, which is the
  // question the reading rule exists to answer.
  const meters = currentLease
    ? await prisma.meter.findMany({
        where: { apartmentId: currentLease.apartment.id, deletedAt: null },
        select: {
          id: true, meterNumber: true, utilityType: true, unit: true,
          defaultUnitPrice: true, status: true,
          readings: {
            where: { deletedAt: null },
            orderBy: [{ readingDate: 'desc' }, { createdAt: 'desc' }],
            take: 1,
            select: { id: true, readingDate: true, currentReading: true, consumption: true, amount: true, periodMonth: true },
          },
        },
        orderBy: { meterNumber: 'asc' },
      })
    : [];

  const openInvoices = invoices.filter((invoice) => invoice.status !== 'PAID').length;

  return {
    tenant,
    baseCurrency: organization?.baseCurrency || 'AFN',
    currentLease: currentLease && {
      ...currentLease,
      monthlyRent: asNumber(currentLease.monthlyRent),
      securityDeposit: asNumber(currentLease.securityDeposit),
    },
    leases: leases.map((lease) => ({
      ...lease,
      monthlyRent: asNumber(lease.monthlyRent),
      securityDeposit: asNumber(lease.securityDeposit),
    })),
    account: { id: account.id, balance: asNumber(account.balance) },
    ledger: ledger.map((entry) => ({
      ...entry,
      debit: asNumber(entry.debit),
      credit: asNumber(entry.credit),
      balanceAfter: asNumber(entry.balanceAfter),
    })),
    invoices: invoices.map((invoice) => ({
      ...invoice,
      total: asNumber(invoice.total),
      paidAmount: asNumber(invoice.paidAmount),
      balance: asNumber(invoice.total) - asNumber(invoice.paidAmount),
      baseTotal: asNumber(invoice.baseTotal),
      basePaidAmount: asNumber(invoice.basePaidAmount),
    })),
    payments: payments.map((payment) => ({
      ...payment,
      amount: asNumber(payment.amount),
      baseAmount: asNumber(payment.baseAmount),
    })),
    deposits: deposits.items.map((item) => ({
      leaseId: item.lease.id,
      contractNumber: item.lease.contractNumber,
      leaseStatus: item.lease.status,
      apartmentNumber: item.lease.apartment.apartmentNumber,
      apartmentName: item.lease.apartment.name,
      summary: item.summary,
    })),
    meters: meters.map((meter) => {
      const lastReading = meter.readings[0] || null;
      return {
        id: meter.id,
        meterNumber: meter.meterNumber,
        utilityType: meter.utilityType,
        unit: meter.unit,
        defaultUnitPrice: asNumber(meter.defaultUnitPrice),
        status: meter.status,
        lastReading: lastReading && {
          ...lastReading,
          currentReading: asNumber(lastReading.currentReading),
          consumption: asNumber(lastReading.consumption),
          amount: asNumber(lastReading.amount),
          month: lastReading.periodMonth || shamsiMonthKey(lastReading.readingDate),
          monthLabel: shamsiMonthLabel(lastReading.periodMonth || shamsiMonthKey(lastReading.readingDate)),
        },
        readThisMonth: Boolean(lastReading)
          && (lastReading.periodMonth || shamsiMonthKey(lastReading.readingDate)) === thisMonth,
      };
    }),
    thisMonth: { key: thisMonth, label: shamsiMonthLabel(thisMonth) },
    summary: {
      billedBase: asNumber(billed._sum.baseTotal),
      collectedBase: asNumber(collected._sum.baseAmount),
      // The sub-ledger is the receivable, so it is the outstanding figure.
      outstandingBase: asNumber(account.balance),
      billedPaidBase: asNumber(billed._sum.basePaidAmount),
      activeLeases: leases.filter((lease) => lease.status === 'ACTIVE').length,
      totalLeases: leases.length,
      openInvoices,
      depositHeldBase: deposits.items.reduce((total, item) => total + asNumber(item.summary.balance), 0),
      depositRequiredBase: deposits.items.reduce((total, item) => total + asNumber(item.summary.requiredDeposit), 0),
    },
  };
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
  // Read first, so a document that is being replaced — or cleared — can take
  // its file with it once the row no longer points at it.
  const previous = await getTenant(organizationId, tenantId);

  // updateMany keeps the tenant and organization constraints in the write itself.
  const result = await prisma.tenant.updateMany({
    where: { id: tenantId, organizationId, deletedAt: null },
    data,
  });

  if (result.count === 0) throw new AppError('Tenant not found.', 404, 'TENANT_NOT_FOUND');

  discardReplacedDocuments(previous, data);

  return getTenant(organizationId, tenantId);
}

/**
 * Deletes the files of documents this update moved away from, and only those:
 * a path that is still the stored one is left alone, which is what makes
 * re-sending an unchanged form safe.
 */
function discardReplacedDocuments(previous, data) {
  for (const field of tenantDocumentFields) {
    if (!(field in data)) continue;

    const stored = previous[field];
    if (!stored || stored === data[field]) continue;

    removeUpload(stored);
  }
}

async function softDeleteTenant(organizationId, tenantId) {
  const result = await prisma.tenant.updateMany({
    where: { id: tenantId, organizationId, deletedAt: null },
    data: { deletedAt: new Date() },
  });

  if (result.count === 0) throw new AppError('Tenant not found.', 404, 'TENANT_NOT_FOUND');
  return { id: tenantId };
}

module.exports = {
  createTenant,
  getTenant,
  getTenantProfile,
  listTenants,
  softDeleteTenant,
  updateTenant,
};
