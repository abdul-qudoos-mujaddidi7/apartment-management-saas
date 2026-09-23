<script>
  /**
   * Reusable tab-style filter bar.
   *
   * Chips sit inline in the page toolbar next to the search field; the active
   * one is filled with the accent tint, so the row needs no rule or box of its
   * own. Choose a different key than `''` when "all" is a real value.
   *
   * Usage:
   *   <TabFilters tabs={[{key:'all',label:'All'},{key:'active',label:'Active'}]} active={currentTab} on:select={...} />
   */

  import { createEventDispatcher } from 'svelte';

  export let tabs = [];
  export let active = 'all';

  const dispatch = createEventDispatcher();

  function select(key) {
    dispatch('select', key);
  }
</script>

<div class="tab-filters" role="tablist" aria-label="Filters">
  {#each tabs as tab (tab.key)}
    <button
      type="button"
      class="tab-filter-item"
      class:is-active={active === tab.key}
      role="tab"
      aria-selected={active === tab.key}
      on:click={() => select(tab.key)}
    >
      {tab.label}
    </button>
  {/each}
</div>

<style>
  .tab-filters {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    min-width: 0;
  }

  .tab-filter-item {
    display: inline-flex;
    align-items: center;
    height: 2.25rem;
    padding: 0 0.875rem;
    border: 0;
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--text-secondary);
    font-size: var(--text-sm);
    font-weight: var(--weight-semibold);
    line-height: 1;
    cursor: pointer;
    white-space: nowrap;
    transition: color var(--transition), background var(--transition);
  }

  .tab-filter-item:hover:not(.is-active) {
    color: var(--text-strong);
    background: var(--neutral-soft);
  }

  .tab-filter-item.is-active {
    color: var(--accent-text);
    background: var(--accent-highlight);
    font-weight: var(--weight-bold);
  }

  @media (max-width: 575.98px) {
    .tab-filter-item {
      padding: 0 0.625rem;
      font-size: var(--text-sm);
    }
  }
</style>
