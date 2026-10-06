<script>
  import { onMount, onDestroy, tick } from 'svelte';
  import { locale } from '../../i18n';
  import { user } from '../../stores/auth';
  import { listGuarantors, getGuarantor } from '../../services/guarantors';
  import GuarantorFormModal from './GuarantorFormModal.svelte';
  export let value = '';
  export let selected = null;
  export let disabled = false;
  let options = [];
  let assigned = null;
  let search = '';
  let error = '';
  let loading = false;
  let open = false;
  let expanded = false;
  let container;
  let searchInput;
  let trigger;
  let activeIndex = 0;
  let timer;
  let version = 0;
  let resolvedId = '';
  $: canView = $user?.permissions?.includes('GUARANTOR_VIEW');
  $: canManage = $user?.permissions?.includes('GUARANTOR_MANAGE');
  $: if (selected?.id === value) assigned = selected;
  $: current = value ? (assigned?.id === value ? assigned : options.find(g => g.id === value)) : null;
  $: displayed = assigned && !options.some(g => g.id === assigned.id) && (!search.trim() || [assigned.firstName, assigned.lastName, assigned.phone, assigned.nationalId].filter(Boolean).join(' ').toLowerCase().includes(search.trim().toLowerCase())) ? [assigned, ...options] : options;
  $: if (value && value !== resolvedId && canView) resolveSelected(value);
  $: if (disabled || !canView) expanded = false;
  const optionLabel = g => [g.firstName, g.lastName].filter(Boolean).join(' ') + ' | ' + g.phone;
  async function resolveSelected(id) {
    resolvedId = id;
    try { const response = await getGuarantor(id); if (value === id) assigned = response.guarantor; }
    catch (e) { if (value === id) error = e.message; }
  }
  async function load() {
    const request = ++version; loading = true;
    try { const response = await listGuarantors({ pageSize: 100, search }); if (request === version) { options = response.items; error = ''; activeIndex = 0; } }
    catch (e) { if (request === version) error = e.message; }
    finally { if (request === version) loading = false; }
  }
  function searchChanged() { clearTimeout(timer); version++; loading = true; options = []; activeIndex = 0; timer = setTimeout(load, 250); }
  async function togglePicker() {
    expanded = !expanded;
    if (expanded) { search = ''; activeIndex = 0; clearTimeout(timer); load(); await tick(); searchInput?.focus(); }
  }
  async function choose(g) {
    value = g?.id || '';
    assigned = g || null;
    expanded = false;
    await tick();
    trigger?.focus();
  }
  function dismiss(event) { if (expanded && !container?.contains(event.target)) expanded = false; }
  function pickerKeydown(event) {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); expanded = false; trigger?.focus(); }
    else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      activeIndex = (activeIndex + (event.key === 'ArrowDown' ? 1 : -1) + displayed.length + 1) % (displayed.length + 1);
      container?.querySelector('#guarantor-option-' + activeIndex)?.scrollIntoView({ block: 'nearest' });
    } else if (event.key === 'Enter') { event.preventDefault(); choose(activeIndex === 0 ? null : displayed[activeIndex - 1]); }
  }
  function saved(event) { assigned = event.detail; value = assigned.id; options = [assigned, ...options.filter(g => g.id !== assigned.id)]; expanded = false; }
  onMount(() => { if (canView) load(); });
  onDestroy(() => { clearTimeout(timer); version++; });
</script>
<svelte:window on:pointerdown={dismiss} on:focusin={dismiss} />
<label class="form-label" for="lease-guarantor">{$locale.guarantors.singular} ({$locale.guarantors.optional})</label>
<div class="d-flex gap-2 flex-wrap">
  <div class="guarantor-picker" bind:this={container}>
    <button class="form-select picker-trigger" id="lease-guarantor" type="button" bind:this={trigger} disabled={disabled || !canView} aria-haspopup="listbox" aria-expanded={expanded} aria-controls="guarantor-options" on:click={togglePicker}>
      {current ? optionLabel(current) : $locale.guarantors.none}
    </button>
    {#if expanded}
      <div class="picker-menu">
        <input class="form-control" type="search" role="combobox" aria-label={$locale.guarantors.search} aria-autocomplete="list" aria-expanded="true" aria-controls="guarantor-options" aria-activedescendant={'guarantor-option-' + activeIndex} placeholder={$locale.guarantors.search} bind:this={searchInput} bind:value={search} on:input={searchChanged} on:keydown={pickerKeydown} />
        <div class="picker-options" id="guarantor-options" role="listbox" aria-label={$locale.guarantors.singular}>
          <button id="guarantor-option-0" class="picker-option" class:is-highlighted={activeIndex === 0} type="button" role="option" aria-selected={!value} tabindex="-1" on:click={() => choose(null)}>{$locale.guarantors.none}</button>
          {#each displayed as g, index (g.id)}
            <button id={'guarantor-option-' + (index + 1)} class="picker-option" class:is-highlighted={activeIndex === index + 1} type="button" role="option" aria-selected={value === g.id} tabindex="-1" on:click={() => choose(g)}>{optionLabel(g)}</button>
          {/each}
        </div>
        {#if loading}<p class="picker-message text-muted" aria-live="polite">{$locale.guarantors.loading}</p>{:else if displayed.length === 0}<p class="picker-message text-muted">{$locale.guarantors.empty}</p>{/if}
      </div>
    {/if}
  </div>
  {#if canManage}<button class="btn btn-light" type="button" {disabled} on:click={() => { expanded = false; open = true; }}><i class="bi bi-plus-lg" aria-hidden="true"></i> {$locale.guarantors.add}</button>{/if}
</div>
{#if error}<p class="text-danger" role="alert">{error}</p>{/if}
<GuarantorFormModal bind:open on:saved={saved} />
<style>
  .guarantor-picker { position: relative; flex: 1; min-width: 12rem; }
  .picker-trigger { text-align: start; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .picker-menu { position: absolute; inset-inline: 0; inset-block-start: calc(100% + var(--space-1)); z-index: 10; padding: var(--space-2); border: 1px solid var(--border); border-radius: var(--control-radius); background: var(--surface); box-shadow: var(--shadow-lg); }
  .picker-options { max-height: 12rem; overflow-y: auto; margin-block-start: var(--space-2); }
  .picker-option { display: block; width: 100%; padding: var(--space-2); border: 0; border-radius: var(--control-radius); color: var(--text-body); background: transparent; text-align: start; overflow-wrap: anywhere; }
  .picker-option:hover, .picker-option.is-highlighted, .picker-option[aria-selected='true'] { color: var(--accent-text); background: var(--accent-soft); }
  .picker-message { margin: var(--space-2); font-size: var(--text-sm); }
</style>
