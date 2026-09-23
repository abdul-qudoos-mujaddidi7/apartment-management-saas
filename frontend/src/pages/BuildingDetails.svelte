<script>
  import PageLayout from '../components/ui/PageLayout.svelte';
  import PageToolbar from '../components/ui/PageToolbar.svelte';
  import DataTable from '../components/ui/DataTable.svelte';
  import Modal from '../components/ui/Modal.svelte';
  import StatusBadge from '../components/ui/StatusBadge.svelte';
  import ActionButton from '../components/ui/ActionButton.svelte';
  import { formatDate } from '../utils/formatters';
  import { push } from 'svelte-spa-router';
  import { api } from '../services/api';
  import { createFloor, deleteFloor, listFloors, updateFloor } from '../services/floors';
  import { language, locale, translate } from '../i18n';

  export let params = {};
  let buildingId, building, editingId = null;
  let floors = [], search = '', loadingBuilding = false, loadingFloors = false;
  let errorMessage = '', noticeMessage = '', modalError = '';
  let modalOpen = false, saving = false, lastSavedFloorNumber = null;
  let formErrors = {}, form = { floorNumber: 1, name: '' };

  $: if (params.id && params.id !== buildingId) {
    buildingId = params.id; building = null; floors = []; search = ''; errorMessage = ''; modalOpen = false; void refresh();
  }
  $: visibleFloors = search.trim()
    ? floors.filter((floor) => `${floor.floorNumber} ${floor.name}`.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()))
    : floors;
  $: totalApartments = floors.reduce((sum, floor) => sum + (floor.totalApartments || 0), 0);
  $: occupiedApartments = floors.reduce((sum, floor) => sum + (floor.apartmentStatusCounts?.OCCUPIED || 0), 0);
  $: availableApartments = floors.reduce((sum, floor) => sum + (floor.apartmentStatusCounts?.AVAILABLE || 0), 0);
  $: occupancyRate = totalApartments ? Math.round(occupiedApartments / totalApartments * 100) : 0;

  async function refresh() { await Promise.all([loadBuilding(), loadFloors()]); }
  async function loadBuilding() {
    const id = buildingId; loadingBuilding = true;
    try { const response = await api.get(`/buildings/${id}`); if (id === buildingId) building = response.building; }
    catch (error) { if (id === buildingId) errorMessage = error.status === 404 ? $locale.floors.notFound : $locale.floors.loadError; }
    finally { if (id === buildingId) loadingBuilding = false; }
  }
  async function loadFloors() {
    const id = buildingId; loadingFloors = true;
    try {
      const collected = []; let page = 1, totalPages = 1;
      do { const response = await listFloors({ page, pageSize: 100, buildingId: id }); collected.push(...response.items); totalPages = response.pagination.totalPages; page += 1; } while (page <= totalPages);
      if (id === buildingId) floors = collected;
    } catch (error) { if (id === buildingId) errorMessage = error.message; }
    finally { if (id === buildingId) loadingFloors = false; }
  }
  function nextFloorNumber() { return floors.reduce((highest, floor) => Math.max(highest, floor.floorNumber), 0) + 1; }
  function validateForm() {
    formErrors = {};
    if (!form.name.trim()) formErrors.name = translate('floors.required', { field: $locale.floors.name });
    if (!Number.isInteger(Number(form.floorNumber)) || Number(form.floorNumber) < 1) formErrors.floorNumber = translate('floors.numberRequired', { field: $locale.floors.floorNumber });
    return !Object.keys(formErrors).length;
  }
  function openApartments(floor) { push(`/floors/${floor.id}`); }
  function openAddFloor() { editingId = null; lastSavedFloorNumber = null; modalError = ''; formErrors = {}; form = { floorNumber: nextFloorNumber(), name: '' }; modalOpen = true; }
  function openEditFloor(floor) { editingId = floor.id; lastSavedFloorNumber = null; modalError = ''; formErrors = {}; form = { floorNumber: floor.floorNumber, name: floor.name }; modalOpen = true; }
  function closeModal() { if (saving) return; modalOpen = false; editingId = null; lastSavedFloorNumber = null; modalError = ''; formErrors = {}; }
  async function saveFloor() {
    if (!validateForm()) return;
    saving = true; modalError = ''; errorMessage = ''; noticeMessage = '';
    const payload = { floorNumber: Number(form.floorNumber), name: form.name.trim() };
    try {
      if (editingId) { await updateFloor(editingId, payload); noticeMessage = $locale.floors.updated; closeModal(); await refresh(); }
      else { const response = await createFloor({ buildingId, ...payload }); noticeMessage = $locale.floors.saved; lastSavedFloorNumber = response.floor.floorNumber; await refresh(); form = { floorNumber: nextFloorNumber(), name: '' }; }
    } catch (error) { if (error.data?.code === 'FLOOR_NUMBER_EXISTS') formErrors = { floorNumber: $locale.floors.floorNumberExists }; else modalError = error.message; }
    finally { saving = false; }
  }
  async function removeFloor(floor) {
    if (!window.confirm($locale.floors.confirmDelete)) return;
    errorMessage = ''; noticeMessage = '';
    try { await deleteFloor(floor.id); noticeMessage = $locale.floors.deleted; await refresh(); } catch (error) { errorMessage = error.message; }
  }
