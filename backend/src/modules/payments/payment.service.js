const { Prisma } = require('@prisma/client');

const prisma = require('../../lib/prisma');
const Decimal = Prisma.Decimal;
const { ensureDefaultAccounts } = require('../financials/financial-account.service');
const { asMoney, postJournal, voidJournalWithReversal } = require('../financials/journal.service');
const { recalculateInvoices } = require('./payment-allocation.service');
const { postTenantLedgerEntry, reverseTenantLedgerEntry } = require('../tenant-accounts/tenant-account.service');

function fail(code, message) {
  return Object.assign(new Error(message), { code });
}

const paymentSelect = {
  id: true,
  organizationId: true,
  tenantId: true,
  leaseId: true,
  paymentNumber: true,
  paymentDate: true,
  amount: true,
  paymentMethod: true,
  reference: true,
  notes: true,
  status: true,
  voidedAt: true,
  voidReason: true,
  createdAt: true,
  receiveAccount: { select: { id: true, code: true, name: true, type: true } },
  tenant: { select: { id: true, firstName: true, lastName: true, phone: true } },
  lease: {
    select: {
      id: true,
      contractNumber: true,
      apartment: {
        select: {
          id: true,
          apartmentNumber: true,
          name: true,
          floor: { select: { id: true, name: true, floorNumber: true, building: { select: { id: true, name: true } } } },
        },
      },
    },
  },
  allocations: {
    select: {
      id: true,
      amount: true,
      voidedAt: true,
      invoiceItem: {
        select: {
          id: true,
          type: true,
          description: true,
          amount: true,
          invoice: { select: { id: true, invoiceNumber: true, total: true, paidAmount: true, status: true } },
        },
      },
    },
  },
};

function formatPayment(payment) {
  const allocated = payment.status === 'POSTED'
    ? payment.allocations.reduce((total, allocation) => (
      allocation.voidedAt ? total : total.plus(allocation.amount)
    ), new Decimal(0))
    : new Decimal(0);
  return {
    ...payment,
    amount: Number(payment.amount),
    allocatedAmount: Number(allocated),
    unallocatedAmount: Number(new Decimal(payment.amount).minus(allocated)),
    allocations: payment.allocations.map((allocation) => ({
      id: allocation.id,
      amount: Number(allocation.amount),
      voidedAt: allocation.voidedAt,
      invoiceItem: {
        ...allocation.invoiceItem,
        amount: Number(allocation.invoiceItem.amount),
        invoice: {
          ...allocation.invoiceItem.invoice,
          total: Number(allocation.invoiceItem.invoice.total),
          paidAmount: Number(allocation.invoiceItem.invoice.paidAmount),
        },
      },
    })),
  };
}

async function nextPaymentNumber(client, organizationId) {
  await client.$queryRaw`
    SELECT \`id\` FROM \`Organization\`
    WHERE \`id\` = ${organizationId}
    FOR UPDATE
  `;
  const count = await client.payment.count({ where: { organizationId } });
  return `PAY-${String(count + 1).padStart(6, '0')}`;
}

async function assertTenant(client, organizationId, tenantId) {
  const tenant = await client.tenant.findFirst({
    where: { id: tenantId, organizationId, deletedAt: null },
    select: { id: true },
  });
  if (!tenant) throw fail('TENANT_NOT_FOUND', 'Tenant not found.');
  return tenant;
}

async function assertLease(client, organizationId, tenantId, leaseId) {
  if (!leaseId) return null;
  const lease = await client.lease.findFirst({
    where: { id: leaseId, organizationId, tenantId, deletedAt: null },
    select: { id: true },
  });
  if (!lease) throw fail('LEASE_NOT_FOUND', 'Lease not found for this tenant.');
  return lease;
}

/**
 * Return outstanding InvoiceItems grouped by Invoice.
 * Each item includes its paidAmount and balance (derived from allocations).
 */
async function getOutstandingItems(client, organizationId, tenantId, leaseId) {
  const invoices = await client.invoice.findMany({
    where: {
      organizationId,
      deletedAt: null,
      status: { notIn: ['PAID', 'CANCELLED'] },
      lease: { tenantId, deletedAt: null, ...(leaseId ? { id: leaseId } : {}) },
    },
    select: {
      id: true,
      invoiceNumber: true,
      invoiceDate: true,
      dueDate: true,
      total: true,
      items: {
        select: {
          id: true,
          type: true,
          description: true,
          amount: true,
          paymentAllocations: {
            where: { payment: { status: 'POSTED' } },
            select: { amount: true, voidedAt: true },
          },
        },
        orderBy: { createdAt: 'asc' },
      },
    },
    orderBy: [{ invoiceDate: 'asc' }, { createdAt: 'asc' }],
  });

  const result = [];
  for (const invoice of invoices) {
    const outstandingItems = [];
    for (const item of invoice.items) {
      const paid = item.paymentAllocations.reduce((sum, alloc) => {
        if (alloc.voidedAt) return sum;
        return sum.plus(new Decimal(alloc.amount));
      }, new Decimal(0)).toDecimalPlaces(2);
      const balance = new Decimal(item.amount).minus(paid).toDecimalPlaces(2);
      if (balance.greaterThan(0)) {
        outstandingItems.push({
          id: item.id,
          type: item.type,
          description: item.description,
          amount: Number(item.amount),
          paidAmount: Number(paid),
          balance: Number(balance),
        });
      }
    }
    if (outstandingItems.length > 0) {
      result.push({
        id: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        invoiceDate: invoice.invoiceDate,
        dueDate: invoice.dueDate,
        total: Number(invoice.total),
        items: outstandingItems,
      });
    }
  }
  return result;
}

