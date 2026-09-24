<script>
  import { onMount } from 'svelte';
  import { push } from 'svelte-spa-router';

  import PageLayout from '../components/ui/PageLayout.svelte';
  import PageToolbar from '../components/ui/PageToolbar.svelte';
  import ActionButton from '../components/ui/ActionButton.svelte';
  import DataTable from '../components/ui/DataTable.svelte';
  import Pagination from '../components/ui/Pagination.svelte';
  import Modal from '../components/ui/Modal.svelte';
  import StatusBadge from '../components/ui/StatusBadge.svelte';
  import RowActions from '../components/ui/RowActions.svelte';
  import TabFilters from '../components/ui/TabFilters.svelte';

  import { getBuildings } from '../services/buildings';
  import { listFloors } from '../services/floors';
  import { listApartments } from '../services/apartments';
  import {
    createAsset,
    createAssetCategory,
    deleteApartmentAssetRecord,
    deleteAsset,
    deleteAssetCategory,
    listApartmentAssetRecords,
    listAssetCategories,
    listAssets,
    updateApartmentAssetRecord,
    updateAsset,
    updateAssetCategory
  } from '../services/assets';

  import { locale, translate } from '../i18n';
  import { formatDate, formatMoney, formatNumber } from '../utils/formatters';

  const conditionKeys = ['NEW', 'GOOD', 'FAIR', 'DAMAGED', 'BROKEN'];

  let activeTab = 'records';

  let search = '';
  let buildingId = '';
  let floorId = '';
  let apartmentId = '';
  let categoryId = '';
  let assetId = '';
  let condition = '';
  let setup = 'all';

  let buildings = [];
  let floors = [];
  let apartments = [];
  let assets = [];
  let categories = [];

  let records = [];
  let pagination = { page: 1, pageSize: 20, total: 0, totalPages: 0 };
  let summary = { totalRecords: 0, totalQuantity: 0, totalValue: 0, damagedCount: 0 };

  let loading = false;
  let saving = false;
  let errorMessage = '';
  let noticeMessage = '';

  // --- Modals ---------------------------------------------------------------

  let recordModalOpen = false;
  let recordEditingId = null;
  let recordError = '';
  let recordErrors = {};
  let recordForm = emptyRecordForm();

  let apartmentPickerOpen = false;
  let apartmentPickerError = '';
  let apartmentPickerFloors = [];
  let apartmentPickerApartments = [];
  let apartmentPicker = { buildingId: '', floorId: '', apartmentId: '' };

  let assetModalOpen = false;
  let assetEditingId = null;
  let assetError = '';
  let assetErrors = {};
  let assetForm = emptyAssetForm();

  let categoryModalOpen = false;
  let categoryEditingId = null;
  let categoryError = '';
  let categoryErrors = {};
  let categoryForm = emptyCategoryForm();

  function emptyRecordForm() {
    return {
      assetId: '',
      quantity: 1,
      condition: 'GOOD',
      serialNumber: '',
      modelNumber: '',
      unitValue: '',
      notes: ''
    };
  }

  function emptyAssetForm() {
    return { name: '', categoryId: '', code: '', unit: '', description: '' };
  }

  function emptyCategoryForm() {
    return { name: '', description: '' };
  }

  onMount(async () => {
    await Promise.all([loadBuildings(), loadCategories(), loadAssets()]);
    await loadRecords(1);
  });

  $: tabs = [
    { key: 'records', label: $locale.assets.tabRecords },
    { key: 'catalog', label: $locale.assets.tabCatalog },
    { key: 'categories', label: $locale.assets.tabCategories }
  ];

  $: filtersCount = [buildingId, floorId, apartmentId, categoryId, assetId, condition].filter(Boolean).length
    + (setup !== 'all' ? 1 : 0);

  $: resultSummary = `${$locale.assets.totalRecords}: ${pagination.total}`;

  $: assetGroups = groupByCategory(assets);

  function groupByCategory(list) {
    const groups = new Map();

    for (const asset of list) {
      const label = asset.category?.name || '';
      if (!groups.has(label)) groups.set(label, []);
      groups.get(label).push(asset);
    }

    return [...groups.entries()].map(([label, items]) => ({ label, items }));
  }

  // --- Option loading -------------------------------------------------------

  async function loadBuildings() {
    try {
      const response = await getBuildings({ pageSize: 100 });
      buildings = response.items || [];
    } catch (error) {
      errorMessage = error.message || $locale.assets.optionsError;
    }
  }

  async function loadFloors(nextBuildingId) {
    floors = [];
    if (!nextBuildingId) return;

    try {
      const response = await listFloors({ buildingId: nextBuildingId, pageSize: 100 });
      floors = response.items || [];
    } catch (error) {
      errorMessage = error.message || $locale.assets.optionsError;
    }
  }

  async function loadApartments(nextFloorId) {
    apartments = [];
    if (!nextFloorId) return;

    try {
      const response = await listApartments({ floorId: nextFloorId, pageSize: 100 });
      apartments = response.items || [];
    } catch (error) {
      errorMessage = error.message || $locale.assets.optionsError;
    }
  }

  async function loadAssets() {
    try {
      const response = await listAssets({ pageSize: 100 });
      assets = response.items || [];
    } catch (error) {
      errorMessage = error.message || $locale.assets.optionsError;
    }
  }

  async function loadCategories() {
    try {
      const response = await listAssetCategories({ pageSize: 100 });
      categories = response.items || [];
    } catch (error) {
      errorMessage = error.message || $locale.assets.optionsError;
    }
  }

  // --- Records --------------------------------------------------------------

  async function loadRecords(page = pagination.page) {
    loading = true;
    errorMessage = '';

    try {
      const response = await listApartmentAssetRecords({
        page,
        pageSize: pagination.pageSize,
        search,
        buildingId,
        floorId,
        apartmentId,
        categoryId,
        assetId,
        condition,
        setup
      });

      records = response.items || [];
      pagination = response.pagination;
      summary = response.summary || summary;
    } catch (error) {
      errorMessage = error.message || $locale.assets.loadError;
    } finally {
      loading = false;
    }
  }

  async function applyBuildingFilter(value) {
    buildingId = value;
    floorId = '';
    apartmentId = '';
    await loadFloors(value);
    apartments = [];
    if (activeTab === 'records') await loadRecords(1);
  }

  async function applyFloorFilter(value) {
    floorId = value;
    apartmentId = '';
    await loadApartments(value);
    if (activeTab === 'records') await loadRecords(1);
  }

  function clearFilters() {
    buildingId = '';
    floorId = '';
    apartmentId = '';
    categoryId = '';
    assetId = '';
    condition = '';
    setup = 'all';
    floors = [];
    apartments = [];
    if (activeTab === 'records') loadRecords(1);
  }

  async function selectTab(key) {
    if (activeTab === key) return;
    activeTab = key;
    errorMessage = '';
    noticeMessage = '';
    if (key === 'records') await loadRecords(1);
  }

  function conditionTone(value) {
    switch (value) {
      case 'NEW':
      case 'GOOD':
        return 'success';
      case 'FAIR':
        return 'info';
      case 'DAMAGED':
        return 'warning';
      case 'BROKEN':
        return 'danger';
      default:
        return 'neutral';
    }
  }

  function assetLabel(record) {
    return record.asset?.name || '—';
  }

  // Asset registration belongs to one apartment. Choose that apartment first,
  // then use its complete asset sheet to add and save one or more items.
  function openApartmentAssetCreate() {
    apartmentPickerError = '';
    apartmentPicker = { buildingId, floorId, apartmentId };
    apartmentPickerFloors = buildingId ? floors : [];
    apartmentPickerApartments = floorId ? apartments : [];
    apartmentPickerOpen = true;
  }

  function closeApartmentPicker() {
    apartmentPickerOpen = false;
    apartmentPickerError = '';
  }

  async function changePickerBuilding(value) {
    apartmentPicker = { buildingId: value, floorId: '', apartmentId: '' };
    apartmentPickerFloors = [];
    apartmentPickerApartments = [];
    apartmentPickerError = '';
    if (!value) return;
    try {
      const response = await listFloors({ buildingId: value, pageSize: 100 });
      apartmentPickerFloors = response.items || [];
    } catch (error) {
      apartmentPickerError = error.message || $locale.assets.optionsError;
    }
  }

  async function changePickerFloor(value) {
    apartmentPicker = { ...apartmentPicker, floorId: value, apartmentId: '' };
    apartmentPickerApartments = [];
    apartmentPickerError = '';
    if (!value) return;
    try {
      const response = await listApartments({ floorId: value, pageSize: 100 });
      apartmentPickerApartments = response.items || [];
    } catch (error) {
      apartmentPickerError = error.message || $locale.assets.optionsError;
    }
  }

  function continueToApartmentAssets() {
    if (!apartmentPicker.apartmentId) return;
    push(`/apartments/${apartmentPicker.apartmentId}/assets`);
  }

  // --- Record modal ---------------------------------------------------------

  function openRecordEdit(record) {
    recordEditingId = record.id;
    recordError = '';
    recordErrors = {};
    recordForm = {
      assetId: record.assetId,
      quantity: record.quantity,
      condition: record.condition,
      serialNumber: record.serialNumber || '',
      modelNumber: record.modelNumber || '',
      unitValue: record.unitValue === null || record.unitValue === undefined ? '' : record.unitValue,
      notes: record.notes || ''
    };
    recordModalOpen = true;
  }

  function closeRecordModal() {
    if (saving) return;
    recordModalOpen = false;
    recordEditingId = null;
    recordError = '';
    recordErrors = {};
  }

  function validateRecordForm() {
    recordErrors = {};

    if (!recordForm.assetId) {
      recordErrors.assetId = translate('assets.required', { field: $locale.assets.asset });
    }

    const quantity = Number(recordForm.quantity);
    if (!Number.isInteger(quantity) || quantity < 1) {
      recordErrors.quantity = translate('assets.wholeQuantity', { field: $locale.assets.quantity });
    }

    if (recordForm.unitValue !== '' && (!Number.isFinite(Number(recordForm.unitValue)) || Number(recordForm.unitValue) < 0)) {
      recordErrors.unitValue = translate('assets.notNegative', { field: $locale.assets.unitValue });
    }

    return Object.keys(recordErrors).length === 0;
  }

  async function submitRecord() {
    if (!validateRecordForm()) return;

    saving = true;
    recordError = '';

    try {
      await updateApartmentAssetRecord(recordEditingId, {
        assetId: recordForm.assetId,
        quantity: Number(recordForm.quantity),
        condition: recordForm.condition,
        serialNumber: recordForm.serialNumber.trim() || null,
        modelNumber: recordForm.modelNumber.trim() || null,
        unitValue: recordForm.unitValue === '' ? null : Number(recordForm.unitValue),
        notes: recordForm.notes.trim() || null
      });

      noticeMessage = $locale.assets.updated;
      closeRecordModal();
      await loadRecords(pagination.page);
    } catch (error) {
      if (error.data?.code === 'SERIAL_NUMBER_EXISTS') {
        recordErrors = { serialNumber: $locale.assets.serialExists };
      } else {
        recordError = error.message;
      }
    } finally {
      saving = false;
    }
  }

  async function removeRecord(record) {
    if (!window.confirm($locale.assets.confirmDelete)) return;

    errorMessage = '';
    noticeMessage = '';

    try {
      await deleteApartmentAssetRecord(record.id);
      noticeMessage = $locale.assets.deleted;
      const page = records.length === 1 && pagination.page > 1 ? pagination.page - 1 : pagination.page;
      await loadRecords(page);
    } catch (error) {
      errorMessage = error.message;
    }
  }

  function openApartmentAssets(record) {
    push(`/apartments/${record.apartmentId}/assets`);
  }

  // --- Catalogue ------------------------------------------------------------

  function openAssetCreate() {
    assetEditingId = null;
    assetError = '';
    assetErrors = {};
    assetForm = { ...emptyAssetForm(), categoryId: categories[0]?.id || '' };
    assetModalOpen = true;
  }

  function openAssetEdit(asset) {
    assetEditingId = asset.id;
    assetError = '';
    assetErrors = {};
    assetForm = {
      name: asset.name,
      categoryId: asset.categoryId || '',
      code: asset.code || '',
      unit: asset.unit || '',
      description: asset.description || ''
    };
    assetModalOpen = true;
  }

  function closeAssetModal() {
    if (saving) return;
    assetModalOpen = false;
    assetEditingId = null;
    assetError = '';
    assetErrors = {};
  }

  async function submitAsset() {
    assetErrors = {};
    assetError = '';

    if (!assetForm.name.trim()) {
      assetErrors = { name: translate('assets.required', { field: $locale.assets.name }) };
      return;
    }

    saving = true;

    const payload = {
      name: assetForm.name.trim(),
      categoryId: assetForm.categoryId || null,
      code: assetForm.code.trim() || null,
      unit: assetForm.unit.trim() || null,
      description: assetForm.description.trim() || null
    };

    try {
      if (assetEditingId) {
        await updateAsset(assetEditingId, payload);
        noticeMessage = $locale.assets.assetSaved;
      } else {
        await createAsset(payload);
        noticeMessage = $locale.assets.assetSaved;
      }

      closeAssetModal();
      await loadAssets();
    } catch (error) {
      assetError = error.message;
    } finally {
      saving = false;
    }
  }

  async function removeAsset(asset) {
    if (!window.confirm($locale.assets.confirmDelete)) return;

    errorMessage = '';
    noticeMessage = '';

    try {
      await deleteAsset(asset.id);
      noticeMessage = $locale.assets.deleted;
      await loadAssets();
    } catch (error) {
      errorMessage = error.message;
    }
  }

  // --- Categories -----------------------------------------------------------

  function openCategoryCreate() {
    categoryEditingId = null;
    categoryError = '';
    categoryErrors = {};
    categoryForm = emptyCategoryForm();
    categoryModalOpen = true;
  }

  function openCategoryEdit(category) {
    categoryEditingId = category.id;
    categoryError = '';
    categoryErrors = {};
    categoryForm = {
      name: category.name,
      description: category.description || ''
    };
    categoryModalOpen = true;
  }

  function closeCategoryModal() {
    if (saving) return;
    categoryModalOpen = false;
    categoryEditingId = null;
    categoryError = '';
    categoryErrors = {};
  }

  async function submitCategory() {
    categoryErrors = {};
    categoryError = '';

    if (!categoryForm.name.trim()) {
      categoryErrors = { name: translate('assets.required', { field: $locale.assets.name }) };
      return;
    }

    saving = true;

    const payload = {
      name: categoryForm.name.trim(),
      description: categoryForm.description.trim() || null
    };

    try {
      if (categoryEditingId) {
        await updateAssetCategory(categoryEditingId, payload);
      } else {
        await createAssetCategory(payload);
      }

      noticeMessage = $locale.assets.categorySaved;
      // Closed directly: closeCategoryModal() refuses while `saving` is still set,
      // which is exactly the state the save leaves behind.
      categoryModalOpen = false;
      categoryEditingId = null;
      await loadCategories();
    } catch (error) {
      categoryError = error.message;
    } finally {
      saving = false;
    }
  }

  async function removeCategory(category) {
    if (!window.confirm($locale.assets.confirmDelete)) return;

    errorMessage = '';
    noticeMessage = '';

    try {
      await deleteAssetCategory(category.id);
      noticeMessage = $locale.assets.deleted;
      await loadCategories();
    } catch (error) {
      errorMessage = error.message;
    }
  }
