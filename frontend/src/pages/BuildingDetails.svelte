<script>
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

<div class="details-page">
  <nav class="breadcrumb-row" aria-label="Breadcrumb"><button type="button" on:click={() => push('/buildings')}><i class="bi bi-house-door" aria-hidden="true"></i><span>{$locale.buildings.title}</span></button><i class="bi bi-chevron-right" aria-hidden="true"></i><span aria-current="page">{building?.code || $locale.buildings.details}</span></nav>

  <!-- The breadcrumb above is the page's own navigation and title, so there is no
       title row and no second back link. The heading stays for screen readers. -->
  <h1 class="visually-hidden">{$locale.buildings.details}</h1>

  {#if errorMessage}<div class="alert alert-danger" role="alert">{errorMessage}</div>{/if}
  {#if noticeMessage}<div class="alert alert-success" role="status">{noticeMessage}</div>{/if}

  {#if loadingBuilding}
    <div class="page-loader"><div class="spinner-border text-primary" role="status"><span class="visually-hidden">{$locale.floors.loading}</span></div></div>
  {:else if building}
    <section class="building-card" aria-label={$locale.buildings.information}>
      <img class="building-photo" src="/images/home/hero-tall.jpg" alt="" />
      <div class="building-copy"><div class="building-name"><h2>{building.code}</h2><StatusBadge label={building.status === 'ACTIVE' ? $locale.buildings.active : $locale.buildings.inactive} tone={building.status === 'ACTIVE' ? 'success' : 'neutral'} /></div><p><i class="bi bi-geo-alt" aria-hidden="true"></i>{building.address || '—'}</p><p><i class="bi bi-calendar3" aria-hidden="true"></i>{$locale.buildings.created}: {formatDate(building.createdAt, $language)}</p><p><i class="bi bi-building" aria-hidden="true"></i>{$locale.buildings.totalFloors}: {floors.length}<span class="meta-divider"></span>{$locale.buildings.totalApartments}: {totalApartments}</p></div>
      <div class="building-action"><ActionButton icon="bi-plus-lg" label={$locale.floors.add} on:click={openAddFloor} /></div>
    </section>

    <section class="floors-card" aria-labelledby="floors-title">
      <header class="floors-header"><div class="floors-title"><span><i class="bi bi-layers" aria-hidden="true"></i></span><div><h2 id="floors-title">{$locale.floors.title}</h2><p>{$locale.floors.description}</p></div></div><label class="floor-search"><i class="bi bi-search" aria-hidden="true"></i><span class="visually-hidden">{$locale.floors.search}</span><input type="search" bind:value={search} placeholder={$locale.floors.search} /></label></header>

      <DataTable loading={loadingFloors} isEmpty={visibleFloors.length === 0} loadingLabel={$locale.floors.loading} emptyLabel={$locale.floors.empty} emptyIcon="bi-layers" minTableWidth="46rem" showFooter={false}>
        <thead><tr><th>#</th><th>{$locale.floors.name}</th><th>{$locale.apartments.title}</th><th>{$locale.buildings.created}</th><th class="actions-heading">{$locale.buildings.actions}</th></tr></thead>
        <tbody>{#each visibleFloors as floor (floor.id)}<tr><td class="data-cell">{floor.floorNumber}</td><td><button class="table-link" type="button" on:click={() => openApartments(floor)}>{floor.name}</button></td><td><div class="apartments-link"><span class="data-cell">{floor.totalApartments || 0}</span><button type="button" on:click={() => openApartments(floor)}>{$locale.buildings.view} {$locale.apartments.title}<i class="bi bi-arrow-right" aria-hidden="true"></i></button></div></td><td>{formatDate(floor.createdAt, $language)}</td><td class="actions-cell"><button class="row-action" type="button" on:click={() => openEditFloor(floor)}><i class="bi bi-pencil" aria-hidden="true"></i><span>{$locale.floors.edit}</span></button><button class="row-action delete" type="button" on:click={() => removeFloor(floor)}><i class="bi bi-trash3" aria-hidden="true"></i><span>{$locale.floors.delete}</span></button></td></tr>{/each}</tbody>
      </DataTable>

      <div class="add-more"><span><i class="bi bi-building-add" aria-hidden="true"></i></span><h3>{$locale.floors.add}</h3><p>{$locale.floors.description}</p><ActionButton icon="bi-plus-lg" label={$locale.floors.add} on:click={openAddFloor} /></div>
    </section>
  {/if}
</div>

<Modal bind:open={modalOpen} title={editingId ? $locale.floors.edit : $locale.floors.add} busy={saving} closeLabel={$locale.floors.cancel} on:close={closeModal}>
  <form id="floor-form" on:submit|preventDefault={saveFloor} novalidate>{#if lastSavedFloorNumber !== null}<div class="alert alert-success" role="status">{translate('floors.savedAnother', { number: lastSavedFloorNumber })}</div>{/if}{#if modalError}<div class="alert alert-danger" role="alert">{modalError}</div>{/if}<div class="mb-3"><label class="form-label" for="floor-number">{$locale.floors.floorNumber}</label><input class:is-invalid={formErrors.floorNumber} class="form-control" id="floor-number" type="number" min="1" bind:value={form.floorNumber} />{#if formErrors.floorNumber}<div class="invalid-feedback">{formErrors.floorNumber}</div>{/if}</div><div class="mb-3"><label class="form-label" for="floor-name">{$locale.floors.name}</label><input class:is-invalid={formErrors.name} class="form-control" id="floor-name" bind:value={form.name} />{#if formErrors.name}<div class="invalid-feedback">{formErrors.name}</div>{/if}</div></form>
  <div slot="footer"><button class="btn btn-light" type="button" on:click={closeModal}>{lastSavedFloorNumber !== null ? $locale.floors.done : $locale.floors.cancel}</button><button class="btn btn-primary" type="submit" form="floor-form" disabled={saving}>{saving ? $locale.floors.loading : editingId ? $locale.floors.update : lastSavedFloorNumber !== null ? $locale.floors.another : $locale.floors.save}</button></div>
</Modal>

<style>
  .details-page{display:flex;flex:1 1 auto;flex-direction:column;min-width:0;gap:var(--space-4)}
  .breadcrumb-row{display:flex;align-items:center;gap:.55rem;color:var(--text-muted);font-size:var(--text-xs)}.breadcrumb-row button{display:inline-flex;align-items:center;gap:.4rem;padding:0;border:0;color:var(--accent);background:none;font:inherit;font-weight:var(--weight-semibold)}.breadcrumb-row>i{font-size:.58rem}:global([dir='rtl']) .breadcrumb-row>i,:global([dir='rtl']) .apartments-link button i{transform:rotate(180deg)}
  .page-loader{display:grid;place-items:center;min-height:22rem}
  .building-card{display:grid;grid-template-columns:7.25rem minmax(16rem,1fr) auto;align-items:center;gap:var(--space-5);padding:var(--space-4);border:1px solid var(--border);border-radius:var(--radius-lg);background:var(--surface);box-shadow:var(--shadow-sm)}.building-photo{width:7.25rem;height:5.6rem;object-fit:cover;border-radius:var(--radius-md)}.building-copy{min-width:0}.building-name{display:flex;align-items:center;gap:.75rem;flex-wrap:wrap}.building-name h2{margin:0;color:var(--text-strong);font-family:var(--font-data);font-size:1.3rem}.building-copy p{display:flex;align-items:center;gap:.5rem;margin:.38rem 0 0;color:var(--text-muted);font-size:var(--text-xs)}.building-copy p i{width:1rem;color:var(--text-secondary);text-align:center}.meta-divider{width:1px;height:.8rem;margin-inline:.3rem;background:var(--border)}
  /* The button carries its own fill (`ActionButton`), so no panel behind it. */
  .building-action{display:flex;flex-direction:column;align-items:flex-end;justify-content:center;gap:var(--space-2)}
  .floors-card{display:flex;flex:1 1 auto;flex-direction:column;min-height:0;overflow:hidden;border:1px solid var(--border);border-radius:var(--radius-lg);background:var(--surface);box-shadow:var(--shadow-sm)}.floors-header{display:flex;align-items:center;justify-content:space-between;gap:var(--space-4);padding:var(--space-4)}.floors-title{display:flex;align-items:flex-start;gap:.7rem}.floors-title>span{width:2rem;height:2rem;display:grid;place-items:center;border-radius:.55rem;color:var(--accent);background:var(--accent-soft)}.floors-title h2{margin:0;color:var(--text-strong);font-size:var(--text-lg)}.floors-title p{margin:.15rem 0 0;color:var(--text-muted);font-size:var(--text-xs)}.floor-search{display:flex;align-items:center;gap:.5rem;width:min(18rem,100%);height:var(--control-height);padding:0 .75rem;border:1px solid var(--border);border-radius:var(--control-radius);background:var(--surface)}.floor-search:focus-within{border-color:var(--accent-border);box-shadow:var(--ring)}.floor-search i{color:var(--text-muted)}.floor-search input{min-width:0;width:100%;padding:0;border:0;outline:0;background:transparent;color:var(--text-strong);font-size:var(--text-sm)}
  .floors-card :global(.data-table-panel){flex:0 0 auto;margin-inline:var(--space-4);border-radius:var(--radius-md);box-shadow:none}.apartments-link{display:flex;align-items:center;gap:var(--space-3)}.apartments-link button{display:inline-flex;align-items:center;gap:.45rem;padding:0;border:0;color:var(--accent);background:none;font-size:var(--text-xs);font-weight:var(--weight-semibold)}.actions-cell{display:flex;align-items:center;justify-content:flex-end;gap:.45rem}.row-action{display:inline-flex;align-items:center;gap:.4rem;min-height:var(--control-height);padding:0 .7rem;border:1px solid var(--border);border-radius:var(--control-radius);color:var(--text-secondary);background:var(--surface);font-size:var(--text-xs);font-weight:var(--weight-semibold)}.row-action:hover{color:var(--accent);border-color:var(--accent-soft-border);background:var(--accent-soft)}.row-action.delete{color:var(--danger);border-color:var(--danger-border);background:var(--danger-soft)}
  .add-more{display:grid;justify-items:center;align-content:center;gap:.35rem;flex:1 1 auto;min-height:9rem;padding:var(--space-5);text-align:center}.add-more>span{width:2.8rem;height:2.8rem;display:grid;place-items:center;margin-block-end:.2rem;border-radius:50%;color:var(--accent);background:var(--accent-soft);font-size:1.1rem}.add-more h3{margin:0;color:var(--text-strong);font-size:var(--text-sm)}.add-more p{margin:0 0 .55rem;color:var(--text-muted);font-size:var(--text-xs)}
  @media(max-width:1050px){.building-card{grid-template-columns:6rem 1fr}.building-photo{width:6rem}.building-action{grid-column:1/-1;align-items:center}.floors-card :global(.data-table-panel){flex:1 1 auto}}
  @media(max-width:650px){.building-card{grid-template-columns:1fr}.building-photo{width:100%;height:9rem}.building-action{align-items:center}.floors-header{align-items:flex-start;flex-direction:column}.floor-search{width:100%}.actions-cell{justify-content:flex-start}.row-action span{display:none}.row-action{width:var(--control-height);padding:0;justify-content:center}}
</style>