</script>

<svelte:head><title>{building ? building.name : $locale.floors.title} | {$locale.common.apartmentPro}</title></svelte:head>

<PageLayout showStats={Boolean(building)} ariaLabel={building?.name || $locale.buildings.details}>
  <svelte:fragment slot="toolbar">
    <PageToolbar bind:search searchPlaceholder={$locale.floors.search} onSearch={() => {}} addLabel={$locale.floors.add} onAdd={openAddFloor}>
      <svelte:fragment slot="actions"><button class="toolbar-back" type="button" on:click={() => push('/buildings')}><i class="bi bi-arrow-left" aria-hidden="true"></i><span>{$locale.buildings.back}</span></button></svelte:fragment>
    </PageToolbar>
  </svelte:fragment>

  <svelte:fragment slot="stats">
    {#if building}
      <div class="building-strip">
        <div class="building-main"><span class="building-icon"><i class="bi bi-building" aria-hidden="true"></i></span><div><div class="building-title"><h1>{building.name}</h1><StatusBadge label={building.status === 'ACTIVE' ? $locale.buildings.active : $locale.buildings.inactive} tone={building.status === 'ACTIVE' ? 'success' : 'neutral'} /></div><p>{building.code} · {building.address || '—'}</p></div></div>
        <dl class="building-facts"><div><dt>{$locale.buildings.totalFloors}</dt><dd>{floors.length}</dd></div><div><dt>{$locale.buildings.totalApartments}</dt><dd>{totalApartments}</dd></div><div><dt>{$locale.apartments.statuses.AVAILABLE}</dt><dd>{availableApartments}</dd></div><div><dt>{$locale.apartments.statuses.OCCUPIED}</dt><dd>{occupiedApartments} <small>({occupancyRate}%)</small></dd></div><div class="created-fact"><dt>{$locale.buildings.created}</dt><dd>{formatDate(building.createdAt, $language)}</dd></div></dl>
      </div>
    {/if}
  </svelte:fragment>

  <svelte:fragment slot="alerts">{#if errorMessage}<div class="alert alert-danger" role="alert">{errorMessage}</div>{/if}{#if noticeMessage}<div class="alert alert-success" role="status">{noticeMessage}</div>{/if}</svelte:fragment>

  <svelte:fragment slot="content">
    <DataTable loading={loadingBuilding || loadingFloors} isEmpty={visibleFloors.length === 0} loadingLabel={$locale.floors.loading} emptyLabel={search ? $locale.floors.empty : $locale.floors.empty} emptyIcon="bi-layers" minTableWidth="54rem" showFooter={false}>
      <ActionButton slot="empty-action" icon="bi-plus-lg" label={$locale.floors.add} on:click={openAddFloor} />
      <thead><tr><th>{$locale.floors.floorNumber}</th><th>{$locale.floors.name}</th><th>{$locale.apartments.totalApartments}</th><th>{$locale.apartments.statuses.AVAILABLE}</th><th>{$locale.apartments.statuses.OCCUPIED}</th><th>{$locale.dashboard.occupancy}</th><th class="actions-heading">{$locale.buildings.actions}</th></tr></thead>
      <tbody>
        {#each visibleFloors as floor (floor.id)}
          <tr><td class="data-cell">{floor.floorNumber}</td><td><button class="table-link" type="button" on:click={() => openApartments(floor)}>{floor.name}</button></td><td class="data-cell">{floor.totalApartments || 0}</td><td class="data-cell">{floor.apartmentStatusCounts?.AVAILABLE || 0}</td><td class="data-cell">{floor.apartmentStatusCounts?.OCCUPIED || 0}</td><td><div class="occupancy-cell"><span>{floor.totalApartments ? Math.round((floor.apartmentStatusCounts?.OCCUPIED || 0) / floor.totalApartments * 100) : 0}%</span><div><i style={`width:${floor.totalApartments ? Math.round((floor.apartmentStatusCounts?.OCCUPIED || 0) / floor.totalApartments * 100) : 0}%`}></i></div></div></td><td class="actions-cell"><button class="open-floor" type="button" on:click={() => openApartments(floor)}><span>{$locale.apartments.title}</span><i class="bi bi-arrow-right" aria-hidden="true"></i></button><button class="icon-button" type="button" on:click={() => openEditFloor(floor)} aria-label={$locale.floors.edit}><i class="bi bi-pencil" aria-hidden="true"></i></button><button class="icon-button danger" type="button" on:click={() => removeFloor(floor)} aria-label={$locale.floors.delete}><i class="bi bi-trash3" aria-hidden="true"></i></button></td></tr>
        {/each}
      </tbody>
    </DataTable>
  </svelte:fragment>
</PageLayout>

<Modal bind:open={modalOpen} title={editingId ? $locale.floors.edit : $locale.floors.add} busy={saving} closeLabel={$locale.floors.cancel} on:close={closeModal}>
  <form id="floor-form" on:submit|preventDefault={saveFloor} novalidate>{#if lastSavedFloorNumber !== null}<div class="alert alert-success" role="status">{translate('floors.savedAnother', { number: lastSavedFloorNumber })}</div>{/if}{#if modalError}<div class="alert alert-danger" role="alert">{modalError}</div>{/if}<div class="mb-3"><label class="form-label" for="floor-number">{$locale.floors.floorNumber}</label><input class:is-invalid={formErrors.floorNumber} class="form-control" id="floor-number" type="number" min="1" bind:value={form.floorNumber} />{#if formErrors.floorNumber}<div class="invalid-feedback">{formErrors.floorNumber}</div>{/if}</div><div class="mb-3"><label class="form-label" for="floor-name">{$locale.floors.name}</label><input class:is-invalid={formErrors.name} class="form-control" id="floor-name" bind:value={form.name} />{#if formErrors.name}<div class="invalid-feedback">{formErrors.name}</div>{/if}</div></form>
  <div slot="footer"><button class="btn btn-light" type="button" on:click={closeModal}>{lastSavedFloorNumber !== null ? $locale.floors.done : $locale.floors.cancel}</button><button class="btn btn-primary" type="submit" form="floor-form" disabled={saving}>{saving ? $locale.floors.loading : editingId ? $locale.floors.update : lastSavedFloorNumber !== null ? $locale.floors.another : $locale.floors.save}</button></div>
</Modal>

<style>
  .toolbar-back,.open-floor{display:inline-flex;align-items:center;gap:.4rem;min-height:var(--control-height);padding:0 .75rem;border:1px solid var(--border);border-radius:var(--control-radius);color:var(--text-secondary);background:var(--surface);font-size:var(--text-sm);font-weight:var(--weight-semibold)}
  .toolbar-back:hover,.open-floor:hover{color:var(--accent);border-color:var(--accent-soft-border);background:var(--accent-soft)}
  :global([dir='rtl']) .toolbar-back i,:global([dir='rtl']) .open-floor i{transform:rotate(180deg)}
  .building-strip{display:flex;align-items:center;justify-content:space-between;gap:var(--space-5);width:100%}.building-main{display:flex;align-items:center;gap:var(--space-3);min-width:15rem}.building-icon{width:2.8rem;height:2.8rem;flex:0 0 2.8rem;display:grid;place-items:center;border-radius:.75rem;color:var(--accent);background:var(--accent-soft);font-size:1.1rem}.building-title{display:flex;align-items:center;gap:.65rem;flex-wrap:wrap}.building-title h1{margin:0;color:var(--text-strong);font-size:var(--text-lg)}.building-main p{margin:.2rem 0 0;color:var(--text-muted);font-size:var(--text-xs)}
  .building-facts{display:flex;align-items:center;justify-content:flex-end;gap:0;margin:0}.building-facts>div{min-width:6.5rem;padding-inline:var(--space-4);border-inline-start:1px solid var(--border)}.building-facts dt{color:var(--text-muted);font-size:.65rem;font-weight:var(--weight-semibold);white-space:nowrap}.building-facts dd{margin:.15rem 0 0;color:var(--text-strong);font-family:var(--font-data);font-size:var(--text-md);font-weight:var(--weight-heavy)}.building-facts small{color:var(--text-muted);font-size:.68rem}.created-fact{min-width:8rem!important}
  .occupancy-cell{display:flex;align-items:center;gap:.55rem}.occupancy-cell>span{min-width:2.3rem;color:var(--text-secondary);font-family:var(--font-data);font-size:var(--text-xs);font-weight:var(--weight-semibold)}.occupancy-cell>div{width:4.5rem;height:.35rem;overflow:hidden;border-radius:1rem;background:var(--grey-200)}.occupancy-cell i{display:block;height:100%;border-radius:inherit;background:var(--accent)}
  .actions-cell{display:flex;align-items:center;justify-content:flex-end;gap:.35rem}.actions-cell .icon-button{margin:0}
  @media(max-width:1000px){.building-strip{align-items:flex-start;flex-direction:column}.building-facts{width:100%;justify-content:flex-start;overflow-x:auto}.building-facts>div:first-child{padding-inline-start:0;border-inline-start:0}}
  @media(max-width:575px){.toolbar-back span,.open-floor span{display:none}.toolbar-back,.open-floor{width:var(--control-height);padding:0;justify-content:center}.building-facts>div{min-width:5.75rem;padding-inline:var(--space-3)}.created-fact{display:none}}
</style>
