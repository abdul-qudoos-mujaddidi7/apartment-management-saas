<script>
  import { onMount, onDestroy } from 'svelte';
  import { link } from 'svelte-spa-router';

  import PageLayout from '../components/ui/PageLayout.svelte';
  import TabFilters from '../components/ui/TabFilters.svelte';
  import ActionButton from '../components/ui/ActionButton.svelte';
  import PageToolbar from '../components/ui/PageToolbar.svelte';
  import DataTable from '../components/ui/DataTable.svelte';
  import Checkbox from '../components/ui/Checkbox.svelte';
  import Pagination from '../components/ui/Pagination.svelte';
  import StatusBadge from '../components/ui/StatusBadge.svelte';
  import RowActions from '../components/ui/RowActions.svelte';
  import BuildingFormModal from '../components/buildings/BuildingFormModal.svelte';

  import { getBuildings, deleteBuilding } from '../services/buildings';
  import { locale } from '../i18n';
  import { sortRows } from '../utils/sortRows';
  import { debounce } from '../utils/debounce';
  import { createSelection, isAllSelected, isSomeSelected, toggleAllSelected, toggleSelected } from '../utils/selection';

  let buildings = [];
  let sort = { key: null, dir: 'asc' };
  $: view = sortRows(buildings, sort.key, sort.dir);
  let pagination = { page: 1, pageSize: 10, total: 0, totalPages: 0 };
  let search = '';
  let loading = false;
  let errorMessage = '';
  let noticeMessage = '';
  let requestToken = 0;

  // --- Tab filter state ---
  let statusFilter = 'all';
  $: statusTabs = [
    { key: 'all', label: $locale.common.all },
    { key: 'ACTIVE', label: $locale.buildings.active },
    { key: 'INACTIVE', label: $locale.buildings.inactive }
  ];

  function handleTabChange(e) {
    statusFilter = e.detail;
    loadBuildings(1);
  }

  /* The dialog owns the form; this page only tracks which row it was handed
     (null = create) and refreshes the list once the save lands. */
  let modalOpen = false;
  let editing = null;

  const debouncedSearch = debounce(() => loadBuildings(1), 300);
  onDestroy(() => debouncedSearch.cancel());
  function handleSearch() { debouncedSearch(); }

  onMount(() => loadBuildings(1));

  async function loadBuildings(page = pagination.page) {
    const token = ++requestToken;
    loading = true;
    errorMessage = '';
    try {
      const response = await getBuildings({
        page,
        pageSize: pagination.pageSize,
        search,
        status: statusFilter === 'all' ? undefined : statusFilter
      });
      if (token !== requestToken) return;
      buildings = response.items;
      pagination = response.pagination;
    } catch (error) {
      if (token !== requestToken) return;
      errorMessage = error.message;
    } finally {
      if (token === requestToken) loading = false;
    }
  }

  function openCreate() {
    editing = null;
    errorMessage = '';
    noticeMessage = '';
    modalOpen = true;
  }

  function openEdit(building) {
    editing = building;
    errorMessage = '';
    noticeMessage = '';
    modalOpen = true;
  }

  function closeModal() {
    modalOpen = false;
    editing = null;
  }

  async function handleSaved() {
    const wasEditing = Boolean(editing);
    editing = null;
    errorMessage = '';
    noticeMessage = $locale.buildings.saved;
    // A new row lands on the first page; an edit stays where the user was.
    await loadBuildings(wasEditing ? pagination.page : 1);
  }

  async function confirmDelete(building) {
    if (!window.confirm($locale.buildings.confirmDelete)) return;
    errorMessage = '';
    noticeMessage = '';
    try {
      await deleteBuilding(building.id);
      noticeMessage = $locale.buildings.deleted;
      const page = buildings.length === 1 && pagination.page > 1
        ? pagination.page - 1
        : pagination.page;
      await loadBuildings(page);
    } catch (error) {
      errorMessage = error.message;
    }
  }

  function statusTone(status) {
    return status === 'ACTIVE' ? 'success' : 'neutral';
  }

  function statusLabel(status) {
    return status === 'ACTIVE' ? $locale.buildings.active : $locale.buildings.inactive;
  }

  $: resultStart = pagination.total === 0
    ? 0
    : (pagination.page - 1) * pagination.pageSize + 1;
  $: resultEnd = Math.min(pagination.page * pagination.pageSize, pagination.total);
  $: resultSummary = $locale.buildings.showing
    .replace('{from}', resultStart)
    .replace('{to}', resultEnd)
    .replace('{total}', pagination.total);
  // Leading checkbox column — ids of the rows currently rendered.
  let selectedIds = createSelection();
  $: rowIds = buildings.map((building) => building.id);
  $: allRowsSelected = isAllSelected(selectedIds, rowIds);
  $: someRowsSelected = isSomeSelected(selectedIds, rowIds);

  function toggleRow(id) { selectedIds = toggleSelected(selectedIds, id); }
  function toggleAllRows() { selectedIds = toggleAllSelected(selectedIds, rowIds); }
