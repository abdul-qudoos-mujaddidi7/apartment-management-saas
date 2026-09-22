<script>
  /**
   * Pagination bar.
   *
   * Page controls sit on the leading edge and the meta cluster on the trailing
   * edge: numbers are chips, the current one filled with the accent colour.
   * The per-page picker only renders when a page supplies `itemsPerPage`, so
   * pages that only page through records are unaffected.
   */

  export let page = 1;
  export let totalPages = 0;
  export let label = '';
  export let summary = '';
  export let previousLabel = 'Previous';
  export let nextLabel = 'Next';
  export let onPage = () => {};

  /** Opt in to the page-size picker. */
  export let itemsPerPage = null;
  export let perPageOptions = [10, 25, 50, 100];
  export let perPageLabel = 'Per page';
  export let perPageSuffix = '';
  export let onPerPage = () => {};

  // A short window around the current page: enough context to jump, never a
  // wall of numbers.
  $: windowPages = (() => {
    if (totalPages <= 7) {
      return Array.from({ length: totalPages }, (_, index) => index + 1);
    }

    const start = Math.max(1, Math.min(page - 2, totalPages - 4));
    return Array.from({ length: 5 }, (_, index) => start + index);
  })();

  $: showFirst = totalPages > 7 && windowPages[0] > 1;
  $: showLast = totalPages > 7 && windowPages[windowPages.length - 1] < totalPages;
  $: showPerPage = itemsPerPage != null && perPageOptions.length > 0;
</script>

