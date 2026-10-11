/**
 * The identity every export wears: whose workspace it came from, which language
 * it is written in, and which currency its figures are stated in.
 *
 * A page should not have to remember these. It says *what* it is exporting —
 * title, columns, rows — and spreads this in, so an invoice list exported from
 * Dari opens right-to-left with Dari dates, and the same list exported from
 * English does not, without either page knowing that happened.
 */

import { get } from 'svelte/store';
import { language, locale } from '../../i18n';
import { user } from '../../stores/auth';
import { baseCurrency } from '../../stores/currency';

/**
 * @returns {{ company: string, language: string, currency: string,
 *             generatedLabel: string }}
 */
export function reportIdentity() {
  const current = get(locale);
  return {
    // The organisation is the name on the document; beside it, the product is
    // the fallback, so a report is never headed by an empty line.
    company: get(user)?.organizations?.[0]?.name || current.common.apartmentPro,
    language: get(language),
    currency: get(baseCurrency)
  };
}

/**
 * The line of small print under the title: what this export covers and when it
 * was taken. Pages pass their own filter descriptions — a building, a date
 * range, an account — and this says when.
 */
export function generatedLine() {
  const now = new Date();
  const pad = (value) => String(value).padStart(2, '0');
  return `${pad(now.getFullYear())}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
}
