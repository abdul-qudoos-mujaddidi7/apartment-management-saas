<script>
  import { onDestroy, onMount } from 'svelte';
  import { api } from '../services/api';
  import { listApartments } from '../services/apartments';
  import { listFloors } from '../services/floors';
  import { listMeters } from '../services/meters';
  import { createMeterReading, deleteMeterReading, listMeterReadings, updateMeterReading } from '../services/meterReadings';
  import PageLayout from '../components/ui/PageLayout.svelte';
  import DataTable from '../components/ui/DataTable.svelte';
  import Checkbox from '../components/ui/Checkbox.svelte';
  import PageToolbar from '../components/ui/PageToolbar.svelte';
  import Pagination from '../components/ui/Pagination.svelte';
  import Modal from '../components/ui/Modal.svelte';
  import BuildingSelect from '../components/buildings/BuildingSelect.svelte';
  import StatusBadge from '../components/ui/StatusBadge.svelte';
  import ShamsiDatePicker from '../components/ui/ShamsiDatePicker.svelte';
  import { formatShortDate } from '../utils/formatters';
  import { locale, translate } from '../i18n';
  import { debounce } from '../utils/debounce';
  import { createSelection, isAllSelected, isSomeSelected, toggleAllSelected, toggleSelected } from '../utils/selection';
  import { formatMoney } from '../utils/formatters';

  const utilities = ['ELECTRICITY', 'WATER', 'GAS'];
  const emptyForm = () => ({ buildingId: '', floorId: '', apartmentId: '', meterId: '', readingDate: new Date().toISOString().slice(0, 10), currentReading: '', notes: '' });
  let readings = [];
  let pagination = { page: 1, pageSize: 10, total: 0, totalPages: 0 };
  let filters = { search: '', buildingId: '', utilityType: '', dateFrom: '', dateTo: '' };
  let buildings = [];
  let floors = [];
  let apartments = [];
  let meters = [];
  let loading = false;
  let saving = false;
  let errorMessage = '';
  let noticeMessage = '';
  let modalError = '';
  let modalOpen = false;
  let editingId = null;
  let formErrors = {};
  let form = emptyForm();

  const debouncedSearch = debounce(() => loadReadings(1), 250);
  onDestroy(() => debouncedSearch.cancel());
  function queueSearch() { debouncedSearch(); }

  onMount(async () => { try { await loadBuildings(); await loadReadings(1); } catch (error) { await handleRequestError(error); } });

  async function handleRequestError(error) { if (error.status === 401) return true; errorMessage = error.message; return false; }
  async function loadBuildings() { const response = await api.get('/buildings?page=1&pageSize=100'); buildings = response.items || []; }

  async function loadReadings(page = pagination.page) {
    loading = true; errorMessage = '';
    try { const response = await listMeterReadings({ page, pageSize: pagination.pageSize, ...filters }); readings = response.items; pagination = response.pagination; }
    catch (error) { await handleRequestError(error); }
    finally { loading = false; }
  }

  function resetModal() { modalOpen = false; modalError = ''; formErrors = {}; }
  function closeModal() { if (!saving) resetModal(); }
  function openCreate() { editingId = null; form = emptyForm(); floors = []; apartments = []; meters = []; modalError = ''; formErrors = {}; modalOpen = true; }

  async function loadFloors(buildingId) { floors = buildingId ? ((await listFloors({ buildingId, page: 1, pageSize: 100 })).items || []) : []; }
  async function loadApartments(floorId) { apartments = floorId ? ((await listApartments({ floorId, page: 1, pageSize: 100 })).items || []) : []; }
  async function loadMetersForApartment(apartmentId, selectedMeter = null) { meters = apartmentId ? ((await listMeters({ apartmentId, status: 'ACTIVE', page: 1, pageSize: 100 })).items || []) : []; if (selectedMeter && !meters.some((meter) => meter.id === selectedMeter.id)) { meters = [selectedMeter, ...meters]; } }

  async function buildingChanged() { form = { ...form, floorId: '', apartmentId: '', meterId: '' }; apartments = []; meters = []; try { await loadFloors(form.buildingId); } catch (error) { modalError = error.message; } }
  async function floorChanged() { form = { ...form, apartmentId: '', meterId: '' }; meters = []; try { await loadApartments(form.floorId); } catch (error) { modalError = error.message; } }
  async function apartmentChanged() { form = { ...form, meterId: '' }; try { await loadMetersForApartment(form.apartmentId); } catch (error) { modalError = error.message; } }

  async function openEdit(reading) {
    const meter = reading.meter; const apartment = meter.apartment; const floor = apartment.floor;
    editingId = reading.id; modalError = ''; formErrors = {}; modalOpen = true;
    form = { buildingId: floor.building.id, floorId: '', apartmentId: '', meterId: '', readingDate: reading.readingDate.slice(0, 10), currentReading: reading.currentReading, notes: reading.notes || '' };
    try { await loadFloors(floor.building.id); form = { ...form, floorId: floor.id }; await loadApartments(floor.id); form = { ...form, apartmentId: apartment.id }; await loadMetersForApartment(apartment.id, meter); form = { ...form, meterId: meter.id }; }
    catch (error) { modalError = error.message; }
  }

  function validateForm() {
    const copy = $locale.meterReadings; const errors = {};
    if (!form.meterId) errors.meterId = translate('meterReadings.required', { field: copy.meter });
    if (!form.readingDate) errors.readingDate = translate('meterReadings.required', { field: copy.date });
    if (form.currentReading === '' || Number(form.currentReading) < 0) errors.currentReading = translate('meterReadings.notNegative', { field: copy.currentReading });
    formErrors = errors;
    return Object.keys(errors).length === 0;
  }

  async function saveReading() {
    if (!validateForm()) return;
    saving = true; modalError = ''; errorMessage = ''; noticeMessage = '';
    const payload = { readingDate: form.readingDate, currentReading: Number(form.currentReading), notes: form.notes.trim() || null };
    try {
      if (editingId) { await updateMeterReading(editingId, payload); noticeMessage = $locale.meterReadings.updated; }
      else { await createMeterReading({ meterId: form.meterId, ...payload }); noticeMessage = $locale.meterReadings.saved; }
      resetModal(); await loadReadings(1);
    } catch (error) {
      if (await handleRequestError(error)) return;
      if (error.data?.errors) { formErrors = Object.fromEntries(Object.entries(error.data.errors).map(([field, messages]) => [field, messages[0]])); }
      else if (error.data?.code === 'CURRENT_READING_TOO_LOW') { formErrors = { ...formErrors, currentReading: $locale.meterReadings.currentReadingTooLow }; }
      else if (error.data?.code === 'METER_READING_DATE_EXISTS') { formErrors = { ...formErrors, readingDate: $locale.meterReadings.dateExists }; }
      else if (error.data?.code === 'METER_READING_ALREADY_BILLED') { modalError = $locale.meterReadings.alreadyBilled; }
      else { modalError = error.message; }
    } finally { saving = false; }
  }

  async function removeReading(reading) {
    if (!window.confirm($locale.meterReadings.confirmDelete)) return;
    errorMessage = ''; noticeMessage = '';
    try { await deleteMeterReading(reading.id); noticeMessage = $locale.meterReadings.deleted; await loadReadings(readings.length === 1 && pagination.page > 1 ? pagination.page - 1 : pagination.page); }
    catch (error) { if (!(await handleRequestError(error)) && error.data?.code === 'METER_READING_ALREADY_BILLED') { errorMessage = $locale.meterReadings.alreadyBilled; } }
  }

  const utilityLabel = (type) => $locale.meterReadings[type.toLowerCase()];
  const formatReading = (value) => Number(value).toLocaleString(undefined, { minimumFractionDigits: 3, maximumFractionDigits: 3 });
  const billingTone = (status) => ({ UNBILLED: 'neutral', BILLED: 'info', PARTIALLY_PAID: 'warning', PAID: 'success' }[status] || 'neutral');
  const billingLabel = (status) => { const labels = { UNBILLED: $locale.meterReadings.unbilled, BILLED: $locale.meterReadings.billed, PARTIALLY_PAID: $locale.meterReadings.partiallyPaid, PAID: $locale.meterReadings.paid }; return labels[status] || status; };
  const meterLabel = (meter) => `${meter.meterNumber} | ${utilityLabel(meter.utilityType)} | ${meter.unit}`;
  $: resultSummary = `${$locale.meterReadings.title}: ${pagination.total}`;
  // Leading checkbox column — ids of the rows currently rendered.
  let selectedIds = createSelection();
  $: rowIds = readings.map((reading) => reading.id);
  $: allRowsSelected = isAllSelected(selectedIds, rowIds);
  $: someRowsSelected = isSomeSelected(selectedIds, rowIds);

  function toggleRow(id) { selectedIds = toggleSelected(selectedIds, id); }
  function toggleAllRows() { selectedIds = toggleAllSelected(selectedIds, rowIds); }

  // The filters live in the toolbar's panel, so the button carries the count.
  $: activeFilterCount = [filters.buildingId, filters.utilityType, filters.dateFrom, filters.dateTo].filter(Boolean).length;
  function clearFilters() { filters = { ...filters, buildingId: '', utilityType: '', dateFrom: '', dateTo: '' }; loadReadings(1); }
