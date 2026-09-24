const { Prisma } = require('@prisma/client');

const prisma = require('../../lib/prisma');
const Decimal = Prisma.Decimal;
const { toBase } = require('../../lib/money');
const { priceDocument } = require('../currency/currency.service');
const { ensureDefaultAccounts } = require('../financials/financial-account.service');
const { postJournal, voidJournalWithReversal } = require('../financials/journal.service');
const { postTenantLedgerEntry } = require('../tenant-accounts/tenant-account.service');

function fail(code, message) {
  return Object.assign(new Error(message), { code });
}

function scope(organizationId) {
  return {
    organizationId,
    deletedAt: null,
  };
}

/*
 * A deposit is held money, not earned money: it is a liability until it is
 * refunded or kept for a reason. These are the accounts it moves between.
 */
const LIABILITY_ACCOUNT = '2000';
const RECEIVABLE_ACCOUNT = '1100';
const FORFEITED_ACCOUNT = '4050';
const DEFAULT_CASH_ACCOUNT = '1000';

/// The journal a deposit writes, and how voiding finds it again.
const JOURNAL_REFERENCE = 'SECURITY_DEPOSIT';

const leaseSelect = {
  id: true,
  contractNumber: true,
  status: true,
  startDate: true,
  securityDeposit: true,
  currency: true,
  securityDepositCurrency: true,
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
  reason: true,
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
  account: { select: { id: true, code: true, name: true } },
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

async function baseCurrencyOf(client, organizationId) {
  const organization = await client.organization.findUnique({
    where: { id: organizationId },
    select: { baseCurrency: true },
  });
  return organization?.baseCurrency || 'AFN';
}

/**
 * The rate for a currency at a date, or null when the workspace has not
 * recorded one. Unlike `priceDocument` this never throws: the deposit page has
 * to render a lease whose currency has no rate yet, and it is not a write.
 */
async function rateOn(client, organizationId, code, date) {
  const currency = await client.currency.findFirst({
    where: { organizationId, code, deletedAt: null },
    select: { id: true },
  });
  if (!currency) return null;

  const rate = await client.exchangeRate.findFirst({
    where: { currencyId: currency.id, effectiveDate: { lte: date } },
    orderBy: { effectiveDate: 'desc' },
    select: { rate: true },
  });
  if (rate) return new Decimal(rate.rate);

  /*
   * A lease can start before the first rate was recorded, and the deposit page
   * still has to state one number in one currency. The earliest rate that
   * exists is the best information there is, and it is far better than adding
   * dollars to afghanis. Only a currency with no rate at all is unpriced.
   */
  const earliest = await client.exchangeRate.findFirst({
    where: { currencyId: currency.id },
    orderBy: { effectiveDate: 'asc' },
    select: { rate: true },
  });
  return earliest ? new Decimal(earliest.rate) : null;
}

async function latestTransactionDate(client, organizationId, leaseId) {
  const latest = await client.securityDepositTransaction.findFirst({
    where: { organizationId, leaseId, status: 'POSTED' },
    orderBy: { transactionDate: 'desc' },
    select: { transactionDate: true },
  });
  return latest ? latest.transactionDate : null;
}

/**
 * Deposit status is judged in the organization's base currency, because that is
 * the currency the liability is carried in.
 *
 * `Lease.securityDeposit` is quoted in its own selected currency, so it is
 * converted before it is compared with anything. Comparing the two directly is
 * what made a 500 USD deposit read as a 500 AFN requirement and refuse the
 * first real receipt as an overpayment.
 */
async function getSummary(organizationId, lease, client = prisma, options = {}) {
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

  const baseCurrency = await baseCurrencyOf(client, organizationId);
  const leaseCurrency = lease.securityDepositCurrency || lease.currency || baseCurrency;
  const quotedDeposit = new Decimal(lease.securityDeposit);

  const referenceDate = options.referenceDate
    || (await latestTransactionDate(client, organizationId, lease.id))
    || lease.startDate
    || new Date();

  // The base currency is its own rate (1). Anything else needs a recorded rate;
  // when there is none the requirement is reported as quoted and the summary
  // says so, rather than pretending the two currencies are the same.
  const rate = leaseCurrency === baseCurrency
    ? new Decimal(1)
    : await rateOn(client, organizationId, leaseCurrency, referenceDate);
  const rateMissing = rate === null;
  const requiredDeposit = rateMissing
    ? quotedDeposit
    : quotedDeposit.mul(rate).toDecimalPlaces(2);

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
    baseCurrency,
    leaseCurrency,
    quotedDeposit,
    rateMissing,
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

function formatTransaction(transaction) {
  return {
    ...transaction,
    exchangeRate: Number(transaction.exchangeRate ?? 1),
    amount: serializeDecimal(transaction.amount),
    baseAmount: serializeDecimal(transaction.baseAmount ?? transaction.amount),
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
    transactions: transactions.map(formatTransaction),
  };
}

/**
 * The account a RECEIVED is taken into and a REFUND is paid out of. Money can
 * only sit in an asset account, so a caller that names one naming a liability
 * or an income account is refused rather than silently posting the movement
 * twice.
 */
async function resolveMovementAccount(client, organizationId, accounts, accountId) {
  if (!accountId) return accounts[DEFAULT_CASH_ACCOUNT];

  const account = await client.financialAccount.findFirst({
    where: { id: accountId, organizationId, deletedAt: null, isActive: true },
    select: { id: true, code: true, name: true, type: true },
  });

  if (!account) {
    throw fail('DEPOSIT_ACCOUNT_NOT_FOUND', 'The account to move the deposit through was not found.');
  }

  if (account.type !== 'ASSET') {
    throw fail(
      'DEPOSIT_ACCOUNT_NOT_ASSET',
      `${account.code} ${account.name} cannot hold money; choose a cash or bank account.`,
    );
  }

  return account;
}

function deductionTarget(record, accounts) {
  return record.reason === 'RENT_ARREARS'
    ? accounts[RECEIVABLE_ACCOUNT]
    : accounts[FORFEITED_ACCOUNT];
}

/**
 * Writes the ledger entry a deposit movement implies. Every deposit answers to
 * exactly one journal, keyed by the transaction, so a retry cannot post twice.
 */
async function postDepositJournal(client, organizationId, context) {
  const { lease, record, account, accounts, amount, baseAmount } = context;
  const tenantId = lease.tenant.id;
  const pricing = { currency: record.currency, exchangeRate: record.exchangeRate };

  if (record.type === 'RECEIVED') {
    // Cash up, liability up: the money is held, not earned.
    return postJournal(client, organizationId, {
      ...pricing,
      transactionDate: record.transactionDate,
      referenceType: JOURNAL_REFERENCE,
      referenceId: record.id,
      description: `Security deposit received ${lease.contractNumber}`,
      lines: [
        {
          accountId: account.id,
          tenantId,
          debit: amount,
          credit: 0,
          baseDebit: baseAmount,
          description: `Security deposit received ${lease.contractNumber}`,
        },
        {
          accountId: accounts[LIABILITY_ACCOUNT].id,
          tenantId,
          debit: 0,
          credit: amount,
          baseCredit: baseAmount,
          description: `Security deposit held for ${lease.contractNumber}`,
        },
      ],
    });
  }

  if (record.type === 'DEDUCTION') {
    const target = deductionTarget(record, accounts);
    const journal = await postJournal(client, organizationId, {
      ...pricing,
      transactionDate: record.transactionDate,
      referenceType: JOURNAL_REFERENCE,
      referenceId: record.id,
      description: `Security deposit deduction ${lease.contractNumber}`,
      lines: [
        {
          accountId: accounts[LIABILITY_ACCOUNT].id,
          tenantId,
          debit: amount,
          credit: 0,
          baseDebit: baseAmount,
          description: `Security deposit released ${lease.contractNumber}`,
        },
        {
          accountId: target.id,
          tenantId,
          debit: 0,
          credit: amount,
          baseCredit: baseAmount,
          description: record.reason === 'RENT_ARREARS'
            ? `Rent arrears settled from deposit ${lease.contractNumber}`
            : `Security deposit forfeited ${lease.contractNumber}`,
        },
      ],
    });

    /*
     * Rent was already billed as income, so keeping the deposit settles a
     * receivable rather than earning anything. The tenant's sub-ledger has to
     * move with the control account or the two stop agreeing, and it is the
     * sub-ledger that refuses a deduction larger than the tenant owes.
     */
    if (record.reason === 'RENT_ARREARS') {
      await postTenantLedgerEntry(client, organizationId, {
        tenantId,
        type: 'PAYMENT',
        transactionDate: record.transactionDate,
        referenceType: JOURNAL_REFERENCE,
        referenceId: record.id,
        description: `Deposit applied to rent arrears ${lease.contractNumber}`,
        debit: 0,
        credit: baseAmount,
        currency: record.currency,
        exchangeRate: record.exchangeRate,
      });
    }

    return journal;
  }

  // REFUND: the liability is discharged and the money leaves the account.
  return postJournal(client, organizationId, {
    ...pricing,
    transactionDate: record.transactionDate,
    referenceType: JOURNAL_REFERENCE,
    referenceId: record.id,
    description: `Security deposit refunded ${lease.contractNumber}`,
    lines: [
      {
        accountId: accounts[LIABILITY_ACCOUNT].id,
        tenantId,
        debit: amount,
        credit: 0,
        baseDebit: baseAmount,
        description: `Security deposit refunded ${lease.contractNumber}`,
      },
      {
        accountId: account.id,
        tenantId,
        debit: 0,
        credit: amount,
        baseCredit: baseAmount,
        description: `Security deposit paid out ${lease.contractNumber}`,
      },
    ],
  });
}

async function create(organizationId, leaseId, data) {
  return prisma.$transaction(
    async (transaction) => {
      const lease = await getLease(organizationId, leaseId, transaction);
      const amount = new Decimal(data.amount);
      // The amount is what the tenant actually handed over or was charged back,
      // in its own currency; `baseAmount` is what the deposit balances move by.
      const pricing = await priceDocument(transaction, organizationId, {
        currency: data.currency,
        date: data.transactionDate,
      });
      const baseAmount = toBase(amount, pricing.exchangeRate);
      const summary = await getSummary(organizationId, lease, transaction, {
        referenceDate: data.transactionDate,
      });
      const accounts = await ensureDefaultAccounts(transaction, organizationId);

      if (data.type === 'DEDUCTION' && !data.reason) {
        throw fail(
          'DEDUCTION_REASON_REQUIRED',
          'Say why the deposit is being kept: rent arrears, damage, or other.',
        );
      }

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

      const account = data.type === 'DEDUCTION'
        ? null
        : await resolveMovementAccount(transaction, organizationId, accounts, data.accountId);

      const created = await transaction.securityDepositTransaction.create({
        data: {
          type: data.type,
          reason: data.type === 'DEDUCTION' ? data.reason : null,
          accountId: account ? account.id : null,
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

      await postDepositJournal(transaction, organizationId, {
        lease,
        record: created,
        account,
        accounts,
        amount,
        baseAmount,
      });

      return formatTransaction(created);
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
          type: true,
          leaseId: true,
          amount: true,
          baseAmount: true,
          transactionDate: true,
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

      const lease = await getLease(organizationId, record.leaseId, transaction);
      const summary = await getSummary(organizationId, lease, transaction);

      /*
       * Voiding a receipt the deposit has already spent would leave the money
       * it funded hanging: the deduction or refund that used it has to go first.
       * A deposit can also never be voided below zero.
       */
      if (record.type === 'RECEIVED' && new Decimal(record.baseAmount).gt(summary.balance)) {
        throw fail(
          'DEPOSIT_ALREADY_USED',
          'This deposit has already been used or refunded. Void those movements first.',
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

      // The ledger and the tenant's sub-ledger are both left with the original
      // entry and its reversal, so what was corrected stays visible.
      await voidJournalWithReversal(
        transaction,
        organizationId,
        JOURNAL_REFERENCE,
        transactionId,
        record.transactionDate,
        reason,
      );

      if (record.type === 'DEDUCTION') {
        const arrearsEntry = await transaction.tenantLedgerEntry.findUnique({
          where: {
            organizationId_referenceType_referenceId_type: {
              organizationId,
              referenceType: JOURNAL_REFERENCE,
              referenceId: transactionId,
              type: 'PAYMENT',
            },
          },
          select: { debit: true, credit: true, currency: true, exchangeRate: true },
        });

        if (arrearsEntry) {
          await postTenantLedgerEntry(transaction, organizationId, {
            tenantId: lease.tenant.id,
            type: 'REVERSAL',
            transactionDate: record.transactionDate,
            referenceType: `${JOURNAL_REFERENCE}_VOID`,
            referenceId: transactionId,
            description: reason,
            debit: arrearsEntry.credit,
            credit: arrearsEntry.debit,
            currency: arrearsEntry.currency,
            exchangeRate: arrearsEntry.exchangeRate,
          });
        }
      }

      return formatTransaction(updated);
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
