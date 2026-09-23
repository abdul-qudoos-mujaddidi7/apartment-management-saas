<script>
  import PageLayout from '../components/ui/PageLayout.svelte';
  import { onMount } from 'svelte';
  import { api } from '../services/api';
  import { listFloors } from '../services/floors';
  import { listApartments } from '../services/apartments';
  import { createMeter, deleteMeter, listMeters, updateMeter } from '../services/meters';
  import { createMeterReading, listMeterReadings } from '../services/meterReadings';
  import PageToolbar from '../components/ui/PageToolbar.svelte';
  import DataTable from '../components/ui/DataTable.svelte';
  import Checkbox from '../components/ui/Checkbox.svelte';
  import Pagination from '../components/ui/Pagination.svelte';
  import Modal from '../components/ui/Modal.svelte';
  import BuildingSelect from '../components/buildings/BuildingSelect.svelte';
  import StatusBadge from '../components/ui/StatusBadge.svelte';
  import RowActions from '../components/ui/RowActions.svelte';
  import ActionButton from '../components/ui/ActionButton.svelte';
  import ShamsiDatePicker from '../components/ui/ShamsiDatePicker.svelte';
  import { formatShortDate } from '../utils/formatters';
  import { locale, translate } from '../i18n';
  import { sortRows } from '../utils/sortRows';
  import { createSelection, isAllSelected, isSomeSelected, toggleAllSelected, toggleSelected } from '../utils/selection';
  import { formatMoney } from '../utils/formatters';

  const UTILITIES = [{ value: 'ELECTRICITY', icon: 'bi-lightning-charge' }, { value: 'WATER', icon: 'bi-droplet' }, { value: 'GAS', icon: 'bi-fire' }];
  const STATUSES = ['ACTIVE', 'INACTIVE', 'REPLACED'];
  const SUGGESTED_UNITS = { ELECTRICITY: 'kWh', WATER: 'm³', GAS: 'm³' };
  const emptyForm = () => ({ buildingId: '', floorId: '', apartmentId: '', meterNumber: '', utilityType: 'ELECTRICITY', unit: SUGGESTED_UNITS.ELECTRICITY, defaultUnitPrice: 0, initialReading: '', installationDate: '', status: 'ACTIVE', notes: '' });
  const emptyReadingForm = () => ({ readingDate: new Date().toISOString().slice(0, 10), currentReading: '', notes: '' });

  let meters = [];
  let sort = { key: null, dir: 'asc' };
  $: view = sortRows(meters, sort.key, sort.dir);
  let pagination = { page: 1, pageSize: 10, total: 0, totalPages: 0 };
  let filters = { search: '', buildingId: '', utilityType: '', status: '' };
  let buildings = [];
  let floors = [];
  let apartments = [];
  let loading = false;
  let saving = false;
  let errorMessage = '';
  let noticeMessage = '';
  let modalError = '';
  let modalOpen = false;
  let editingId = null;
  let formErrors = {};
  let form = emptyForm();
  let readingModalOpen = false;
  let selectedMeter = null;
  let latestReading = null;
  let loadingLatestReading = false;
  let readingSaving = false;
  let readingModalError = '';
  let readingFormErrors = {};
  let readingForm = emptyReadingForm();

  onMount(async () => { await loadOptions(); await loadMeters(1); });

  async function handleRequestError(error) {
    if (error.status === 401) return true;
    errorMessage = error.message;
    return false;
  }

  async function loadOptions() {
    try { const response = await api.get('/buildings?page=1&pageSize=100'); buildings = response.items || []; }
    catch (error) { if (!(await handleRequestError(error))) errorMessage = $locale.meters.optionsError; }
  }

  async function loadMeters(page = pagination.page) {
    loading = true;
    errorMessage = '';
    try {
      const response = await listMeters({ page, pageSize: pagination.pageSize, search: filters.search.trim(), buildingId: filters.buildingId || undefined, utilityType: filters.utilityType || undefined, status: filters.status || undefined });
      meters = response.items;
      pagination = response.pagination;
    } catch (error) { await handleRequestError(error); }
    finally { loading = false; }
  }

  function openCreate() {
    editingId = null; form = emptyForm(); floors = []; apartments = [];
    modalError = ''; formErrors = {}; modalOpen = true;
  }

  async function openEdit(meter) {
    const buildingId = meter.apartment.floor.building.id;
    const floorId = meter.apartment.floor.id;
    editingId = meter.id; modalError = ''; formErrors = {}; floors = []; apartments = []; modalOpen = true;
    form = { ...emptyForm(), buildingId, floorId: '', apartmentId: '', meterNumber: meter.meterNumber, utilityType: meter.utilityType, unit: meter.unit, defaultUnitPrice: meter.defaultUnitPrice, initialReading: meter.initialReading ?? '', installationDate: meter.installationDate ? meter.installationDate.slice(0, 10) : '', status: meter.status, notes: meter.notes || '' };
    try { await loadFloors(buildingId); form = { ...form, floorId }; await loadApartments(floorId); form = { ...form, apartmentId: meter.apartment.id }; }
    catch (error) { modalError = error.message; }
  }

  function resetModal() { modalOpen = false; modalError = ''; formErrors = {}; }
  function closeModal() { if (saving) return; resetModal(); }
  async function loadFloors(buildingId) { if (!buildingId) { floors = []; return; } floors = (await listFloors({ buildingId, page: 1, pageSize: 100 })).items || []; }
  async function loadApartments(floorId) { if (!floorId) { apartments = []; return; } apartments = (await listApartments({ floorId, page: 1, pageSize: 100 })).items || []; }

  async function buildingChanged() { form = { ...form, floorId: '', apartmentId: '' }; apartments = []; modalError = ''; try { await loadFloors(form.buildingId); } catch (error) { modalError = error.message; } }
  async function floorChanged() { form = { ...form, apartmentId: '' }; modalError = ''; try { await loadApartments(form.floorId); } catch (error) { modalError = error.message; } }
  function utilityChanged() { const suggested = SUGGESTED_UNITS[form.utilityType]; if (!form.unit || Object.values(SUGGESTED_UNITS).includes(form.unit)) { form = { ...form, unit: suggested }; } }

  function validateForm() {
    const { meters: copy } = $locale;
    const errors = {};
    if (!form.apartmentId) errors.apartmentId = translate('meters.required', { field: copy.apartment });
    if (!form.meterNumber.trim()) errors.meterNumber = translate('meters.required', { field: copy.meterNumber });
    if (!form.unit.trim()) errors.unit = translate('meters.required', { field: copy.unit });
    if (form.initialReading !== '' && Number(form.initialReading) < 0) errors.initialReading = translate('meters.notNegative', { field: copy.initialReading });
    if (form.defaultUnitPrice === '' || Number(form.defaultUnitPrice) < 0) errors.defaultUnitPrice = translate('meters.notNegative', { field: copy.defaultUnitPrice });
    formErrors = errors;
    return Object.keys(errors).length === 0;
  }

  async function saveMeter() {
    if (!validateForm()) return;
    saving = true; modalError = ''; errorMessage = ''; noticeMessage = '';
    const payload = { apartmentId: form.apartmentId, meterNumber: form.meterNumber.trim(), utilityType: form.utilityType, unit: form.unit.trim(), defaultUnitPrice: Number(form.defaultUnitPrice), initialReading: form.initialReading === '' ? null : Number(form.initialReading), installationDate: form.installationDate || null, status: form.status, notes: form.notes.trim() || null };
    try {
      if (editingId) { await updateMeter(editingId, payload); noticeMessage = $locale.meters.updated; }
      else { await createMeter(payload); noticeMessage = $locale.meters.saved; }
      resetModal(); await loadMeters(1);
    } catch (error) {
      if (await handleRequestError(error)) return;
      if (error.data?.errors) { formErrors = Object.fromEntries(Object.entries(error.data.errors).map(([field, messages]) => [field, messages[0]])); }
      else if (error.data?.code === 'METER_NUMBER_EXISTS') { formErrors = { ...formErrors, meterNumber: $locale.meters.meterNumberExists }; }
      else { modalError = error.message; }
    } finally { saving = false; }
  }

  async function removeMeter(meter) {
    if (!window.confirm($locale.meters.confirmDelete)) return;
    errorMessage = ''; noticeMessage = '';
    try { await deleteMeter(meter.id); noticeMessage = $locale.meters.deleted; const lastRowOnPage = meters.length === 1 && pagination.page > 1; await loadMeters(lastRowOnPage ? pagination.page - 1 : pagination.page); }
    catch (error) { await handleRequestError(error); }
  }

  async function openReadingModal(meter) {
    selectedMeter = meter; latestReading = null; readingForm = emptyReadingForm(); readingFormErrors = {}; readingModalError = ''; readingModalOpen = true; loadingLatestReading = true;
    try { const response = await listMeterReadings({ meterId: meter.id, page: 1, pageSize: 1 }); latestReading = response.items?.[0] || null; }
    catch (error) { await handleRequestError(error); }
    finally { loadingLatestReading = false; }
  }

  function closeReadingModal(force = false) { if (readingSaving && !force) return; readingModalOpen = false; selectedMeter = null; latestReading = null; readingModalError = ''; readingFormErrors = {}; readingForm = emptyReadingForm(); }

  function validateReadingForm() {
    const errors = {};
    if (!selectedMeter) readingModalError = $locale.meterReadings.meterNotSelected;
    if (!readingForm.readingDate) errors.readingDate = translate('meterReadings.required', { field: $locale.meterReadings.readingDate });
    if (readingForm.currentReading === '' || Number(readingForm.currentReading) < 0) errors.currentReading = translate('meterReadings.notNegative', { field: $locale.meterReadings.currentReading });
    readingFormErrors = errors;
    return Boolean(selectedMeter) && Object.keys(errors).length === 0;
  }

  async function saveQuickReading() {
    if (!validateReadingForm()) return;
    readingSaving = true; readingModalError = ''; errorMessage = ''; noticeMessage = '';
    try {
      await createMeterReading({ meterId: selectedMeter.id, readingDate: readingForm.readingDate, currentReading: Number(readingForm.currentReading), notes: readingForm.notes.trim() || null });
      noticeMessage = $locale.meterReadings.saved; closeReadingModal(true);
    } catch (error) {
      if (await handleRequestError(error)) return;
      if (error.data?.errors) { readingFormErrors = Object.fromEntries(Object.entries(error.data.errors).map(([field, messages]) => [field, messages[0]])); }
      else if (error.data?.code === 'CURRENT_READING_TOO_LOW') { readingFormErrors = { ...readingFormErrors, currentReading: $locale.meterReadings.currentReadingTooLow }; }
      else if (error.data?.code === 'METER_READING_DATE_EXISTS') { readingFormErrors = { ...readingFormErrors, readingDate: $locale.meterReadings.dateExists }; }
      else { readingModalError = error.message; }
    } finally { readingSaving = false; }
  }

  const utilityLabel = (utilityType) => $locale.meters[utilityType.toLowerCase()];
  const statusLabel = (status) => $locale.meters[status.toLowerCase()];
  const utilityIcon = (utilityType) => UTILITIES.find((utility) => utility.value === utilityType)?.icon;
  const formatReading = (value) => Number(value).toLocaleString(undefined, { minimumFractionDigits: 3, maximumFractionDigits: 3 });
  const displayedLatestReading = () => { if (latestReading) return latestReading.currentReading; return selectedMeter?.initialReading; };
  function meterStatusTone(status) { switch (status) { case 'ACTIVE': return 'success'; case 'REPLACED': return 'warning'; default: return 'neutral'; } }
  $: resultSummary = `${$locale.meters.totalMeters}: ${pagination.total}`;
  // Leading checkbox column — ids of the rows currently rendered.
  let selectedIds = createSelection();
  $: rowIds = meters.map((meter) => meter.id);
  $: allRowsSelected = isAllSelected(selectedIds, rowIds);
  $: someRowsSelected = isSomeSelected(selectedIds, rowIds);

  function toggleRow(id) { selectedIds = toggleSelected(selectedIds, id); }
  function toggleAllRows() { selectedIds = toggleAllSelected(selectedIds, rowIds); }

  // The filters live in the toolbar's panel, so the button carries the count.
  $: activeFilterCount = [filters.buildingId, filters.utilityType, filters.status].filter(Boolean).length;
  function clearFilters() { filters = { ...filters, buildingId: '', utilityType: '', status: '' }; loadMeters(1); }
