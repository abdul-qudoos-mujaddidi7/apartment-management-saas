const { Prisma } = require('@prisma/client');

const Decimal = Prisma.Decimal;

/**
 * Money arithmetic shared by every currency-aware module.
 *
 * A rate is always expressed the same way throughout the system: how many
 * units of the organization's base currency one unit of the foreign currency
 * is worth. So AFN-as-base gives AFN 1, and USD at 63 means "1 USD = 63 AFN".
 * The base currency's rate is therefore always exactly 1.
 */

const MONEY_PLACES = 2;
const RATE_PLACES = 8;

/** Round a value to the storage precision of a money column. */
function asMoney(value) {
  return new Decimal(value || 0).toDecimalPlaces(MONEY_PLACES, Decimal.ROUND_HALF_UP);
}

/** Round a value to the storage precision of a rate column. */
function asRate(value) {
  return new Decimal(value || 0).toDecimalPlaces(RATE_PLACES, Decimal.ROUND_HALF_UP);
}

/** Convert an amount stated in the base currency at no change. */
function sameCurrency(amount) {
  return asMoney(amount);
}

/**
 * Amount in a foreign currency → the base currency.
 * `rate` is base units per 1 unit of the foreign currency.
 */
function toBase(amount, rate) {
  return asMoney(new Decimal(amount || 0).times(new Decimal(rate || 1)));
}

/** Amount in the base currency → a foreign currency. */
function fromBase(amount, rate) {
  const divisor = new Decimal(rate || 0);
  if (divisor.isZero()) return asMoney(0);
  return asMoney(new Decimal(amount || 0).dividedBy(divisor));
}

/**
 * Convert between two currencies whose rates are both quoted against the base
 * currency. Returns the amount unchanged when the rates are identical, which is
 * the whole-organization-single-currency path.
 */
function convert(amount, fromRate, toRate) {
  const from = new Decimal(fromRate || 1);
  const to = new Decimal(toRate || 1);
  if (to.isZero()) return asMoney(0);
  if (from.equals(to)) return asMoney(amount);
  return asMoney(new Decimal(amount || 0).times(from).dividedBy(to));
}

/** Normalise any date-ish value to the UTC midnight MySQL DATE columns store. */
function toDateOnly(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

/** Today, as the DATE columns store it — used when no document date is given. */
function today() {
  return toDateOnly(new Date());
}

module.exports = {
  MONEY_PLACES,
  RATE_PLACES,
  asMoney,
  asRate,
  convert,
  fromBase,
  sameCurrency,
  toBase,
  toDateOnly,
  today,
};
