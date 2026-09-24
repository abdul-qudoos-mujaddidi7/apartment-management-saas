<script>
  import { onMount } from 'svelte';
  import { push } from 'svelte-spa-router';
  import PageLayout from '../components/ui/PageLayout.svelte';
  import PageToolbar from '../components/ui/PageToolbar.svelte';
  import DataTable from '../components/ui/DataTable.svelte';
  import Checkbox from '../components/ui/Checkbox.svelte';
  import { createSelection, isAllSelected, isSomeSelected, toggleAllSelected, toggleSelected } from '../utils/selection';
  import Pagination from '../components/ui/Pagination.svelte';
  import Modal from '../components/ui/Modal.svelte';
  import RowActions from '../components/ui/RowActions.svelte';
  import BuildingSelect from '../components/buildings/BuildingSelect.svelte';
  import { locale } from '../i18n';
  import { formatNumber } from '../utils/formatters';
  import { sortRows } from '../utils/sortRows';
  import { getBuildings } from '../services/buildings';
  import { listFloors, createFloor, updateFloor, deleteFloor } from '../services/floors';
  import { notifySuccess } from '../stores/toasts';

  let floors = [];
  let sort = { key: null, dir: 'asc' };
  $: view = sortRows(floors, sort.key, sort.dir);
  let buildings = [];
  let search = '';
  let buildingId = '';
  let loading = true;
  let errorMessage = '';
  let pagination = { page: 1, pageSize: 10, totalPages: 0 };
  let requestToken = 0;
  let modalOpen = false;
  let editingId = null;
  let saving = false;
  let modalError = '';
  let form = { buildingId: '', floorNumber: '', name: '' };

  onMount(() => {
    void loadFloors();
    void loadBuildings();
  });

  async function loadBuildings() {
    try {
      const items = [];
      let page = 1;
      let totalPages = 1;
      do {
        const response = await getBuildings({ page, pageSize: 100 });
        items.push(...response.items);
        totalPages = response.pagination.totalPages;
        page += 1;
      } while (page <= totalPages);
      buildings = items;
    } catch (error) {
      errorMessage = error.message;
    }
  }

  async function loadFloors(page = 1) {
    const token = ++requestToken;
    loading = true;
    errorMessage = '';
    try {
      const response = await listFloors({ page, pageSize: 10, search, buildingId });
      if (token !== requestToken) return;
      floors = response.items;
      pagination = response.pagination;
    } catch (error) {
      if (token === requestToken) errorMessage = error.message;
    } finally {
      if (token === requestToken) loading = false;
    }
  }

  function openFloor(floor = null) {
    editingId = floor?.id ?? null;
    form = { buildingId: floor?.buildingId ?? buildingId, floorNumber: floor ? String(floor.floorNumber) : '', name: floor?.name ?? '' };
    modalError = '';
    modalOpen = true;
  }

  async function saveFloor() {
    if (saving) return;
    saving = true;
    modalError = '';
    try {
      const payload = { buildingId: form.buildingId, floorNumber: String(form.floorNumber).trim(), name: form.name.trim() };
      if (editingId) await updateFloor(editingId, payload);
      else await createFloor(payload);
      notifySuccess(editingId ? $locale.floors.updated : $locale.floors.saved);
      modalOpen = false;
      await loadFloors(editingId ? pagination.page : 1);
    } catch (error) {
      modalError = error.data?.code === 'FLOOR_NUMBER_EXISTS' ? $locale.floors.floorNumberExists : error.message;
    } finally {
      saving = false;
    }
  }

  async function removeFloor(floor) {
    if (!window.confirm($locale.floors.confirmDelete)) return;
    errorMessage = '';
    try {
      await deleteFloor(floor.id);
      notifySuccess($locale.floors.deleted);
      await loadFloors(floors.length === 1 ? Math.max(1, pagination.page - 1) : pagination.page);
    } catch (error) {
      errorMessage = error.message;
    }
  }
  // Leading checkbox column — ids of the rows currently rendered.
  let selectedIds = createSelection();
  $: rowIds = floors.map((floor) => floor.id);
  $: allRowsSelected = isAllSelected(selectedIds, rowIds);
  $: someRowsSelected = isSomeSelected(selectedIds, rowIds);

  function toggleRow(id) { selectedIds = toggleSelected(selectedIds, id); }
  function toggleAllRows() { selectedIds = toggleAllSelected(selectedIds, rowIds); }

  // The building filter lives in the toolbar's panel, so the button counts it.
  $: activeFilterCount = buildingId ? 1 : 0;
  function clearFilters() { buildingId = ''; loadFloors(1); }
</script>

<svelte:head><title>{$locale.floors.title} | {$locale.common.apartmentPro}</title></svelte:head>

