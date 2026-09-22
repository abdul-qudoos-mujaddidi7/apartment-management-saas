const prisma = require('../../lib/prisma');
const AppError = require('../../errors/AppError');
const { searchCatalogue } = require('../../lib/currency-catalogue');
const {
  asMoney,
  asRate,
  convert,
  toBase,
  toDateOnly,
  today,
} = require('../../lib/money');

/**
 * The organization's currency catalogue and rate book.
 *
 * Rate convention: `ExchangeRate.rate` is how many units of the organization's
 * base currency one unit of the currency is worth (1 USD = 63 AFN ⇒ 63).
 * The base currency always resolves to 1 and never needs a rate row.
 *
 * A rate is resolved *for a date* and then frozen onto the document that used
 * it. Nothing in this module is consulted again once a document is posted, so
 * changing a rate today cannot restate yesterday's books.
 */

const CURRENCY_CODE = /^[A-Z]{3}$/;
const MAX_RATE_LOOKBACK = 20;

function currencyError(statusCode, code, message, details = null) {
  return new AppError(message, statusCode, code, details);
}

function normaliseCode(value) {
  return typeof value === 'string' ? value.trim().toUpperCase() : '';
}

async function getOrganization(client, organizationId) {
  const organization = await client.organization.findFirst({
    where: { id: organizationId, deletedAt: null },
    select: { id: true, baseCurrency: true },
  });
  if (!organization) {
    throw currencyError(401, 'INVALID_ORGANIZATION', 'Invalid organization.');
  }
  return organization;
}

/**
 * Currencies are initialized lazily, exactly like the default chart of
 * accounts: the first read or write makes sure the organization has its base
 * currency row, and the unique constraint keeps that safe under load.
 */
async function ensureBaseCurrency(client, organizationId) {
  const organization = await getOrganization(client, organizationId);
  const baseCode = normaliseCode(organization.baseCurrency) || 'AFN';

  const existing = await client.currency.findFirst({
    where: { organizationId, code: baseCode },
    select: { id: true, code: true, isBase: true, isActive: true, deletedAt: true },
  });

  if (existing) {
    if (!existing.isBase || !existing.isActive || existing.deletedAt) {
      return client.currency.update({
        where: { id: existing.id },
        data: { isBase: true, isActive: true, deletedAt: null, name: baseCode },
      });
    }
    return existing;
  }

  // Two concurrent first writes can both find nothing; the unique
  // (organizationId, code) constraint decides, and the loser re-reads.
  let created;
  try {
    created = await client.currency.create({
      data: {
        organizationId,
        code: baseCode,
        name: baseCode,
        isBase: true,
        isActive: true,
      },
    });
  } catch (error) {
    if (error.code !== 'P2002') throw error;
    const raced = await client.currency.findFirst({
      where: { organizationId, code: baseCode },
      select: { id: true, code: true, isBase: true, isActive: true, deletedAt: true },
    });
    if (!raced) throw error;
    return raced;
  }

  await client.exchangeRate.upsert({
    where: { currencyId_effectiveDate: { currencyId: created.id, effectiveDate: new Date('1970-01-01') } },
    update: { rate: 1 },
    create: {
      organizationId,
      currencyId: created.id,
      rate: 1,
      effectiveDate: new Date('1970-01-01'),
      source: 'MANUAL',
    },
  });

  return created;
}

/**
 * Resolve the rate to use for a document in `currency` dated `date`.
 *
 * Failing loudly when a rate is missing is deliberate: defaulting to 1 would
 * silently post a foreign-currency document as if it were base currency and
 * misstate the ledger with no trace of the mistake.
 */
async function resolveRate(client, organizationId, { currency, date } = {}) {
  const base = await ensureBaseCurrency(client, organizationId);
  const requested = normaliseCode(currency);
  const on = toDateOnly(date) || today();

  if (!requested || requested === base.code) {
    return { code: base.code, rate: asRate(1), currencyId: base.id, effectiveDate: on, isBase: true };
  }

  const row = await client.currency.findFirst({
    where: { organizationId, code: requested, deletedAt: null, isActive: true },
    select: { id: true, code: true },
  });

  if (!row) {
    throw currencyError(
      400,
      'CURRENCY_NOT_SUPPORTED',
      `${requested} is not an active currency for this organization.`,
      { field: 'currency' },
    );
  }

  const rate = await client.exchangeRate.findFirst({
    where: { organizationId, currencyId: row.id, effectiveDate: { lte: on } },
    orderBy: { effectiveDate: 'desc' },
    select: { rate: true, effectiveDate: true },
  });

  if (!rate) {
    throw currencyError(
      409,
      'EXCHANGE_RATE_MISSING',
      `No ${requested} exchange rate is recorded on or before ${on.toISOString().slice(0, 10)}.`,
      { field: 'currency' },
    );
  }

  return { code: row.code, rate: asRate(rate.rate), currencyId: row.id, effectiveDate: on, isBase: false };
}

