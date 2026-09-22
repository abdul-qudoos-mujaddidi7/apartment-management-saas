<script>
  import { onMount } from 'svelte';
  import { push } from 'svelte-spa-router';

  import PageLayout from '../components/ui/PageLayout.svelte';
  import ActionButton from '../components/ui/ActionButton.svelte';
  import PageToolbar from '../components/ui/PageToolbar.svelte';
  import DataTable from '../components/ui/DataTable.svelte';
  import Checkbox from '../components/ui/Checkbox.svelte';
  import { createSelection, isAllSelected, isSomeSelected, toggleAllSelected, toggleSelected } from '../utils/selection';
  import Pagination from '../components/ui/Pagination.svelte';
  import Modal from '../components/ui/Modal.svelte';
  import StatusBadge from '../components/ui/StatusBadge.svelte';

  import { getFloor } from '../services/floors';
  import {
    createApartment,
    deleteApartment,
    listApartments,
    updateApartment
  } from '../services/apartments';
  import {
    language,
    locale,
    translate
  } from '../i18n';

  export let params = {};

  const numberLocales = {
    en: 'en-US',
    fa: 'fa-IR',
    ps: 'ps-AF'
  };
  let floorId = null;
  let routeReady = false;
  let floor = null;
  let loadingFloor = false;

  let apartments = [];

  let pagination = {
    page: 1,
    pageSize: 10,
    total: 0,
    totalPages: 0
  };

  let search = '';
  let loading = false;
  let saving = false;

  let errorMessage = '';
  let noticeMessage = '';

  let modalOpen = false;
  let modalError = '';

  let editingId = null;
  let lastSavedApartmentNumber = null;

  let formErrors = {};
  let form = emptyForm();

  function emptyForm() {
    return {
      apartmentNumber: '',
      name: '',
      type: '',
      area: '',
      bedrooms: 0,
      bathrooms: 0,
      monthlyRent: 0,
      status: 'AVAILABLE'
    };
  }

  onMount(async () => {
    try {
      await applyRoute(params?.id || null);
      routeReady = true;
    } catch (error) {
      errorMessage = error?.message || $locale.apartments.loadError;
    }
  });

  $: if (routeReady) {
    const routeFloorId = params?.id || null;
    if (routeFloorId !== floorId) {
      applyRoute(routeFloorId);
    }
  }

  async function applyRoute(newFloorId) {
    floorId = newFloorId || null;
    floor = null;
    search = '';
    errorMessage = '';
    noticeMessage = '';
    pagination = { page: 1, pageSize: pagination.pageSize, total: 0, totalPages: 0 };

    if (floorId) {
      await Promise.all([loadFloor(), loadApartments(1)]);
    } else {
      loadingFloor = false;
      await loadApartments(1);
    }
  }

  function formatNumber(value, currentLanguage) {
    if (value === null || value === undefined || value === '') return '—';
    try {
      return new Intl.NumberFormat(numberLocales[currentLanguage] || 'en-US', { maximumFractionDigits: 2 }).format(value);
    } catch { return String(value); }
  }

  function formatArea(value, currentLanguage) {
    if (value === null || value === undefined || value === '') return '—';
    return `${formatNumber(value, currentLanguage)} m²`;
  }

  async function loadFloor() {
    if (!floorId) { floor = null; loadingFloor = false; return; }
    loadingFloor = true;
    try {
      const response = await getFloor(floorId);
      floor = response.floor;
    } catch (error) {
      floor = null;
      errorMessage = error.status === 404 ? $locale.apartments.notFound : $locale.apartments.loadError;
    } finally { loadingFloor = false; }
  }

  async function loadApartments(page = pagination.page) {
    loading = true;
    errorMessage = '';
    try {
      const filters = { page, pageSize: pagination.pageSize, search: search.trim() };
      if (floorId) filters.floorId = floorId;
      const response = await listApartments(filters);
      apartments = response.items || [];
      pagination = response.pagination;
    } catch (error) {
      errorMessage = error.message || $locale.apartments.loadError;
    } finally { loading = false; }
  }

  function nextApartmentNumber() {
    if (!floor) return '';
    const prefix = Number(floor.floorNumber) * 100;
    const used = new Set(apartments.map((a) => Number(a.apartmentNumber)).filter((v) => Number.isInteger(v)));
    let suffix = 1;
    while (used.has(prefix + suffix)) { suffix += 1; }
    return String(prefix + suffix);
  }

  function validateForm() {
    formErrors = {};
    if (!form.apartmentNumber.trim()) formErrors.apartmentNumber = translate('apartments.required', { field: $locale.apartments.apartmentNumber });
    if (!form.name.trim()) formErrors.name = translate('apartments.required', { field: $locale.apartments.name });
    if (!form.type) formErrors.type = translate('apartments.required', { field: $locale.apartments.type });
    if (form.area !== '' && (!Number.isFinite(Number(form.area)) || Number(form.area) < 0)) formErrors.area = translate('apartments.numberRequired', { field: $locale.apartments.area });
    if (!Number.isInteger(Number(form.bedrooms)) || Number(form.bedrooms) < 0) formErrors.bedrooms = translate('apartments.wholeNumber', { field: $locale.apartments.bedrooms });
    if (!Number.isInteger(Number(form.bathrooms)) || Number(form.bathrooms) < 0) formErrors.bathrooms = translate('apartments.wholeNumber', { field: $locale.apartments.bathrooms });
    if (!Number.isFinite(Number(form.monthlyRent)) || Number(form.monthlyRent) < 0) formErrors.monthlyRent = translate('apartments.numberRequired', { field: $locale.apartments.monthlyRent });
    return Object.keys(formErrors).length === 0;
  }

  function openAddApartment() {
    if (!floorId || !floor) return;
    editingId = null;
    lastSavedApartmentNumber = null;
    modalError = '';
    formErrors = {};
    form = { ...emptyForm(), apartmentNumber: nextApartmentNumber() };
    modalOpen = true;
  }

  function openEditApartment(apartment) {
    editingId = apartment.id;
    lastSavedApartmentNumber = null;
    modalError = '';
    formErrors = {};
    form = {
      apartmentNumber: apartment.apartmentNumber,
      name: apartment.name,
      type: apartment.type,
      area: apartment.area === null || apartment.area === undefined ? '' : apartment.area,
      bedrooms: apartment.bedrooms,
      bathrooms: apartment.bathrooms,
      monthlyRent: apartment.monthlyRent,
      status: apartment.status
    };
    modalOpen = true;
  }

  function closeModal() {
    if (saving) return;
    modalOpen = false;
    editingId = null;
    lastSavedApartmentNumber = null;
    modalError = '';
    formErrors = {};
  }

  function buildApartmentPayload() {
    return {
      apartmentNumber: form.apartmentNumber.trim(),
      name: form.name.trim(),
      type: form.type,
      area: form.area === '' ? null : Number(form.area),
      bedrooms: Number(form.bedrooms),
      bathrooms: Number(form.bathrooms),
      monthlyRent: Number(form.monthlyRent),
      status: form.status
    };
  }

  // Save & continue: create the apartment and go straight to its asset sheet.
  async function saveAndContinue() {
    if (editingId) return;
    if (!validateForm()) return;
    if (!floorId) { modalError = $locale.apartments.notFound; return; }

    saving = true;
    modalError = '';
    errorMessage = '';
    noticeMessage = '';

    try {
      const response = await createApartment({ floorId, ...buildApartmentPayload() });
      await push(`/apartments/${response.apartment.id}/assets`);
    } catch (error) {
      applyModalError(error);
    } finally {
      saving = false;
    }
  }

  function applyModalError(error) {
    if (error.data?.code === 'APARTMENT_NUMBER_EXISTS') {
      formErrors = { apartmentNumber: $locale.apartments.apartmentNumberExists };
    } else if (error.data?.code === 'FLOOR_NOT_FOUND') {
      modalError = $locale.apartments.notFound;
    } else {
      modalError = error.message;
    }
  }

  async function saveApartment() {
    if (!validateForm()) return;
    saving = true;
    modalError = '';
    errorMessage = '';
    noticeMessage = '';
    const payload = buildApartmentPayload();
    try {
      if (editingId) {
        await updateApartment(editingId, payload);
        noticeMessage = $locale.apartments.updated;
        closeModal();
        await loadApartments(pagination.page);
      } else {
        if (!floorId) { modalError = $locale.apartments.notFound; return; }
        const response = await createApartment({ floorId, ...payload });
        noticeMessage = $locale.apartments.saved;
        lastSavedApartmentNumber = response.apartment.apartmentNumber;
        await loadApartments(1);
        form = { ...emptyForm(), apartmentNumber: nextApartmentNumber() };
      }
    } catch (error) {
      applyModalError(error);
    } finally { saving = false; }
  }

  async function removeApartment(apartment) {
    if (!window.confirm($locale.apartments.confirmDelete)) return;
    errorMessage = '';
    noticeMessage = '';
    try {
      await deleteApartment(apartment.id);
      noticeMessage = $locale.apartments.deleted;
      const page = apartments.length === 1 && pagination.page > 1 ? pagination.page - 1 : pagination.page;
      await loadApartments(page);
    } catch (error) { errorMessage = error.message; }
  }

  async function goBackToBuilding() {
    if (!floor?.building?.id) return;
    await push(`/buildings/${floor.building.id}`);
  }

  function statusTone(status) {
    switch (status) {
      case 'AVAILABLE': return 'success';
      case 'OCCUPIED': return 'info';
      case 'RESERVED': return 'warning';
      case 'MAINTENANCE': return 'warning';
      default: return 'neutral';
    }
  }

  function statusLabel(status) { return $locale.apartments.statuses[status] || status; }

  $: resultSummary = `${$locale.apartments.totalApartments}: ${pagination.total}`;
  $: pageTitle = floor ? floor.name : $locale.apartments.title;
  // Leading checkbox column — ids of the rows currently rendered.
  let selectedIds = createSelection();
  $: rowIds = apartments.map((apartment) => apartment.id);
  $: allRowsSelected = isAllSelected(selectedIds, rowIds);
  $: someRowsSelected = isSomeSelected(selectedIds, rowIds);

  function toggleRow(id) { selectedIds = toggleSelected(selectedIds, id); }
  function toggleAllRows() { selectedIds = toggleAllSelected(selectedIds, rowIds); }
