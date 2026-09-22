<script>
  /**
   * Checkbox for table selection columns.
   *
   * Controlled on purpose: the page owns the selection set and passes `checked`
   * back in, so the box can never drift from the rows it represents. The
   * `indeterminate` mixed state is a DOM property rather than an attribute, so
   * it is applied to the node after updates.
   *
   * Fires: change (detail = the requested checked state)
   */

  import { createEventDispatcher } from 'svelte';

  export let checked = false;
  export let indeterminate = false;
  /** Accessible name — the box carries no visible label of its own. */
  export let label = '';
  export let disabled = false;
  export let className = '';

  const dispatch = createEventDispatcher();

  let input;

  $: if (input) input.indeterminate = indeterminate && !checked;

  function handleChange(event) {
    dispatch('change', event.currentTarget.checked);
  }
</script>

<label class={`select-checkbox ${className}`.trim()}>
  <input
    type="checkbox"
    bind:this={input}
    checked={checked}
    {disabled}
    aria-label={label || undefined}
    on:change={handleChange}
  />
</label>

<style>
  .select-checkbox {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    vertical-align: middle;
    cursor: pointer;
  }

  .select-checkbox input {
    appearance: none;
    -webkit-appearance: none;
    position: relative;
    width: 1.0625rem;
    height: 1.0625rem;
    margin: 0;
    border: 1px solid var(--border-strong);
    border-radius: 4px;
    background: var(--surface);
    cursor: pointer;
    transition: border-color var(--transition), background var(--transition);
  }

  .select-checkbox input:hover:not(:disabled) {
    border-color: var(--accent);
  }

  .select-checkbox input:checked,
  .select-checkbox input:indeterminate {
    border-color: var(--accent);
    background: var(--accent);
  }

  /* Tick: a rotated corner, so it stays crisp at any density. */
  .select-checkbox input:checked::after {
    content: '';
    position: absolute;
    inset-block-start: 0.09rem;
    inset-inline-start: 0.31rem;
    width: 0.25rem;
    height: 0.5rem;
    border: solid var(--white);
    border-width: 0 2px 2px 0;
    transform: rotate(45deg);
  }

  /* Mixed state: a dash, matching the tick's weight. */
  .select-checkbox input:indeterminate::after {
    content: '';
    position: absolute;
    inset-block-start: calc(50% - 1px);
    inset-inline: 0.19rem;
    height: 2px;
    background: var(--white);
  }

  .select-checkbox input:disabled {
    border-color: var(--border);
    background: var(--surface-sunken);
    cursor: not-allowed;
  }
</style>