</script>

<svelte:head>
  <title>{$locale.buildings.title} | {$locale.common.apartmentPro}</title>
</svelte:head>

<PageLayout>
  <svelte:fragment slot="toolbar">
    <PageToolbar
      bind:search
      searchPlaceholder={$locale.buildings.search}
      onSearch={handleSearch}
      addLabel={$locale.buildings.add}
      onAdd={openCreate}
    >
      <svelte:fragment slot="tabs">
        <TabFilters tabs={statusTabs} active={statusFilter} on:select={handleTabChange} />
      </svelte:fragment>
    </PageToolbar>
  </svelte:fragment>

  <svelte:fragment slot="alerts">
    {#if errorMessage}
      <div class="alert alert-danger" role="alert">{errorMessage}</div>
    {/if}
    {#if noticeMessage}
      <div class="alert alert-success" role="status">{noticeMessage}</div>
    {/if}
  </svelte:fragment>

  <svelte:fragment slot="content">
    <DataTable
      {loading}
      isEmpty={buildings.length === 0}
      loadingLabel={$locale.buildings.loading}
      emptyLabel={$locale.buildings.empty}
      emptyIcon="bi-buildings"
      minTableWidth="54rem"
      showFooter={!loading && buildings.length > 0}
      sortKey={sort.key}
      sortDir={sort.dir}
      on:sort={(event) => (sort = event.detail)}
    >
      <ActionButton
        slot="empty-action"
        icon="bi-plus-lg"
        label={$locale.buildings.add}
        on:click={openCreate}
      />

      <thead>
        <tr>
          <th class="select-column"><Checkbox checked={allRowsSelected} indeterminate={someRowsSelected} label={$locale.common.selectAll} on:change={toggleAllRows} /></th>
          <th data-sort="name">{$locale.buildings.name}</th>
          <th data-sort="code">{$locale.buildings.code}</th>
          <th data-sort="address">{$locale.buildings.address}</th>
          <th data-sort="totalFloors">{$locale.buildings.floors}</th>
          <th data-sort="status">{$locale.buildings.status}</th>
          <th class="actions-heading">{$locale.buildings.actions}</th>
        </tr>
      </thead>

      <tbody>
        {#each view as building (building.id)}
          <tr class:is-selected={selectedIds.has(building.id)}>
            <td class="select-column"><Checkbox checked={selectedIds.has(building.id)} label={$locale.common.selectRow} on:change={() => toggleRow(building.id)} /></td>
            <td class="building-name">
              <a use:link class="entity-link" href={`/buildings/${building.id}`}>
              
                <span>{building.name}</span>
              </a>
            </td>
            <td class="data-cell">{building.code}</td>
            <td>{building.address || '—'}</td>
            <td class="data-cell">{building.totalFloors ?? 0}</td>
            <td>
              <StatusBadge label={statusLabel(building.status)} tone={statusTone(building.status)} />
            </td>
            <td class="actions-cell">
              <RowActions label={$locale.buildings.actions}>
                <button class="row-menu-item" type="button" on:click={() => openEdit(building)}>
                  <i class="bi bi-pencil" aria-hidden="true"></i>
                  {$locale.buildings.edit}
                </button>
                <button class="row-menu-item danger" type="button" on:click={() => confirmDelete(building)}>
                  <i class="bi bi-trash3" aria-hidden="true"></i>
                  {$locale.buildings.delete}
                </button>
              </RowActions>
            </td>
          </tr>
        {/each}
      </tbody>
    </DataTable>
  </svelte:fragment>

  <svelte:fragment slot="footer">
    <Pagination
      page={pagination.page}
      totalPages={pagination.totalPages}
      previousLabel={$locale.buildings.previous}
      nextLabel={$locale.buildings.next}
      label={$locale.buildings.page.replace('{page}', pagination.page).replace('{totalPages}', pagination.totalPages)}
      summary={resultSummary}
      onPage={loadBuildings}
    />
  </svelte:fragment>
</PageLayout>

<BuildingFormModal bind:open={modalOpen} building={editing} on:saved={handleSaved} on:close={closeModal} />
