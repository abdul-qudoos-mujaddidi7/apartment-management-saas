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
  import BuildingSelect from '../components/buildings/BuildingSelect.svelte';
  import { locale } from '../i18n';
  import { getBuildings } from '../services/buildings';
  import { listFloors, createFloor, updateFloor, deleteFloor } from '../services/floors';

  let floors = [];
  let buildings = [];
  let search = '';
  let buildingId = '';
  let loading = true;
  let errorMessage = '';
  let noticeMessage = '';
  let pagination = { page: 1, pageSize: 10, totalPages: 0 };
  let requestToken = 0;
  let modalOpen = false;
  let editingId = null;
  let saving = false;
  let modalError = '';
  let form = { buildingId: '', floorNumber: 1, name: '' };

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
    form = { buildingId: floor?.buildingId ?? buildingId, floorNumber: floor?.floorNumber ?? 1, name: floor?.name ?? '' };
    modalError = '';
    modalOpen = true;
  }

  async function saveFloor() {
    if (saving) return;
    saving = true;
    modalError = '';
    noticeMessage = '';
    try {
      const payload = { buildingId: form.buildingId, floorNumber: Number(form.floorNumber), name: form.name.trim() };
      if (editingId) await updateFloor(editingId, payload);
      else await createFloor(payload);
      noticeMessage = editingId ? $locale.floors.updated : $locale.floors.saved;
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
    noticeMessage = '';
    errorMessage = '';
    try {
      await deleteFloor(floor.id);
      noticeMessage = $locale.floors.deleted;
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
    {#if noticeMessage}<div class="alert alert-success" role="status">{noticeMessage}</div>{/if}
  </svelte:fragment>
  <svelte:fragment slot="content">
    <DataTable {loading} isEmpty={floors.length === 0} loadingLabel={$locale.floors.loading} emptyLabel={$locale.floors.empty} emptyIcon="bi-layers" minTableWidth="40rem">
      <thead><tr><th class="select-column"><Checkbox checked={allRowsSelected} indeterminate={someRowsSelected} label={$locale.common.selectAll} on:change={toggleAllRows} /></th><th>{$locale.buildings.name}</th><th>{$locale.floors.floorNumber}</th><th>{$locale.floors.name}</th><th>{$locale.floors.apartments}</th><th>{$locale.buildings.actions}</th></tr></thead>
      <tbody>
        {#each floors as floor (floor.id)}
          <tr class:is-selected={selectedIds.has(floor.id)}>
            <td class="select-column"><Checkbox checked={selectedIds.has(floor.id)} label={$locale.common.selectRow} on:change={() => toggleRow(floor.id)} /></td>
            <td>{floor.building?.name ?? '—'}</td>
            <td>{floor.floorNumber}</td>
            <td><button class="link-button" type="button" on:click={() => push(`/floors/${floor.id}`)}>{floor.name}</button></td>
            <td><button class="link-button" type="button" on:click={() => push(`/floors/${floor.id}`)}>{$locale.apartments.title}</button></td>
            <td class="actions-cell">
              <button class="icon-button" type="button" aria-label={$locale.floors.edit} on:click={() => openFloor(floor)}><i class="bi bi-pencil" aria-hidden="true"></i></button>
              <button class="icon-button danger" type="button" aria-label={$locale.floors.delete} on:click={() => removeFloor(floor)}><i class="bi bi-trash3" aria-hidden="true"></i></button>
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

<Modal bind:open={modalOpen} title={editingId ? $locale.floors.edit : $locale.floors.add} busy={saving} closeLabel={$locale.floors.cancel} on:close={() => { if (!saving) modalOpen = false; }}>
  <form id="floors-form" on:submit|preventDefault={saveFloor}>
    {#if modalError}<div class="alert alert-danger" role="alert">{modalError}</div>{/if}
    <div class="mb-3">
      <BuildingSelect
        selectId="floor-building"
        label={$locale.buildings.name}
        buildings={buildings}
        bind:value={form.buildingId}
        placeholder={$locale.meterReadings.selectBuilding}
        required
        disabled={saving || Boolean(editingId)}
      />
    </div>
    <div class="mb-3"><label class="form-label" for="floor-number">{$locale.floors.floorNumber}</label><input id="floor-number" class="form-control" type="number" min="1" max="200" step="1" required bind:value={form.floorNumber} disabled={saving} /></div>
    <div class="mb-3"><label class="form-label" for="floor-name">{$locale.floors.name}</label><input id="floor-name" class="form-control" required pattern=".*\S.*" maxlength="191" bind:value={form.name} disabled={saving} /></div>
  </form>
  <div slot="footer">
    <button class="btn btn-light" type="button" disabled={saving} on:click={() => modalOpen = false}>{$locale.floors.cancel}</button>
    <button class="btn btn-primary" type="submit" form="floors-form" disabled={saving}>{saving ? $locale.floors.loading : editingId ? $locale.floors.update : $locale.floors.save}</button>
  </div>
</Modal>
