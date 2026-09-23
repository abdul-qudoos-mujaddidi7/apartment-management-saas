/**
 * Sort the rows a page already holds, by a dotted path into each row.
 *
 * The index tables are drawn with a sort caret on every column, so a header is
 * only honest if pressing it does something. Sorting lives here and is driven by
 * the `data-sort` attribute a page puts on its header cells — `DataTable` reads
 * that attribute, announces the state through `aria-sort` and dispatches `sort`
 * with `{ key, dir }`; the page hands that to this function.
 *
 * Rows arrive from the API already paged, so this orders the page in view rather
 * than the whole result set. When a list outgrows one page the sort belongs on
 * the server; the call site does not change, only what feeds it.
 */
export function sortRows(rows, key, dir = 'asc') {
  if (!key || !Array.isArray(rows)) return rows;

  const factor = dir === 'desc' ? -1 : 1;
  return [...rows].sort((a, b) => factor * compare(read(a, key), read(b, key)));
}

function read(row, path) {
  return path.split('.').reduce((value, part) => (value === null || value === undefined ? value : value[part]), row);
}

function compare(a, b) {
  // Numbers first, so a column of amounts or counts sorts by value and not by
  // its text ("9" after "10" is the bug this avoids).
  const asNumber = typeof a === 'number' ? a : Number(String(a ?? '').trim());
  const bsNumber = typeof b === 'number' ? b : Number(String(b ?? '').trim());
  const numeric = !Number.isNaN(asNumber) && !Number.isNaN(bsNumber) && String(a).trim() !== '' && String(b).trim() !== '';
  if (numeric) return asNumber - bsNumber;

  // Dates, then text. `localeCompare` with `numeric` gets "Apartment 2" before
  // "Apartment 10" and keeps non-Latin scripts in their own order.
  const asDate = toDate(a);
  const bsDate = toDate(b);
  if (asDate !== null && bsDate !== null) return asDate - bsDate;

  // Empty values sit last whichever way the column is sorted, so a list does not
  // open on a run of dashes.
  const aEmpty = a === null || a === undefined || a === '';
  const bEmpty = b === null || b === undefined || b === '';
  if (aEmpty !== bEmpty) return aEmpty ? 1 : -1;

  return String(a ?? '').localeCompare(String(b ?? ''), undefined, { numeric: true, sensitivity: 'base' });
}

function toDate(value) {
  if (typeof value !== 'string' || value.length < 8 || !/^\d{4}-\d{2}-\d{2}/.test(value)) return null;
  const time = Date.parse(value);
  return Number.isNaN(time) ? null : time;
}