<PageLayout>
  <svelte:fragment slot="toolbar">
    <PageToolbar
      bind:search
      searchPlaceholder={$locale.floors.search}
      onSearch={() => loadFloors(1)}
      addLabel={$locale.floors.add}
      onAdd={() => openFloor()}
      filtersLabel={$locale.common.filters}
      filtersCount={activeFilterCount}
      filtersClearLabel={$locale.common.clearFilters}
      onClearFilters={clearFilters}
    >
      <svelte:fragment slot="filters">
        <div class="filters-field">
          <label class="filters-field-label" for="floor-filter-building">{$locale.buildings.name}</label>
          <select class="form-select" id="floor-filter-building" bind:value={buildingId} on:change={() => loadFloors(1)}>
            <option value="">{$locale.invoices.allBuildings}</option>
            {#each buildings as building (building.id)}<option value={building.id}>{building.name}</option>{/each}
          </select>
        </div>
      </svelte:fragment>
    </PageToolbar>
  </svelte:fragment>
  <svelte:fragment slot="alerts">
    {#if errorMessage}<div class="alert alert-danger" role="alert">{errorMessage}</div>{/if}
  </svelte:fragment>
  <svelte:fragment slot="content">
    <DataTable {loading} isEmpty={floors.length === 0} loadingLabel={$locale.floors.loading} emptyLabel={$locale.floors.empty} emptyIcon="bi-layers" minTableWidth="40rem" sortKey={sort.key} sortDir={sort.dir} on:sort={(event) => (sort = event.detail)}>
      <thead><tr><th class="select-column"><Checkbox checked={allRowsSelected} indeterminate={someRowsSelected} label={$locale.common.selectAll} on:change={toggleAllRows} /></th><th data-sort="building.name">{$locale.buildings.name}</th><th data-sort="floorNumber">{$locale.floors.floorNumber}</th><th data-sort="name">{$locale.floors.name}</th><th data-sort="totalApartments">{$locale.floors.apartments}</th><th class="actions-heading">{$locale.buildings.actions}</th></tr></thead>
      <tbody>
        {#each view as floor (floor.id)}
          <tr class:is-selected={selectedIds.has(floor.id)}>
            <td class="select-column"><Checkbox checked={selectedIds.has(floor.id)} label={$locale.common.selectRow} on:change={() => toggleRow(floor.id)} /></td>
            <td class="cell-muted">{floor.building?.name ?? '—'}</td>
            <td class="cell-muted">{floor.floorNumber}</td>
            <td>
              <button class="table-link" type="button" on:click={() => push(`/floors/${floor.id}`)}>
                {floor.name}
              </button>
            </td>
            <td>
              <span class="apartments-link">
                <span class="apartments-count">{formatNumber(floor.totalApartments ?? 0)}</span>
                <button class="table-link" type="button" on:click={() => push(`/floors/${floor.id}`)}>
                  {$locale.apartments.title}
                </button>
              </span>
            </td>
            <td class="actions-cell">
              <RowActions label={$locale.buildings.actions}>
                <button class="row-menu-item" type="button" on:click={() => openFloor(floor)}>
                  <i class="bi bi-pencil" aria-hidden="true"></i>
                  {$locale.floors.edit}
                </button>
                <button class="row-menu-item danger" type="button" on:click={() => removeFloor(floor)}>
                  <i class="bi bi-trash3" aria-hidden="true"></i>
                  {$locale.floors.delete}
                </button>
              </RowActions>
            </td>
          </tr>
        {/each}
      </tbody>
    </DataTable>
  </svelte:fragment>
  <svelte:fragment slot="footer">
    <Pagination page={pagination.page} totalPages={pagination.totalPages} previousLabel={$locale.buildings.previous} nextLabel={$locale.buildings.next} onPage={loadFloors} />
  </svelte:fragment>
</PageLayout>

<Modal bind:open={modalOpen} title={editingId ? $locale.floors.edit : $locale.floors.add} description={$locale.floors.description} busy={saving} icon="bi-layers" closeLabel={$locale.floors.cancel} on:close={() => { if (!saving) modalOpen = false; }}>
  <form id="floors-form" on:submit|preventDefault={saveFloor}>
    {#if modalError}<div class="alert alert-danger" role="alert">{modalError}</div>{/if}
    <div class="field">
      <BuildingSelect
        selectId="floor-building"
        label={$locale.buildings.name}
        buildings={buildings}
        icon="bi-building"
        bind:value={form.buildingId}
        placeholder={$locale.meterReadings.selectBuilding}
        required
        disabled={saving || Boolean(editingId)}
      />
    </div>
    <div class="field">
      <label class="field-label" for="floor-number">{$locale.floors.floorNumber}</label>
      <div class="field-control">
        <i class="bi bi-123" aria-hidden="true"></i>
        <input id="floor-number" class="form-control" type="text" maxlength="32" required pattern=".*\S.*" bind:value={form.floorNumber} disabled={saving} />
      </div>
    </div>
    <div class="field">
      <label class="field-label" for="floor-name">{$locale.floors.name}</label>
      <div class="field-control">
        <i class="bi bi-tag" aria-hidden="true"></i>
        <input id="floor-name" class="form-control" required pattern=".*\S.*" maxlength="191" bind:value={form.name} disabled={saving} />
      </div>
    </div>
  </form>
  <div slot="footer">
    <button class="btn btn-light" type="button" disabled={saving} on:click={() => modalOpen = false}>{$locale.floors.cancel}</button>
    <button class="btn btn-primary" type="submit" form="floors-form" disabled={saving}>{saving ? $locale.floors.loading : editingId ? $locale.floors.update : $locale.floors.save}</button>
  </div>
</Modal>

<style>
  /* The apartments column reads as a figure and a way in: the count first, in the
     same quiet chip the building page uses, then the link to the floor's own
     apartment list. */
  .apartments-link {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
  }

  .apartments-count {
    min-width: 1.6rem;
    padding: 0.05rem 0.4rem;
    border: 1px solid var(--border);
    border-radius: 999px;
    color: var(--text-secondary);
    background: var(--surface-sunken);
    font-family: var(--font-data);
    font-size: var(--text-xs);
    font-weight: var(--weight-semibold);
    text-align: center;
  }
</style>