/**
 * The frozen pair a money document stores: which currency it is written in,
 * and the base-currency conversion factor captured on the day it was posted.
 */
async function priceDocument(client, organizationId, { currency, date } = {}) {
  const resolved = await resolveRate(client, organizationId, { currency, date });
  return { currency: resolved.code, exchangeRate: resolved.rate };
}

/** Convert between two of the organization's currencies on a given date. */
async function convertBetween(client, organizationId, { amount, fromCurrency, toCurrency, date } = {}) {
  const [from, to] = await Promise.all([
    resolveRate(client, organizationId, { currency: fromCurrency, date }),
    resolveRate(client, organizationId, { currency: toCurrency, date }),
  ]);

  return {
    amount: convert(amount, from.rate, to.rate),
    from,
    to,
  };
}

/** Convenience wrappers for the two conversions the posting modules need. */
async function toBaseAmount(client, organizationId, { amount, currency, date } = {}) {
  const resolved = await resolveRate(client, organizationId, { currency, date });
  return { amount: toBase(amount, resolved.rate), resolved };
}

async function listCurrencies(organizationId, options = {}) {
  await ensureBaseCurrency(prisma, organizationId);

  const where = {
    organizationId,
    deletedAt: null,
    ...(options.includeInactive ? {} : { isActive: true }),
    ...(options.search
      ? {
        OR: [
          { code: { contains: options.search } },
          { name: { contains: options.search } },
        ],
      }
      : {}),
  };

  const [items, organization] = await prisma.$transaction([
    prisma.currency.findMany({
      where,
      orderBy: [{ isBase: 'desc' }, { code: 'asc' }],
      select: {
        id: true,
        code: true,
        name: true,
        symbol: true,
        isBase: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
        exchangeRates: {
          orderBy: { effectiveDate: 'desc' },
          take: MAX_RATE_LOOKBACK,
          select: { id: true, rate: true, effectiveDate: true, source: true },
        },
      },
    }),
    prisma.organization.findUnique({ where: { id: organizationId }, select: { baseCurrency: true } }),
  ]);

  return {
    baseCurrency: organization?.baseCurrency || 'AFN',
    items: items.map((currency) => ({
      id: currency.id,
      code: currency.code,
      name: currency.name,
      symbol: currency.symbol,
      isBase: currency.isBase,
      isActive: currency.isActive,
      // A base currency has no rates of its own — it is the denominator.
      rate: currency.isBase
        ? 1
        : Number(currency.exchangeRates[0]?.rate ?? 0) || null,
      rateEffectiveDate: currency.isBase ? null : currency.exchangeRates[0]?.effectiveDate || null,
      rates: currency.exchangeRates.map((rate) => ({
        id: rate.id,
        rate: Number(rate.rate),
        effectiveDate: rate.effectiveDate,
        source: rate.source,
      })),
    })),
  };
}

async function createCurrency(organizationId, data) {
  const code = normaliseCode(data.code);
  if (!CURRENCY_CODE.test(code)) {
    throw currencyError(400, 'INVALID_CURRENCY_CODE', 'Use a three-letter currency code such as USD.', { field: 'code' });
  }

  return prisma.$transaction(async (tx) => {
    await ensureBaseCurrency(tx, organizationId);

    const clash = await tx.currency.findFirst({
      where: { organizationId, code },
      select: { id: true, deletedAt: true },
    });
    if (clash && !clash.deletedAt) {
      throw currencyError(409, 'CURRENCY_EXISTS', `${code} is already in your currency list.`, { field: 'code' });
    }

    const currency = clash
      ? await tx.currency.update({
        where: { id: clash.id },
        data: {
          name: data.name?.trim() || code,
          symbol: data.symbol?.trim() || null,
          isActive: true,
          deletedAt: null,
        },
      })
      : await tx.currency.create({
        data: {
          organizationId,
          code,
          name: data.name?.trim() || code,
          symbol: data.symbol?.trim() || null,
          isBase: false,
          isActive: true,
        },
      });

    if (data.rate !== undefined && data.rate !== null) {
      await upsertRate(tx, organizationId, currency, {
        rate: data.rate,
        effectiveDate: data.effectiveDate,
      });
    }

    return getCurrency(organizationId, currency.id, tx);
  });
}

