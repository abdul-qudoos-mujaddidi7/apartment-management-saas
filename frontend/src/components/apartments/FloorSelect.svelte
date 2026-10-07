<script>
  import { createEventDispatcher, tick } from 'svelte';
  import { locale } from '../../i18n';

  export let id = 'apartment-floor';
  export let floors = [];
  export let value = '';
  export let disabled = false;
  export let invalid = false;
  export let describedBy = undefined;

  const dispatch = createEventDispatcher();
  let container;
  let open = false;
  let search = '';
  let activeIndex = 0;

  const label = floor => !floor?.id ? $locale.apartments.chooseFloor
    : [floor.building?.name, floor.name].filter(Boolean).join(' · ');
  const normalize = text => String(text ?? '').normalize('NFKC').toLowerCase()
    .replace(/[۰-۹٠-٩]/g, digit => String(digit.charCodeAt(0) - (digit >= '۰' ? 0x6f0 : 0x660)));

  $: selected = floors.find(floor => floor.id === value);
  $: query = normalize(search).trim();
  $: matches = floors.filter(floor => normalize([floor.building?.name, floor.name, floor.floorNumber].join(' ')).includes(query));
  $: options = query ? matches : [{ id: '' }, ...matches];
  $: if (disabled) open = false;

  function expand() {
    if (disabled) return;
    search = '';
    activeIndex = 0;
    open = true;
  }

  function choose(floor) {
    value = floor.id;
    open = false;
    search = '';
    dispatch('change', value);
  }

  function dismiss(event) {
    if (!container?.contains(event.target)) open = false;
  }

  async function keydown(event) {
    if (event.key === 'Escape' && open) {
      event.preventDefault();
      event.stopPropagation();
      open = false;
    } else if (event.key === 'Enter') {
      event.preventDefault();
      if (!open) expand();
      else if (options[activeIndex]) choose(options[activeIndex]);
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!open) expand();
      else if (options.length) activeIndex = (activeIndex + (event.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length;
      await tick();
      container?.querySelector(`#${id}-option-${activeIndex}`)?.scrollIntoView({ block: 'nearest' });
    }
  }
</script>

<svelte:window on:pointerdown={dismiss} on:focusin={dismiss} />

<div class="floor-picker" bind:this={container}>
  <div class="field-control">
    <i class="bi bi-layers" aria-hidden="true"></i>
    <input
      {id}
      class="form-control"
      class:is-invalid={invalid}
      type="text"
      role="combobox"
      autocomplete="off"
      {disabled}
      placeholder={$locale.apartments.chooseFloor}
      value={open ? search : (selected ? label(selected) : '')}
      aria-autocomplete="list"
      aria-expanded={open}
      aria-controls={`${id}-options`}
      aria-activedescendant={open && options[activeIndex] ? `${id}-option-${activeIndex}` : undefined}
      aria-invalid={invalid}
      aria-describedby={describedBy}
      on:focus={expand}
      on:click={() => { if (!open) expand(); }}
      on:input={event => { search = event.currentTarget.value; activeIndex = 0; open = true; }}
      on:keydown={keydown}
      on:blur={() => { open = false; }}
    />
  </div>
  {#if open}
    <div class="floor-menu">
      <div id={`${id}-options`} role="listbox" aria-label={$locale.apartments.floor}>
        {#each options as floor, index (floor.id)}
          <button
            id={`${id}-option-${index}`}
            class="floor-option"
            class:is-highlighted={activeIndex === index}
            type="button"
            role="option"
            aria-selected={value === floor.id}
            tabindex="-1"
            on:mousedown|preventDefault
            on:click={() => choose(floor)}
          >{label(floor)}</button>
        {/each}
      </div>
      {#if !options.length}<p class="floor-empty" role="status">{$locale.common.noResults}</p>{/if}
    </div>
  {/if}
</div>

<style>
  .floor-picker { position: relative; }
  .floor-menu { position: absolute; inset-inline: 0; inset-block-start: calc(100% + var(--space-1)); z-index: 20; max-height: 16rem; overflow-y: auto; padding: var(--space-1); border: 1px solid var(--border); border-radius: var(--control-radius); background: var(--surface); box-shadow: var(--shadow-lg); }
  .floor-option { display: block; width: 100%; min-height: 2.75rem; padding: var(--space-2) var(--space-3); border: 0; border-radius: var(--control-radius); background: transparent; color: var(--text-body); text-align: start; overflow-wrap: anywhere; }
  .floor-option:hover, .floor-option.is-highlighted, .floor-option[aria-selected='true'] { background: var(--accent-soft); color: var(--accent-text); }
  .floor-empty { margin: var(--space-2); color: var(--text-muted); font-size: var(--text-sm); }
</style>
