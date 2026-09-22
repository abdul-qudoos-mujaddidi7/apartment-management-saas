const { Prisma } = require('@prisma/client');

const prisma = require('../../lib/prisma');
const Decimal = Prisma.Decimal;
const { toBase } = require('../../lib/money');
const { priceDocument } = require('../currency/currency.service');

function fail(code, message) {
  return Object.assign(new Error(message), { code });
}

function scope(organizationId) {
  return {
    organizationId,
    deletedAt: null,
  };
}

const leaseSelect = {
  id: true,
  contractNumber: true,
  status: true,
  securityDeposit: true,
  tenant: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      phone: true,
    },
  },
  apartment: {
    select: {
      id: true,
      apartmentNumber: true,
      floor: {
        select: {
          id: true,
          name: true,
          floorNumber: true,
          building: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      },
    },
  },
};

const transactionSelect = {
  id: true,
  type: true,
  currency: true,
  exchangeRate: true,
  amount: true,
  baseAmount: true,
  transactionDate: true,
  reference: true,
  notes: true,
  status: true,
  voidReason: true,
  voidedAt: true,
  createdAt: true,
};

function serializeDecimal(value) {
  return Number(value);
}

function depositStatus(summary) {
  if (summary.received.isZero()) return 'NOT_PAID';
  if (summary.received.lt(summary.requiredDeposit)) return 'PARTIAL';
  if (summary.balance.isZero()) return 'SETTLED';

  if (summary.deductions.plus(summary.refunded).gt(0)) {
    return 'PARTIALLY_USED';
  }

  return 'HELD';
}

async function getLease(organizationId, leaseId, client = prisma) {
  const lease = await client.lease.findFirst({
    where: {
      id: leaseId,
      ...scope(organizationId),
      tenant: {
        organizationId,
        deletedAt: null,
      },
      apartment: {
        organizationId,
        deletedAt: null,
        floor: {
          deletedAt: null,
          building: {
            organizationId,
            deletedAt: null,
          },
        },
      },
    },
    select: leaseSelect,
  });

  if (!lease) {
    throw fail('LEASE_NOT_FOUND', 'Lease not found.');
  }

  return lease;
}

/**
 * Deposit status is judged in the organization's base currency.
 *
 * The required deposit lives on the lease as a base-currency figure, so the
 * transactions have to be compared against it in the same currency; a deposit
 * taken in USD, a deduction made in EUR and the remaining balance are then all
 * one meaningful number rather than three that cannot be added up.
 */
async function getSummary(organizationId, lease, client = prisma) {
  const grouped = await client.securityDepositTransaction.groupBy({
    by: ['type'],
    where: {
      organizationId,
      leaseId: lease.id,
      status: 'POSTED',
    },
    _sum: {
      baseAmount: true,
      amount: true,
    },
  });

  const amounts = Object.fromEntries(
    grouped.map((row) => [row.type, row._sum.baseAmount ?? row._sum.amount ?? new Decimal(0)]),
  );

  const requiredDeposit = new Decimal(lease.securityDeposit);
  const received = amounts.RECEIVED || new Decimal(0);
  const deductions = amounts.DEDUCTION || new Decimal(0);
  const refunded = amounts.REFUND || new Decimal(0);
  const balance = received.minus(deductions).minus(refunded);
  const remainingToCollect = Decimal.max(
    requiredDeposit.minus(received),
    new Decimal(0),
  );

  const summary = {
    requiredDeposit,
    received,
    deductions,
    refunded,
    balance,
    remainingToCollect,
  };

  return {
    ...summary,
    status: depositStatus(summary),
  };
}

function formatSummary(summary) {
  return Object.fromEntries(
    Object.entries(summary).map(([key, value]) => [
      key,
      value instanceof Decimal ? serializeDecimal(value) : value,
    ]),
  );
}

function buildLeaseWhere(organizationId, query) {
  return {
    ...scope(organizationId),
    securityDeposit: { gt: 0 },

    ...(query.tenantId ? { tenantId: query.tenantId } : {}),

    ...(query.buildingId
      ? {
          apartment: {
            organizationId,
            deletedAt: null,
            floor: {
              deletedAt: null,
              building: {
                id: query.buildingId,
                organizationId,
                deletedAt: null,
              },
            },
          },
        }
      : {}),

    ...(query.leaseStatus ? { status: query.leaseStatus } : {}),

    ...(query.search
      ? {
          OR: [
            { contractNumber: { contains: query.search } },
            { tenant: { firstName: { contains: query.search } } },
            { tenant: { lastName: { contains: query.search } } },
            { tenant: { phone: { contains: query.search } } },
            { apartment: { apartmentNumber: { contains: query.search } } },
          ],
        }
      : {}),
  };
}

