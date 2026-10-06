<script>
  import { onMount, onDestroy } from 'svelte';
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
  let timer;
  let version = 0;
  let resolvedId = '';
  $: canView = $user?.permissions?.includes('GUARANTOR_VIEW');
  $: canManage = $user?.permissions?.includes('GUARANTOR_MANAGE');
  $: if (selected?.id === value) assigned = selected;
  $: displayed = assigned && assigned.id === value && !options.some(g => g.id === value) ? [assigned, ...options] : options;
  $: if (value && value !== resolvedId && canView) resolveSelected(value);
  async function resolveSelected(id) {
    resolvedId = id;
    try { const response = await getGuarantor(id); if (value === id) assigned = response.guarantor; }
    catch (e) { if (value === id) error = e.message; }
  }
  async function load() {
    const request = ++version; loading = true;
    try { const response = await listGuarantors({ pageSize: 100, search }); if (request === version) { options = response.items; error = ''; } }
    catch (e) { if (request === version) error = e.message; }
    finally { if (request === version) loading = false; }
  }
  function searchChanged() { clearTimeout(timer); timer = setTimeout(load, 250); }
  function saved(event) { assigned = event.detail; value = assigned.id; options = [assigned, ...options.filter(g => g.id !== assigned.id)]; }
  onMount(() => { if (canView) load(); });
  onDestroy(() => { clearTimeout(timer); version++; });
</script>
<label class="form-label" for="lease-guarantor">{$locale.guarantors.singular} ({$locale.guarantors.optional})</label>
{#if canView}
  <input class="form-control mb-2" type="search" aria-label={$locale.guarantors.search} placeholder={$locale.guarantors.search} bind:value={search} on:input={searchChanged} {disabled} />
{/if}
<div class="d-flex gap-2 flex-wrap">
  <select class="form-select guarantor-picker" id="lease-guarantor" bind:value disabled={disabled || !canView}>
    <option value="">{$locale.guarantors.none}</option>
    {#each displayed as g (g.id)}<option value={g.id}>{g.firstName} {g.lastName} — {g.phone}</option>{/each}
  </select>
  {#if canManage}<button class="btn btn-light" type="button" {disabled} on:click={() => open = true}><i class="bi bi-plus-lg" aria-hidden="true"></i> {$locale.guarantors.add}</button>{/if}
</div>
{#if loading}<p class="text-muted" aria-live="polite">{$locale.guarantors.loading}</p>{/if}
{#if error}<p class="text-danger" role="alert">{error}</p>{/if}
<GuarantorFormModal bind:open on:saved={saved} />
<style>.guarantor-picker { flex: 1; min-width: 12rem; }</style>
