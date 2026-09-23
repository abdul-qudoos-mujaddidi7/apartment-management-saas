<script>
  /**
   * Pagination bar.
   *
   * One row, three tracks: Previous on the leading edge, the numbers in the
   * middle of the card, Next on the trailing edge. A step is its word plus a
   * chevron with no chrome at rest, so the row's ink is the numbers; the page
   * you are on is the only filled control, a solid accent square with white
   * text. Numbers are zero-padded to the width of the list's last page, which
   * is what keeps the row from reflowing as you walk through it ("01 02 03"
   * always occupies the same width). The numbers are deliberately small — the
   * bar's job is "where am I, and how do I leave", which two weights of ink do
   * better than two rows of buttons.
   *
   * The window shows both ends of the list, one page either side of the current
   * one, and a gap where the two runs do not meet — so at page 3 of 11 you see
   * `01 02 03 04 … 10 11` and can tell where you are in the list, which a
   * sliding five-number window could not.
   *
   * Only the per-page picker rides on the trailing edge with Next, and only
   * when a page opts in with `itemsPerPage`.
   *
   * `summary` is still accepted so every call site keeps working, but the bar no
   * longer shows it: "Showing 1–2 of 2" spends the row's most valuable space
   * telling you what the numbers already say. Pass it and it is ignored.
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

  const GAP = 'gap';

  $: pageCount = Math.max(0, Math.floor(Number(totalPages)) || 0);
  $: current = Math.min(Math.max(1, Math.floor(Number(page)) || 1), Math.max(1, pageCount));

  /* Two digits once the list runs past 9, so 11 pages read 01…11; a list of a
     hundred keeps its own three-digit numbers rather than becoming 001. */
  $: pad = pageCount >= 10 ? 2 : 1;

  $: formatPage = (number) => String(number).padStart(pad, '0');

  /* The window: both ends, one neighbour either side of the current page, and
     three numbers of run-in while the current page is near an end (so a list
     opened on page 1 shows a run of pages rather than a stub). Anything left
     out becomes one ellipsis. */
  $: pageItems = (() => {
    if (pageCount <= 0) return [];
    /* A short list lists itself: seven numbers and one gap is worse than seven
       numbers, so below this the window never elides anything. */
    if (pageCount <= 7) return Array.from({ length: pageCount }, (_, index) => index + 1);

    const wanted = new Set([1, 2, pageCount - 1, pageCount, current - 1, current, current + 1]);
    if (current <= 3) [3, 4].forEach((number) => wanted.add(number));
    if (current >= pageCount - 2) [pageCount - 2, pageCount - 3].forEach((number) => wanted.add(number));

    const numbers = [...wanted].filter((number) => number >= 1 && number <= pageCount).sort((a, b) => a - b);

    return numbers.reduce((items, number, index) => {
      if (index > 0 && number - numbers[index - 1] > 1) items.push(GAP);
      items.push(number);
      return items;
    }, []);
  })();

  $: showPerPage = itemsPerPage != null && perPageOptions.length > 0;

  function goTo(number) {
    if (number === current) return;
    onPage(number);
  }
</script>