async function list(organizationId, query) {
  const where = buildLeaseWhere(organizationId, query);

  // Deposit status is calculated from transactions, not stored on Lease.
  // When it is requested, calculate first and paginate after filtering.
  if (query.depositStatus) {
    const leases = await prisma.lease.findMany({
      where,
      select: leaseSelect,
      orderBy: { createdAt: 'desc' },
    });

    const allItems = await Promise.all(
      leases.map(async (lease) => ({
        lease,
        summary: formatSummary(await getSummary(organizationId, lease)),
      })),
    );

    const filtered = allItems.filter(
      (item) => item.summary.status === query.depositStatus,
    );

    const total = filtered.length;
    const start = (query.page - 1) * query.pageSize;
    const items = filtered.slice(start, start + query.pageSize);

    return {
      items,
      pagination: {
        page: query.page,
        pageSize: query.pageSize,
        total,
        totalPages: Math.ceil(total / query.pageSize),
      },
    };
  }

  const [leases, total] = await prisma.$transaction([
    prisma.lease.findMany({
      where,
      select: leaseSelect,
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      orderBy: { createdAt: 'desc' },
    }),
    prisma.lease.count({ where }),
  ]);

  const items = await Promise.all(
    leases.map(async (lease) => ({
      lease,
      summary: formatSummary(await getSummary(organizationId, lease)),
    })),
  );

  return {
    items,
    pagination: {
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: Math.ceil(total / query.pageSize),
    },
  };
}

async function details(organizationId, leaseId) {
  const lease = await getLease(organizationId, leaseId);

  const [summary, transactions] = await Promise.all([
    getSummary(organizationId, lease),
    prisma.securityDepositTransaction.findMany({
      where: {
        organizationId,
        leaseId,
      },
      select: transactionSelect,
      orderBy: [{ transactionDate: 'asc' }, { createdAt: 'asc' }],
    }),
  ]);

  return {
    lease,
    summary: formatSummary(summary),
    transactions: transactions.map((transaction) => ({
      ...transaction,
      exchangeRate: Number(transaction.exchangeRate ?? 1),
      amount: serializeDecimal(transaction.amount),
      baseAmount: serializeDecimal(transaction.baseAmount ?? transaction.amount),
    })),
  };
}

async function create(organizationId, leaseId, data) {
  return prisma.$transaction(
    async (transaction) => {
      const lease = await getLease(organizationId, leaseId, transaction);
      const summary = await getSummary(organizationId, lease, transaction);
      const amount = new Decimal(data.amount);
      // The amount is what the tenant actually handed over or was charged back,
      // in its own currency; `baseAmount` is what the deposit balances move by.
      const pricing = await priceDocument(transaction, organizationId, {
        currency: data.currency,
        date: data.transactionDate,
      });
      const baseAmount = toBase(amount, pricing.exchangeRate);

      // Compare in base currency, which is what the summary is stated in.
      if (
        data.type === 'RECEIVED' &&
        summary.received.plus(baseAmount).gt(summary.requiredDeposit)
      ) {
        throw fail(
          'DEPOSIT_OVERPAYMENT',
          'Received amount cannot exceed the required security deposit.',
        );
      }

      if (data.type === 'DEDUCTION' && baseAmount.gt(summary.balance)) {
        throw fail(
          'DEDUCTION_EXCEEDS_BALANCE',
          'Deduction amount cannot exceed the current security deposit balance.',
        );
      }

      if (data.type === 'REFUND' && baseAmount.gt(summary.balance)) {
        throw fail(
          'REFUND_EXCEEDS_BALANCE',
          'Refund amount cannot exceed the current security deposit balance.',
        );
      }

      const created = await transaction.securityDepositTransaction.create({
        data: {
          type: data.type,
          currency: pricing.currency,
          exchangeRate: pricing.exchangeRate,
          amount,
          baseAmount,
          transactionDate: data.transactionDate,
          reference: data.reference,
          notes: data.notes,
          leaseId,
          organizationId,
        },
        select: transactionSelect,
      });

      return {
        ...created,
        exchangeRate: Number(created.exchangeRate ?? 1),
        amount: serializeDecimal(created.amount),
        baseAmount: serializeDecimal(created.baseAmount),
      };
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    },
  );
}

async function voidTransaction(organizationId, transactionId, reason) {
  return prisma.$transaction(
    async (transaction) => {
      const record = await transaction.securityDepositTransaction.findFirst({
        where: {
          id: transactionId,
          organizationId,
        },
        select: {
          id: true,
          status: true,
        },
      });

      if (!record) {
        throw fail(
          'TRANSACTION_NOT_FOUND',
          'Security deposit transaction not found.',
        );
      }

      if (record.status === 'VOIDED') {
        throw fail(
          'TRANSACTION_ALREADY_VOIDED',
          'This transaction has already been voided.',
        );
      }

      const updated = await transaction.securityDepositTransaction.update({
        where: { id: transactionId },
        data: {
          status: 'VOIDED',
          voidReason: reason,
          voidedAt: new Date(),
        },
        select: transactionSelect,
      });

      return {
        ...updated,
        exchangeRate: Number(updated.exchangeRate ?? 1),
        amount: serializeDecimal(updated.amount),
        baseAmount: serializeDecimal(updated.baseAmount),
      };
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    },
  );
}

module.exports = {
  list,
  details,
  create,
  voidTransaction,
};
