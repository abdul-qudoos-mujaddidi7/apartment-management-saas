<script>
  /**
   * Data table region.
   *
   * Renders the table plus its toolbar, loading/empty states and footer. The
   * page supplies `<thead>` and `<tbody>` through the default slot; `.col-start`
   * marks cells that read from the leading edge, `.actions-cell` /
   * `.actions-heading` mark the trailing action column. Cells read from the
   * leading edge by default and long text is ellipsised, matching the ERP index
   * tables. The action column is exempt: it holds controls, so it is measured and
   * pinned to its own content (see `fitActionColumn`).
   *
   * Slots: toolbar, empty-action, footer, default (thead + tbody)
   */

  import { afterUpdate, createEventDispatcher, onMount, tick } from 'svelte';

  const dispatch = createEventDispatcher();

  export let loading = false;
  export let isEmpty = false;
  export let loadingLabel = 'Loading…';
  export let emptyLabel = 'No records found.';
  export let emptyIcon = 'bi-table';
  export let className = '';
  export let minTableWidth = '60rem';
  export let showFooter = true;
  export let ariaLabel = '';

  /** Tighter row rhythm. */
  export let dense = true;
  /** Zebra rows. */
  export let striped = false;
  /** Row hover tint. */
  export let hover = false;
  /** Keep the header visible while the body scrolls. */
  export let stickyHeader = true;
  /** `fixed` keeps columns even; `auto` sizes them to content. */
  export let layout = 'fixed';
  /** `thin` | `hidden` | `normal` */
  export let scrollbar = 'thin';
  /** Truncate long cell content with an ellipsis. */
  export let clipCells = true;
  /**
   * The column currently sorted, and which way. Pages own the sorting itself —
   * they hold the rows — but the table owns the affordance: a header cell marked
   * `data-sort="field"` becomes a control with the reference's up/down caret, and
   * dispatching `sort` with `{ key, dir }` is the page's cue to reorder.
   */
  export let sortKey = null;
  export let sortDir = 'asc';

  $: tableLayout = layout === 'auto' ? 'auto' : 'fixed';
  $: scrollbarMode = ['thin', 'hidden', 'normal'].includes(scrollbar) ? scrollbar : 'thin';

  let tableEl;
  /** Pinned width of the trailing action column, in px. 0 = let the table decide. */
  let actionsWidth = 0;

  /**
   * `table-layout: fixed` hands every column an equal share, which is fine for
   * text (long values are ellipsised) but silently eats row controls: a four-icon
   * action cell needs ~180px and was being given ~108px, so the trailing buttons
   * were clipped out of sight. Measure how wide the column's content really is and
   * pin the column to it — a control is never truncatable, so it is sized, not
   * clipped.
   *
   * `scrollWidth` is the measure to use: it is `max(current column width, what the
   * content needs)`, so it settles on the content's own width after one pass and
   * then stops changing. Adding padding on top would feed the result back in and
   * grow the column on every pass (an endless update loop); the value already
   * accounts for the cell's padding.
   */
  async function fitActionColumn() {
    await tick();
    if (!tableEl) return;
    const cells = tableEl.querySelectorAll('.actions-heading, .actions-cell');
    if (cells.length === 0) { actionsWidth = 0; return; }
    let widest = 0;
    for (const cell of cells) widest = Math.max(widest, measureCell(cell));
    actionsWidth = Math.ceil(widest);
  }

  /**
   * What a cell's content actually needs, padding included.
   *
   * `scrollWidth` used to stand in for this and was wrong in the other
   * direction: it is `max(current width, content)`, so once the column was wider
   * than its controls — which is what happens as soon as a row carries a kebab
   * rather than two labelled buttons — it reported the column, and the pin held
   * the column wide forever. Measuring the children instead lets the control
   * column shrink to its controls. A heading holds no children, so its text is
   * measured through a range.
   */
  function measureCell(cell) {
    const style = getComputedStyle(cell);
    const padding = (parseFloat(style.paddingInlineStart) || 0) + (parseFloat(style.paddingInlineEnd) || 0);
    if (cell.children.length === 0) {
      const range = document.createRange();
      range.selectNodeContents(cell);
      return range.getBoundingClientRect().width + padding;
    }
    const gap = parseFloat(style.columnGap || style.gap) || 0;
    let content = gap * Math.max(0, cell.children.length - 1);
    for (const child of cell.children) content += child.getBoundingClientRect().width;
    return content + padding;
  }

  /**
   * Any column whose data cells carry `.amount-cell` need their header
   * right-aligned too, so headers and data share the same edge. Pages that
   * forget to add the class to `<th>` still get correct alignment — this
   * detects the column position from the data and pins the header.
   */
  function syncAmountHeaders() {
    if (!tableEl) return;
    const headerCells = tableEl.querySelectorAll('thead th');
    const firstRow = tableEl.querySelector('tbody tr');
    if (!firstRow) return;
    const dataCells = firstRow.children;
    for (let i = 0; i < headerCells.length; i++) {
      if (dataCells[i]?.classList.contains('amount-cell')) {
        headerCells[i].classList.add('amount-cell');
      }
    }
  }

  /**
   * The row's identity is the first cell that is neither the checkbox column nor
   * the action column — that is the one cell drawn at full strength, and the rest
   * rest at `--table-muted`. Marked here rather than in twelve page templates so
   * every list picks up the same reading order, and a page can still say
   * otherwise by putting `.cell-strong` or `.cell-muted` on a cell itself.
   */
  function markLeadCells() {
    if (!tableEl) return;
    for (const row of tableEl.querySelectorAll('tbody tr')) {
      const cells = [...row.children];
      const lead = cells.find(cell =>
        !cell.classList.contains('select-column') &&
        !cell.classList.contains('actions-cell') &&
        !cell.classList.contains('cell-muted')
      );
      for (const cell of cells) cell.classList.toggle('cell-lead', cell === lead);
    }
  }

  /** Sortable header: keyboard-reachable, and announced as sorted or not. */
  function enhanceHeaders() {
    if (!tableEl) return;
    for (const th of tableEl.querySelectorAll('th[data-sort]')) {
      th.tabIndex = 0;
      th.setAttribute(
        'aria-sort',
        th.dataset.sort === sortKey ? (sortDir === 'desc' ? 'descending' : 'ascending') : 'none'
      );
    }
  }

  function requestSort(th) {
    const key = th?.dataset?.sort;
    if (!key) return;
    // Re-pressing the sorted column flips it; any new column starts ascending.
    dispatch('sort', { key, dir: key === sortKey && sortDir === 'asc' ? 'desc' : 'asc' });
  }

  function onTableClick(event) {
    const th = event.target.closest?.('th[data-sort]');
    if (th) requestSort(th);
  }

  function onTableKeydown(event) {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    const th = event.target.closest?.('th[data-sort]');
    if (!th) return;
    event.preventDefault();
    requestSort(th);
  }

  onMount(fitActionColumn);
  afterUpdate(() => { fitActionColumn(); syncAmountHeaders(); markLeadCells(); enhanceHeaders(); });
