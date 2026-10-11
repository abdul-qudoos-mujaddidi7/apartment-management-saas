/**
 * The one description of a report, read by both writers.
 *
 * A page builds a report once and hands it to the Excel writer or the PDF
 * writer; neither of them may look at the page, the DOM or the locale itself.
 * That is the whole point of this file: a spreadsheet and a PDF of the same
 * list can never disagree about what a column is called, which way a number is
 * aligned or what a total comes to, because there is only one description of
 * the report and both writers read it.
 *
 * A `column` declares what a value *is*; the writers decide how to draw it:
 *
 *   { label: 'Amount', kind: 'money' }   → 12,345.00 AFN  ·  numeric cell with
 *                                          a 2-decimal format in Excel, right
 *                                          aligned in both
 *   { label: 'Count', kind: 'number' }   → 12  ·  ... the same, whole numbers
 *   { label: 'Date',  kind: 'date' }     → ۱۴۰۵/۰۷/۱۹  ·  the Shamsi date the
 *                                          console itself prints
 *   { label: 'Name' }                    → text, left aligned
 *
 * Rows are positional — `row[0]` belongs to `columns[0]` — because that is what
 * a page already has when it maps its records, and a row that is one cell short
 * still lines up under its own headers.
 *
 * This module must stay free of `document` and of the locale store: the unit
 * tests that exercise the writers run it in plain Node.
 */

import { formatNumber, formatShortDate } from '../formatters.js';

/** Excel refuses a sheet name longer than 31 characters or holding : \ / ? * [ ] */
const SHEET_NAME_LIMIT = 31;
const SHEET_NAME_ILLEGAL = /[:\\/?*[\]]/g;

/** How many decimals money carries. The currency itself is stated per column. */
const MONEY_DECIMALS = 2;

/** Columns are sized from their content, within these bounds (characters). */
const MIN_WIDTH = 9;
const MAX_WIDTH = 46;

/**
 * @param {object} spec
 * @param {string} spec.title          Report title — the top band.
 * @param {string} [spec.subtitle]     One line under the title (account, filter).
 * @param {string} [spec.company]      Organisation name; falls back to the app.
 * @param {string[]} [spec.meta]       Small print lines under the header band.
 * @param {{label: string, value: any}[]} [spec.metrics]
 * @param {Array<object|string>} spec.columns  Header cells, or column specs.
 * @param {Array<Array<any>>} spec.rows
 * @param {Array<any>|null} [spec.totals] Aligned with `columns`; drawn as a
 *   closing band. The first cell is normally the word "Total".
 * @param {string} [spec.fileName]     Without extension; a timestamp is added.
 * @param {string} [spec.sheetName]
 * @param {string} [spec.currency]     Currency code printed after money cells.
 * @param {string} [spec.language]     'en' | 'fa' | 'ps' — sets document direction.
 */
export function createReport(spec = {}) {
  const rows = Array.isArray(spec.rows) ? spec.rows : [];
  const columns = (spec.columns || []).map((column, index) => normalizeColumn(column, index, rows));
  const title = text(spec.title);
  // An unstated language is read as English, not as Dari: a page that forgets
  // to pass one should produce a report the console itself can be read beside.
  const language = spec.language === 'fa' || spec.language === 'ps' ? spec.language : 'en';

  return {
    title,
    subtitle: text(spec.subtitle),
    company: text(spec.company),
    meta: (spec.meta || []).map(text).filter(Boolean),
    metrics: (spec.metrics || [])
      .map((metric) => ({ label: text(metric?.label), value: metric?.value }))
      .filter((metric) => metric.label),
    columns,
    // Every row is squared up to the column count: a writer loops over columns,
    // and a ragged row is a hole in its output, not a shorter row.
    rows: rows.map((row) => columns.map((_, index) => (Array.isArray(row) ? row[index] : undefined))),
    totals: Array.isArray(spec.totals) ? spec.totals : null,
    fileName: slug(spec.fileName || title || 'report'),
    sheetName: sheetName(spec.sheetName || title),
    currency: text(spec.currency),
    language,
    rtl: language !== 'en'
  };
}