async function updateCurrency(organizationId, id, data) {
  return prisma.$transaction(async (tx) => {
    const currency = await tx.currency.findFirst({ where: { id, organizationId, deletedAt: null } });
    if (!currency) throw currencyError(404, 'CURRENCY_NOT_FOUND', 'Currency not found.');
    if (currency.isBase && data.isActive === false) {
      throw currencyError(409, 'BASE_CURRENCY_IMMUTABLE', 'The base currency cannot be deactivated.');
    }

    await tx.currency.update({
      where: { id: currency.id },
      data: {
        ...(data.name !== undefined ? { name: data.name.trim() || currency.code } : {}),
        ...(data.symbol !== undefined ? { symbol: data.symbol?.trim() || null } : {}),
        ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
      },
    });

    if (data.rate !== undefined && data.rate !== null) {
      await upsertRate(tx, organizationId, currency, {
        rate: data.rate,
        effectiveDate: data.effectiveDate,
      });
    }

    return getCurrency(organizationId, currency.id, tx);
  });
}

async function upsertRate(client, organizationId, currency, { rate, effectiveDate }) {
  if (currency.isBase) {
    throw currencyError(409, 'BASE_CURRENCY_RATE', 'The base currency is always worth exactly 1; it has no rate to set.');
  }

  const value = asRate(rate);
  if (!value.isFinite() || value.lessThanOrEqualTo(0)) {
    throw currencyError(400, 'INVALID_EXCHANGE_RATE', 'An exchange rate must be greater than zero.', { field: 'rate' });
  }

  const on = toDateOnly(effectiveDate) || today();

  await client.exchangeRate.upsert({
    where: { currencyId_effectiveDate: { currencyId: currency.id, effectiveDate: on } },
    update: { rate: value, source: 'MANUAL' },
    create: { organizationId, currencyId: currency.id, rate: value, effectiveDate: on, source: 'MANUAL' },
  });

  return value;
}

/** Record a rate without touching the currency's own fields. */
async function addRate(organizationId, id, data) {
  return prisma.$transaction(async (tx) => {
    const currency = await tx.currency.findFirst({ where: { id, organizationId, deletedAt: null } });
    if (!currency) throw currencyError(404, 'CURRENCY_NOT_FOUND', 'Currency not found.');

    await upsertRate(tx, organizationId, currency, data);
    return getCurrency(organizationId, currency.id, tx);
  });
}

/**
 * Read one currency back in its API shape.
 *
 * `client` matters: inside a transaction the row that was just written is not yet
 * visible on another connection, so a caller in `$transaction` must pass its `tx`
 * or the read looks for a currency that does not exist yet.
 */
async function getCurrency(organizationId, id, client = prisma) {
  const currency = await client.currency.findFirst({
    where: { id, organizationId, deletedAt: null },
    select: {
      id: true,
      code: true,
      name: true,
      symbol: true,
      isBase: true,
      isActive: true,
      createdAt: true,
      updatedAt: true,
      exchangeRates: {
        orderBy: { effectiveDate: 'desc' },
        take: MAX_RATE_LOOKBACK,
        select: { id: true, rate: true, effectiveDate: true, source: true },
      },
    },
  });

  if (!currency) throw currencyError(404, 'CURRENCY_NOT_FOUND', 'Currency not found.');

  return {
    id: currency.id,
    code: currency.code,
    name: currency.name,
    symbol: currency.symbol,
    isBase: currency.isBase,
    isActive: currency.isActive,
    rate: currency.isBase ? 1 : Number(currency.exchangeRates[0]?.rate ?? 0) || null,
    rateEffectiveDate: currency.isBase ? null : currency.exchangeRates[0]?.effectiveDate || null,
    rates: currency.exchangeRates.map((rate) => ({
      id: rate.id,
      rate: Number(rate.rate),
      effectiveDate: rate.effectiveDate,
      source: rate.source,
    })),
  };
}

/**
 * A currency that has been used on a posted document is never removed: the
 * documents carry its code forever, and a report that cannot name the currency
 * of an old invoice is worse than a slightly longer list.
 */