{#if totalPages > 0}
  <nav class="pagination-bar" aria-label={label || 'Pagination'}>
    <div class="pagination-nav">
      <button
        class="nav-arrow"
        type="button"
        disabled={page <= 1}
        aria-label={previousLabel}
        title={previousLabel}
        on:click={() => onPage(page - 1)}
      >
        <i class="bi bi-chevron-left" aria-hidden="true"></i>
      </button>

      <span class="page-numbers">
        {#if showFirst}
          <button class="page-num" type="button" aria-label="1" on:click={() => onPage(1)}>1</button>
          <span class="page-ellipsis" aria-hidden="true">…</span>
        {/if}

        {#each windowPages as number (number)}
          <button
            class="page-num"
            class:is-current={number === page}
            type="button"
            aria-current={number === page ? 'page' : undefined}
            on:click={() => onPage(number)}
          >
            {number}
          </button>
        {/each}

        {#if showLast}
          <span class="page-ellipsis" aria-hidden="true">…</span>
          <button
            class="page-num"
            type="button"
            aria-label={String(totalPages)}
            on:click={() => onPage(totalPages)}
          >
            {totalPages}
          </button>
        {/if}
      </span>

      <button
        class="nav-arrow"
        type="button"
        disabled={page >= totalPages}
        aria-label={nextLabel}
        title={nextLabel}
        on:click={() => onPage(page + 1)}
      >
        <i class="bi bi-chevron-right" aria-hidden="true"></i>
      </button>
    </div>

    <div class="pagination-meta">
      {#if summary}
        <span class="pagination-count">{summary}</span>
      {/if}

      {#if showPerPage}
        <label class="per-page-picker">
          <span class="picker-label">{perPageLabel}</span>
          <select
            value={itemsPerPage}
            aria-label={perPageLabel}
            on:change={(event) => onPerPage(Number(event.currentTarget.value))}
          >
            {#each perPageOptions as option (option)}
              <option value={option}>{option}{perPageSuffix ? ` ${perPageSuffix}` : ''}</option>
            {/each}
          </select>
          <i class="bi bi-chevron-down picker-icon" aria-hidden="true"></i>
        </label>
      {/if}
    </div>
  </nav>
{/if}

<style>
  .pagination-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.65rem 1rem;
    flex-wrap: wrap;
    width: 100%;
    min-width: 0;
  }

  /* --- Page controls ---------------------------------------------------- */

  .pagination-nav {
    display: inline-flex;
    align-items: center;
    gap: 0.15rem;
    min-width: 0;
    flex-wrap: wrap;
  }

  .page-numbers {
    display: inline-flex;
    align-items: center;
    gap: 0.1rem;
  }

  .nav-arrow {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: var(--control-height-sm);
    height: var(--control-height-sm);
    min-width: var(--control-height-sm);
    padding: 0;
    border: 0;
    border-radius: var(--radius-sm);
    color: var(--text-secondary);
    background: transparent;
    font-size: 0.8rem;
    cursor: pointer;
    transition: color var(--transition), background var(--transition);
  }

  .nav-arrow:hover:not(:disabled) {
    color: var(--text-strong);
    background: var(--neutral-soft);
  }

  .nav-arrow:disabled {
    color: var(--text-disabled);
    background: transparent;
    cursor: not-allowed;
  }

  .page-num {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: var(--control-height-sm);
    height: var(--control-height-sm);
    padding-inline: 0.4rem;
    border: 0;
    border-radius: var(--radius-sm);
    color: var(--text-strong);
    background: var(--neutral-soft);
    font-size: var(--text-sm);
    font-weight: var(--weight-semibold);
    font-variant-numeric: tabular-nums;
    cursor: pointer;
    transition: color var(--transition), background var(--transition);
  }

  .page-num:hover:not(.is-current) {
    color: var(--accent);
    background: var(--accent-highlight);
  }

  .page-num.is-current {
    color: var(--text-on-accent);
    background: var(--accent);
    font-weight: var(--weight-bold);
    cursor: default;
  }

  .page-ellipsis {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 1.25rem;
    height: var(--control-height-sm);
    color: var(--text-muted);
    font-size: var(--text-sm);
    font-weight: var(--weight-semibold);
    letter-spacing: 0.04em;
  }

  /* Chevrons follow the reading direction, so they mirror in RTL. */
  :global([dir='rtl']) .nav-arrow i {
    transform: scaleX(-1);
  }

  /* --- Meta ------------------------------------------------------------- */

  .pagination-meta {
    display: inline-flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 0.65rem 0.85rem;
    min-width: 0;
  }

  .pagination-count {
    color: var(--text-secondary);
    font-size: var(--text-sm);
    font-weight: var(--weight-semibold);
    white-space: nowrap;
  }

  .per-page-picker {
    position: relative;
    display: inline-flex;
    align-items: center;
    flex: 0 0 auto;
    margin: 0;
  }

  /* Floating label notched into the top rule of the select. */
  .picker-label {
    position: absolute;
    inset-block-start: 0;
    inset-inline-start: 0.55rem;
    z-index: 1;
    transform: translateY(-50%);
    padding-inline: 0.28rem;
    background: var(--surface);
    color: var(--text-muted);
    font-size: var(--text-xs);
    font-weight: var(--weight-semibold);
    line-height: 1;
    white-space: nowrap;
    pointer-events: none;
  }

  .per-page-picker select {
    appearance: none;
    min-width: 5.5rem;
    height: var(--control-height-sm);
    padding-inline: 0.7rem 1.65rem;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    color: var(--text-strong);
    background: var(--surface);
    font-size: var(--text-sm);
    font-weight: var(--weight-semibold);
    line-height: 1;
    cursor: pointer;
  }

  .per-page-picker select:focus {
    outline: 0;
    border-color: var(--accent-border);
    box-shadow: var(--ring);
  }

  .picker-icon {
    position: absolute;
    inset-inline-end: 0.55rem;
    inset-block-start: 50%;
    transform: translateY(-50%);
    pointer-events: none;
    color: var(--text-muted);
    font-size: var(--text-xs);
  }

  @media (max-width: 767.98px) {
    .pagination-bar {
      flex-direction: column;
      align-items: stretch;
      gap: 0.75rem;
    }

    .pagination-nav,
    .pagination-meta {
      justify-content: center;
    }

    .per-page-picker {
      flex: 1 1 auto;
    }

    .per-page-picker select {
      width: 100%;
    }
  }
</style>
