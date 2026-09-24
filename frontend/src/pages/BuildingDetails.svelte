<script>
  import { onDestroy } from 'svelte';

  import DataTable from '../components/ui/DataTable.svelte';
  import Modal from '../components/ui/Modal.svelte';
  import Pagination from '../components/ui/Pagination.svelte';
  import StatusBadge from '../components/ui/StatusBadge.svelte';
  import ActionButton from '../components/ui/ActionButton.svelte';
  import RowActions from '../components/ui/RowActions.svelte';
  import { debounce } from '../utils/debounce';
  import { sortRows } from '../utils/sortRows';
  import { formatDate } from '../utils/formatters';
  import { push } from 'svelte-spa-router';
  import { api } from '../services/api';
  import { createFloor, deleteFloor, listFloors, updateFloor } from '../services/floors';
  import { language, locale, translate } from '../i18n';

  export let params = {};
  let buildingId, building, editingId = null;
  let floors = [], search = '', loadingBuilding = false, loadingFloors = false;
  let sort = { key: null, dir: 'asc' };
  $: view = sortRows(floors, sort.key, sort.dir);
  let errorMessage = '', noticeMessage = '', modalError = '';
  let modalOpen = false, saving = false, lastSavedFloorNumber = null;
  let formErrors = {}, form = { floorNumber: '', name: '' };
  /* The list is paged by the server, so this page holds one page of floors and
     every building-wide figure below comes from the building record instead. */
  let pagination = { page: 1, pageSize: 10, total: 0, totalPages: 0 };
  let requestToken = 0;

  $: if (params.id && params.id !== buildingId) {
    buildingId = params.id; building = null; floors = []; search = ''; errorMessage = ''; modalOpen = false;
    pagination = { ...pagination, page: 1, total: 0, totalPages: 0 };
    void refresh();
  }

  $: resultStart = pagination.total === 0 ? 0 : (pagination.page - 1) * pagination.pageSize + 1;
  $: resultEnd = Math.min(pagination.page * pagination.pageSize, pagination.total);
  $: resultSummary = $locale.floors.showing
    .replace('{from}', resultStart)
    .replace('{to}', resultEnd)
    .replace('{total}', pagination.total);

  const debouncedSearch = debounce(() => loadFloors(1), 300);
  onDestroy(() => debouncedSearch.cancel());
  function handleSearch() { debouncedSearch(); }

  async function refresh() { await Promise.all([loadBuilding(), loadFloors()]); }
  async function loadBuilding() {
    const id = buildingId; loadingBuilding = true;
    try { const response = await api.get(`/buildings/${id}`); if (id === buildingId) building = response.building; }
    catch (error) { if (id === buildingId) errorMessage = error.status === 404 ? $locale.floors.notFound : $locale.floors.loadError; }
    finally { if (id === buildingId) loadingBuilding = false; }
  }
  async function loadFloors(page = pagination.page) {
    const id = buildingId;
    const token = ++requestToken;
    loadingFloors = true;
    try {
      const response = await listFloors({ page, pageSize: pagination.pageSize, search, buildingId: id });
      if (token !== requestToken || id !== buildingId) return;
      floors = response.items;
      pagination = response.pagination;
    } catch (error) {
      if (token !== requestToken) return;
      errorMessage = error.message;
    } finally {
      if (token === requestToken) loadingFloors = false;
    }
  }
  /* Floor labels are free text, so the suggestion is only made when the floors
     so far are numbers — "2" after "1". A building that names its floors
     ("Ground", "B1") gets an empty field to fill in itself. */
  function highestNumberedFloor() {
    return floors.reduce((highest, floor) => {
      const value = Number(String(floor.floorNumber).trim());
      return Number.isInteger(value) && value > highest ? value : highest;
    }, 0);
  }
  function nextFloorNumber() {
    const highest = highestNumberedFloor();
    return highest ? String(highest + 1) : '';
  }
  function validateForm() {
    formErrors = {};
    if (!form.name.trim()) formErrors.name = translate('floors.required', { field: $locale.floors.name });
    if (!String(form.floorNumber).trim()) formErrors.floorNumber = translate('floors.required', { field: $locale.floors.floorNumber });
    return !Object.keys(formErrors).length;
  }
  function openApartments(floor) { push(`/floors/${floor.id}`); }
  async function openAddFloor() {
    editingId = null; lastSavedFloorNumber = null; modalError = ''; formErrors = {};
    form = { floorNumber: nextFloorNumber(), name: '' };
    modalOpen = true;
    /* On a building with more floors than one page, the highest number is on the
       last page. Ask for it so the suggested number is the real next one — the
       request is skipped when the whole list is already in hand. */
    if (pagination.total <= pagination.pageSize) return;
    const id = buildingId;
    try {
      const response = await listFloors({ page: Math.max(pagination.totalPages, 1), pageSize: pagination.pageSize, buildingId: id });
      if (id !== buildingId || !modalOpen || editingId !== null) return;
      const highest = response.items.reduce((max, floor) => {
        const value = Number(String(floor.floorNumber).trim());
        return Number.isInteger(value) && value > max ? value : max;
      }, 0);
      if (highest && highest + 1 > Number(form.floorNumber)) form.floorNumber = String(highest + 1);
    } catch {
      /* Keep the suggestion; the server still refuses a number already in use. */
    }
  }
  function openEditFloor(floor) { editingId = floor.id; lastSavedFloorNumber = null; modalError = ''; formErrors = {}; form = { floorNumber: String(floor.floorNumber), name: floor.name }; modalOpen = true; }
  function closeModal() { if (saving) return; modalOpen = false; editingId = null; lastSavedFloorNumber = null; modalError = ''; formErrors = {}; }
  async function saveFloor() {
    if (!validateForm()) return;
    saving = true; modalError = ''; errorMessage = ''; noticeMessage = '';
    const payload = { floorNumber: String(form.floorNumber).trim(), name: form.name.trim() };
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
      <div class="building-copy"><div class="building-name"><h2>{building.code}</h2><StatusBadge label={building.status === 'ACTIVE' ? $locale.buildings.active : $locale.buildings.inactive} tone={building.status === 'ACTIVE' ? 'success' : 'neutral'} /></div><p><i class="bi bi-geo-alt" aria-hidden="true"></i>{building.address || '—'}</p><p><i class="bi bi-calendar3" aria-hidden="true"></i>{$locale.buildings.created}: {formatDate(building.createdAt, $language)}</p><p><i class="bi bi-building" aria-hidden="true"></i>{$locale.buildings.totalFloors}: {building.totalFloors ?? 0}<span class="meta-divider"></span>{$locale.buildings.totalApartments}: {building.totalApartments ?? 0}</p></div>
      <div class="building-action"><ActionButton icon="bi-plus-lg" label={$locale.floors.add} on:click={openAddFloor} /></div>
    </section>

    <section class="floors-card" aria-labelledby="floors-title">
      <header class="floors-header"><div class="floors-title"><div><h2 id="floors-title">{$locale.floors.title}</h2></div></div><label class="floor-search"><i class="bi bi-search" aria-hidden="true"></i><span class="visually-hidden">{$locale.floors.search}</span><input type="search" bind:value={search} on:input={handleSearch} placeholder={$locale.floors.search} /></label></header>

      <DataTable loading={loadingFloors} isEmpty={floors.length === 0} loadingLabel={$locale.floors.loading} emptyLabel={$locale.floors.empty} emptyIcon="bi-layers" minTableWidth="46rem" showFooter={!loadingFloors && pagination.total > 0} sortKey={sort.key} sortDir={sort.dir} on:sort={(event) => (sort = event.detail)}>
        <ActionButton slot="empty-action" icon="bi-plus-lg" label={$locale.floors.add} on:click={openAddFloor} />
        <thead><tr><th class="cell-muted">#</th><th data-sort="name">{$locale.floors.name}</th><th data-sort="totalApartments">{$locale.apartments.title}</th><th data-sort="createdAt">{$locale.buildings.created}</th><th class="actions-heading">{$locale.buildings.actions}</th></tr></thead>
        <tbody>{#each view as floor (floor.id)}<tr><td class="data-cell cell-muted">{floor.floorNumber}</td><td><button class="table-link" type="button" on:click={() => openApartments(floor)}>{floor.name}</button></td><td><div class="apartments-link"><span class="data-cell">{floor.totalApartments || 0}</span><button type="button" on:click={() => openApartments(floor)}>{$locale.buildings.view} {$locale.apartments.title}<i class="bi bi-arrow-right" aria-hidden="true"></i></button></div></td><td class="cell-muted">{formatDate(floor.createdAt, $language)}</td><td class="actions-cell"><RowActions label={$locale.buildings.actions}><button class="row-menu-item" type="button" on:click={() => openEditFloor(floor)}><i class="bi bi-pencil" aria-hidden="true"></i>{$locale.floors.edit}</button><button class="row-menu-item danger" type="button" on:click={() => removeFloor(floor)}><i class="bi bi-trash3" aria-hidden="true"></i>{$locale.floors.delete}</button></RowActions></td></tr>{/each}</tbody>        <svelte:fragment slot="footer"><Pagination page={pagination.page} totalPages={pagination.totalPages} previousLabel={$locale.floors.previous} nextLabel={$locale.floors.next} label={$locale.floors.page.replace('{page}', pagination.page).replace('{totalPages}', pagination.totalPages)} summary={resultSummary} onPage={loadFloors} /></svelte:fragment>
      </DataTable>
    </section>
  {/if}
</div>

<Modal bind:open={modalOpen} title={editingId ? $locale.floors.edit : $locale.floors.add} busy={saving} icon="bi-layers" closeLabel={$locale.floors.cancel} on:close={closeModal}>
  <form id="floor-form" on:submit|preventDefault={saveFloor} novalidate>{#if lastSavedFloorNumber !== null}<div class="alert alert-success" role="status">{translate('floors.savedAnother', { number: lastSavedFloorNumber })}</div>{/if}{#if modalError}<div class="alert alert-danger" role="alert">{modalError}</div>{/if}<div class="mb-3"><label class="form-label" for="floor-number">{$locale.floors.floorNumber}</label><input class:is-invalid={formErrors.floorNumber} class="form-control" id="floor-number" type="text" maxlength="32" bind:value={form.floorNumber} />{#if formErrors.floorNumber}<div class="invalid-feedback">{formErrors.floorNumber}</div>{/if}</div><div class="mb-3"><label class="form-label" for="floor-name">{$locale.floors.name}</label><input class:is-invalid={formErrors.name} class="form-control" id="floor-name" bind:value={form.name} />{#if formErrors.name}<div class="invalid-feedback">{formErrors.name}</div>{/if}</div></form>
  <div slot="footer"><button class="btn btn-light" type="button" on:click={closeModal}>{lastSavedFloorNumber !== null ? $locale.floors.done : $locale.floors.cancel}</button><button class="btn btn-primary" type="submit" form="floor-form" disabled={saving}>{saving ? $locale.floors.loading : editingId ? $locale.floors.update : lastSavedFloorNumber !== null ? $locale.floors.another : $locale.floors.save}</button></div>
</Modal>

<style>
  .details-page{display:flex;flex:1 1 auto;flex-direction:column;min-width:0;min-height:0;gap:var(--space-4)}
  .breadcrumb-row{display:flex;align-items:center;gap:.55rem;color:var(--text-muted);font-size:var(--text-xs)}.breadcrumb-row button{display:inline-flex;align-items:center;gap:.4rem;padding:0;border:0;color: var(--accent-text);background:none;font:inherit;font-weight:var(--weight-semibold)}.breadcrumb-row>i{font-size:.58rem}:global([dir='rtl']) .breadcrumb-row>i,:global([dir='rtl']) .apartments-link button i{transform:rotate(180deg)}
  .page-loader{display:grid;place-items:center;min-height:22rem}
  /* The page's hero: a light wash of the brand blue over white — brightest at the
     top corner, settling into a cool base — so the card reads as one tinted
     surface rather than a plain white box. Nothing else on the page is tinted. */
  .building-card{display:grid;grid-template-columns:7.25rem minmax(16rem,1fr) auto;flex:0 0 auto;align-items:center;gap:var(--space-5);padding:var(--space-4);border:1px solid var(--border);border-radius:var(--radius-lg);border-color:#dbe9f7;background:radial-gradient(120% 150% at 12% 0%,rgba(30,108,165,.13),rgba(30,108,165,0) 58%),linear-gradient(160deg,#fafcff 0%,#eff6fd 55%,#e7f1fa 100%);box-shadow:var(--shadow-sm),inset 0 1px 0 rgba(255,255,255,.7)}.building-photo{width:7.25rem;height:5.6rem;object-fit:cover;border-radius:var(--radius-md)}.building-copy{min-width:0}.building-name{display:flex;align-items:center;gap:.75rem;flex-wrap:wrap}.building-name h2{margin:0;color:var(--text-strong);font-family:var(--font-data);font-size:1.3rem}.building-copy p{display:flex;align-items:center;gap:.5rem;margin:.38rem 0 0;color:var(--text-muted);font-size:var(--text-xs)}.building-copy p i{width:1rem;color:var(--text-secondary);text-align:center}.meta-divider{width:1px;height:.8rem;margin-inline:.3rem;background:var(--border)}
  /* The button carries its own fill (`ActionButton`), so no panel behind it. */
  .building-action{display:flex;flex-direction:column;align-items:flex-end;justify-content:center;gap:var(--space-2)}
  .floors-card{display:flex;flex:1 1 auto;flex-direction:column;min-height:0;overflow:hidden;border:1px solid var(--border);border-radius:var(--radius-lg);background:var(--surface);box-shadow:var(--shadow-sm)}.floors-header{display:flex;align-items:center;gap:var(--space-3);padding:var(--space-4)}.floors-title{display:flex;align-items:flex-start;gap:.7rem;margin-inline-end:auto}.floors-title h2{margin:0;color:var(--text-strong);font-size:var(--text-lg)}.floor-search{display:flex;align-items:center;gap:.5rem;flex:0 1 18rem;width:min(18rem,100%);height:var(--control-height);padding:0 .75rem;border:1px solid var(--border);border-radius:var(--control-radius);background:var(--surface)}.floor-search:focus-within{border-color:var(--accent-border);box-shadow:var(--ring)}.floor-search i{color:var(--text-muted)}.floor-search input{min-width:0;width:100%;padding:0;border:0;outline:0;background:transparent;color:var(--text-strong);font-size:var(--text-sm)}
  /* The table *is* the card: no inner panel chrome, exactly as an index page
     strips it, so the header band and the rows span the card edge to edge. */
  .floors-card :global(.data-table-panel){flex:1 1 auto;border:0;border-radius:0;background:transparent;box-shadow:none}.apartments-link{display:flex;align-items:center;gap:var(--space-3)}.apartments-link button{display:inline-flex;align-items:center;gap:.45rem;padding:0;border:0;color: var(--accent-text);background:none;font-size:var(--text-xs);font-weight:var(--weight-semibold)}.actions-cell{display:flex;align-items:center;justify-content:flex-end;gap:.45rem}  @media(max-width:1050px){.building-card{grid-template-columns:6rem 1fr}.building-photo{width:6rem}.building-action{grid-column:1/-1;align-items:center}}
  @media(max-width:650px){.building-card{grid-template-columns:1fr}.building-photo{width:100%;height:9rem}.building-action{align-items:center}.floors-header{align-items:flex-start;flex-direction:column}.floor-search{width:100%}.actions-cell{justify-content:flex-start}}
</style>
