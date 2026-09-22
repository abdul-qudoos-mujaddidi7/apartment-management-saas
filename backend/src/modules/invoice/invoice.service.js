const { Prisma } = require('@prisma/client');

const prisma = require('../../lib/prisma');
const Decimal = Prisma.Decimal;
const { ensureDefaultAccounts } = require('../financials/financial-account.service');
const { postJournal, voidJournalWithReversal } = require('../financials/journal.service');
const { postTenantLedgerEntry, replaceInvoiceLedgerEntry, reverseTenantLedgerEntry } = require('../tenant-accounts/tenant-account.service');

function serviceError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function leaseScope(organizationId) {
  return {
    organizationId,
    deletedAt: null,
    tenant: { deletedAt: null },
    apartment: {
      deletedAt: null,
      floor: {
        deletedAt: null,
        building: { organizationId, deletedAt: null },
      },
    },
  };
}

function invoiceSelect(includeItems = false) {
  return {
    id: true,
    organizationId: true,
    leaseId: true,
    invoiceNumber: true,
    invoiceDate: true,
    dueDate: true,
    subtotal: true,
    total: true,
    paidAmount: true,
    status: true,
    notes: true,
    createdAt: true,
    updatedAt: true,
    ...(includeItems ? {
      items: {
        select: {
          id: true,
          meterReadingId: true,
          type: true,
          description: true,
          quantity: true,
          unitPrice: true,
          amount: true,
          paymentAllocations: {
            where: { payment: { status: 'POSTED' } },
            select: { amount: true, voidedAt: true },
          },
        },
        orderBy: { createdAt: 'asc' },
      },
    } : {}),
    lease: {
      select: {
        id: true,
        contractNumber: true,
        monthlyRent: true,
        tenant: { select: { id: true, firstName: true, lastName: true } },
        apartment: {
          select: {
            id: true,
            apartmentNumber: true,
            name: true,
            floor: {
              select: {
                id: true,
                floorNumber: true,
                name: true,
                building: { select: { id: true, name: true } },
              },
            },
          },
        },
      },
    },
  };
}

function todayAtMidnight() {
  const today = new Date();
  return new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
}

function displayStatus(invoice) {
  if (
    invoice.status !== 'CANCELLED'
    && invoice.status !== 'PAID'
    && invoice.dueDate
    && invoice.dueDate < todayAtMidnight()
    && new Decimal(invoice.paidAmount).lessThan(invoice.total)
  ) {
    return 'OVERDUE';
  }
  return invoice.status;
}

function sumItemAllocations(allocations) {
  return (allocations || []).reduce((total, alloc) => {
    if (alloc.voidedAt) return total;
    return total.plus(new Decimal(alloc.amount));
  }, new Decimal(0)).toDecimalPlaces(2);
}

function deriveItemStatus(amount, paidAmount) {
  if (paidAmount.greaterThanOrEqualTo(amount)) return 'PAID';
  if (paidAmount.isZero()) return 'UNPAID';
  return 'PARTIALLY_PAID';
}

function formatInvoice(invoice) {
  if (!invoice) return invoice;

  // Derive paidAmount from items
  let derivedPaidAmount = new Decimal(0);
  let itemsFormatted = [];

  if (invoice.items) {
    itemsFormatted = invoice.items.map((item) => {
      const itemPaid = sumItemAllocations(item.paymentAllocations);
      derivedPaidAmount = derivedPaidAmount.plus(itemPaid);
      const itemBalance = new Decimal(item.amount).minus(itemPaid).toDecimalPlaces(2);
      return {
        id: item.id,
        meterReadingId: item.meterReadingId,
        type: item.type,
        description: item.description,
        quantity: Number(item.quantity),
        unitPrice: Number(item.unitPrice),
        amount: Number(item.amount),
        paidAmount: Number(itemPaid),
        balance: Number(itemBalance),
        paymentStatus: deriveItemStatus(new Decimal(item.amount), itemPaid),
      };
    });
    derivedPaidAmount = derivedPaidAmount.toDecimalPlaces(2);
  } else {
    derivedPaidAmount = new Decimal(invoice.paidAmount);
  }

  const derivedStatus = {
    ...invoice,
    paidAmount: Number(derivedPaidAmount),
    total: Number(invoice.total),
  };

  return {
    ...invoice,
    subtotal: Number(invoice.subtotal),
    total: Number(invoice.total),
    paidAmount: Number(derivedPaidAmount),
    status: displayStatus(derivedStatus),
    lease: {
      ...invoice.lease,
      monthlyRent: Number(invoice.lease.monthlyRent),
    },
    items: itemsFormatted,
  };
}