</script>

<svelte:head><title>{$locale.meters.title} | {$locale.common.apartmentPro}</title></svelte:head>

<PageLayout>
  <svelte:fragment slot="toolbar">
    <PageToolbar
      bind:search={filters.search}
      searchPlaceholder={$locale.meters.search}
      onSearch={() => loadMeters(1)}
      addLabel={$locale.meters.add}
      onAdd={openCreate}
      filtersLabel={$locale.common.filters}
      filtersCount={activeFilterCount}
      filtersClearLabel={$locale.common.clearFilters}
      onClearFilters={clearFilters}
    >
      <svelte:fragment slot="filters">
        <div class="filters-field">
          <label class="filters-field-label" for="meter-filter-building">{$locale.meters.building}</label>
          <select class="form-select" id="meter-filter-building" bind:value={filters.buildingId} on:change={() => loadMeters(1)}>
            <option value="">{$locale.meters.allBuildings}</option>
            {#each buildings as building (building.id)}<option value={building.id}>{building.name}</option>{/each}
          </select>
        </div>
        <div class="filters-field">
          <label class="filters-field-label" for="meter-filter-utility">{$locale.meters.utilityType}</label>
          <select class="form-select" id="meter-filter-utility" bind:value={filters.utilityType} on:change={() => loadMeters(1)}>
            <option value="">{$locale.meters.allUtilities}</option>
            {#each UTILITIES as utility (utility.value)}<option value={utility.value}>{utilityLabel(utility.value)}</option>{/each}
          </select>
        </div>
        <div class="filters-field">
          <label class="filters-field-label" for="meter-filter-status">{$locale.meters.status}</label>
          <select class="form-select" id="meter-filter-status" bind:value={filters.status} on:change={() => loadMeters(1)}>
            <option value="">{$locale.meters.allStatuses}</option>
            {#each STATUSES as status (status)}<option value={status}>{statusLabel(status)}</option>{/each}
          </select>
        </div>
      </svelte:fragment>
    </PageToolbar>
  </svelte:fragment>

  <svelte:fragment slot="alerts">
    {#if errorMessage}<div class="alert alert-danger" role="alert"><i class="bi bi-exclamation-triangle" aria-hidden="true"></i><span>{errorMessage}</span></div>{/if}
    {#if noticeMessage}<div class="alert alert-success" role="status"><i class="bi bi-check-circle" aria-hidden="true"></i><span>{noticeMessage}</span></div>{/if}
  </svelte:fragment>

  <svelte:fragment slot="content">
    <DataTable {loading} isEmpty={meters.length === 0} loadingLabel={$locale.meters.loading} emptyLabel={$locale.meters.empty} emptyIcon="bi-speedometer2" minTableWidth="60rem" showFooter={!loading && meters.length > 0} sortKey={sort.key} sortDir={sort.dir} on:sort={(event) => (sort = event.detail)}>
      <ActionButton slot="empty-action" icon="bi-plus-lg" label={$locale.meters.add} on:click={openCreate} />
      <thead><tr>
        <th class="select-column"><Checkbox checked={allRowsSelected} indeterminate={someRowsSelected} label={$locale.common.selectAll} on:change={toggleAllRows} /></th>
        <th data-sort="meterNumber">{$locale.meters.meterNumber}</th><th data-sort="utilityType">{$locale.meters.utilityType}</th><th data-sort="apartment.floor.building.name">{$locale.meters.building}</th><th data-sort="apartment.floor.name">{$locale.meters.floor}</th><th data-sort="apartment.apartmentNumber">{$locale.meters.apartment}</th><th data-sort="unit">{$locale.meters.unit}</th><th data-sort="defaultUnitPrice">{$locale.meters.defaultUnitPrice}</th><th data-sort="initialReading">{$locale.meters.initialReading}</th><th data-sort="installationDate">{$locale.meters.installationDate}</th><th data-sort="status">{$locale.meters.status}</th><th class="actions-heading"><span class="visually-hidden">{$locale.meters.edit}</span></th>
      </tr></thead>
      <tbody>{#each view as meter (meter.id)}
        <tr class:is-selected={selectedIds.has(meter.id)}>
          <td class="select-column"><Checkbox checked={selectedIds.has(meter.id)} label={$locale.common.selectRow} on:change={() => toggleRow(meter.id)} /></td>
          <td class="meter-number">{meter.meterNumber}</td>
          <td><span class="utility-cell"><i class={`bi ${utilityIcon(meter.utilityType)}`} aria-hidden="true"></i>{utilityLabel(meter.utilityType)}</span></td>
          <td>{meter.apartment.floor.building.name}</td>
          <td>{meter.apartment.floor.name || meter.apartment.floor.floorNumber}</td>
          <td><span class="apartment-number">{meter.apartment.apartmentNumber}</span>{#if meter.apartment.name}<span class="cell-sub">{meter.apartment.name}</span>{/if}</td>
          <td class="data-cell">{meter.unit}</td>
          <td class="reading-cell">{formatMoney(meter.defaultUnitPrice)} / {meter.unit}</td>
          <td class="reading-cell">{meter.initialReading === null ? '—' : meter.initialReading.toLocaleString()}</td>
          <td class="date-cell">{formatShortDate(meter.installationDate)}</td>
          <td><StatusBadge label={statusLabel(meter.status)} tone={meterStatusTone(meter.status)} /></td>
          <td class="actions-cell">
            <RowActions label={$locale.meters.edit}>
              <button class="row-menu-item" type="button" on:click={() => openReadingModal(meter)} disabled={meter.status !== 'ACTIVE'}><i class="bi bi-clipboard-plus" aria-hidden="true"></i>{$locale.meters.addReading}</button>
              <button class="row-menu-item" type="button" on:click={() => openEdit(meter)}><i class="bi bi-pencil" aria-hidden="true"></i>{$locale.common.actions.edit}</button>
              <button class="row-menu-item danger" type="button" on:click={() => removeMeter(meter)}><i class="bi bi-trash3" aria-hidden="true"></i>{$locale.meters.delete}</button>
            </RowActions>
          </td>
        </tr>
      {/each}</tbody>
    </DataTable>
  </svelte:fragment>

  <svelte:fragment slot="footer">
    <Pagination page={pagination.page} totalPages={pagination.totalPages} previousLabel={$locale.meters.previous} nextLabel={$locale.meters.next} label={$locale.meters.page.replace('{page}', pagination.page).replace('{totalPages}', pagination.totalPages)} summary={resultSummary} onPage={(page) => loadMeters(page)} />
  </svelte:fragment>
</PageLayout>

<!-- Quick Reading Modal -->
<Modal bind:open={readingModalOpen} title={$locale.meterReadings.quickAdd} busy={readingSaving} closeLabel={$locale.meterReadings.cancel} on:close={() => closeReadingModal()}>
  {#if selectedMeter}
    <form id="quick-reading-form" on:submit|preventDefault={saveQuickReading} novalidate>
      {#if readingModalError}<div class="alert alert-danger" role="alert"><i class="bi bi-exclamation-triangle" aria-hidden="true"></i><span>{readingModalError}</span></div>{/if}
      <dl class="quick-reading-context">
        <div><dt>{$locale.meterReadings.meterNumber}</dt><dd>{selectedMeter.meterNumber}</dd></div>
        <div><dt>{$locale.meterReadings.apartment}</dt><dd>{selectedMeter.apartment.apartmentNumber}</dd></div>
        <div><dt>{$locale.meterReadings.building}</dt><dd>{selectedMeter.apartment.floor.building.name}</dd></div>
        <div><dt>{$locale.meterReadings.utilityType}</dt><dd>{utilityLabel(selectedMeter.utilityType)}</dd></div>
        <div><dt>{$locale.meterReadings.unit}</dt><dd>{selectedMeter.unit}</dd></div>
        <div><dt>{$locale.meterReadings.lastReading}</dt><dd class="reading-cell">{#if loadingLatestReading}<span class="spinner-border spinner-border-sm" role="status"><span class="visually-hidden">{$locale.meterReadings.loading}</span></span>{:else if displayedLatestReading() !== null && displayedLatestReading() !== undefined}{formatReading(displayedLatestReading())} {selectedMeter.unit}{:else}—{/if}</dd></div>
      </dl>
      <div class="row g-3">
        <div class="col-sm-6"><label class="form-label" for="quick-reading-date">{$locale.meterReadings.readingDate}</label><ShamsiDatePicker invalid={Boolean(readingFormErrors.readingDate)} id="quick-reading-date" bind:value={readingForm.readingDate} />{#if readingFormErrors.readingDate}<div class="invalid-feedback">{readingFormErrors.readingDate}</div>{/if}</div>
        <div class="col-sm-6"><label class="form-label" for="quick-current-reading">{$locale.meterReadings.currentReading}</label><input class:is-invalid={readingFormErrors.currentReading} class="form-control" id="quick-current-reading" type="number" min="0" step="0.001" bind:value={readingForm.currentReading} />{#if readingFormErrors.currentReading}<div class="invalid-feedback">{readingFormErrors.currentReading}</div>{/if}</div>
        <div class="col-12"><label class="form-label" for="quick-reading-notes">{$locale.meterReadings.notes}</label><textarea class="form-control" id="quick-reading-notes" rows="3" bind:value={readingForm.notes}></textarea></div>
      </div>
    </form>
  {/if}
  <div slot="footer">
    {#if selectedMeter}
      <button class="btn btn-light" type="button" on:click={() => closeReadingModal()} disabled={readingSaving}>{$locale.meterReadings.cancel}</button>
      <button class="btn btn-primary" type="submit" form="quick-reading-form" disabled={readingSaving}>{readingSaving ? $locale.meterReadings.loading : $locale.meterReadings.saveReading}</button>
    {/if}
  </div>
</Modal>

<!-- Meter Create/Edit Modal -->
<Modal bind:open={modalOpen} title={editingId ? $locale.meters.edit : $locale.meters.add} busy={saving} size="modal-lg" closeLabel={$locale.meters.cancel} on:close={closeModal}>
  <form id="meter-form" on:submit|preventDefault={saveMeter} novalidate>
    {#if modalError}<div class="alert alert-danger" role="alert"><i class="bi bi-exclamation-triangle" aria-hidden="true"></i><span>{modalError}</span></div>{/if}
    <fieldset>
      <legend class="section-label">{$locale.meters.location}</legend>
      <div class="row g-3">
        <div class="col-sm-4"><BuildingSelect selectId="meter-building" label={$locale.meters.building} buildings={buildings} bind:value={form.buildingId} on:change={buildingChanged} placeholder={$locale.meters.select} /></div>
        <div class="col-sm-4"><label class="form-label" for="meter-floor">{$locale.meters.floor}</label><select class="form-select" id="meter-floor" bind:value={form.floorId} on:change={floorChanged} disabled={!form.buildingId}><option value="">{$locale.meters.select}</option>{#each floors as floor (floor.id)}<option value={floor.id}>{floor.name || floor.floorNumber}</option>{/each}</select></div>
        <div class="col-sm-4"><label class="form-label" for="meter-apartment">{$locale.meters.apartment}</label><select class:is-invalid={formErrors.apartmentId} class="form-select" id="meter-apartment" bind:value={form.apartmentId} disabled={!form.floorId}><option value="">{$locale.meters.select}</option>{#each apartments as apartment (apartment.id)}<option value={apartment.id}>{apartment.apartmentNumber}{apartment.name ? ` — ${apartment.name}` : ''}</option>{/each}</select>{#if formErrors.apartmentId}<div class="invalid-feedback">{formErrors.apartmentId}</div>{/if}</div>
      </div>
    </fieldset>
    <fieldset>
      <legend class="section-label">{$locale.meters.reading}</legend>
      <div class="row g-3">
        <div class="col-sm-6"><label class="form-label" for="meter-number">{$locale.meters.meterNumber}</label><input class:is-invalid={formErrors.meterNumber} class="form-control" id="meter-number" bind:value={form.meterNumber} />{#if formErrors.meterNumber}<div class="invalid-feedback">{formErrors.meterNumber}</div>{/if}</div>
        <div class="col-sm-3"><label class="form-label" for="meter-utility">{$locale.meters.utilityType}</label><select class="form-select" id="meter-utility" bind:value={form.utilityType} on:change={utilityChanged}>{#each UTILITIES as utility (utility.value)}<option value={utility.value}>{utilityLabel(utility.value)}</option>{/each}</select></div>
        <div class="col-sm-3"><label class="form-label" for="meter-unit">{$locale.meters.unit}</label><input class:is-invalid={formErrors.unit} class="form-control" id="meter-unit" bind:value={form.unit} />{#if formErrors.unit}<div class="invalid-feedback">{formErrors.unit}</div>{/if}</div>
        <div class="col-sm-6"><label class="form-label" for="meter-reading">{$locale.meters.initialReading}</label><input class:is-invalid={formErrors.initialReading} class="form-control" id="meter-reading" type="number" min="0" step="0.001" bind:value={form.initialReading} />{#if formErrors.initialReading}<div class="invalid-feedback">{formErrors.initialReading}</div>{/if}</div>
        <div class="col-sm-6"><label class="form-label" for="meter-default-unit-price">{$locale.meters.defaultUnitPrice}</label><input class:is-invalid={formErrors.defaultUnitPrice} class="form-control" id="meter-default-unit-price" type="number" min="0" step="0.0001" bind:value={form.defaultUnitPrice} /><div class="form-text">{formatMoney(form.defaultUnitPrice || 0)} {$locale.meters.pricePerUnit} {form.unit || '—'}</div>{#if formErrors.defaultUnitPrice}<div class="invalid-feedback">{formErrors.defaultUnitPrice}</div>{/if}</div>
        <div class="col-sm-3"><label class="form-label" for="meter-installed">{$locale.meters.installationDate}</label><ShamsiDatePicker id="meter-installed" bind:value={form.installationDate} /></div>
        <div class="col-sm-3"><label class="form-label" for="meter-status">{$locale.meters.status}</label><select class="form-select" id="meter-status" bind:value={form.status}>{#each STATUSES as status (status)}<option value={status}>{statusLabel(status)}</option>{/each}</select></div>
        <div class="col-12"><label class="form-label" for="meter-notes">{$locale.meters.notes}</label><textarea class="form-control" id="meter-notes" rows="3" bind:value={form.notes}></textarea></div>
      </div>
    </fieldset>
  </form>
  <div slot="footer">
    <button class="btn btn-light" type="button" on:click={closeModal} disabled={saving}>{$locale.meters.cancel}</button>
    <button class="btn btn-primary" type="submit" form="meter-form" disabled={saving}>{saving ? $locale.meters.loading : editingId ? $locale.meters.update : $locale.meters.save}</button>
  </div>
</Modal>

<style>
  .utility-cell { display: inline-flex; align-items: center; gap: 0.4rem; }
  .utility-cell i { color: var(--text-muted); font-size: 0.95rem; }
  .cell-sub { display: block; color: var(--text-muted); font-size: var(--text-xs); }
  .quick-reading-context { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0.75rem 1rem; margin: 0 0 1.25rem; padding: 0.85rem; border: 1px solid var(--border); border-radius: var(--control-radius); background: var(--surface-muted); }
  .quick-reading-context div { min-inline-size: 0; }
  .quick-reading-context dt { color: var(--text-muted); font-size: var(--text-xs); font-weight: var(--weight-heavy); }
  .quick-reading-context dd { margin: 0.18rem 0 0; overflow: hidden; color: var(--text-strong); font-size: var(--text-sm); font-weight: var(--weight-bold); text-overflow: ellipsis; white-space: nowrap; }
  @media (max-width: 575.98px) {
    .quick-reading-context { grid-template-columns: 1fr; }
  }
</style>
