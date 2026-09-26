/**
 * How a contract writes a number.
 *
 * A contract is assembled on the server — clause text is resolved there — so the
 * figures inside a clause and the figures in the tables beside it have to be
 * written by the same hand. These three helpers are therefore the *only* money,
 * quantity and date formatting a contract uses, and the frontend renders the
 * strings they produce rather than reformatting the raw values.
 *
 * Each one is a port of the matching helper the browser already uses
 * (`frontend/src/utils/formatters.js` and `utils/shamsiDate.js`), with one
 * difference: the locale is pinned to `en-US` rather than left to the host. A
 * browser formats for whoever is looking at it, which is right on screen; a
 * server-rendered document must read the same for everyone, including on the
 * second print of the same contract.
 */

const { MONEY_PLACES } = require('../../lib/money');
const { toShamsi } = require('../../lib/shamsi');

const PERSIAN_DIGITS = '۰۱۲۳۴۵۶۷۸۹';

/** `1234.5` → `1,234.50 AFN`, matching the screen's money figures. */
function formatMoney(value, currency = 'AFN') {
  const amount = Number(value) || 0;
  const grouped = amount.toLocaleString('en-US', {
    minimumFractionDigits: MONEY_PLACES,
    maximumFractionDigits: MONEY_PLACES,
  });

  return `${grouped} ${currency}`;
}

/** A plain quantity — an area, a count of rooms — with no currency attached. */
function formatNumber(value, decimals = 0) {
  const amount = Number(value) || 0;
  return amount.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/**
 * A date as the office's own form rules one: `01 / 07 / 1405` — day, month,
 * year, in the Shamsi calendar and in the digits of the language the document
 * is printed in.
 *
 * The application's screens name the month (`29 سرطان 1405`), which reads well
 * in a table beside other dates. A contract follows the paper it replaces
 * instead, and that paper has ruled its dates in this order — and in this
 * order only — for as long as the office has been issuing it.
 */
function formatDate(value) {
  const parts = toShamsi(value);
  if (!parts) return '—';

  const pad = (number) => String(number).padStart(2, '0');
  return `${pad(parts.jd)} / ${pad(parts.jm)} / ${parts.jy}`;
}

/**
 * How many whole months a lease runs for, which is how a contract states its
 * term — "for a period of (12) months" — rather than as a pair of dates.
 *
 * Rounded to the nearest month, because a term agreed as a year is seldom
 * written as 365 days and the two dates a lease records are what the office and
 * the tenant agreed on, not a calendar calculation. Null when the lease has no
 * usable period, so the token stays visible instead of printing a wrong number.
 */
function monthCount(start, end) {
  const from = new Date(start);
  const to = new Date(end);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || to <= from) return null;

  const months =
    (to.getFullYear() - from.getFullYear()) * 12 +
    (to.getMonth() - from.getMonth()) +
    (to.getDate() - from.getDate()) / 30.44;

  return Math.max(1, Math.round(months));
}

/** A number, or null when there is no value — never a misleading zero. */
function optionalNumber(value) {
  return value === null || value === undefined ? null : Number(value);
}

/** A trimmed string, or null when there is nothing to show. */
function optionalText(value) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text === '' ? null : text;
}

/**
 * The digits a document is written in.
 *
 * A contract in Dari or Pashto is set in the Arabic-Indic numerals its readers
 * use — ۱۴۰۵ rather than 1405 — while an English contract keeps the Latin ones.
 * The twin of this lives in the frontend's `utils/formatters.js`, for the same
 * reason the Shamsi calendar is duplicated: the contract is drawn twice, once
 * here for the PDF and once in the browser for the preview, and the two have to
 * write a number the same way.
 */
function toDocumentDigits(value, language = 'en') {
  const text = value === null || value === undefined ? '' : String(value);
  if (language !== 'fa' && language !== 'ps') return text;

  return text.replace(/[0-9]/g, (digit) => PERSIAN_DIGITS[Number(digit)]);
}

module.exports = {
  formatDate,
  formatMoney,
  formatNumber,
  monthCount,
  optionalNumber,
  optionalText,
  toDocumentDigits,
};
