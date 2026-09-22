/**
 * Format a numeric value as money with currency suffix.
 * Displays as "15,000.00 AFN" — never "AFN 15,000.00".
 */
export function formatMoney(value, currency = 'AFN') {
  const num = Number(value) || 0;
  const formatted = num.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${formatted} ${currency}`;
}

/**
 * Format a number with locale-aware grouping.
 */
export function formatNumber(value, decimals = 0) {
  const num = Number(value) || 0;
  return num.toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/**
 * Format an ISO date string to a short display format.
 * "2026-09-14" → "14 Sep 2026"
 */
export function formatDate(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

/**
 * Format an ISO date string to a short date only.
 * "2026-09-14" → "14/09/2026"
 */
export function formatShortDate(value) {
  if (!value) return '—';
  return String(value).slice(0, 10);
}
