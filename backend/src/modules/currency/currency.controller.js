const { z } = require('zod');

const currencyService = require('./currency.service');
const {
  addRateSchema,
  catalogueQuerySchema,
  convertQuerySchema,
  createCurrencySchema,
  listCurrenciesSchema,
  rateQuerySchema,
  setBaseCurrencySchema,
  updateCurrencySchema,
} = require('./currency.validation');

function organizationId(req) {
  return req.user.organizationId;
}

function invalid(res, code, result) {
  return res.status(400).json({
    success: false,
    code,
    message: 'Invalid currency data.',
    errors: z.flattenError(result.error).fieldErrors,
  });
}

function handleServiceError(error, res, next) {
  // AppError carries its own status, so operational failures answer themselves.
  if (error.isOperational) {
    return res.status(error.statusCode).json({
      success: false,
      code: error.code,
      message: error.message,
      ...(error.details ? { errors: error.details } : {}),
    });
  }

  return next(error);
}

async function list(req, res, next) {
  try {
    const result = listCurrenciesSchema.safeParse(req.query);
    if (!result.success) return invalid(res, 'INVALID_CURRENCY_QUERY', result);

    const currencies = await currencyService.listCurrencies(organizationId(req), result.data);
    return res.status(200).json({ success: true, ...currencies });
  } catch (error) {
    return handleServiceError(error, res, next);
  }
}

/**
 * Reference data for the picker on the "Add currency" form: every code the
 * currency API knows, with the name and symbol that go with it.
 */
async function catalogue(req, res, next) {
  try {
    const result = catalogueQuerySchema.safeParse(req.query);
    if (!result.success) return invalid(res, 'INVALID_CURRENCY_QUERY', result);

    const { search, refresh } = result.data;
    const catalogue = await currencyService.listCurrencyCatalogue({ search, refresh });

    return res.status(200).json({ success: true, ...catalogue });
  } catch (error) {
    return handleServiceError(error, res, next);
  }
}

async function rate(req, res, next) {
  try {
    const result = rateQuerySchema.safeParse(req.query);
    if (!result.success) return invalid(res, 'INVALID_CURRENCY_QUERY', result);

    const resolved = await currencyService.resolveRate(
      require('../../lib/prisma'),
      organizationId(req),
      { currency: result.data.currency, date: result.data.date },
    );

    return res.status(200).json({
      success: true,
      currency: resolved.code,
      rate: Number(resolved.rate),
      effectiveDate: resolved.effectiveDate,
      isBase: resolved.isBase,
    });
  } catch (error) {
    return handleServiceError(error, res, next);
  }
}

async function convertAmount(req, res, next) {
  try {
    const result = convertQuerySchema.safeParse(req.query);
    if (!result.success) return invalid(res, 'INVALID_CONVERSION_QUERY', result);

    const { amount, from, to, date } = result.data;
    const converted = await currencyService.convertBetween(
      require('../../lib/prisma'),
      organizationId(req),
      { amount, fromCurrency: from, toCurrency: to, date },
    );

    return res.status(200).json({
      success: true,
      amount: Number(converted.amount),
      from: { currency: converted.from.code, rate: Number(converted.from.rate) },
      to: { currency: converted.to.code, rate: Number(converted.to.rate) },
    });
  } catch (error) {
    return handleServiceError(error, res, next);
  }
}

async function create(req, res, next) {
  try {
    const result = createCurrencySchema.safeParse(req.body);
    if (!result.success) return invalid(res, 'INVALID_CURRENCY_DATA', result);

    const currency = await currencyService.createCurrency(organizationId(req), result.data);
    return res.status(201).json({ success: true, currency });
  } catch (error) {
    return handleServiceError(error, res, next);
  }
}

async function update(req, res, next) {
  try {
    const result = updateCurrencySchema.safeParse(req.body);
    if (!result.success) return invalid(res, 'INVALID_CURRENCY_DATA', result);

    const currency = await currencyService.updateCurrency(organizationId(req), req.params.id, result.data);
    return res.status(200).json({ success: true, currency });
  } catch (error) {
    return handleServiceError(error, res, next);
  }
}

async function addRate(req, res, next) {
  try {
    const result = addRateSchema.safeParse(req.body);
    if (!result.success) return invalid(res, 'INVALID_EXCHANGE_RATE', result);

    const currency = await currencyService.addRate(organizationId(req), req.params.id, result.data);
    return res.status(201).json({ success: true, currency });
  } catch (error) {
    return handleServiceError(error, res, next);
  }
}

async function setBase(req, res, next) {
  try {
    const result = setBaseCurrencySchema.safeParse(req.body);
    if (!result.success) return invalid(res, 'INVALID_CURRENCY_DATA', result);

    const base = await currencyService.setBaseCurrency(organizationId(req), result.data.code);
    return res.status(200).json({ success: true, ...base });
  } catch (error) {
    return handleServiceError(error, res, next);
  }
}

async function remove(req, res, next) {
  try {
    const removed = await currencyService.deleteCurrency(organizationId(req), req.params.id);
    return res.status(200).json({ success: true, currency: removed, message: 'Currency removed successfully.' });
  } catch (error) {
    return handleServiceError(error, res, next);
  }
}

module.exports = { addRate, catalogue, convertAmount, create, list, rate, remove, setBase, update };
