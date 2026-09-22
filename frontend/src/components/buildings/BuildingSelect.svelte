<script>
  import { createEventDispatcher, tick } from 'svelte';

  import BuildingFormModal from './BuildingFormModal.svelte';
  import { locale } from '../../i18n';

  /** id given to the <select>, so the label (and any fieldset legend) can point at it. */
  export let selectId = '';
  export let label = '';
  /** Options to show, as returned by the buildings endpoints. */
  export let buildings = [];
  /** Selected building id. Two-way bindable. */
  export let value = '';
  /** Empty-option text. Pass '' for a select that always has a value. */
  export let placeholder = '';
  export let disabled = false;
  export let required = false;
  export let invalid = false;
  export let error = '';
  /** Set false where creating a building makes no sense (e.g. a filter). */
  export let allowCreate = true;

  const dispatch = createEventDispatcher();

  let modalOpen = false;
  /* Buildings created from this picker, kept locally so the option exists the
     moment the dialog closes — the page does not have to reload its list. */
  let created = [];

  $: options = created.length
    ? [
        ...buildings,
        ...created.filter((candidate) => !buildings.some((existing) => existing.id === candidate.id))
      ]
    : buildings;

  async function handleSaved(event) {
    const building = event.detail;
    created = [...created, building];
    value = building.id;
    /* Let the parent's bind:value land before notifying it, so an on:change
       handler that reads the bound form field sees the new id. */
    await tick();
    dispatch('change', value);
    dispatch('created', building);
  }
</script>

<label class="form-label" for={selectId}>
  {label}{#if required}<span class="field-required" aria-hidden="true">*</span>{/if}
</label>

<div class="building-select">
  <select
    class:is-invalid={invalid}
    class="form-select"
    id={selectId}
    bind:value
    {disabled}
    {required}
    on:change={() => dispatch('change', value)}
  >
    {#if placeholder}
      <option value="">{placeholder}</option>
    {/if}
    {#each options as building (building.id)}
      <option value={building.id}>{building.name}</option>
    {/each}
  </select>

  {#if allowCreate}
    <button
      class="building-select-add"
      type="button"
      disabled={disabled}
      on:click={() => (modalOpen = true)}
      aria-label={$locale.buildings.newBuilding}
      title={$locale.buildings.newBuilding}
    >
      <i class="bi bi-plus-lg" aria-hidden="true"></i>
    </button>
  {/if}
</div>

{#if error}
  <div class="invalid-feedback">{error}</div>
{/if}

<BuildingFormModal bind:open={modalOpen} on:saved={handleSaved} />

<style>
  .building-select {
    display: flex;
    min-width: 0;
    gap: var(--space-2);
    align-items: center;
  }

  .building-select .form-select {
    flex: 1 1 auto;
    min-width: 0;
  }

  /* A quiet square affordance that sits on the control row, so "add a
     building" is available exactly where a building is being chosen. */
  .building-select-add {
    display: inline-flex;
    flex: 0 0 auto;
    align-items: center;
    justify-content: center;
    width: var(--control-height);
    height: var(--control-height);
    padding: 0;
    border: 1px solid var(--border);
    border-radius: var(--control-radius);
    color: var(--accent);
    background: var(--surface);
    font-size: 1rem;
    cursor: pointer;
    transition: border-color var(--transition), color var(--transition),
      background var(--transition), box-shadow var(--transition);
  }

  .building-select-add:hover:not(:disabled) {
    border-color: var(--accent-soft-border);
    background: var(--accent-soft);
  }

  .building-select-add:focus-visible {
    outline: 0;
    box-shadow: var(--ring);
  }

  .building-select-add:disabled {
    color: var(--text-placeholder);
    cursor: not-allowed;
  }
</style>