</script>

<section
  class={`data-table-panel ${className}`.trim()}
  aria-live="polite"
  aria-busy={loading}
>
  {#if $$slots.toolbar}
    <div class="data-table-toolbar">
      <slot name="toolbar" />
    </div>
  {/if}

  {#if loading}
    <div class="panel-loader">
      <div class="spinner-border text-primary" role="status">
        <span class="visually-hidden">{loadingLabel}</span>
      </div>
    </div>
  {:else if isEmpty}
    <div class="empty-state">
      <i class={`bi ${emptyIcon}`} aria-hidden="true"></i>
      <p>{emptyLabel}</p>
      <slot name="empty-action" />
    </div>
  {:else}
    <div
      class="data-table-wrap"
      class:scrollbar-thin={scrollbarMode === 'thin'}
      class:scrollbar-hidden={scrollbarMode === 'hidden'}
      class:scrollbar-normal={scrollbarMode === 'normal'}
    >
      <!-- svelte-ignore a11y-click-events-have-key-events, a11y-no-noninteractive-element-interactions -->
      <table
        class="data-table"
        bind:this={tableEl}
        on:click={onTableClick}
        on:keydown={onTableKeydown}
        style:--table-actions-width={actionsWidth ? `${actionsWidth}px` : undefined}
        class:data-table--dense={dense}
        class:data-table--striped={striped}
        class:data-table--hover={hover}
        class:data-table--sticky={stickyHeader}
        class:data-table--clip-cells={clipCells}
        style:min-width={minTableWidth}
        style:table-layout={tableLayout}
        aria-label={ariaLabel || undefined}
      >
        <slot />
      </table>
    </div>
  {/if}

  {#if showFooter && $$slots.footer}
    <footer class="data-table-footer">
      <slot name="footer" />
    </footer>
  {/if}
</section>

<style>
  .data-table-panel {
    display: flex;
    flex: 1 1 auto;
    flex-direction: column;
    min-width: 0;
    min-height: 120px;
    overflow: hidden;
    border: 1px solid var(--card-border);
    border-radius: var(--card-radius);
    background: var(--surface);
    box-shadow: var(--card-shadow);
  }

  /* --- Toolbar ---------------------------------------------------------- */

  /* Toolbar sits flush against the column header — same background, no
     border between them, so search + chips + header form one continuous band. */
  .data-table-toolbar {
    flex: 0 0 auto;
    padding: 0.625rem var(--index-gutter, var(--space-4));
    background: var(--surface-sunken);
  }

  /* --- Scroll area ------------------------------------------------------ */

  .data-table-wrap {
    width: 100%;
    min-width: 0;
    min-height: 0;
    flex: 1 1 auto;
    overflow: auto;
    -webkit-overflow-scrolling: touch;
  }

  .scrollbar-thin {
    scrollbar-width: thin;
    scrollbar-color: var(--ink-300) transparent;
  }

  .scrollbar-thin::-webkit-scrollbar { width: 6px; height: 6px; }
  .scrollbar-thin::-webkit-scrollbar-track { background: transparent; }
  .scrollbar-thin::-webkit-scrollbar-thumb {
    border-radius: var(--radius-pill);
    background: var(--ink-300);
  }
  .scrollbar-thin::-webkit-scrollbar-thumb:hover { background: var(--ink-400); }

  .scrollbar-hidden {
    scrollbar-width: none;
    -ms-overflow-style: none;
  }
  .scrollbar-hidden::-webkit-scrollbar { display: none; width: 0; height: 0; }

  .scrollbar-normal { scrollbar-width: auto; }

  /* --- Table ------------------------------------------------------------ */

  .data-table {
    width: 100%;
    margin: 0;
    border-collapse: separate;
    border-spacing: 0;
    color: var(--table-muted);
    font-size: var(--table-font-size, 0.8125rem);
    /* The sort carets, drawn rather than typed: two chevrons stacked for a
       column that can be sorted both ways, one when it is sorted. Masks so the
       mark takes the header's own colour and weight. */
    --caret-both: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 12 12'%3E%3Cpath d='M2.3 8.2 6 4.5l3.7 3.7' fill='none' stroke='%23000' stroke-width='1.6' stroke-linecap='round' stroke-linejoin='round'/%3E%3Cpath d='M2.3 3.8 6 7.5l3.7-3.7' fill='none' stroke='%23000' stroke-width='1.6' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");
    --caret-up: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 12 12'%3E%3Cpath d='M2.3 8.3 6 4.6l3.7 3.7' fill='none' stroke='%23000' stroke-width='1.7' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");
    --caret-down: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 12 12'%3E%3Cpath d='M2.3 3.7 6 7.4l3.7-3.7' fill='none' stroke='%23000' stroke-width='1.7' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");
  }

  /* Header row: a 36px label strip, not a header row — same white as the rows,
     closed by one hairline, muted labels with the sort caret. Labels arrive from
     the locales already written as "Building name", so the header keeps the
     author's capitalisation instead of shouting in caps. */
  .data-table :global(thead th) {
    height: var(--table-head-height, 36px);
    padding: 0 var(--table-cell-pad-inline);
    border-block-start: 0;
    border-block-end: 1px solid var(--table-head-line, var(--card-border));
    background: var(--table-head-bg);
    color: var(--text-muted);
    font-size: var(--table-head-font-size, 0.75rem);
    font-weight: var(--weight-semibold);
    letter-spacing: 0.01em;
    line-height: 1.25;
    text-align: start;
    vertical-align: middle;
    white-space: nowrap;
  }

  /* A sortable column: the whole label is the control, with the caret riding at
     its end. The caret is decoration for the eye — `aria-sort` is what a screen
     reader reads. */
  .data-table :global(thead th[data-sort]) {
    cursor: pointer;
    user-select: none;
    transition: color 0.15s ease;
  }

  .data-table :global(thead th[data-sort]:hover),
  .data-table :global(thead th[aria-sort='ascending']),
  .data-table :global(thead th[aria-sort='descending']) {
    color: var(--text-strong);
  }

  .data-table :global(thead th[data-sort]::after) {
    content: '';
    display: inline-block;
    width: 7px;
    height: 9px;
    margin-inline-start: 5px;
    vertical-align: -1px;
    background-color: currentColor;
    opacity: 0.5;
    -webkit-mask: var(--caret-both) center / contain no-repeat;
    mask: var(--caret-both) center / contain no-repeat;
  }

  .data-table :global(thead th[aria-sort='ascending']::after) {
    opacity: 1;
    -webkit-mask-image: var(--caret-up);
    mask-image: var(--caret-up);
  }

  .data-table :global(thead th[aria-sort='descending']::after) {
    opacity: 1;
    -webkit-mask-image: var(--caret-down);
    mask-image: var(--caret-down);
  }

  .data-table--sticky :global(thead th) {
    position: sticky;
    inset-block-start: 0;
    z-index: 5;
  }

  .data-table :global(tbody tr) {
    background: var(--surface);
  }

  .data-table :global(tbody td) {
    padding: var(--table-cell-pad-block) var(--table-cell-pad-inline);
    border-block-end: 1px solid var(--table-row-line, var(--card-border));
    background: inherit;
    color: var(--table-muted);
    font-size: var(--table-font-size, 0.8125rem);
    line-height: 1.5;
    text-align: start;
    vertical-align: middle;
    white-space: nowrap;
  }

  /* One strong cell per row — the identity, marked by `markLeadCells`. */
  .data-table :global(tbody td.cell-lead),
  .data-table :global(tbody td.cell-strong) {
    color: var(--text-strong);
    font-weight: var(--weight-semibold);
  }

  /* The identity usually *is* the way into the row, but the reference draws it as
     dark bold text rather than a blue link — the whole row is the affordance
     there. So the link inherits the cell's ink and reveals itself on hover or
     keyboard focus, where the pointer already is.
     Anything with its own colour (a badge, an icon button) is untouched. */
  .data-table :global(td.cell-lead a),
  .data-table :global(td.cell-lead button.table-link) {
    color: inherit;
    text-decoration: none;
  }

  .data-table :global(td.cell-lead a:hover),
  .data-table :global(td.cell-lead a:focus-visible),
  .data-table :global(td.cell-lead button.table-link:hover),
  .data-table :global(td.cell-lead button.table-link:focus-visible) {
    color: var(--accent-text);
    text-decoration: underline;
    text-underline-offset: 2px;
  }

  .data-table :global(td.cell-lead a:hover .entity-icon),
  .data-table :global(td.cell-lead a:focus-visible .entity-icon) {
    color: var(--accent-text);
  }

  .data-table :global(td.cell-lead .entity-icon) {
    width: 1.5rem;
    height: 1.5rem;
    flex: 0 0 1.5rem;
    color: var(--table-muted);
    background: var(--surface-hover);
    font-size: 0.8rem;
  }

  /* A softer sub-line under a strong cell — the apartment's name under its
     number, and the like. */
  .data-table :global(tbody td small.cell-sub) {
    display: block;
    color: var(--table-muted);
    font-size: var(--text-xs);
    font-weight: var(--weight-medium);
  }

  .data-table :global(tbody tr:last-child td) {
    border-block-end-color: transparent;
  }

  /* 44px label strip, 48px rows: room enough for a 24px status pill to sit
     centred in its row without the row growing, which is what keeps a long
     list scannable. */
  .data-table--dense :global(thead th) {
    height: var(--table-head-height, 36px);
    padding-block: 0;
  }

  .data-table--striped :global(tbody tr:nth-child(even)) {
    background: var(--surface-muted);
  }

  .data-table--hover :global(tbody tr:hover) {
    background: var(--surface-hover);
  }

  .data-table--clip-cells :global(tbody td) {
    overflow: hidden;
    text-overflow: ellipsis;
  }

  /* Alignment helpers supplied by page markup. */
  .data-table :global(.col-start),
  .data-table :global(.cell-start) {
    text-align: start;
  }

  /* Trailing action column: end-aligned, never squeezed below its controls
     (`fitActionColumn` supplies the measured width), and never truncated — the
     clip-cells rule below would ellipsise a row control sitting exactly on the
     cell's content edge, which silently replaces a button with "…". */
  .data-table :global(.actions-heading),
  .data-table :global(.actions-cell) {
    width: var(--table-actions-width, auto);
    overflow: visible;
    text-overflow: clip;
    text-align: end;
  }

  .data-table :global(.actions-cell) { white-space: nowrap; }

  .data-table :global(.sort-icon) { margin-inline-start: 0.25rem; }

  .data-table :global(td > *) {
    margin-block: 0;
  }

  .data-table :global(.status-badge),
  .data-table :global(button),
  .data-table :global(.entity-link) {
    vertical-align: middle;
  }

  /* --- Selection column ------------------------------------------------- */

  /* Leading checkbox column. Pages mark the cells themselves, because they own
     the rows; the box sits on the panel's own gutter, so its left edge lines up
     with the toolbar's search field above it (both start at `--index-gutter`)
     and with the footer below it. The width is exactly the gutter plus the box
     plus the trailing gap, so the centred box lands on the gutter — the old
     fixed 2.75rem column put it a little to the left of everything else, which
     only showed up once the gutter grew on wider screens. */
  .data-table :global(.select-column) {
    width: calc(var(--index-gutter, var(--space-4)) + 1.8125rem);
    padding-inline: var(--index-gutter, var(--space-4)) 0.75rem;
    text-align: center;
  }

  /* Amount/number cells stay right-aligned — figures read better when their
     decimal points line up, and the column header was already right-aligned in
     most pages. */
  .data-table :global(.amount-cell) {
    text-align: end;
  }

  /* Declared after the striped/hover variants so a checked row stays visibly
     checked while the pointer is over it. */
  .data-table :global(tbody tr.is-selected) {
    background: var(--accent-soft);
  }

  .data-table :global(tbody tr.is-selected:hover) {
    background: var(--accent-tint);
  }

  /* --- Footer ----------------------------------------------------------- */

  .data-table-footer {
    display: flex;
    align-items: center;
    flex: 0 0 auto;
    min-height: 3.25rem;
    padding: var(--space-2) var(--index-gutter, var(--space-4));
    border-block-start: 1px solid var(--border);
    background: var(--surface);
  }
</style>