function preparedItems(items) {
  return items.map((item) => {
    const quantity = new Decimal(item.quantity);
    const unitPrice = new Decimal(item.unitPrice);
    const amount = quantity.times(unitPrice).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

    return {
      type: item.type,
      description: item.description,
      quantity,
      unitPrice,
      amount,
    };
  });
}

function utilityDescription(reading) {
  const name = reading.meter.utilityType.charAt(0) + reading.meter.utilityType.slice(1).toLowerCase();
  return `${name} - Meter ${reading.meter.meterNumber} - ${new Decimal(reading.consumption).toFixed(3)} ${reading.meter.unit}`;
}

async function prepareInvoiceItems(client, organizationId, lease, sourceItems) {
  const utilityReadingIds = new Set();
  const items = [];

  for (const item of sourceItems) {
    if (!item.meterReadingId) {
      items.push(preparedItems([item])[0]);
      continue;
    }

    if (utilityReadingIds.has(item.meterReadingId)) {
      throw serviceError('METER_READING_NOT_AVAILABLE', 'A meter reading can only be billed once per invoice.');
    }
    utilityReadingIds.add(item.meterReadingId);

    // Serialise billing attempts for the same reading. The unique InvoiceItem
    // relation is the final database guard if another transaction races us.
    await client.$queryRaw`
      SELECT \`id\`
      FROM \`MeterReading\`
      WHERE \`id\` = ${item.meterReadingId}
      FOR UPDATE
    `;

    const reading = await client.meterReading.findFirst({
      where: {
        id: item.meterReadingId,
        deletedAt: null,
        invoiceItem: null,
        meter: {
          apartmentId: lease.apartmentId,
          deletedAt: null,
          apartment: {
            deletedAt: null,
            floor: { deletedAt: null, building: { organizationId, deletedAt: null } },
          },
        },
      },
      select: {
        id: true,
        consumption: true,
        unitPrice: true,
        amount: true,
        meter: { select: { meterNumber: true, utilityType: true, unit: true } },
      },
    });

    if (!reading) {
      throw serviceError('METER_READING_NOT_AVAILABLE', 'Meter reading is unavailable, already billed, or belongs to another apartment.');
    }
    if (new Decimal(reading.unitPrice).lessThanOrEqualTo(0)) {
      throw serviceError('METER_READING_PRICE_REQUIRED', 'Set a positive meter unit price before billing this reading.');
    }
    if (item.type !== reading.meter.utilityType) {
      throw serviceError('METER_READING_TYPE_MISMATCH', 'Meter reading utility type does not match the invoice item type.');
    }

    items.push({
      meterReadingId: reading.id,
      type: reading.meter.utilityType,
      description: utilityDescription(reading),
      quantity: new Decimal(reading.consumption),
      unitPrice: new Decimal(reading.unitPrice),
      amount: new Decimal(reading.amount),
    });
  }

  return items;
}

function calculateTotals(items) {
  const subtotal = items.reduce((total, item) => total.plus(item.amount), new Decimal(0));
  return { subtotal, total: subtotal };
}

async function assertLeaseInOrganization(client, organizationId, leaseId) {
  const lease = await client.lease.findFirst({
    where: { id: leaseId, ...leaseScope(organizationId) },
    select: { id: true, tenantId: true, apartmentId: true },
  });
  if (!lease) throw serviceError('LEASE_NOT_FOUND', 'Lease not found.');
  return lease;
}

const incomeAccountCodes = {
  RENT: '4000',
  ELECTRICITY: '4010',
  WATER: '4020',
  GAS: '4030',
};

