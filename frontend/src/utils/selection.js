/**
 * Row-selection helpers for the DataTable checkbox column.
 *
 * Pages hold a plain `Set` of selected row ids and reassign it from these
 * helpers, so Svelte's reactivity sees a new value without a store. Every
 * helper returns a fresh Set and never mutates the one it was given.
 */

/** An empty selection. */
export function createSelection() {
  return new Set();
}

export function isSelected(selected, id) {
  return selected.has(id);
}

/** True when every id on the current page is selected (an empty list is not "all"). */
export function isAllSelected(selected, ids) {
  return ids.length > 0 && ids.every((id) => selected.has(id));
}

/** True for the mixed state: some rows on, some off. 
 *  Drives the indeterminate look of the header box. */
export function isSomeSelected(selected, ids) {
  return !isAllSelected(selected, ids) && ids.some((id) => selected.has(id));
}

/** Toggle a single row. */
export function toggleSelected(selected, id) {
  const next = new Set(selected);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}

/** Toggle every id on the current page — the header box. */
export function toggleAllSelected(selected, ids) {
  const next = new Set(selected);
  if (isAllSelected(next, ids)) ids.forEach((id) => next.delete(id));
  else ids.forEach((id) => next.add(id));
  return next;
}