async function countDocumentsUsing(organizationId, code) {
  const [invoices, payments, journals, deposits] = await prisma.$transaction([
    prisma.invoice.count({ where: { organizationId, currency: code } }),
    prisma.payment.count({ where: { organizationId, currency: code } }),
    prisma.journal.count({ where: { organizationId, currency: code } }),
    prisma.securityDepositTransaction.count({ where: { organizationId, currency: code } }),
  ]);

  return invoices + payments + journals + deposits;
}

async function deleteCurrency(organizationId, id) {
  return prisma.$transaction(async (tx) => {
    const currency = await tx.currency.findFirst({ where: { id, organizationId, deletedAt: null } });
    if (!currency) throw currencyError(404, 'CURRENCY_NOT_FOUND', 'Currency not found.');
    if (currency.isBase) {
      throw currencyError(409, 'BASE_CURRENCY_IMMUTABLE', 'The base currency cannot be removed.');
    }

    const used = await countDocumentsUsing(organizationId, currency.code);
    if (used > 0) {
      throw currencyError(
        409,
        'CURRENCY_IN_USE',
        `${currency.code} is used on ${used} posted record${used === 1 ? '' : 's'}; deactivate it instead of deleting it.`,
      );
    }

    await tx.currency.update({ where: { id: currency.id }, data: { isActive: false, deletedAt: new Date() } });
    return { id: currency.id, code: currency.code };
  });
}

/**
 * Change the reporting currency.
 *
 * Only allowed before the organization has any posted money: every stored
 * base-currency figure was converted to the old base, so re-denominating them
 * would silently restate history rather than convert it. The base currency row
 * must already exist in the catalogue.
 */
async function setBaseCurrency(organizationId, requestedCode) {
  const code = normaliseCode(requestedCode);
  if (!CURRENCY_CODE.test(code)) {
    throw currencyError(400, 'INVALID_CURRENCY_CODE', 'Use a three-letter currency code such as USD.', { field: 'baseCurrency' });
  }

  return prisma.$transaction(async (tx) => {
    const organization = await getOrganization(tx, organizationId);
    if (normaliseCode(organization.baseCurrency) === code) {
      return { baseCurrency: code };
    }

    const [invoices, payments, journals, deposits] = await Promise.all([
      tx.invoice.count({ where: { organizationId } }),
      tx.payment.count({ where: { organizationId } }),
      tx.journal.count({ where: { organizationId } }),
      tx.securityDepositTransaction.count({ where: { organizationId } }),
    ]);
    if (invoices + payments + journals + deposits > 0) {
      throw currencyError(
        409,
        'BASE_CURRENCY_LOCKED',
        'The base currency cannot change after money documents exist, because every stored base amount was converted to it.',
      );
    }

    const currency = await tx.currency.findFirst({
      where: { organizationId, code, deletedAt: null, isActive: true },
      select: { id: true },
    });
    if (!currency) {
      throw currencyError(404, 'CURRENCY_NOT_FOUND', `Add ${code} to your currency list before making it the base currency.`);
    }

    await tx.currency.updateMany({
      where: { organizationId, isBase: true },
      data: { isBase: false },
    });
    await tx.currency.update({ where: { id: currency.id }, data: { isBase: true } });
    await tx.exchangeRate.upsert({
      where: { currencyId_effectiveDate: { currencyId: currency.id, effectiveDate: new Date('1970-01-01') } },
      update: { rate: 1 },
      create: {
        organizationId,
        currencyId: currency.id,
        rate: 1,
        effectiveDate: new Date('1970-01-01'),
        source: 'MANUAL',
      },
    });
    await tx.organization.update({ where: { id: organizationId }, data: { baseCurrency: code } });

    return { baseCurrency: code };
  });
}

/**
 * The currencies the "Add currency" form can offer.
 *
 * This is reference data, not the organization's ledger: it says what USD is
 * called and how it is written, and the form fills those two fields in from it.
 * Membership in this list is not a permission to post — a code the list has
 * never heard of can still be added by hand.
 */
async function listCurrencyCatalogue({ search, refresh } = {}) {
  return searchCatalogue(search, { force: Boolean(refresh) });
}

module.exports = {
  addRate,
  asMoney,
  convertBetween,
  createCurrency,
  deleteCurrency,
  ensureBaseCurrency,
  getCurrency,
  listCurrencies,
  listCurrencyCatalogue,
  priceDocument,
  resolveRate,
  setBaseCurrency,
  toBaseAmount,
  updateCurrency,
};