async function postInvoiceJournal(client, organizationId, invoice, tenantId, items) {
  const accounts = await ensureDefaultAccounts(client, organizationId);
  const creditByAccount = items.reduce((totals, item) => {
    const code = incomeAccountCodes[item.type];
    if (!code) return totals;
    totals[code] = (totals[code] || new Decimal(0)).plus(item.amount);
    return totals;
  }, {});

  const lines = [
    {
      accountId: accounts['1100'].id,
      tenantId,
      debit: invoice.total,
      credit: 0,
      description: `Accounts receivable for ${invoice.invoiceNumber}`,
    },
    ...Object.entries(creditByAccount).map(([code, amount]) => ({
      accountId: accounts[code].id,
      credit: amount,
      debit: 0,
      description: `Income for ${invoice.invoiceNumber}`,
    })),
  ];

  return postJournal(client, organizationId, {
    transactionDate: invoice.invoiceDate,
    referenceType: 'INVOICE',
    referenceId: invoice.id,
    description: `Invoice ${invoice.invoiceNumber}`,
    lines,
  });
}

async function refreshInvoiceJournal(client, organizationId, invoice, tenantId, items) {
  const current = await client.journal.findUnique({
    where: {
      organizationId_referenceType_referenceId: {
        organizationId,
        referenceType: 'INVOICE',
        referenceId: invoice.id,
      },
    },
  });
  if (!current || current.status === 'VOIDED') {
    return postInvoiceJournal(client, organizationId, invoice, tenantId, items);
  }

  const accounts = await ensureDefaultAccounts(client, organizationId);
  const creditByAccount = items.reduce((totals, item) => {
    const code = incomeAccountCodes[item.type];
    if (!code) return totals;
    totals[code] = (totals[code] || new Decimal(0)).plus(item.amount);
    return totals;
  }, {});
  const lines = [
    { accountId: accounts['1100'].id, tenantId, debit: invoice.total, credit: 0, description: `Accounts receivable for ${invoice.invoiceNumber}` },
    ...Object.entries(creditByAccount).map(([code, amount]) => ({ accountId: accounts[code].id, debit: 0, credit: amount, description: `Income for ${invoice.invoiceNumber}` })),
  ];

  await client.journalLine.deleteMany({ where: { journalId: current.id } });
  return client.journal.update({
    where: { id: current.id },
    data: {
      transactionDate: invoice.invoiceDate,
      description: `Invoice ${invoice.invoiceNumber}`,
      lines: { create: lines },
    },
  });
}

async function nextInvoiceNumber(client, organizationId) {
  // Every invoice writer for an organization locks the same parent row first.
  // The count includes soft-deleted records, so a number can never be reused.
  await client.$queryRaw`
    SELECT \`id\`
    FROM \`Organization\`
    WHERE \`id\` = ${organizationId}
    FOR UPDATE
  `;
  const count = await client.invoice.count({ where: { organizationId } });
  return `INV-${String(count + 1).padStart(6, '0')}`;
}

