<script>
  import { createEventDispatcher } from 'svelte';
  import { locale } from '../../i18n';

  export let tabs = [];
  export let active = 'all';
  export let label = '';

  const dispatch = createEventDispatcher();
</script>

<label class="filters-field">
  <span class="filters-field-label">{label || $locale.common.filters}</span>
  <select class="form-select" value={active} on:change={(event) => dispatch('select', event.currentTarget.value)}>
    {#each tabs as tab (tab.key)}
      <option value={tab.key}>{tab.label}</option>
    {/each}
  </select>
</label>

<style>
  .filters-field { display: grid; gap: 0.375rem; min-width: 0; }
  .filters-field-label { color: var(--text-secondary); font-size: var(--text-sm); font-weight: var(--weight-semibold); }
</style>