</script>

<svelte:head>
  <title>{$locale.assets.title} | {$locale.common.apartmentPro}</title>
</svelte:head>

<PageLayout
  showStats={activeTab === 'records'}
  ariaLabel={$locale.assets.title}
>
  <svelte:fragment slot="actions">
    {#if activeTab === 'records'}
      <ActionButton icon="bi-plus-lg" label={$locale.assets.addApartmentAsset} on:click={openApartmentAssetCreate} />
    {:else if activeTab === 'catalog'}
      <ActionButton icon="bi-plus-lg" label={$locale.assets.newAsset} on:click={openAssetCreate} />
    {:else if activeTab === 'categories'}
      <ActionButton icon="bi-plus-lg" label={$locale.assets.newCategory} on:click={openCategoryCreate} />
    {/if}
  </svelte:fragment>

  <svelte:fragment slot="stats">
    <div class="stat-grid">
      <div class="stat-tile">
        <span class="stat-icon"><i class="bi bi-box-seam" aria-hidden="true"></i></span>
        <div>
          <div class="metric-copy">{$locale.assets.summaryRecords}</div>
          <strong>{formatNumber(summary.totalRecords)}</strong>
        </div>
      </div>
      <div class="stat-tile">
        <span class="stat-icon"><i class="bi bi-stack" aria-hidden="true"></i></span>
        <div>
          <div class="metric-copy">{$locale.assets.summaryQuantity}</div>
          <strong>{formatNumber(summary.totalQuantity)}</strong>
        </div>
      </div>
      <div class="stat-tile">
        <span class="stat-icon"><i class="bi bi-cash-coin" aria-hidden="true"></i></span>
        <div>
          <div class="metric-copy">{$locale.assets.summaryValue}</div>
          <strong>{formatMoney(summary.totalValue)}</strong>
        </div>
      </div>
      <div class="stat-tile">
        <span class="stat-icon"><i class="bi bi-exclamation-triangle" aria-hidden="true"></i></span>
        <div>
          <div class="metric-copy">{$locale.assets.summaryDamaged}</div>
          <strong>{formatNumber(summary.damagedCount)}</strong>
        </div>
      </div>
    </div>
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
    <!-- Asset records across the organization -->
    {#if activeTab === 'records'}
      <DataTable
        {loading}
        isEmpty={records.length === 0}
        loadingLabel={$locale.assets.loading}
        emptyLabel={$locale.assets.emptyRecords}
        emptyIcon="bi-box-seam"
        minTableWidth="80rem"
        showFooter={!loading && records.length > 0}
      >
        <ActionButton slot="empty-action" icon="bi-plus-lg" label={$locale.assets.addApartmentAsset} on:click={openApartmentAssetCreate} />

        <PageToolbar
          slot="toolbar"
          bind:search
          searchPlaceholder={$locale.assets.search}
          onSearch={() => loadRecords(1)}
          showAdd={false}
          filtersLabel={$locale.common.filters}
          filtersCount={filtersCount}
          filtersClearLabel={$locale.common.clearFilters}
          onClearFilters={clearFilters}
        >
          <svelte:fragment slot="tabs">
            <TabFilters {tabs} active={activeTab} on:select={(event) => selectTab(event.detail)} />
          </svelte:fragment>

          <svelte:fragment slot="filters">
            <label class="filters-field">
              <span class="filters-field-label">{$locale.assets.building}</span>
              <select class="form-select" value={buildingId} on:change={(event) => applyBuildingFilter(event.currentTarget.value)}>
                <option value="">{$locale.assets.allBuildings}</option>
                {#each buildings as building (building.id)}
                  <option value={building.id}>{building.name}</option>
                {/each}
              </select>
            </label>

            <label class="filters-field">
              <span class="filters-field-label">{$locale.assets.floor}</span>
              <select class="form-select" value={floorId} on:change={(event) => applyFloorFilter(event.currentTarget.value)} disabled={!buildingId}>
                <option value="">{$locale.assets.allFloors}</option>
                {#each floors as floor (floor.id)}
                  <option value={floor.id}>{floor.name}</option>
                {/each}
              </select>
            </label>

            <label class="filters-field">
              <span class="filters-field-label">{$locale.assets.apartment}</span>
              <select
                class="form-select"
                value={apartmentId}
                on:change={(event) => { apartmentId = event.currentTarget.value; loadRecords(1); }}
                disabled={!floorId}
              >
                <option value="">{$locale.assets.allApartments}</option>
                {#each apartments as apartment (apartment.id)}
                  <option value={apartment.id}>{apartment.apartmentNumber} · {apartment.name}</option>
                {/each}
              </select>
            </label>

            <label class="filters-field">
              <span class="filters-field-label">{$locale.assets.category}</span>
              <select class="form-select" value={categoryId} on:change={(event) => { categoryId = event.currentTarget.value; loadRecords(1); }}>
                <option value="">{$locale.assets.allCategories}</option>
                {#each categories as category (category.id)}
                  <option value={category.id}>{category.name}</option>
                {/each}
              </select>
            </label>

            <label class="filters-field">
              <span class="filters-field-label">{$locale.assets.asset}</span>
              <select class="form-select" value={assetId} on:change={(event) => { assetId = event.currentTarget.value; loadRecords(1); }}>
                <option value="">{$locale.assets.allAssets}</option>
                {#each assets as asset (asset.id)}
                  <option value={asset.id}>{asset.name}</option>
                {/each}
              </select>
            </label>

            <label class="filters-field">
              <span class="filters-field-label">{$locale.assets.condition}</span>
              <select class="form-select" value={condition} on:change={(event) => { condition = event.currentTarget.value; loadRecords(1); }}>
                <option value="">{$locale.assets.allConditions}</option>
                {#each conditionKeys as conditionValue (conditionValue)}
                  <option value={conditionValue}>{$locale.assets.conditions[conditionValue]}</option>
                {/each}
              </select>
            </label>

            <label class="filters-field">
              <span class="filters-field-label">{$locale.assets.setupStatus}</span>
              <select class="form-select" value={setup} on:change={(event) => { setup = event.currentTarget.value; loadRecords(1); }}>
                <option value="all">{$locale.assets.allSetup}</option>
                <option value="pending">{$locale.assets.setupPending}</option>
                <option value="completed">{$locale.assets.setupCompleted}</option>
              </select>
            </label>
          </svelte:fragment>
        </PageToolbar>

        <thead>
          <tr>
            <th>{$locale.assets.assetItem}</th>
            <th>{$locale.assets.apartment}</th>
            <th>{$locale.assets.floor}</th>
            <th>{$locale.assets.building}</th>
            <th>{$locale.assets.category}</th>
            <th class="amount-cell">{$locale.assets.quantity}</th>
            <th>{$locale.assets.condition}</th>
            <th>{$locale.assets.serialNumber}</th>
            <th class="amount-cell">{$locale.assets.unitValue}</th>
            <th>{$locale.assets.updatedAt}</th>
            <th class="actions-heading"><span class="visually-hidden">{$locale.assets.actions}</span></th>
          </tr>
        </thead>

        <tbody>
          {#each records as record (record.id)}
            <tr>
              <td>
                <button class="entity-link" type="button" on:click={() => openApartmentAssets(record)}>
                  {assetLabel(record)}
                </button>
                {#if record.asset?.unit}
                  <span class="unit-hint">{record.asset.unit}</span>
                {/if}
              </td>
              <td>{record.apartment?.apartmentNumber || '—'} · {record.apartment?.name || ''}</td>
              <td>{record.apartment?.floor?.name || '—'}</td>
              <td>{record.apartment?.floor?.building?.name || '—'}</td>
              <td>{record.asset?.category?.name || '—'}</td>
              <td class="amount-cell">{formatNumber(record.quantity)}</td>
              <td>
                <StatusBadge
                  label={$locale.assets.conditions[record.condition] || record.condition}
                  tone={conditionTone(record.condition)}
                />
              </td>
              <td>{record.serialNumber || '—'}</td>
              <td class="amount-cell">{record.unitValue === null ? '—' : formatMoney(record.unitValue)}</td>
              <td>{formatDate(record.updatedAt)}</td>
              <td class="actions-cell">
                <RowActions label={$locale.assets.actions}>
                  <button class="row-menu-item" type="button" on:click={() => openRecordEdit(record)}>
                    <i class="bi bi-pencil" aria-hidden="true"></i>
                    {$locale.assets.edit}
                  </button>
                  <button class="row-menu-item danger" type="button" on:click={() => removeRecord(record)}>
                    <i class="bi bi-trash3" aria-hidden="true"></i>
                    {$locale.assets.removeItem}
                  </button>
                </RowActions>
              </td>
            </tr>
          {/each}
        </tbody>

        <Pagination
          slot="footer"
          page={pagination.page}
          totalPages={pagination.totalPages}
          previousLabel={$locale.assets.previous}
          nextLabel={$locale.assets.next}
          label={$locale.assets.page.replace('{page}', pagination.page).replace('{totalPages}', pagination.totalPages)}
          summary={resultSummary}
          itemsPerPage={pagination.pageSize}
          perPageOptions={[10, 20, 50, 100]}
          perPageLabel={$locale.common.perPage}
          onPerPage={(size) => { pagination = { ...pagination, pageSize: size }; loadRecords(1); }}
          onPage={loadRecords}
        />
      </DataTable>

    <!-- Master asset catalogue -->
    {:else if activeTab === 'catalog'}
      <DataTable
        isEmpty={assets.length === 0}
        emptyLabel={$locale.assets.catalogEmpty}
        emptyIcon="bi-boxes"
        minTableWidth="58rem"
        showFooter={false}
      >
        <PageToolbar
          slot="toolbar"
          bind:search
          searchPlaceholder={$locale.assets.search}
          showAdd={false}
        >
          <svelte:fragment slot="tabs">
            <TabFilters {tabs} active={activeTab} on:select={(event) => selectTab(event.detail)} />
          </svelte:fragment>
        </PageToolbar>

        <ActionButton slot="empty-action" icon="bi-plus-lg" label={$locale.assets.newAsset} on:click={openAssetCreate} />

        <thead>
          <tr>
            <th>{$locale.assets.name}</th>
            <th>{$locale.assets.category}</th>
            <th>{$locale.assets.unit}</th>
            <th>{$locale.assets.code}</th>
            <th class="amount-cell">{$locale.assets.usageCount}</th>
            <th class="actions-heading"><span class="visually-hidden">{$locale.assets.actions}</span></th>
          </tr>
        </thead>

        <tbody>
          {#each assets.filter((asset) => !search.trim() || asset.name.toLowerCase().includes(search.trim().toLowerCase())) as asset (asset.id)}
            <tr>
              <td>{asset.name}</td>
              <td>{asset.category?.name || '—'}</td>
              <td>{asset.unit || '—'}</td>
              <td>{asset.code || '—'}</td>
              <td class="amount-cell">{formatNumber(asset.usageCount)}</td>
              <td class="actions-cell">
                <RowActions label={$locale.assets.actions}>
                  <button class="row-menu-item" type="button" on:click={() => openAssetEdit(asset)}>
                    <i class="bi bi-pencil" aria-hidden="true"></i>
                    {$locale.assets.edit}
                  </button>
                  <button class="row-menu-item danger" type="button" on:click={() => removeAsset(asset)}>
                    <i class="bi bi-trash3" aria-hidden="true"></i>
                    {$locale.assets.removeItem}
                  </button>
                </RowActions>
              </td>
            </tr>
          {/each}
        </tbody>
      </DataTable>

    <!-- Categories -->
    {:else}
      <DataTable
        isEmpty={categories.length === 0}
        emptyLabel={$locale.assets.categoriesEmpty}
        emptyIcon="bi-tags"
        minTableWidth="48rem"
        showFooter={false}
      >
        <PageToolbar
          slot="toolbar"
          bind:search
          searchPlaceholder={$locale.assets.search}
          showAdd={false}
        >
          <svelte:fragment slot="tabs">
            <TabFilters {tabs} active={activeTab} on:select={(event) => selectTab(event.detail)} />
          </svelte:fragment>
        </PageToolbar>

        <ActionButton slot="empty-action" icon="bi-plus-lg" label={$locale.assets.newCategory} on:click={openCategoryCreate} />

        <thead>
          <tr>
            <th>{$locale.assets.name}</th>
            <th>{$locale.assets.description}</th>
            <th class="amount-cell">{$locale.assets.usageCount}</th>
            <th class="actions-heading"><span class="visually-hidden">{$locale.assets.actions}</span></th>
          </tr>
        </thead>

        <tbody>
          {#each categories.filter((category) => !search.trim() || category.name.toLowerCase().includes(search.trim().toLowerCase())) as category (category.id)}
            <tr>
              <td>{category.name}</td>
              <td>{category.description || '—'}</td>
              <td class="amount-cell">{formatNumber(category.assetCount)}</td>
              <td class="actions-cell">
                <RowActions label={$locale.assets.actions}>
                  <button class="row-menu-item" type="button" on:click={() => openCategoryEdit(category)}>
                    <i class="bi bi-pencil" aria-hidden="true"></i>
                    {$locale.assets.edit}
                  </button>
                  <button class="row-menu-item danger" type="button" on:click={() => removeCategory(category)}>
                    <i class="bi bi-trash3" aria-hidden="true"></i>
                    {$locale.assets.removeItem}
                  </button>
                </RowActions>
              </td>
            </tr>
          {/each}
        </tbody>
      </DataTable>
    {/if}
  </svelte:fragment>
</PageLayout>

<!-- Choose the apartment before opening its multi-item asset sheet. -->
<Modal
  bind:open={apartmentPickerOpen}
  icon="bi-building-add"
  title={$locale.assets.addApartmentAsset}
  closeLabel={$locale.assets.cancel}
  on:close={closeApartmentPicker}
>
  {#if apartmentPickerError}
    <div class="alert alert-danger" role="alert">{apartmentPickerError}</div>
  {/if}

  <div class="row g-3">
    <div class="col-12">
      <label class="form-label" for="asset-building">{$locale.assets.building}</label>
      <select class="form-select" id="asset-building" value={apartmentPicker.buildingId} on:change={(event) => changePickerBuilding(event.currentTarget.value)}>
        <option value="">{$locale.assets.selectBuilding}</option>
        {#each buildings as building (building.id)}
          <option value={building.id}>{building.name}</option>
        {/each}
      </select>
    </div>

    <div class="col-12">
      <label class="form-label" for="asset-floor">{$locale.assets.floor}</label>
      <select class="form-select" id="asset-floor" value={apartmentPicker.floorId} on:change={(event) => changePickerFloor(event.currentTarget.value)} disabled={!apartmentPicker.buildingId}>
        <option value="">{$locale.assets.selectFloor}</option>
        {#each apartmentPickerFloors as floor (floor.id)}
          <option value={floor.id}>{floor.name}</option>
        {/each}
      </select>
    </div>

    <div class="col-12">
      <label class="form-label" for="asset-apartment">{$locale.assets.apartment}</label>
      <select class="form-select" id="asset-apartment" bind:value={apartmentPicker.apartmentId} disabled={!apartmentPicker.floorId}>
        <option value="">{$locale.assets.selectApartment}</option>
        {#each apartmentPickerApartments as apartment (apartment.id)}
          <option value={apartment.id}>{apartment.apartmentNumber} · {apartment.name}</option>
        {/each}
      </select>
    </div>
  </div>

  <div slot="footer">
    <button class="btn btn-light" type="button" on:click={closeApartmentPicker}>{$locale.assets.cancel}</button>
    <button class="btn btn-primary" type="button" on:click={continueToApartmentAssets} disabled={!apartmentPicker.apartmentId}>
      {$locale.assets.continue}
      <i class="bi bi-arrow-right" aria-hidden="true"></i>
    </button>
  </div>
</Modal>

<!-- Edit a registered apartment asset -->
<Modal
  bind:open={recordModalOpen}
  icon="bi-box-seam"
  title={$locale.assets.edit}
  busy={saving}
  closeLabel={$locale.assets.cancel}
  on:close={closeRecordModal}
>
  <form id="record-form" on:submit|preventDefault={submitRecord} novalidate>
    {#if recordError}
      <div class="alert alert-danger" role="alert">{recordError}</div>
    {/if}

    <div class="row g-3">
      <div class="col-sm-6">
        <label class="form-label" for="record-asset">{$locale.assets.asset}</label>
        <select class:is-invalid={recordErrors.assetId} class="form-select" id="record-asset" bind:value={recordForm.assetId}>
          <option value="">{$locale.assets.selectAsset}</option>
          {#each assetGroups as group (group.label)}
            {#if group.label}
              <optgroup label={group.label}>
                {#each group.items as asset (asset.id)}<option value={asset.id}>{asset.name}</option>{/each}
              </optgroup>
            {:else}
              {#each group.items as asset (asset.id)}<option value={asset.id}>{asset.name}</option>{/each}
            {/if}
          {/each}
        </select>
        {#if recordErrors.assetId}<div class="invalid-feedback">{recordErrors.assetId}</div>{/if}
      </div>
      <div class="col-sm-3">
        <label class="form-label" for="record-quantity">{$locale.assets.quantity}</label>
        <input class:is-invalid={recordErrors.quantity} class="form-control" id="record-quantity" type="number" min="1" step="1" bind:value={recordForm.quantity} />
        {#if recordErrors.quantity}<div class="invalid-feedback">{recordErrors.quantity}</div>{/if}
      </div>
      <div class="col-sm-3">
        <label class="form-label" for="record-condition">{$locale.assets.condition}</label>
        <select class="form-select" id="record-condition" bind:value={recordForm.condition}>
          {#each conditionKeys as conditionValue (conditionValue)}
            <option value={conditionValue}>{$locale.assets.conditions[conditionValue]}</option>
          {/each}
        </select>
      </div>
      <div class="col-sm-6">
        <label class="form-label" for="record-serial">{$locale.assets.serialNumber}</label>
        <input class:is-invalid={recordErrors.serialNumber} class="form-control" id="record-serial" bind:value={recordForm.serialNumber} />
        {#if recordErrors.serialNumber}<div class="invalid-feedback">{recordErrors.serialNumber}</div>{/if}
      </div>
      <div class="col-sm-6">
        <label class="form-label" for="record-model">{$locale.assets.modelNumber}</label>
        <input class="form-control" id="record-model" bind:value={recordForm.modelNumber} />
      </div>
      <div class="col-sm-6">
        <label class="form-label" for="record-value">{$locale.assets.unitValue}</label>
        <input class:is-invalid={recordErrors.unitValue} class="form-control" id="record-value" type="number" min="0" step="0.01" bind:value={recordForm.unitValue} />
        {#if recordErrors.unitValue}<div class="invalid-feedback">{recordErrors.unitValue}</div>{/if}
      </div>
      <div class="col-12">
        <label class="form-label" for="record-notes">{$locale.assets.notes}</label>
        <textarea class="form-control" id="record-notes" rows="2" bind:value={recordForm.notes}></textarea>
      </div>
    </div>
  </form>

  <div slot="footer">
    <button class="btn btn-light" type="button" on:click={closeRecordModal} disabled={saving}>
      {$locale.assets.cancel}
    </button>
    <button class="btn btn-primary" type="submit" form="record-form" disabled={saving}>
      {saving ? $locale.assets.saving : $locale.assets.save}
    </button>
  </div>
</Modal>

<!-- Create / edit a master asset -->
<Modal
  bind:open={assetModalOpen}
  icon="bi-box-seam"
  title={assetEditingId ? $locale.assets.edit : $locale.assets.newAsset}
  busy={saving}
  closeLabel={$locale.assets.cancel}
  on:close={closeAssetModal}
>
  <form id="asset-form" on:submit|preventDefault={submitAsset} novalidate>
    {#if assetError}
      <div class="alert alert-danger" role="alert">{assetError}</div>
    {/if}

    <div class="row g-3">
      <div class="col-sm-6">
        <label class="form-label" for="asset-name">{$locale.assets.name}</label>
        <input class:is-invalid={assetErrors.name} class="form-control" id="asset-name" bind:value={assetForm.name} />
        {#if assetErrors.name}<div class="invalid-feedback">{assetErrors.name}</div>{/if}
      </div>
      <div class="col-sm-6">
        <label class="form-label" for="asset-category">{$locale.assets.category}</label>
        <select class="form-select" id="asset-category" bind:value={assetForm.categoryId}>
          <option value="">{$locale.assets.selectCategory}</option>
          {#each categories as category (category.id)}
            <option value={category.id}>{category.name}</option>
          {/each}
        </select>
      </div>
      <div class="col-sm-4">
        <label class="form-label" for="asset-unit">{$locale.assets.unit}</label>
        <input class="form-control" id="asset-unit" placeholder={$locale.assets.unitPlaceholder} bind:value={assetForm.unit} />
      </div>
      <div class="col-sm-4">
        <label class="form-label" for="asset-code">{$locale.assets.code}</label>
        <input class="form-control" id="asset-code" bind:value={assetForm.code} />
      </div>
      <div class="col-12">
        <label class="form-label" for="asset-description">{$locale.assets.description}</label>
        <textarea class="form-control" id="asset-description" rows="2" bind:value={assetForm.description}></textarea>
      </div>
    </div>
  </form>

  <div slot="footer">
    <button class="btn btn-light" type="button" on:click={closeAssetModal} disabled={saving}>
      {$locale.assets.cancel}
    </button>
    <button class="btn btn-primary" type="submit" form="asset-form" disabled={saving}>
      {saving ? $locale.assets.saving : $locale.assets.save}
    </button>
  </div>
</Modal>

<!-- Create / edit an asset category -->
<Modal
  bind:open={categoryModalOpen}
  icon="bi-tags"
  title={categoryEditingId ? $locale.assets.edit : $locale.assets.newCategory}
  busy={saving}
  closeLabel={$locale.assets.cancel}
  on:close={closeCategoryModal}
>
  <form id="category-form" on:submit|preventDefault={submitCategory} novalidate>
    {#if categoryError}
      <div class="alert alert-danger" role="alert">{categoryError}</div>
    {/if}

    <div class="row g-3">
      <div class="col-12">
        <label class="form-label" for="category-name">{$locale.assets.name}</label>
        <input class:is-invalid={categoryErrors.name} class="form-control" id="category-name" bind:value={categoryForm.name} />
        {#if categoryErrors.name}<div class="invalid-feedback">{categoryErrors.name}</div>{/if}
      </div>
      <div class="col-12">
        <label class="form-label" for="category-description">{$locale.assets.description}</label>
        <textarea class="form-control" id="category-description" rows="2" bind:value={categoryForm.description}></textarea>
      </div>
    </div>
  </form>

  <div slot="footer">
    <button class="btn btn-light" type="button" on:click={closeCategoryModal} disabled={saving}>
      {$locale.assets.cancel}
    </button>
    <button class="btn btn-primary" type="submit" form="category-form" disabled={saving}>
      {saving ? $locale.assets.saving : $locale.assets.save}
    </button>
  </div>
</Modal>

<style>
  .unit-hint {
    margin-inline-start: 0.4rem;
    color: var(--text-muted);
    font-size: var(--text-xs);
  }
</style>