async function outstanding(organizationId, tenantId, leaseId) {
  await assertTenant(prisma, organizationId, tenantId);
  await assertLease(prisma, organizationId, tenantId, leaseId);
  return getOutstandingItems(prisma, organizationId, tenantId, leaseId);
}

/**
 * Validate allocations at the InvoiceItem level.
 *
 * Rules:
 * - Each invoiceItemId must be unique within the payment
 * - Allocation amount must be > 0
 * - Allocation amount must be <= item outstanding balance
 * - Total allocations must be <= payment amount
 * - Item must belong to the tenant's invoices
 */
async function validateAllocations(client, organizationId, tenantId, leaseId, allocations, paymentAmount) {
  const seen = new Set();
  let allocated = new Decimal(0);
  const verified = [];

  for (const allocation of allocations) {
    if (seen.has(allocation.invoiceItemId)) {
      throw fail('DUPLICATE_ALLOCATION', 'An invoice item can only be allocated once per payment.');
    }
    seen.add(allocation.invoiceItemId);

    const amount = asMoney(allocation.amount);
    if (amount.lessThanOrEqualTo(0)) {
      throw fail('INVALID_ALLOCATION', 'Allocation amount must be greater than zero.');
    }

    // Verify the item exists, belongs to this tenant's invoices, and is on an open invoice
    const invoiceItem = await client.invoiceItem.findFirst({
      where: {
        id: allocation.invoiceItemId,
        invoice: {
          organizationId,
          deletedAt: null,
          status: { notIn: ['PAID', 'CANCELLED'] },
          lease: { tenantId, deletedAt: null, ...(leaseId ? { id: leaseId } : {}) },
        },
      },
      select: {
        id: true,
        amount: true,
        invoice: { select: { id: true } },
      },
    });
    if (!invoiceItem) {
      throw fail('INVOICE_ITEM_NOT_FOUND', 'Invoice item not found for this payment.');
    }

    // Compute current paid amount for this item
    const aggregate = await client.paymentAllocation.aggregate({
      where: {
        invoiceItemId: invoiceItem.id,
        voidedAt: null,
        payment: { status: 'POSTED' },
      },
      _sum: { amount: true },
    });
    const currentPaid = new Decimal(aggregate._sum.amount || 0).toDecimalPlaces(2);
    const balance = new Decimal(invoiceItem.amount).minus(currentPaid).toDecimalPlaces(2);

    if (amount.greaterThan(balance)) {
      throw fail('ALLOCATION_EXCEEDS_BALANCE', 'Allocation exceeds the item outstanding balance.');
    }

    allocated = allocated.plus(amount);
    verified.push({ invoiceItemId: invoiceItem.id, amount });
  }

  if (allocated.greaterThan(paymentAmount)) {
    throw fail('ALLOCATION_EXCEEDS_PAYMENT', 'Total allocations cannot exceed the payment amount.');
  }

  return { allocations: verified, allocated };
}

