const { Prisma } = require('@prisma/client');

const prisma = require('../../lib/prisma');
const Decimal = Prisma.Decimal;
const { fromBase, toBase } = require('../../lib/money');
const { priceDocument } = require('../currency/currency.service');
const { ensureDefaultAccounts } = require('../financials/financial-account.service');
const { postJournal, voidJournalWithReversal } = require('../financials/journal.service');
const { incomeAccountCodes } = require('./invoice-income');
const { lineCurrency } = require('./invoice-line-currency');
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
    currency: true,
    exchangeRate: true,
    subtotal: true,
    total: true,
    paidAmount: true,
    baseSubtotal: true,
    baseTotal: true,
    basePaidAmount: true,
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
          currency: true,
          exchangeRate: true,
          baseAmount: true,
          paymentAllocations: {
            where: { payment: { status: 'POSTED' } },
            select: { amount: true, appliedAmount: true, baseAppliedAmount: true, voidedAt: true },
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
        currency: true,
        serviceFee: true,
        serviceFeeCurrency: true,
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

/**
 * What an allocation actually paid off this invoice item.
 *
 * `appliedAmount` is the item's own currency, frozen when the payment was made:
 * a USD receipt settling an AFN charge converts once, at that moment, instead of
 * being re-converted — and re-stated — every time this invoice is read.
 */
function sumItemAllocations(allocations) {
  return (allocations || []).reduce((total, alloc) => {
    if (alloc.voidedAt) return total;
    return total.plus(new Decimal(alloc.appliedAmount ?? alloc.amount));
  }, new Decimal(0)).toDecimalPlaces(2);
}

/** The same allocations, in the organization's base currency. */
function sumItemBaseAllocations(allocations) {
  return (allocations || []).reduce((total, alloc) => {
    if (alloc.voidedAt) return total;
    return total.plus(new Decimal(alloc.baseAppliedAmount ?? alloc.amount));
  }, new Decimal(0)).toDecimalPlaces(2);
}

/**
 * A line's value in the base currency, falling back to its own currency's rate
 * for a row written before lines carried a base mirror of their own.
 */
function itemBaseAmount(item, invoiceRate = 1) {
  if (item.baseAmount !== undefined && item.baseAmount !== null) return new Decimal(item.baseAmount);
  return toBase(item.amount, item.exchangeRate ?? invoiceRate ?? 1);
}

function deriveItemStatus(amount, paidAmount) {
  if (paidAmount.greaterThanOrEqualTo(amount)) return 'PAID';
  if (paidAmount.isZero()) return 'UNPAID';
  return 'PARTIALLY_PAID';
}

function formatInvoice(invoice) {
  if (!invoice) return invoice;

  const exchangeRate = new Decimal(invoice.exchangeRate ?? 1);

  // Derive paidAmount from items
  let derivedPaidAmount = new Decimal(0);
  let derivedBasePaidAmount = new Decimal(0);
  let itemsFormatted = [];

  if (invoice.items) {
    itemsFormatted = invoice.items.map((item) => {
      const itemPaid = sumItemAllocations(item.paymentAllocations);
      const itemBasePaid = sumItemBaseAllocations(item.paymentAllocations);
      derivedPaidAmount = derivedPaidAmount.plus(itemPaid);
      derivedBasePaidAmount = derivedBasePaidAmount.plus(itemBasePaid);
      const itemBalance = new Decimal(item.amount).minus(itemPaid).toDecimalPlaces(2);
      return {
        id: item.id,
        meterReadingId: item.meterReadingId,
        type: item.type,
        description: item.description,
        quantity: Number(item.quantity),
        unitPrice: Number(item.unitPrice),
        amount: Number(item.amount),
        // The currency this line is stated in, and what it is worth in the base
        // currency at the rate it was posted at.
        currency: item.currency || invoice.currency || 'AFN',
        exchangeRate: Number(item.exchangeRate ?? exchangeRate ?? 1),
        baseAmount: Number(itemBaseAmount(item, exchangeRate)),
        paidAmount: Number(itemPaid),
        balance: Number(itemBalance),
        basePaidAmount: Number(itemBasePaid),
        paymentStatus: deriveItemStatus(new Decimal(item.amount), itemPaid),
      };
    });
    derivedPaidAmount = derivedPaidAmount.toDecimalPlaces(2);
    derivedBasePaidAmount = derivedBasePaidAmount.toDecimalPlaces(2);
  } else {
    derivedPaidAmount = new Decimal(invoice.paidAmount);
    derivedBasePaidAmount = new Decimal(invoice.basePaidAmount ?? invoice.paidAmount);
  }

  const derivedStatus = {
    ...invoice,
    paidAmount: Number(derivedPaidAmount),
    total: Number(invoice.total),
  };

  return {
    ...invoice,
    currency: invoice.currency || 'AFN',
    exchangeRate: Number(exchangeRate),
    subtotal: Number(invoice.subtotal),
    total: Number(invoice.total),
    paidAmount: Number(derivedPaidAmount),
    baseSubtotal: Number(invoice.baseSubtotal ?? invoice.subtotal),
    baseTotal: Number(invoice.baseTotal ?? invoice.total),
    basePaidAmount: Number(derivedBasePaidAmount),
    // What is still owed, expressed in the base currency, for portfolio-wide totals.
    baseBalance: Math.max(
      Number(invoice.baseTotal ?? invoice.total) - Number(derivedBasePaidAmount),
      0,
    ),
    status: displayStatus(derivedStatus),
    lease: {
      ...invoice.lease,
      monthlyRent: Number(invoice.lease.monthlyRent),
    },
    items: itemsFormatted,
  };
}

function utilityDescription(reading) {
  const name = reading.meter.utilityType.charAt(0) + reading.meter.utilityType.slice(1).toLowerCase();
  return `${name} - Meter ${reading.meter.meterNumber} - ${new Decimal(reading.consumption).toFixed(3)} ${reading.meter.unit}`;
}

/**
 * Turn what the user sent into the rows to store.
 *
 * Every line is priced in the currency it is stated in — `invoice-line-currency`
 * says which that is — and that currency's rate against the base currency is
 * resolved for the invoice's own date and frozen onto the line. The line's base
 * mirror is what the invoice's totals add up, so a lease agreed in one currency
 * and a meter priced in another can be billed on the same invoice.
 */
async function prepareInvoiceItems(client, organizationId, lease, sourceItems, { baseCurrency, date }) {
  const utilityReadingIds = new Set();
  const rates = new Map();
  const items = [];

  // One rate lookup per currency for the whole invoice, not one per line.
  async function rateFor(currency) {
    const code = String(currency || baseCurrency).toUpperCase();
    if (!rates.has(code)) {
      rates.set(code, (await priceDocument(client, organizationId, { currency: code, date })).exchangeRate);
    }
    return rates.get(code);
  }

  /** A line as it will be stored: in its own currency, and in the base one. */
  function stored(item, currency, quantity, unitPrice, amount, rate) {
    return {
      type: item.type,
      description: item.description,
      quantity,
      unitPrice,
      amount,
      currency: String(currency || baseCurrency).toUpperCase(),
      exchangeRate: rate,
      baseAmount: toBase(amount, rate),
    };
  }

  for (const item of sourceItems) {
    if (!item.meterReadingId) {
      const currency = lineCurrency(item, lease, baseCurrency);
      // Service fees are contractual charges. Always copy the selected lease's
      // fee so a stale or manipulated client cannot invoice a different value.
      const isServiceFee = item.type === 'SERVICE_FEE';
      const quantity = new Decimal(isServiceFee ? 1 : item.quantity);
      const unitPrice = new Decimal(isServiceFee ? lease.serviceFee : item.unitPrice);
      const amount = quantity.times(unitPrice).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
      items.push(stored(item, currency, quantity, unitPrice, amount, await rateFor(currency)));
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

    // A meter holds one price for its unit and that price is entered in the base
    // currency, so a reading is billed in the base currency as it stands.
    items.push({
      meterReadingId: reading.id,
      ...stored(
        { ...item, type: reading.meter.utilityType, description: utilityDescription(reading) },
        baseCurrency,
        new Decimal(reading.consumption),
        new Decimal(reading.unitPrice),
        new Decimal(reading.amount),
        await rateFor(baseCurrency),
      ),
    });
  }

  return items;
}

/**
 * The invoice's totals, in the base currency: the sum of its lines' base
 * mirrors. Every line states its own currency, so these are the only totals
 * that mean anything across a mixed-currency invoice.
 */
function calculateTotals(items) {
  const subtotal = items.reduce((total, item) => total.plus(itemBaseAmount(item)), new Decimal(0));
  return { subtotal, total: subtotal };
}

async function assertLeaseInOrganization(client, organizationId, leaseId) {
  const lease = await client.lease.findFirst({
    where: { id: leaseId, ...leaseScope(organizationId) },
    select: { id: true, tenantId: true, apartmentId: true, currency: true, serviceFee: true, serviceFeeCurrency: true },
  });
  if (!lease) throw serviceError('LEASE_NOT_FOUND', 'Lease not found.');
  return lease;
}

async function postInvoiceJournal(client, organizationId, invoice, tenantId, items) {
  const accounts = await ensureDefaultAccounts(client, organizationId);
  // A credit is stated in the invoice's own currency: the line's base value read
  // back at the rate the invoice was posted at. An invoice written in the base
  // currency credits the line itself.
  const creditByAccount = items.reduce((totals, item) => {
    const code = incomeAccountCodes[item.type];
    if (!code) return totals;
    const credit = fromBase(itemBaseAmount(item, invoice.exchangeRate ?? 1), invoice.exchangeRate ?? 1);
    totals[code] = (totals[code] || new Decimal(0)).plus(credit);
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
    // The invoice's own currency, at the rate frozen onto it, so the ledger
    // mirrors the document and the base totals are exactly what was billed.
    currency: invoice.currency,
    exchangeRate: invoice.exchangeRate,
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
  // A credit is stated in the invoice's own currency: the line's base value read
  // back at the rate the invoice was posted at. An invoice written in the base
  // currency credits the line itself.
  const creditByAccount = items.reduce((totals, item) => {
    const code = incomeAccountCodes[item.type];
    if (!code) return totals;
    const credit = fromBase(itemBaseAmount(item, invoice.exchangeRate ?? 1), invoice.exchangeRate ?? 1);
    totals[code] = (totals[code] || new Decimal(0)).plus(credit);
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
      currency: invoice.currency,
      exchangeRate: invoice.exchangeRate,
      description: `Invoice ${invoice.invoiceNumber}`,
      lines: {
        create: lines.map((line) => ({
          ...line,
          baseDebit: toBase(line.debit, invoice.exchangeRate),
          baseCredit: toBase(line.credit, invoice.exchangeRate),
        })),
      },
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
    tenantId, leaseId, status, currency, dateFrom, dateTo,
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
    ...(filters.currency ? { currency: String(filters.currency).toUpperCase() } : {}),
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
      // The document is written in the base currency and each of its lines keeps
      // the currency it was agreed in, so everything it stores is already a
      // base-currency figure and its own rate is 1.
      const { currency: baseCurrency } = await priceDocument(tx, organizationId, { date: data.invoiceDate });
      const items = await prepareInvoiceItems(tx, organizationId, lease, data.items, {
        baseCurrency,
        date: data.invoiceDate,
      });
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
          currency: baseCurrency,
          exchangeRate: 1,
          paidAmount: 0,
          status: 'UNPAID',
          subtotal: totals.subtotal,
          total: totals.total,
          baseSubtotal: totals.subtotal,
          baseTotal: totals.total,
        },
        select: { id: true },
      });
      await tx.invoiceItem.createMany({
        data: items.map((item) => ({ ...item, invoiceId: invoice.id })),
      });
      const created = await getInvoiceFromTransaction(tx, invoice.id);
      // The sub-ledger is base currency, so it takes the stored base total.
      await postTenantLedgerEntry(tx, organizationId, {
        tenantId: lease.tenantId,
        type: 'INVOICE',
        transactionDate: created.invoiceDate,
        referenceType: 'INVOICE',
        referenceId: created.id,
        description: `Invoice ${created.invoiceNumber}`,
        debit: created.baseTotal,
        credit: 0,
        currency: created.currency,
        exchangeRate: created.exchangeRate,
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
        leaseId: true,
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

    // An edited invoice is re-stated under the rule a new one is posted under:
    // its lines keep their own currencies and the document reads in the base
    // currency. Nothing may be paid against it at this point, so this can never
    // restate money that has already moved.
    const { currency: baseCurrency } = await priceDocument(tx, organizationId, { date: invoiceDate });
    const updateData = {
      invoiceDate,
      dueDate,
      notes: data.notes === undefined ? current.notes : data.notes,
      currency: baseCurrency,
      exchangeRate: 1,
    };

    if (data.items) {
      const lease = await assertLeaseInOrganization(tx, organizationId, current.leaseId);
      const items = await prepareInvoiceItems(tx, organizationId, lease, data.items, {
        baseCurrency,
        date: invoiceDate,
      });
      const totals = calculateTotals(items);
      updateData.subtotal = totals.subtotal;
      updateData.total = totals.total;
      updateData.baseSubtotal = totals.subtotal;
      updateData.baseTotal = totals.total;
      updateData.items = { deleteMany: {}, create: items };

      await tx.invoice.update({ where: { id }, data: updateData });
      const refreshed = await getInvoiceFromTransaction(tx, id);
      await replaceInvoiceLedgerEntry(tx, organizationId, {
        tenantId: lease.tenantId,
        invoiceId: refreshed.id,
        transactionDate: refreshed.invoiceDate,
        description: `Invoice ${refreshed.invoiceNumber}`,
        amount: refreshed.baseTotal,
        currency: refreshed.currency,
        exchangeRate: refreshed.exchangeRate,
      });
      await refreshInvoiceJournal(tx, organizationId, refreshed, lease.tenantId, items);
      return refreshed;
    }

    await tx.invoice.update({ where: { id }, data: updateData });
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