</script>

<svelte:head>
  <title>{pageTitle} | {$locale.common.apartmentPro}</title>
</svelte:head>

<PageLayout>
  <svelte:fragment slot="actions">
    {#if floor?.building?.id}
      <button class="back-button" type="button" on:click={goBackToBuilding}>
        <i class="bi bi-arrow-left" aria-hidden="true"></i>
        {$locale.apartments.back}
      </button>
    {/if}
    {#if floorId}
      <ActionButton icon="bi-plus-lg" label={$locale.apartments.add} on:click={openAddApartment} />
    {/if}
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
    {#if floorId && loadingFloor}
      <div class="panel-loader">
        <div class="spinner-border text-primary" role="status">
          <span class="visually-hidden">{$locale.apartments.loading}</span>
        </div>
      </div>
    {:else if !floorId || floor}
      <DataTable
        {loading}
        isEmpty={apartments.length === 0}
        loadingLabel={$locale.apartments.loading}
        emptyLabel={$locale.apartments.empty}
        emptyIcon="bi-door-open"
        minTableWidth="58rem"
        showFooter={!loading && apartments.length > 0}
      >
        <PageToolbar
          slot="toolbar"
          bind:search
          searchPlaceholder={$locale.apartments.search}
          onSearch={() => loadApartments(1)}
          showAdd={Boolean(floorId)}
          addLabel={$locale.apartments.add}
          onAdd={openAddApartment}
        />

        <ActionButton
          slot="empty-action"
          icon="bi-plus-lg"
          label={$locale.apartments.add}
          on:click={openAddApartment}
        />

        <thead>
          <tr>
            <th class="select-column"><Checkbox checked={allRowsSelected} indeterminate={someRowsSelected} label={$locale.common.selectAll} on:change={toggleAllRows} /></th>
            <th>{$locale.apartments.apartmentNumber}</th>
            <th>{$locale.apartments.name}</th>
            <th>{$locale.apartments.type}</th>
            <th>{$locale.apartments.bedrooms}</th>
            <th>{$locale.apartments.bathrooms}</th>
            <th>{$locale.apartments.area}</th>
            <th>{$locale.apartments.monthlyRent}</th>
            <th>{$locale.apartments.status}</th>
            <th class="actions-heading"><span class="visually-hidden">{$locale.apartments.edit}</span></th>
          </tr>
        </thead>

        <tbody>
          {#each apartments as apartment (apartment.id)}
            <tr class:is-selected={selectedIds.has(apartment.id)}>
              <td class="select-column"><Checkbox checked={selectedIds.has(apartment.id)} label={$locale.common.selectRow} on:change={() => toggleRow(apartment.id)} /></td>
              <td class="apartment-number">{apartment.apartmentNumber}</td>
              <td class="apartment-name">{apartment.name}</td>
              <td>{$locale.apartments.types[apartment.type] || apartment.type}</td>
              <td class="data-cell">{apartment.bedrooms}</td>
              <td class="data-cell">{apartment.bathrooms}</td>
              <td class="data-cell">{formatArea(apartment.area, $language)}</td>
              <td class="amount-cell">{formatNumber(apartment.monthlyRent, $language)}</td>
              <td>
                <StatusBadge label={statusLabel(apartment.status)} tone={statusTone(apartment.status)} />
              </td>
              <td class="actions-cell">
                <button class="icon-button" type="button" on:click={() => openEditApartment(apartment)} aria-label={$locale.apartments.edit}>
                  <i class="bi bi-pencil" aria-hidden="true"></i>
                </button>
                <button class="icon-button danger" type="button" on:click={() => removeApartment(apartment)} aria-label={$locale.apartments.delete}>
                  <i class="bi bi-trash3" aria-hidden="true"></i>
                </button>
              </td>
            </tr>
          {/each}
        </tbody>

        <Pagination
          slot="footer"
          page={pagination.page}
          totalPages={pagination.totalPages}
          previousLabel={$locale.apartments.previous}
          nextLabel={$locale.apartments.next}
          label={$locale.apartments.page.replace('{page}', pagination.page).replace('{totalPages}', pagination.totalPages)}
          summary={resultSummary}
          onPage={loadApartments}
        />
      </DataTable>
    {/if}
  </svelte:fragment>
</PageLayout>

<Modal
  bind:open={modalOpen}
  title={editingId ? $locale.apartments.edit : $locale.apartments.add}
  busy={saving}
  size="modal-lg"
  closeLabel={$locale.apartments.cancel}
  on:close={closeModal}
>
  <form id="apartment-form" on:submit|preventDefault={saveApartment} novalidate>
    {#if lastSavedApartmentNumber !== null}
      <div class="alert alert-success" role="status">
        {translate('apartments.savedAnother', { number: lastSavedApartmentNumber })}
      </div>
    {/if}

    {#if modalError}
      <div class="alert alert-danger" role="alert">{modalError}</div>
    {/if}

    <div class="row g-3">
      <div class="col-sm-6">
        <label class="form-label" for="apartment-number">{$locale.apartments.apartmentNumber}</label>
        <input class:is-invalid={formErrors.apartmentNumber} class="form-control" id="apartment-number" bind:value={form.apartmentNumber} />
        {#if formErrors.apartmentNumber}<div class="invalid-feedback">{formErrors.apartmentNumber}</div>{/if}
      </div>
      <div class="col-sm-6">
        <label class="form-label" for="apartment-name">{$locale.apartments.name}</label>
        <input class:is-invalid={formErrors.name} class="form-control" id="apartment-name" bind:value={form.name} />
        {#if formErrors.name}<div class="invalid-feedback">{formErrors.name}</div>{/if}
      </div>
      <div class="col-sm-6">
        <label class="form-label" for="apartment-type">{$locale.apartments.type}</label>
        <select class:is-invalid={formErrors.type} class="form-select" id="apartment-type" bind:value={form.type}>
          <option value="">{$locale.apartments.selectType}</option>
          {#each Object.keys($locale.apartments.types) as typeValue (typeValue)}
            <option value={typeValue}>{$locale.apartments.types[typeValue]}</option>
          {/each}
        </select>
        {#if formErrors.type}<div class="invalid-feedback">{formErrors.type}</div>{/if}
      </div>
      <div class="col-sm-6">
        <label class="form-label" for="apartment-area">{$locale.apartments.area}</label>
        <input class:is-invalid={formErrors.area} class="form-control" id="apartment-area" type="number" min="0" step="0.01" bind:value={form.area} />
        {#if formErrors.area}<div class="invalid-feedback">{formErrors.area}</div>{/if}
      </div>
      <div class="col-sm-4">
        <label class="form-label" for="apartment-bedrooms">{$locale.apartments.bedrooms}</label>
        <input class:is-invalid={formErrors.bedrooms} class="form-control" id="apartment-bedrooms" type="number" min="0" step="1" bind:value={form.bedrooms} />
        {#if formErrors.bedrooms}<div class="invalid-feedback">{formErrors.bedrooms}</div>{/if}
      </div>
      <div class="col-sm-4">
        <label class="form-label" for="apartment-bathrooms">{$locale.apartments.bathrooms}</label>
        <input class:is-invalid={formErrors.bathrooms} class="form-control" id="apartment-bathrooms" type="number" min="0" step="1" bind:value={form.bathrooms} />
        {#if formErrors.bathrooms}<div class="invalid-feedback">{formErrors.bathrooms}</div>{/if}
      </div>
      <div class="col-sm-4">
        <label class="form-label" for="apartment-rent">{$locale.apartments.monthlyRent}</label>
        <input class:is-invalid={formErrors.monthlyRent} class="form-control" id="apartment-rent" type="number" min="0" step="0.01" bind:value={form.monthlyRent} />
        {#if formErrors.monthlyRent}<div class="invalid-feedback">{formErrors.monthlyRent}</div>{/if}
      </div>
      <div class="col-sm-6">
        <label class="form-label" for="apartment-status">{$locale.apartments.status}</label>
        <select class="form-select" id="apartment-status" bind:value={form.status}>
          {#each Object.keys($locale.apartments.statuses) as statusValue (statusValue)}
            <option value={statusValue}>{$locale.apartments.statuses[statusValue]}</option>
          {/each}
        </select>
      </div>
    </div>
  </form>

  <div slot="footer">
    <button class="btn btn-light" type="button" on:click={closeModal} disabled={saving}>
      {lastSavedApartmentNumber !== null ? $locale.apartments.done : $locale.apartments.cancel}
    </button>
    {#if !editingId}
      <button class="btn btn-light save-continue" type="button" on:click={saveAndContinue} disabled={saving}>
        <span>{$locale.assets.saveContinue}</span>
        <i class="bi bi-arrow-right" aria-hidden="true"></i>
      </button>
    {/if}
    <button class="btn btn-primary" type="submit" form="apartment-form" disabled={saving}>
      {saving ? $locale.apartments.loading : editingId ? $locale.apartments.update : lastSavedApartmentNumber !== null ? $locale.apartments.another : $locale.apartments.save}
    </button>
  </div>
</Modal>

<style>
  .back-button {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0;
    border: 0;
    color: var(--accent);
    background: none;
    font-size: 0.8rem;
    font-weight: 650;
  }
  .back-button:hover { color: var(--accent-hover); }
  :global([dir='rtl']) .back-button i { transform: rotate(180deg); }
  .panel-loader { min-height: 14rem; display: grid; place-items: center; }

  .save-continue {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
  }
  :global([dir='rtl']) .save-continue i { transform: rotate(180deg); }
</style>
