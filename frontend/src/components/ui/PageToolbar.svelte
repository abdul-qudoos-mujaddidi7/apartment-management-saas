<script>
  /**
   * Page toolbar — one row of page controls.
   *
   * Reading order: search field, then the tab chips, then the filters button
   * and the page actions. Anything the page cannot express as a chip belongs in
   * the `filters` slot, which opens in a panel under the button; the button
   * carries the count of active filters so the row stays honest when the panel
   * is closed.
   *
   * Slots: tabs (chips), filters (panel body), actions
   */

  import { onDestroy, onMount } from 'svelte';
  import ActionButton from './ActionButton.svelte';

  export let search = '';
  export let searchPlaceholder = '';
  export let showSearch = true;
  export let addLabel = '';
  export let showAdd = true;
  export let resetLabel = '';
  export let onSearch = () => {};
  export let onAdd = () => {};
  export let onReset = () => {};

  /** Button caption for the filter panel. */
  export let filtersLabel = 'Filters';
  /** How many filters are currently narrowing the list — shown as a badge. */
  export let filtersCount = 0;
  /** Reset caption; the button only appears while a filter is active. */
  export let filtersClearLabel = '';
  export let onClearFilters = () => {};

  let filtersOpen = false;
  let filtersAnchor;

  const PANEL_ID = 'index-filters-panel';

  function handleDocumentPointerDown(event) {
    if (!filtersOpen) return;
    if (filtersAnchor && !filtersAnchor.contains(event.target)) filtersOpen = false;
  }

  function handleDocumentKeydown(event) {
    if (event.key === 'Escape' && filtersOpen) {
      filtersOpen = false;
      filtersAnchor?.querySelector('.filters-button')?.focus();
    }
  }

  onMount(() => {
    document.addEventListener('pointerdown', handleDocumentPointerDown);
    document.addEventListener('keydown', handleDocumentKeydown);
  });

  onDestroy(() => {
    document.removeEventListener('pointerdown', handleDocumentPointerDown);
    document.removeEventListener('keydown', handleDocumentKeydown);
  });
</script>

