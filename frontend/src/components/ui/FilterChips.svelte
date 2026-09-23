<script>
  /**
   * Horizontal filter chips / tab pills.
   *
   * Usage:
   *   <FilterChips options={[{ key: '', label: 'All' }, ...]} bind:value />
   */

  /** Array of { key: string, label: string }. */
  export let options = [];
  /** Currently selected key. */
  export let value = '';
</script>

<div class="filter-chips" role="radiogroup">
  {#each options as option (option.key)}
    <button
      class="chip"
      class:chip--active={value === option.key}
      type="button"
      role="radio"
      aria-checked={value === option.key}
      on:click={() => (value = option.key)}
    >
      {option.label}
    </button>
  {/each}
</div>

<style>
  .filter-chips {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    padding: 0.1875rem;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
  }

  .chip {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    height: 1.875rem;
    padding: 0 0.875rem;
    border: 0;
    border-radius: calc(var(--radius-sm) - 2px);
    background: transparent;
    color: var(--text-secondary);
    font-size: var(--text-sm);
    font-weight: var(--weight-semibold);
    line-height: 1;
    cursor: pointer;
    transition: color var(--transition), background var(--transition);
    white-space: nowrap;
  }

  .chip:hover:not(.chip--active) {
    color: var(--text-strong);
    background: var(--neutral-soft);
  }

  .chip--active {
    color: var(--accent-text);
    background: var(--accent-highlight);
    font-weight: var(--weight-bold);
    cursor: default;
  }

  .chip:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 1px;
  }
</style>