/** A column spec from either a plain label or a full spec object. */
function normalizeColumn(column, index, rows) {
  const spec = typeof column === 'string' ? { label: column } : column || {};
  const values = rows.map((row) => (Array.isArray(row) ? row[index] : undefined)).filter(isPresent);
  const kind = spec.kind || (values.length > 0 && values.every(isNumeric) ? 'number' : 'text');

  return {
    label: text(spec.label) || String(index + 1),
    kind,
    // `decimals` only ever narrows a number column; money keeps its two.
    decimals: Number.isInteger(spec.decimals) ? spec.decimals : kind === 'money' ? MONEY_DECIMALS : 0,
    // Text reads from the start of the cell, figures from the end: a column of
    // amounts must line up under the last digit to be scannable.
    align: spec.align || (kind === 'money' || kind === 'number' ? 'end' : kind === 'date' ? 'center' : 'start')
  };
}

/**
 * A cell as it is read — Shamsi dates, grouped figures, the currency after the
 * amount. Excel and the PDF both draw this; only Excel *also* keeps the raw
 * number, so a reader can still sum the column.
 */
export function displayCell(report, column, value) {
  if (!isPresent(value)) return '';
  if (column.kind === 'money') return money(value, report.currency, column.decimals);
  if (column.kind === 'number') return formatNumber(Number(value), column.decimals);
  // A date column can still carry a word — a totals row puts "Total" in the
  // first cell whatever that cell happens to be — so text that is not a date is
  // written as the text it is rather than as an unreadable dash.
  if (column.kind === 'date') {
    const shamsi = formatShortDate(value);
    return shamsi === '—' ? String(value) : shamsi;
  }
  return String(value);
}

/** The same cell for a spreadsheet: a figure stays a figure, a word stays a word. */
export function rawCell(column, value) {
  if (!isPresent(value)) return null;
  if (column.kind === 'money' || column.kind === 'number') {
    const number = Number(value);
    return Number.isFinite(number) ? number : String(value);
  }
  return String(value);
}

/** Money with the currency code after it, grouped, always two decimals. */
export function money(value, currency = '', decimals = MONEY_DECIMALS) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return String(value ?? '');
  const formatted = formatNumber(amount, decimals);
  return currency ? `${formatted} ${currency}` : formatted;
}

/**
 * Column widths in characters, measured on the *displayed* text rather than on
 * the raw value — "12,345.00 AFN" is what has to fit, not `12345`.
 */
export function columnWidths(report) {
  return report.columns.map((column, index) => {
    let longest = visualLength(column.label);
    for (const row of report.rows) longest = Math.max(longest, visualLength(displayCell(report, column, row[index])));
    if (report.totals) longest = Math.max(longest, visualLength(displayCell(report, column, report.totals[index])));
    return Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, longest + 3));
  });
}

/** Where a column's text sits, as the writers' own vocabulary. */
export function horizontalAlign(column) {
  return column.align === 'end' ? 'right' : column.align === 'center' ? 'center' : 'left';
}

/** A file name safe on every platform, without its extension. */
export function slug(value) {
  return (
    text(value)
      .toLowerCase()
      .replace(/[\s_]+/g, '-')
      .replace(/[^\p{Letter}\p{Number}-]+/gu, '')
      .replace(/-{2,}/g, '-')
      .replace(/^-|-$/g, '') || 'report'
  );
}

/** `name-2026-10-11-1435` — sortable, unambiguous, and never overwrites. */
export function stampedFileName(report, extension, now = new Date()) {
  const pad = (value) => String(value).padStart(2, '0');
  const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`;
  return `${report.fileName}-${stamp}.${extension}`;
}

function sheetName(value) {
  const name = text(value).replace(SHEET_NAME_ILLEGAL, ' ').trim() || 'Report';
  return name.slice(0, SHEET_NAME_LIMIT);
}

/** Text width, counted so a wide Arabic string does not shrink its column. */
function visualLength(value) {
  return [...text(value)].reduce((total, character) => total + (character.charCodeAt(0) > 0x2ff ? 1.7 : 1), 0);
}

const isPresent = (value) => value !== null && value !== undefined && value !== '';
const isNumeric = (value) => typeof value === 'number' ? Number.isFinite(value) : isPresent(value) && Number.isFinite(Number(value));
const text = (value) => (value === null || value === undefined ? '' : String(value).trim());