<section class="app-toolbar">
  {#if showSearch}
    <div class="search-field">
      <i class="bi bi-search" aria-hidden="true"></i>
      <input
        type="search"
        class="search-input"
        bind:value={search}
        on:input={onSearch}
        placeholder={searchPlaceholder}
        aria-label={searchPlaceholder}
      />
    </div>
  {/if}

  {#if $$slots.tabs}
    <div class="toolbar-tabs">
      <slot name="tabs" />
    </div>
  {/if}

  <div class="toolbar-actions">
    {#if $$slots.filters}
      <div class="filters-anchor" bind:this={filtersAnchor}>
        <button
          class="filters-button"
          class:is-open={filtersOpen}
          type="button"
          aria-expanded={filtersOpen}
          aria-controls={PANEL_ID}
          on:click={() => (filtersOpen = !filtersOpen)}
        >
          <i class="bi bi-sliders" aria-hidden="true"></i>
          <span>{filtersLabel}</span>
          {#if filtersCount > 0}
            <span class="filters-count">{filtersCount}</span>
          {/if}
        </button>

        {#if filtersOpen}
          <div class="filters-panel" id={PANEL_ID} role="dialog" aria-label={filtersLabel}>
            <slot name="filters" />

            {#if filtersClearLabel && filtersCount > 0}
              <button class="filters-clear" type="button" on:click={onClearFilters}>
                <i class="bi bi-arrow-counterclockwise" aria-hidden="true"></i>
                <span>{filtersClearLabel}</span>
              </button>
            {/if}
          </div>
        {/if}
      </div>
    {/if}

    {#if resetLabel}
      <button class="toolbar-action-btn" type="button" on:click={onReset}>
        <i class="bi bi-arrow-counterclockwise" aria-hidden="true"></i>
        <span>{resetLabel}</span>
      </button>
    {/if}

    {#if showAdd && addLabel}
      <ActionButton
        icon="bi-plus-lg"
        label={addLabel}
        on:click={onAdd}
      />
    {/if}

    <slot name="actions" />
  </div>
</section>

<style>
  /* The row opts out of the toolbar band's pinned LTR so it mirrors with the
     locale, while every control keeps its own reading direction. */
  .app-toolbar {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    width: 100%;
    min-width: 0;
    direction: initial;
  }

  :global([dir='rtl']) .app-toolbar {
    direction: rtl;
  }

  /* --- Search ----------------------------------------------------------- */

  .search-field {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    /* Grows into the empty part of the row but stops at 24rem, so the chips
       keep following it at a readable distance instead of drifting away on a
       wide screen. */
    flex: 1 1 18rem;
    min-width: 0;
    max-width: 24rem;
    padding: 0 0.875rem;
    height: 2.5rem;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--surface);
    transition: border-color var(--transition), box-shadow var(--transition);
  }

  .search-field:focus-within {
    border-color: var(--accent-border);
    box-shadow: var(--ring);
  }

  .search-field i {
    color: var(--text-muted);
    font-size: 0.8rem;
    flex-shrink: 0;
  }

  .search-input {
    flex: 1;
    min-width: 0;
    border: 0;
    outline: 0;
    background: transparent;
    color: var(--text-strong);
    font-size: var(--text-sm);
    line-height: 1;
    padding: 0;
  }

  .search-input::placeholder {
    color: var(--text-muted);
    font-size: var(--text-sm);
  }

  /* --- Tab chips -------------------------------------------------------- */

  /* `max-width` as well as `min-width`: a row of chips is wider than the band
     on small screens, and without the cap it overflows the panel instead of
     scrolling inside its own line. */
  .toolbar-tabs {
    display: flex;
    align-items: center;
    flex: 1 1 auto;
    min-width: 0;
    max-width: 100%;
    overflow-x: auto;
    scrollbar-width: none;
  }

  .toolbar-tabs::-webkit-scrollbar { display: none; }

  /* --- Actions ---------------------------------------------------------- */

  .toolbar-actions {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex: 0 0 auto;
    min-width: 0;
    max-width: 100%;
    margin-inline-start: auto;
  }

  .toolbar-action-btn {
    display: inline-flex;
    align-items: center;
    gap: 0.375rem;
    height: 2.5rem;
    padding: 0 0.75rem;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--surface);
    color: var(--text-secondary);
    font-size: var(--text-sm);
    font-weight: var(--weight-semibold);
    cursor: pointer;
    transition: color var(--transition), background var(--transition), border-color var(--transition);
    white-space: nowrap;
  }

  .toolbar-action-btn:hover {
    color: var(--text-strong);
    border-color: var(--accent-soft-border);
    background: var(--accent-soft);
  }

  /* --- Filters button and panel ----------------------------------------- */

  .filters-anchor {
    position: relative;
    flex: 0 0 auto;
  }

  .filters-button {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    height: 2.5rem;
    padding: 0 0.75rem;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--surface);
    color: var(--text-secondary);
    font-size: var(--text-sm);
    font-weight: var(--weight-semibold);
    cursor: pointer;
    white-space: nowrap;
    transition: color var(--transition), background var(--transition), border-color var(--transition);
  }

  .filters-button:hover {
    color: var(--text-strong);
    border-color: var(--accent-soft-border);
    background: var(--accent-soft);
  }

  .filters-button.is-open,
  .filters-button[aria-expanded='true'] {
    color: var(--accent);
    border-color: var(--accent-soft-border);
    background: var(--accent-highlight);
  }

  .filters-count {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-inline-size: 1.25rem;
    height: 1.25rem;
    padding: 0 0.3rem;
    border-radius: var(--radius-pill);
    background: var(--accent);
    color: var(--text-on-accent);
    font-size: var(--text-xs);
    font-weight: var(--weight-heavy);
    line-height: 1;
  }

  .filters-panel {
    position: absolute;
    z-index: 60;
    inset-block-start: calc(100% + 0.5rem);
    inset-inline-end: 0;
    display: grid;
    gap: 0.75rem;
    inline-size: min(21rem, calc(100vw - 2rem));
    padding: 0.875rem;
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    background: var(--surface);
    box-shadow: var(--shadow-lg);
  }

  /* Everything the page drops into the panel stacks, whatever shape its own
     filter markup has: a popover is a column, not a toolbar row. */
  .filters-panel :global(.filters-field) {
    display: grid;
    gap: 0.3rem;
    min-width: 0;
  }

  .filters-panel :global(.filters-field-label) {
    color: var(--text-muted);
    font-size: var(--text-xs);
    font-weight: var(--weight-heavy);
    letter-spacing: var(--tracking-wide);
    text-transform: uppercase;
  }

  .filters-panel :global(.form-select),
  .filters-panel :global(.form-control) {
    inline-size: 100%;
    min-inline-size: 0;
  }

  .filters-panel :global(.filter-group),
  .filters-panel :global(.toolbar-filters) {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 0.75rem;
    flex: 0 1 auto;
  }

  .filters-clear {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.375rem;
    height: 2.25rem;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--surface);
    color: var(--text-secondary);
    font-size: var(--text-sm);
    font-weight: var(--weight-semibold);
    cursor: pointer;
    transition: color var(--transition), background var(--transition), border-color var(--transition);
  }

  .filters-clear:hover {
    color: var(--accent);
    border-color: var(--accent-soft-border);
    background: var(--accent-soft);
  }

  /* --- Responsive ------------------------------------------------------- */

  /* The row wraps rather than turns into a column, so every line keeps sharing
     the band's gutter: the search field takes the first line on its own once it
     can no longer sit beside the chips, the chips stay flush to the reading
     edge, and the actions stay pinned to the far edge of the line they land on.
     A column here would centre each group independently — which is exactly how
     the chips ended up floating out of line with the search and the button. */
  @media (max-width: 991.98px) {
    .app-toolbar {
      flex-flow: row wrap;
      align-items: center;
    }

    /* `min-width` gives the field a floor, so it drops to its own line instead
       of being squeezed to a sliver next to the chips and the actions. */
    .search-field {
      flex: 1 1 18rem;
      min-width: 12rem;
      max-width: 100%;
    }

    .toolbar-tabs {
      flex: 1 1 auto;
    }

    .toolbar-actions {
      flex: 0 0 auto;
      margin-inline-start: auto;
    }
  }

  /* Once the row stacks, the filters button can sit far enough from the right
     edge that a right-anchored popover would hang off the screen. Anchor the
     panel to the band instead and let it span the gutter, like a sheet. */
  @media (max-width: 575.98px) {
    .filters-anchor {
      position: static;
    }

    .filters-panel {
      inset-inline: 0;
      inline-size: auto;
    }
  }
</style>