async function listInvoices(organizationId, filters) {
  const {
    page, pageSize, search, buildingId, floorId, apartmentId,
    tenantId, leaseId, status, dateFrom, dateTo,
  } = filters;

  const lease = {
    ...leaseScope(organizationId),
    ...(leaseId ? { id: leaseId } : {}),
    ...(tenantId ? { tenantId } : {}),
    apartment: {
      deletedAt: null,
      ...(apartmentId ? { id: apartmentId } : {}),
      floor: {
        deletedAt: null,
        ...(floorId ? { id: floorId } : {}),
        building: { organizationId, deletedAt: null, ...(buildingId ? { id: buildingId } : {}) },
      },
    },
  };
  const overdueWhere = status === 'OVERDUE'
    ? { status: { in: ['UNPAID', 'PARTIALLY_PAID', 'OVERDUE'] }, dueDate: { lt: todayAtMidnight() } }
    : status ? { status } : {};
  const where = {
    organizationId,
    deletedAt: null,
    lease,
    ...overdueWhere,
    ...(dateFrom || dateTo ? {
      invoiceDate: {
        ...(dateFrom ? { gte: dateFrom } : {}),
        ...(dateTo ? { lte: dateTo } : {}),
      },
    } : {}),
    ...(search ? {
      OR: [
        { invoiceNumber: { contains: search } },
        { lease: { contractNumber: { contains: search } } },
        { lease: { tenant: { firstName: { contains: search } } } },
        { lease: { tenant: { lastName: { contains: search } } } },
        { lease: { apartment: { apartmentNumber: { contains: search } } } },
        { lease: { apartment: { floor: { building: { name: { contains: search } } } } } },
      ],
    } : {}),
  };

  const [items, total] = await prisma.$transaction([
    prisma.invoice.findMany({
      where,
      // Keep enough line-item data in the invoice register to display the
      // charge type without introducing a request per table row.
      select: invoiceSelect(true),
      orderBy: [{ invoiceDate: 'desc' }, { createdAt: 'desc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.invoice.count({ where }),
  ]);

  return {
    items: items.map(formatInvoice),
    pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
  };
}

async function getInvoice(organizationId, id) {
  const invoice = await prisma.invoice.findFirst({
    where: { id, organizationId, deletedAt: null, lease: leaseScope(organizationId) },
    select: invoiceSelect(true),
  });
  if (!invoice) throw serviceError('INVOICE_NOT_FOUND', 'Invoice not found.');
  return formatInvoice(invoice);
}

async function getInvoiceFromTransaction(client, id) {
  const invoice = await client.invoice.findUnique({ where: { id }, select: invoiceSelect(true) });
  return formatInvoice(invoice);
}

async function createInvoice(organizationId, data) {
  try {
    return await prisma.$transaction(async (tx) => {
      const lease = await assertLeaseInOrganization(tx, organizationId, data.leaseId);
      const items = await prepareInvoiceItems(tx, organizationId, lease, data.items);
      const totals = calculateTotals(items);
      const invoiceNumber = await nextInvoiceNumber(tx, organizationId);
      const invoice = await tx.invoice.create({
        data: {
          organizationId,
          leaseId: data.leaseId,
          invoiceNumber,
          invoiceDate: data.invoiceDate,
          dueDate: data.dueDate,
          notes: data.notes ?? null,
          paidAmount: 0,
          status: 'UNPAID',
          ...totals,
        },
        select: { id: true },
      });
      await tx.invoiceItem.createMany({
        data: items.map((item) => ({ ...item, invoiceId: invoice.id })),
      });
      const created = await getInvoiceFromTransaction(tx, invoice.id);
      await postTenantLedgerEntry(tx, organizationId, {
        tenantId: lease.tenantId,
        type: 'INVOICE',
        transactionDate: created.invoiceDate,
        referenceType: 'INVOICE',
        referenceId: created.id,
        description: `Invoice ${created.invoiceNumber}`,
        debit: created.total,
        credit: 0,
      });
      await postInvoiceJournal(tx, organizationId, created, lease.tenantId, items);
      return created;
    });
  } catch (error) {
    if (error.code === 'P2002') {
      throw serviceError('METER_READING_NOT_AVAILABLE', 'Meter reading was billed by another invoice. Refresh and try again.');
    }
    throw error;
  }
}

async function updateInvoice(organizationId, id, data) {
  return prisma.$transaction(async (tx) => {
    const current = await tx.invoice.findFirst({
      where: { id, organizationId, deletedAt: null, lease: leaseScope(organizationId) },
      select: {
        id: true,
        invoiceDate: true,
        dueDate: true,
        notes: true,
        status: true,
        paidAmount: true,
        items: { where: { meterReadingId: { not: null } }, select: { id: true } },
      },
    });
    if (!current) throw serviceError('INVOICE_NOT_FOUND', 'Invoice not found.');
    if (current.status === 'CANCELLED') throw serviceError('INVOICE_CANCELLED', 'Cancelled invoices cannot be edited.');
    if (new Decimal(current.paidAmount).greaterThan(0)) throw serviceError('INVOICE_HAS_PAYMENTS', 'Invoices with payments cannot be edited.');
    if (current.items.length > 0) throw serviceError('INVOICE_HAS_METER_READINGS', 'Invoices with utility readings must be cancelled and recreated to preserve the billing audit.');

    const invoiceDate = data.invoiceDate || current.invoiceDate;
    const dueDate = data.dueDate === undefined ? current.dueDate : data.dueDate;
    if (dueDate && dueDate < invoiceDate) {
      throw serviceError('INVALID_INVOICE_DATES', 'Due date cannot be before invoice date.');
    }

    const updateData = {
      invoiceDate,
      dueDate,
      notes: data.notes === undefined ? current.notes : data.notes,
    };
    if (data.items) {
      const items = preparedItems(data.items);
      const totals = calculateTotals(items);
      updateData.subtotal = totals.subtotal;
      updateData.total = totals.total;
      updateData.items = { deleteMany: {}, create: items };
    }

    await tx.invoice.update({ where: { id }, data: updateData });
    if (data.items) {
      const refreshed = await getInvoiceFromTransaction(tx, id);
      const lease = await assertLeaseInOrganization(tx, organizationId, refreshed.leaseId);
      await replaceInvoiceLedgerEntry(tx, organizationId, {
        tenantId: lease.tenantId,
        invoiceId: refreshed.id,
        transactionDate: refreshed.invoiceDate,
        description: `Invoice ${refreshed.invoiceNumber}`,
        amount: refreshed.total,
      });
      await refreshInvoiceJournal(tx, organizationId, refreshed, lease.tenantId, preparedItems(data.items));
    }
    return getInvoiceFromTransaction(tx, id);
  });
}

async function cancelInvoice(organizationId, id) {
  return prisma.$transaction(async (tx) => {
    const invoice = await tx.invoice.findFirst({
      where: { id, organizationId, deletedAt: null, lease: leaseScope(organizationId) },
      select: { id: true, paidAmount: true, invoiceDate: true, invoiceNumber: true },
    });
    if (!invoice) throw serviceError('INVOICE_NOT_FOUND', 'Invoice not found.');
    if (new Decimal(invoice.paidAmount).greaterThan(0)) {
      throw serviceError('INVOICE_HAS_PAYMENTS', 'Invoices with payments cannot be cancelled.');
    }
    await tx.invoice.update({ where: { id }, data: { status: 'CANCELLED' } });
    // Keep cancelled financial records, but release only the operational link so
    // a reading can be safely billed on a future invoice.
    await tx.invoiceItem.updateMany({ where: { invoiceId: id, meterReadingId: { not: null } }, data: { meterReadingId: null } });
    await reverseTenantLedgerEntry(tx, organizationId, 'INVOICE', id, invoice.invoiceDate, `Cancellation of ${invoice.invoiceNumber}`);
    await voidJournalWithReversal(tx, organizationId, 'INVOICE', id, invoice.invoiceDate, `Cancellation of ${invoice.invoiceNumber}`);
    return getInvoiceFromTransaction(tx, id);
  });
}

async function softDeleteInvoice(organizationId, id) {
  return prisma.$transaction(async (tx) => {
    const invoice = await tx.invoice.findFirst({
      where: { id, organizationId, deletedAt: null, lease: leaseScope(organizationId) },
      select: { id: true, paidAmount: true, invoiceDate: true, invoiceNumber: true },
    });
    if (!invoice) throw serviceError('INVOICE_NOT_FOUND', 'Invoice not found.');
    if (new Decimal(invoice.paidAmount).greaterThan(0)) {
      throw serviceError('INVOICE_HAS_PAYMENTS', 'Invoices with payments cannot be deleted.');
    }
    await tx.invoice.update({ where: { id }, data: { deletedAt: new Date() } });
    await tx.invoiceItem.updateMany({ where: { invoiceId: id, meterReadingId: { not: null } }, data: { meterReadingId: null } });
    await reverseTenantLedgerEntry(tx, organizationId, 'INVOICE', id, invoice.invoiceDate, `Deletion of ${invoice.invoiceNumber}`);
    await voidJournalWithReversal(tx, organizationId, 'INVOICE', id, invoice.invoiceDate, `Deletion of ${invoice.invoiceNumber}`);
    return { id };
  });
}

module.exports = {
  cancelInvoice,
  createInvoice,
  getInvoice,
  listInvoices,
  softDeleteInvoice,
  updateInvoice,
};
