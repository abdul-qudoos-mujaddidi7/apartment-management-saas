import { formatShamsiDate } from './shamsiDate';

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