</script>

<svelte:head><title>{$locale.meterReadings.title} | {$locale.common.apartmentPro}</title></svelte:head>

<PageLayout>
  <svelte:fragment slot="toolbar">
    <PageToolbar
      bind:search={filters.search}
      searchPlaceholder={$locale.meterReadings.search}
      onSearch={queueSearch}
      addLabel={$locale.meterReadings.add}
      onAdd={openCreate}
      filtersLabel={$locale.common.filters}
      filtersCount={activeFilterCount}
      filtersClearLabel={$locale.common.clearFilters}
      onClearFilters={clearFilters}
    >
      <svelte:fragment slot="filters">
        <div class="filters-field">
          <label class="filters-field-label" for="reading-filter-building">{$locale.meterReadings.building}</label>
          <select class="form-select" id="reading-filter-building" bind:value={filters.buildingId} on:change={() => loadReadings(1)}>
            <option value="">{$locale.meterReadings.allBuildings}</option>
            {#each buildings as building (building.id)}<option value={building.id}>{building.name}</option>{/each}
          </select>
        </div>
        <div class="filters-field">
          <label class="filters-field-label" for="reading-filter-utility">{$locale.meterReadings.utilityType}</label>
          <select class="form-select" id="reading-filter-utility" bind:value={filters.utilityType} on:change={() => loadReadings(1)}>
            <option value="">{$locale.meterReadings.allUtilities}</option>
            {#each utilities as utility (utility)}<option value={utility}>{utilityLabel(utility)}</option>{/each}
          </select>
        </div>
        <div class="filters-field">
          <label class="filters-field-label" for="reading-filter-from">{$locale.meterReadings.dateFrom}</label>
          <ShamsiDatePicker id="reading-filter-from" bind:value={filters.dateFrom} on:change={() => loadReadings(1)} />
        </div>
        <div class="filters-field">
          <label class="filters-field-label" for="reading-filter-to">{$locale.meterReadings.dateTo}</label>
          <ShamsiDatePicker id="reading-filter-to" bind:value={filters.dateTo} on:change={() => loadReadings(1)} />
        </div>
      </svelte:fragment>
    </PageToolbar>
  </svelte:fragment>

  <svelte:fragment slot="alerts">
    {#if errorMessage}<div class="alert alert-danger" role="alert">{errorMessage}</div>{/if}
    {#if noticeMessage}<div class="alert alert-success" role="status">{noticeMessage}</div>{/if}
  </svelte:fragment>

  <svelte:fragment slot="content">
    <DataTable loading={loading} isEmpty={readings.length === 0} loadingLabel={$locale.meterReadings.loading} emptyLabel={$locale.meterReadings.empty} emptyIcon="bi-clipboard-data" className="meter-readings-table" minTableWidth="88rem" showFooter={!loading && readings.length > 0}>
      <thead><tr>
        <th class="select-column"><Checkbox checked={allRowsSelected} indeterminate={someRowsSelected} label={$locale.common.selectAll} on:change={toggleAllRows} /></th>
        <th>{$locale.meterReadings.date}</th><th>{$locale.meterReadings.meterNumber}</th><th>{$locale.meterReadings.utilityType}</th><th>{$locale.meterReadings.building}</th><th>{$locale.meterReadings.floor}</th><th>{$locale.meterReadings.apartment}</th><th>{$locale.meterReadings.previousReading}</th><th>{$locale.meterReadings.currentReading}</th><th>{$locale.meterReadings.consumption}</th><th>{$locale.meterReadings.unitPrice}</th><th>{$locale.meterReadings.amount}</th><th>{$locale.meterReadings.billingStatus}</th><th><span class="visually-hidden">{$locale.meterReadings.edit}</span></th>
      </tr></thead>
      <tbody>{#each readings as reading (reading.id)}
        <tr class:is-selected={selectedIds.has(reading.id)}>
          <td class="select-column"><Checkbox checked={selectedIds.has(reading.id)} label={$locale.common.selectRow} on:change={() => toggleRow(reading.id)} /></td>
          <td class="date-cell">{formatShortDate(reading.readingDate)}</td>
          <td class="meter-number">{reading.meter.meterNumber}</td>
          <td>{utilityLabel(reading.meter.utilityType)}</td>
          <td>{reading.meter.apartment.floor.building.name}</td>
          <td>{reading.meter.apartment.floor.name || reading.meter.apartment.floor.floorNumber}</td>
          <td><strong>{reading.meter.apartment.apartmentNumber}</strong>{#if reading.meter.apartment.name}<small class="cell-sub">{reading.meter.apartment.name}</small>{/if}</td>
          <td class="reading-cell">{formatReading(reading.previousReading)}</td>
          <td class="reading-cell">{formatReading(reading.currentReading)}</td>
          <td class="reading-cell">{formatReading(reading.consumption)} {reading.meter.unit}</td>
          <td class="amount-cell">{formatMoney(reading.unitPrice)} / {reading.meter.unit}</td>
          <td class="amount-cell">{formatMoney(reading.amount)}</td>
          <td><StatusBadge label={billingLabel(reading.billingStatus)} tone={billingTone(reading.billingStatus)} /></td>
          <td class="actions-cell">
            <button class="icon-button" type="button" on:click={() => openEdit(reading)} aria-label={$locale.meterReadings.edit} title={reading.billingStatus === 'UNBILLED' ? $locale.meterReadings.edit : $locale.meterReadings.alreadyBilled} disabled={reading.billingStatus !== 'UNBILLED'}><i class="bi bi-pencil" aria-hidden="true"></i></button>
            <button class="icon-button danger" type="button" on:click={() => removeReading(reading)} aria-label={$locale.meterReadings.delete} title={reading.billingStatus === 'UNBILLED' ? $locale.meterReadings.delete : $locale.meterReadings.alreadyBilled} disabled={reading.billingStatus !== 'UNBILLED'}><i class="bi bi-trash3" aria-hidden="true"></i></button>
          </td>
        </tr>
      {/each}</tbody>
    </DataTable>
  </svelte:fragment>

  <svelte:fragment slot="footer">
    <Pagination page={pagination.page} totalPages={pagination.totalPages} previousLabel={$locale.meterReadings.previous} nextLabel={$locale.meterReadings.next} label={$locale.meterReadings.page.replace('{page}', pagination.page).replace('{totalPages}', pagination.totalPages)} summary={resultSummary} onPage={loadReadings} />
  </svelte:fragment>
</PageLayout>

<Modal bind:open={modalOpen} title={editingId ? $locale.meterReadings.edit : $locale.meterReadings.add} busy={saving} size="modal-lg" closeLabel={$locale.meterReadings.cancel} on:close={closeModal}>
  <form id="meter-reading-form" on:submit|preventDefault={saveReading} novalidate>
    {#if modalError}<div class="alert alert-danger" role="alert">{modalError}</div>{/if}
    <fieldset><legend class="section-label">{$locale.meterReadings.location}</legend><div class="row g-3">
      <div class="col-sm-6 col-lg-3"><BuildingSelect selectId="reading-building" label={$locale.meterReadings.building} buildings={buildings} bind:value={form.buildingId} on:change={buildingChanged} placeholder={$locale.meterReadings.selectBuilding} disabled={Boolean(editingId)} /></div>
      <div class="col-sm-6 col-lg-3"><label class="form-label" for="reading-floor">{$locale.meterReadings.floor}</label><select class="form-select" id="reading-floor" bind:value={form.floorId} on:change={floorChanged} disabled={!form.buildingId || Boolean(editingId)}><option value="">{$locale.meterReadings.selectFloor}</option>{#each floors as floor (floor.id)}<option value={floor.id}>{floor.name || floor.floorNumber}</option>{/each}</select></div>
      <div class="col-sm-6 col-lg-3"><label class="form-label" for="reading-apartment">{$locale.meterReadings.apartment}</label><select class="form-select" id="reading-apartment" bind:value={form.apartmentId} on:change={apartmentChanged} disabled={!form.floorId || Boolean(editingId)}><option value="">{$locale.meterReadings.selectApartment}</option>{#each apartments as apartment (apartment.id)}<option value={apartment.id}>{apartment.apartmentNumber}{apartment.name ? ` — ${apartment.name}` : ''}</option>{/each}</select></div>
      <div class="col-sm-6 col-lg-3"><label class="form-label" for="reading-meter">{$locale.meterReadings.meter}</label><select class:is-invalid={formErrors.meterId} class="form-select" id="reading-meter" bind:value={form.meterId} disabled={!form.apartmentId || Boolean(editingId)}><option value="">{$locale.meterReadings.selectMeter}</option>{#each meters as meter (meter.id)}<option value={meter.id}>{meterLabel(meter)}</option>{/each}</select>{#if formErrors.meterId}<div class="invalid-feedback">{formErrors.meterId}</div>{/if}</div>
    </div></fieldset>
    <fieldset><legend class="section-label">{$locale.meterReadings.reading}</legend><div class="row g-3">
      <div class="col-sm-6"><label class="form-label" for="reading-date">{$locale.meterReadings.date}</label><ShamsiDatePicker invalid={Boolean(formErrors.readingDate)} id="reading-date" bind:value={form.readingDate} />{#if formErrors.readingDate}<div class="invalid-feedback">{formErrors.readingDate}</div>{/if}</div>
      <div class="col-sm-6"><label class="form-label" for="reading-current">{$locale.meterReadings.currentReading}</label><input class:is-invalid={formErrors.currentReading} class="form-control" id="reading-current" type="number" min="0" step="0.001" bind:value={form.currentReading} />{#if formErrors.currentReading}<div class="invalid-feedback">{formErrors.currentReading}</div>{/if}</div>
      <div class="col-12"><label class="form-label" for="reading-notes">{$locale.meterReadings.notes}</label><textarea class="form-control" id="reading-notes" rows="3" bind:value={form.notes}></textarea></div>
    </div></fieldset>
  </form>
  <div slot="footer">
    <button class="btn btn-light" type="button" on:click={closeModal} disabled={saving}>{$locale.meterReadings.cancel}</button>
    <button class="btn btn-primary" type="submit" form="meter-reading-form" disabled={saving}>{saving ? $locale.meterReadings.loading : editingId ? $locale.meterReadings.update : $locale.meterReadings.save}</button>
  </div>
</Modal>

<style>
  .cell-sub { display: block; color: var(--text-muted); font-size: var(--text-xs); font-weight: var(--weight-medium); }
</style>
