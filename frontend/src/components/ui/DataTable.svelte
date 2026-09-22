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

  import { afterUpdate, onMount, tick } from 'svelte';

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
    for (const cell of cells) widest = Math.max(widest, cell.scrollWidth);
    actionsWidth = Math.ceil(widest);
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

  onMount(fitActionColumn);
  afterUpdate(() => { fitActionColumn(); syncAmountHeaders(); });
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
      <table
        class="data-table"
        bind:this={tableEl}
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
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    background: var(--surface);
    box-shadow: var(--shadow-sm);
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
    color: var(--ink-600);
    font-size: var(--table-font-size, 0.8125rem);
  }

  /* Header row: light fill band with sentence-case labels and sort icons.
     Labels arrive from the locales already written as "Building name", so the
     header keeps the author's capitalisation instead of shouting in caps. */
  .data-table :global(thead th) {
    padding: var(--table-cell-pad-block) var(--table-cell-pad-inline);
    border-block: 1px solid var(--border);
    background: var(--surface-sunken);
    color: var(--text-muted);
    font-size: var(--table-head-font-size, 0.6875rem);
    font-weight: var(--weight-heavy);
    letter-spacing: 0.01em;
    line-height: 1.25;
    text-align: start;
    vertical-align: middle;
    white-space: nowrap;
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
    border-block-end: 1px solid var(--border);
    background: inherit;
    font-size: var(--table-font-size, 0.8125rem);
    line-height: 1.5;
    text-align: start;
    vertical-align: middle;
    white-space: nowrap;
  }

  .data-table :global(tbody tr:last-child td) {
    border-block-end-color: transparent;
  }

  .data-table--dense :global(thead th) {
    height: 3rem;
    padding-block: 0.625rem;
  }

  .data-table--dense :global(tbody td) {
    padding-block: 0.4rem;
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
