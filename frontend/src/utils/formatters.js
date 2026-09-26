import { PERSIAN_DIGITS, formatShamsiDate } from './shamsiDate';

export function formatMoney(value, currency = 'AFN') {
  const num = Number(value) || 0;
  const formatted = num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${formatted} ${currency}`;
}

export function formatNumber(value, decimals = 0) {
  const num = Number(value) || 0;
  return num.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

export function formatDate(value) {
  return formatShamsiDate(value, { monthName: true });
}

export function formatShortDate(value) {
  return formatShamsiDate(value);
}

/**
 * The digits a document is written in.
 *
 * A contract in Dari or Pashto is set in the Arabic-Indic numerals its readers
 * use — ۱۴۰۵ rather than 1405 — while an English contract keeps the Latin ones.
 * Only the printed document does this: the console's own figures stay as they
 * are, because they are read alongside menus, filters and inputs where the two
 * shapes would fight.
 */
export function toDocumentDigits(value, language = 'en') {
  const text = value === null || value === undefined ? '' : String(value);
  if (language !== 'fa' && language !== 'ps') return text;

  return text.replace(/[0-9]/g, (digit) => PERSIAN_DIGITS[Number(digit)]);
}