async function createPayment(organizationId, data) {
  return prisma.$transaction(async (tx) => {
    await assertTenant(tx, organizationId, data.tenantId);
    await assertLease(tx, organizationId, data.tenantId, data.leaseId);
    const accounts = await ensureDefaultAccounts(tx, organizationId);
    const receiveAccount = await tx.financialAccount.findFirst({
      where: { id: data.receiveAccountId, organizationId, deletedAt: null, isActive: true, type: 'ASSET' },
      select: { id: true },
    });
    if (!receiveAccount) throw fail('RECEIVE_ACCOUNT_NOT_FOUND', 'Receive account not found.');

    const amount = asMoney(data.amount);
    const allocationResult = await validateAllocations(
      tx, organizationId, data.tenantId, data.leaseId, data.allocations, amount,
    );
    const remaining = amount.minus(allocationResult.allocated);
    const paymentNumber = await nextPaymentNumber(tx, organizationId);

    const payment = await tx.payment.create({
      data: {
        organizationId,
        tenantId: data.tenantId,
        leaseId: data.leaseId || null,
        paymentNumber,
        paymentDate: data.paymentDate,
        amount,
        receiveAccountId: receiveAccount.id,
        paymentMethod: data.paymentMethod,
        reference: data.reference || null,
        notes: data.notes || null,
        allocations: { create: allocationResult.allocations },
      },
      select: { id: true },
    });

    // Accounting: Dr Cash, Cr Accounts Receivable (allocated), Cr Tenant Advances (unallocated)
    await postJournal(tx, organizationId, {
      transactionDate: data.paymentDate,
      referenceType: 'PAYMENT',
      referenceId: payment.id,
      description: `Payment ${paymentNumber}`,
      lines: [
        { accountId: receiveAccount.id, tenantId: data.tenantId, debit: amount, credit: 0, description: `Receipt ${paymentNumber}` },
        ...(allocationResult.allocated.greaterThan(0) ? [{ accountId: accounts['1100'].id, tenantId: data.tenantId, debit: 0, credit: allocationResult.allocated, description: `Accounts receivable settlement ${paymentNumber}` }] : []),
        ...(remaining.greaterThan(0) ? [{ accountId: accounts['4000'].id, tenantId: data.tenantId, debit: 0, credit: remaining, description: `Unallocated payment ${paymentNumber}` }] : []),
      ],
    });

    // Tenant ledger: credit receivable for the allocated portion
    if (allocationResult.allocated.greaterThan(0)) {
      await postTenantLedgerEntry(tx, organizationId, {
        tenantId: data.tenantId,
        type: 'PAYMENT',
        transactionDate: data.paymentDate,
        referenceType: 'PAYMENT',
        referenceId: payment.id,
        description: `Payment ${paymentNumber}`,
        debit: 0,
        credit: allocationResult.allocated,
      });
    }

    // Recalculate affected invoices (collect unique invoice IDs from allocated items)
    const affectedInvoiceIds = [];
    for (const alloc of allocationResult.allocations) {
      const item = await tx.invoiceItem.findUnique({
        where: { id: alloc.invoiceItemId },
        select: { invoiceId: true },
      });
      if (item) affectedInvoiceIds.push(item.invoiceId);
    }
    await recalculateInvoices(tx, affectedInvoiceIds);

    return getPaymentFromClient(tx, organizationId, payment.id);
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

async function getPaymentFromClient(client, organizationId, id) {
  const payment = await client.payment.findFirst({
    where: { id, organizationId },
    select: paymentSelect,
  });
  if (!payment) throw fail('PAYMENT_NOT_FOUND', 'Payment not found.');
  return formatPayment(payment);
}

async function getPayment(organizationId, id) {
  return getPaymentFromClient(prisma, organizationId, id);
}

async function listPayments(organizationId, query) {
  const where = {
    organizationId,
    ...(query.tenantId ? { tenantId: query.tenantId } : {}),
    ...(query.leaseId ? { leaseId: query.leaseId } : {}),
    ...(query.status ? { status: query.status } : {}),
    ...(query.dateFrom || query.dateTo ? { paymentDate: { ...(query.dateFrom ? { gte: query.dateFrom } : {}), ...(query.dateTo ? { lte: query.dateTo } : {}) } } : {}),
    ...(query.search ? { OR: [
      { paymentNumber: { contains: query.search } },
      { reference: { contains: query.search } },
      { tenant: { firstName: { contains: query.search } } },
      { tenant: { lastName: { contains: query.search } } },
    ] } : {}),
  };
  const [items, total] = await prisma.$transaction([
    prisma.payment.findMany({ where, select: paymentSelect, orderBy: [{ paymentDate: 'desc' }, { createdAt: 'desc' }], skip: (query.page - 1) * query.pageSize, take: query.pageSize }),
    prisma.payment.count({ where }),
  ]);
  return { items: items.map(formatPayment), pagination: { page: query.page, pageSize: query.pageSize, total, totalPages: Math.ceil(total / query.pageSize) } };
}

async function voidPayment(organizationId, id, voidReason) {
  return prisma.$transaction(async (tx) => {
    const payment = await tx.payment.findFirst({
      where: { id, organizationId },
      select: { id: true, tenantId: true, paymentDate: true, paymentNumber: true, status: true, allocations: { select: { invoiceItemId: true, voidedAt: true } } },
    });
    if (!payment) throw fail('PAYMENT_NOT_FOUND', 'Payment not found.');
    if (payment.status === 'VOIDED') throw fail('PAYMENT_ALREADY_VOIDED', 'Payment is already voided.');

    await tx.payment.update({
      where: { id },
      data: { status: 'VOIDED', voidReason, voidedAt: new Date() },
    });
    await tx.paymentAllocation.updateMany({ where: { paymentId: id, voidedAt: null }, data: { voidedAt: new Date() } });
    await reverseTenantLedgerEntry(tx, organizationId, 'PAYMENT', id, payment.paymentDate, `Void payment ${payment.paymentNumber}: ${voidReason}`);
    await voidJournalWithReversal(tx, organizationId, 'PAYMENT', id, payment.paymentDate, `Void payment ${payment.paymentNumber}: ${voidReason}`);

    // Recalculate affected invoices
    const affectedInvoiceIds = [];
    for (const alloc of payment.allocations) {
      if (!alloc.voidedAt) {
        const item = await tx.invoiceItem.findUnique({ where: { id: alloc.invoiceItemId }, select: { invoiceId: true } });
        if (item) affectedInvoiceIds.push(item.invoiceId);
      }
    }
    await recalculateInvoices(tx, affectedInvoiceIds);
    return getPaymentFromClient(tx, organizationId, id);
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

module.exports = {
  createPayment,
  getPayment,
  listPayments,
  outstanding,
  voidPayment,
};