{#if pageCount > 0}
  <nav class="pagination-bar" aria-label={label || 'Pagination'}>
    <div class="pagination-lead">
      <button
        class="page-step"
        type="button"
        disabled={current <= 1}
        on:click={() => goTo(current - 1)}
      >
        <i class="bi bi-chevron-left" aria-hidden="true"></i>
        <span>{previousLabel}</span>
      </button>
    </div>

    <span class="page-numbers">
      {#each pageItems as item, index (index)}
        {#if item === GAP}
          <span class="page-ellipsis" aria-hidden="true">…</span>
        {:else}
          <button
            class="page-num"
            class:is-current={item === current}
            type="button"
            aria-current={item === current ? 'page' : undefined}
            on:click={() => goTo(item)}
          >
            {formatPage(item)}
          </button>
        {/if}
      {/each}
    </span>

    <div class="pagination-trail">
      <div class="pagination-meta">
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

      <button
        class="page-step"
        type="button"
        disabled={current >= pageCount}
        on:click={() => goTo(current + 1)}
      >
        <span>{nextLabel}</span>
        <i class="bi bi-chevron-right" aria-hidden="true"></i>
      </button>
    </div>
  </nav>
{/if}

<style>
  .pagination-bar {
    display: grid;
    /* Three tracks, the outer two equal: that is what puts the numbers in the
       middle of the *card* rather than in the middle of whatever space is left
       after the steps. Previous and the trailing cluster hug their own edges. */
    grid-template-columns: 1fr auto 1fr;
    align-items: center;
    gap: 0.5rem 1rem;
    width: 100%;
    min-width: 0;
  }

  .pagination-lead {
    display: flex;
    align-items: center;
    justify-content: flex-start;
    min-width: 0;
  }

  .pagination-trail {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    flex-wrap: wrap;
    gap: 0.5rem 1rem;
    min-width: 0;
  }

  .page-numbers {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-wrap: wrap;
    gap: 0.15rem;
    min-width: 0;
  }

  /* --- Steps ------------------------------------------------------------ */

  /* No chrome at rest: the numbers are the row's ink, and a pair of bordered
     buttons would out-weigh them. The word is the control's name — the chevron
     only tells you which way it goes. */
  .page-step {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    height: 2.1rem;
    padding: 0 0.5rem;
    border: 0;
    border-radius: var(--radius-sm);
    color: var(--text-strong);
    background: transparent;
    font-family: inherit;
    font-size: var(--text-md);
    font-weight: var(--weight-semibold);
    cursor: pointer;
    transition: color var(--transition), background var(--transition);
    white-space: nowrap;
  }

  .page-step i {
    font-size: 0.72rem;
  }

  .page-step:hover:not(:disabled) {
    color: var(--accent-text);
    background: var(--neutral-soft);
  }

  .page-step:disabled {
    color: var(--text-disabled);
    cursor: not-allowed;
  }

  /* Chevrons follow the reading direction, so they mirror in RTL — including
     which side of the word they sit on, which flex does on its own. */
  :global([dir='rtl']) .page-step i {
    transform: scaleX(-1);
  }

  /* --- Numbers ---------------------------------------------------------- */

  .page-num {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    /* Small on purpose: ~27px square, one step below the 29px step control, so
       the numbers read as a scale you scan rather than as buttons you press. */
    min-width: 1.9rem;
    height: 1.9rem;
    padding-inline: 0.3rem;
    border: 0;
    /* Softer than the app's 5px small radius: on a 27px square the image's
       corners are about a quarter of the side. */
    border-radius: 7px;
    color: var(--text-secondary);
    background: transparent;
    font-family: inherit;
    font-size: var(--text-sm);
    font-weight: var(--weight-semibold);
    font-variant-numeric: tabular-nums;
    letter-spacing: 0.01em;
    cursor: pointer;
    transition: color var(--transition), background var(--transition);
  }

  .page-num:hover:not(.is-current) {
    color: var(--accent-text);
    background: var(--accent-soft);
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
    min-width: 1.15rem;
    height: 1.9rem;
    color: var(--text-muted);
    font-size: var(--text-sm);
    font-weight: var(--weight-semibold);
  }

  /* --- Meta ------------------------------------------------------------- */

  .pagination-meta {
    display: inline-flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 0.65rem 0.85rem;
    min-width: 0;
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

  /* --- Responsive ------------------------------------------------------- */

  /* Under a tablet the row stacks: Previous, the numbers and the trailing
     cluster each take their own line, centred, which is also where the numbers
     stop being able to sit between two steps without squeezing the words. */
  @media (max-width: 767.98px) {
    .pagination-bar {
      grid-template-columns: minmax(0, 1fr);
      justify-items: center;
      gap: 0.75rem;
    }

    .pagination-lead,
    .page-numbers,
    .pagination-trail {
      grid-column: 1;
      grid-row: auto;
    }

    .pagination-lead { justify-content: center; }
    .pagination-trail { justify-content: center; }
  }

  @media (max-width: 575.98px) {
    .page-step span {
      display: none;
    }

    .page-step {
      width: 2.1rem;
      padding: 0;
      justify-content: center;
    }

    .page-step i {
      font-size: 0.85rem;
    }
  }
</style>
