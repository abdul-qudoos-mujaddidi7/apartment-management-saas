<script>
  import { onDestroy, onMount } from 'svelte';
  import { activeCurrencies, baseCurrency } from '../stores/currency';
  import { createInvoice } from '../services/invoices';
  import { user } from '../stores/auth';
  import { api } from '../services/api';
  import { listMeters } from '../services/meters';
  import { readingBaseline, createMeterReading, deleteMeterReading, getMeterReading, listMeterReadings, updateMeterReading } from '../services/meterReadings';
  import DocumentPreview from '../components/printing/DocumentPreview.svelte';
  import PageLayout from '../components/ui/PageLayout.svelte';
  import DataTable from '../components/ui/DataTable.svelte';
  import Checkbox from '../components/ui/Checkbox.svelte';
  import PageToolbar from '../components/ui/PageToolbar.svelte';
  import Pagination from '../components/ui/Pagination.svelte';
  import UtilityReadingTerms from '../components/meters/UtilityReadingTerms.svelte';
  import Modal from '../components/ui/Modal.svelte';
  import StatusBadge from '../components/ui/StatusBadge.svelte';
  import RowActions from '../components/ui/RowActions.svelte';
  import ShamsiDatePicker from '../components/ui/ShamsiDatePicker.svelte';
  import { formatShortDate } from '../utils/formatters';
  import { AFGHAN_MONTHS, gregorianToShamsi } from '../utils/shamsiDate';
  import { locale, translate } from '../i18n';
  import { notifySuccess } from '../stores/toasts';
  import { sortRows } from '../utils/sortRows';
  import { debounce } from '../utils/debounce';
  import { createSelection, isAllSelected, isSomeSelected, toggleAllSelected, toggleSelected } from '../utils/selection';
  import { formatMoney } from '../utils/formatters';

  const utilities = ['ELECTRICITY', 'WATER', 'GAS'];
  const emptyForm = () => ({ meterId: '', readingDate: new Date().toISOString().slice(0, 10), currentReading: '', periodStart: '', leaseId: '', unitPrice: '', currency: $baseCurrency, readingKind: 'BILLING', resetBaseline: '', notes: '' });
  let readings = [];
  let printReading = null;
  async function openPrint(reading) {
    try { printReading = (await getMeterReading(reading.id)).meterReading; }
    catch (error) { errorMessage = error.message; }
  }
  let leaseOptions = [];
  let billReading = null;
  let billError = '';
  let issuing = false;
  let invoiceDate = new Date().toISOString().slice(0,10);
  async function issueBill() {
    if (!billReading || issuing) return;
    issuing = true; billError = '';
    try {
      await createInvoice({ leaseId: billReading.leaseId, invoiceDate, dueDate: null, items: [{ type: billReading.meter.utilityType, meterReadingId: billReading.id }] });
      billReading = null; notifySuccess($locale.invoices.saved); await loadReadings();
    } catch (e) { billError = e.message; } finally { issuing = false; }
  }
  let history = [];
  let previewPrevious = 0;
  let baseline = null;
  let previewLoading = false;
  let previewVersion = 0;
  async function updatePreview() {
    const meter = meters.find(m => m.id === form.meterId);
    if (!meter || !form.readingDate) return;
    const version = ++previewVersion;
    baseline = null;
    previewLoading = true;
    try {
      const result = await readingBaseline(meter, form.readingDate, editingId);
      if (version !== previewVersion) return;
      baseline = result;
      if (result?.periodStart && form.readingKind !== 'MOVE_IN') form = { ...form, periodStart: result.periodStart };
    } catch (e) { modalError = e.message; } finally { if (version === previewVersion) previewLoading = false; }
  }
  $: selectedMeter = meters.find(m => m.id === form.meterId);
  $: previewPrevious = baseline?.previousReading ?? selectedMeter?.initialReading ?? 0;
  $: previewConsumption = form.readingKind === 'MOVE_IN' ? 0 : Number(form.currentReading) - Number(previewPrevious);
  $: previewAmount = Math.round((previewConsumption * Number(form.unitPrice) + Number.EPSILON) * 100) / 100;
  async function meterChanged() {
    const meter = meters.find(m => m.id === form.meterId);
    const version = ++meterSelectionVersion;
    previewVersion++;
    baseline = null;
    previewLoading = false;
    history = [];
    leaseOptions = [];
    modalError = '';
    form = { ...form, leaseId: '', periodStart: '', unitPrice: meter?.defaultUnitPrice ?? '' };
    if (!meter) return;
    try {
      const [readingResponse, leaseResponse] = await Promise.all([
        listMeterReadings({ meterId: meter.id, pageSize: 100 }),
        api.get('/leases?apartmentId=' + encodeURIComponent(meter.apartmentId || meter.apartment.id) + '&pageSize=100')
      ]);
      if (version !== meterSelectionVersion || !modalOpen) return;
      history = readingResponse.items || [];
      leaseOptions = leaseResponse.items || [];
      const prior = history.find(r => r.readingDate.slice(0,10) < form.readingDate);
      form = { ...form, periodStart: prior?.readingDate.slice(0,10) || meter.installationDate?.slice(0,10) || '' };
      await updatePreview();
    } catch (error) { if (version === meterSelectionVersion && modalOpen) modalError = error.message; }
  }
  let sort = { key: null, dir: 'asc' };
  $: view = sortRows(readings, sort.key, sort.dir);
  let pagination = { page: 1, pageSize: 10, total: 0, totalPages: 0 };
  let filters = { search: '', buildingId: '', utilityType: '', dateFrom: '', dateTo: '' };
  let buildings = [];
  let meters = [];
  let metersLoading = false;
  let meterLoadVersion = 0;
  let meterSelectionVersion = 0;
  let loading = false;
  let saving = false;
  let errorMessage = '';
  let modalError = '';
  let modalOpen = false;
  let editingId = null;
  let formErrors = {};
  let form = emptyForm();

  const debouncedSearch = debounce(() => loadReadings(1), 250);
  onDestroy(() => debouncedSearch.cancel());
  function queueSearch() { debouncedSearch(); }

  onMount(async () => {
    const query = new URLSearchParams(window.location.hash.split('?')[1] || '');
    if (query.get('add') === '1' && $user?.permissions?.includes('UTILITY_MANAGE')) {
      const url = new URL(window.location.href);
      url.hash = '#/meter-readings';
      window.history.replaceState(window.history.state, '', url);
      openCreate();
    }
    try { await loadBuildings(); await loadReadings(1); }
    catch (error) { await handleRequestError(error); }
  });

  async function handleRequestError(error) { if (error.status === 401) return true; errorMessage = error.message; return false; }
  async function loadBuildings() { const response = await api.get('/buildings?page=1&pageSize=100'); buildings = response.items || []; }

  async function loadReadings(page = pagination.page) {
    loading = true; errorMessage = '';
    try { const response = await listMeterReadings({ page, pageSize: pagination.pageSize, ...filters }); readings = response.items; pagination = response.pagination; }
    catch (error) { await handleRequestError(error); }
    finally { loading = false; }
  }

  function resetModal() {
    modalOpen = false;
    modalError = '';
    formErrors = {};
    meterLoadVersion++;
    meterSelectionVersion++;
    previewVersion++;
    metersLoading = false;
    previewLoading = false;
    baseline = null;
  }
  function closeModal() { if (!saving) resetModal(); }
  async function openCreate() {
    resetModal();
    editingId = null;
    form = emptyForm();
    meters = [];
    history = [];
    leaseOptions = [];
    modalOpen = true;
    metersLoading = true;
    const version = ++meterLoadVersion;
    try {
      const options = [];
      let page = 1;
      let totalPages = 1;
      do {
        const response = await listMeters({ status: 'ACTIVE', page, pageSize: 100 });
        if (version !== meterLoadVersion || !modalOpen) return;
        options.push(...(response.items || []));
        totalPages = response.pagination?.totalPages || 1;
        page++;
      } while (page <= totalPages);
      meters = options;
    } catch (error) { if (version === meterLoadVersion && modalOpen) modalError = error.message; }
    finally { if (version === meterLoadVersion) metersLoading = false; }
  }

  async function openEdit(reading) {
    resetModal();
    const meter = reading.meter;
    const version = ++meterSelectionVersion;
    editingId = reading.id;
    meters = [meter];
    history = [];
    leaseOptions = [];
    form = { meterId: meter.id, readingDate: reading.readingDate.slice(0, 10), currentReading: reading.currentReading, notes: reading.notes || '', leaseId: reading.leaseId || '', periodStart: reading.periodStart?.slice(0,10) || '', unitPrice: reading.unitPrice, currency: reading.currency || $baseCurrency, readingKind: reading.readingKind || 'BILLING', resetBaseline: reading.resetBaseline ?? '' };
    modalOpen = true;
    try {
      const [readingResponse, leaseResponse] = await Promise.all([
        listMeterReadings({ meterId: meter.id, pageSize: 100 }),
        api.get('/leases?apartmentId=' + encodeURIComponent(meter.apartmentId || meter.apartment.id) + '&pageSize=100')
      ]);
      if (version !== meterSelectionVersion || !modalOpen) return;
      history = readingResponse.items || [];
      leaseOptions = leaseResponse.items || [];
      await updatePreview();
    } catch (error) { if (version === meterSelectionVersion && modalOpen) modalError = error.message; }
  }

  function validateForm() {
    const copy = $locale.meterReadings; const errors = {};
    if (!form.leaseId) errors.leaseId = $locale.workflow.periodHelp;
    if (form.readingKind !== 'MOVE_IN' && (!form.periodStart || form.periodStart > form.readingDate)) errors.periodStart = $locale.workflow.periodHelp;
    if (!(Number(form.unitPrice) > 0) || !Number.isFinite(Number(form.unitPrice))) errors.unitPrice = $locale.workflow.rate;
    if (Number(form.currentReading) < Number(previewPrevious)) errors.currentReading = copy.currentReadingTooLow;
    if (form.readingKind === 'RESET' && (form.resetBaseline === '' || Number(form.resetBaseline) < 0 || !form.notes.trim())) errors.resetBaseline = $locale.workflow.resetHelp;
    if (!form.meterId) errors.meterId = translate('meterReadings.required', { field: copy.meter });
    if (!form.readingDate) errors.readingDate = translate('meterReadings.required', { field: copy.date });
    if (form.currentReading === '' || !Number.isFinite(Number(form.currentReading)) || Number(form.currentReading) < 0) errors.currentReading = translate('meterReadings.notNegative', { field: copy.currentReading });
    formErrors = errors;
    return Object.keys(errors).length === 0;
  }

  async function saveReading() {
    if (previewLoading || !baseline || !validateForm()) return;
    saving = true; modalError = ''; errorMessage = '';
    const payload = { ...(editingId && form.readingKind === 'MOVE_IN' ? {} : { leaseId: form.leaseId, periodStart: form.readingKind === 'MOVE_IN' ? form.readingDate : form.periodStart }), unitPrice: Number(form.unitPrice), currency: form.currency, ...(editingId ? {} : { readingKind: form.readingKind, ...(form.readingKind === 'RESET' ? { resetBaseline: Number(form.resetBaseline) } : {}) }), ...(editingId && form.readingKind === 'MOVE_IN' ? {} : { readingDate: form.readingDate }), currentReading: Number(form.currentReading), notes: form.notes.trim() || null };
    try {
      if (editingId) { await updateMeterReading(editingId, payload); notifySuccess($locale.meterReadings.updated); }
      else { await createMeterReading({ meterId: form.meterId, ...payload }); notifySuccess($locale.meterReadings.saved); }
      resetModal(); await loadReadings(1);
    } catch (error) {
      if (await handleRequestError(error)) return;
      if (error.data?.errors) { formErrors = Object.fromEntries(Object.entries(error.data.errors).map(([field, messages]) => [field, messages[0]])); }
      else if (error.data?.code === 'CURRENT_READING_TOO_LOW') { formErrors = { ...formErrors, currentReading: $locale.meterReadings.currentReadingTooLow }; }
      else if (error.data?.code === 'METER_READING_DATE_EXISTS') { formErrors = { ...formErrors, readingDate: $locale.meterReadings.dateExists }; }
      else if (error.data?.code === 'METER_READING_MONTH_EXISTS') {
        // Name the month the user can see on their own calendar: the server's
        // message says "Sunbula 1405", the form says آن by its Afghan name.
        const parts = gregorianToShamsi(form.readingDate);
        const month = parts ? `${AFGHAN_MONTHS[parts.jm - 1]} ${parts.jy}` : '';
        formErrors = { ...formErrors, readingDate: translate('meterReadings.monthExists', { month }) };
      }
      else if (error.data?.code === 'METER_READING_ALREADY_BILLED') { modalError = $locale.meterReadings.alreadyBilled; }
      else { modalError = error.message; }
    } finally { saving = false; }
  }

  async function removeReading(reading) {
    if (!window.confirm($locale.meterReadings.confirmDelete)) return;
    errorMessage = '';
    try { await deleteMeterReading(reading.id); notifySuccess($locale.meterReadings.deleted); await loadReadings(readings.length === 1 && pagination.page > 1 ? pagination.page - 1 : pagination.page); }
    catch (error) { if (!(await handleRequestError(error)) && error.data?.code === 'METER_READING_ALREADY_BILLED') { errorMessage = $locale.meterReadings.alreadyBilled; } }
  }

  const utilityLabel = (type) => $locale.meterReadings[type.toLowerCase()];
  const formatReading = (value) => Number(value).toLocaleString(undefined, { minimumFractionDigits: 3, maximumFractionDigits: 3 });
  const billingTone = (status) => ({ UNBILLED: 'neutral', BILLED: 'info', PARTIALLY_PAID: 'warning', PAID: 'success' }[status] || 'neutral');
  const billingLabel = (status) => { const labels = { UNBILLED: $locale.meterReadings.unbilled, BILLED: $locale.meterReadings.billed, PARTIALLY_PAID: $locale.meterReadings.partiallyPaid, PAID: $locale.meterReadings.paid }; return labels[status] || status; };
  const meterLabel = (meter) => [meter.meterNumber, utilityLabel(meter.utilityType), meter.apartment?.floor?.building?.name, meter.apartment?.apartmentNumber].filter(Boolean).join(' | ');
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

<DocumentPreview record={printReading} kind="reading" on:close={() => printReading = null} />

<svelte:head><title>{$locale.meterReadings.title} | {$locale.common.apartmentPro}</title></svelte:head>

<PageLayout>
  <svelte:fragment slot="toolbar">
    <PageToolbar
      bind:search={filters.search}
      searchPlaceholder={$locale.meterReadings.search}
      onSearch={queueSearch}
      showAdd={$user?.permissions?.includes('UTILITY_MANAGE')} addLabel={$locale.meterReadings.add}
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
  </svelte:fragment>

  <svelte:fragment slot="content">
    <DataTable loading={loading} isEmpty={readings.length === 0} loadingLabel={$locale.meterReadings.loading} emptyLabel={$locale.meterReadings.empty} emptyIcon="bi-clipboard-data" className="meter-readings-table" minTableWidth="88rem" showFooter={!loading && readings.length > 0} sortKey={sort.key} sortDir={sort.dir} on:sort={(event) => (sort = event.detail)}>
      <thead><tr>
        <th class="select-column"><Checkbox checked={allRowsSelected} indeterminate={someRowsSelected} label={$locale.common.selectAll} on:change={toggleAllRows} /></th>
        <th data-sort="readingDate">{$locale.meterReadings.date}</th><th data-sort="meter.meterNumber">{$locale.meterReadings.meterNumber}</th><th data-sort="meter.utilityType">{$locale.meterReadings.utilityType}</th><th data-sort="meter.apartment.floor.building.name">{$locale.meterReadings.building}</th><th data-sort="meter.apartment.floor.name">{$locale.meterReadings.floor}</th><th data-sort="meter.apartment.apartmentNumber">{$locale.meterReadings.apartment}</th><th class="reading-cell" data-sort="previousReading">{$locale.meterReadings.previousReading}</th><th class="reading-cell" data-sort="currentReading">{$locale.meterReadings.currentReading}</th><th class="reading-cell" data-sort="consumption">{$locale.meterReadings.consumption}</th><th class="amount-cell" data-sort="unitPrice">{$locale.meterReadings.unitPrice}</th><th class="amount-cell" data-sort="amount">{$locale.meterReadings.amount}</th><th data-sort="billingStatus">{$locale.meterReadings.billingStatus}</th><th class="actions-heading"><span class="visually-hidden">{$locale.meterReadings.edit}</span></th>
      </tr></thead>
      <tbody>{#each view as reading (reading.id)}
        <tr class:is-selected={selectedIds.has(reading.id)}>
          <td class="select-column"><Checkbox checked={selectedIds.has(reading.id)} label={$locale.common.selectRow} on:change={() => toggleRow(reading.id)} /></td>
          <td class="date-cell">{formatShortDate(reading.readingDate)}<small class="cell-sub">{reading.periodStart ? formatShortDate(reading.periodStart) : ""} → {formatShortDate(reading.readingDate)} · {$locale.workflow[{ BILLING: "billing", HANDOVER: "handover", MOVE_IN: "moveIn", RESET: "reset" }[reading.readingKind] || "billing"]}</small></td>
          <td class="meter-number">{reading.meter.meterNumber}</td>
          <td>{utilityLabel(reading.meter.utilityType)}</td>
          <td>{reading.meter.apartment.floor.building.name}</td>
          <td>{reading.meter.apartment.floor.name || reading.meter.apartment.floor.floorNumber}</td>
          <td><strong>{reading.meter.apartment.apartmentNumber}</strong>{#if reading.meter.apartment.name}<small class="cell-sub">{reading.meter.apartment.name}</small>{/if}</td>
          <td class="reading-cell">{formatReading(reading.previousReading)}</td>
          <td class="reading-cell">{formatReading(reading.currentReading)}</td>
          <td class="reading-cell">{formatReading(reading.consumption)} {reading.meter.unit}</td>
          <td class="amount-cell">{formatMoney(reading.unitPrice, reading.currency || $baseCurrency)} / {reading.meter.unit}</td>
          <td class="amount-cell">{formatMoney(reading.amount, reading.currency || $baseCurrency)}</td>
          <td><StatusBadge label={billingLabel(reading.billingStatus)} tone={billingTone(reading.billingStatus)} /><small class="cell-sub">{$locale.workflow.paid}: {formatMoney(reading.paidAmount, reading.currency || $baseCurrency)} · {$locale.workflow.outstanding}: {formatMoney(reading.outstanding, reading.currency || $baseCurrency)}</small></td>
          <td class="actions-cell">
            <RowActions label={$locale.meterReadings.edit}>
              <button class="row-menu-item" type="button" on:click={() => openPrint(reading)}><i class="bi bi-printer" aria-hidden="true"></i>{$locale.printing.print}</button>
              {#if $user?.permissions?.includes('INVOICE_MANAGE') && reading.billingStatus === 'UNBILLED' && reading.leaseId && reading.readingKind !== 'MOVE_IN'}
                <button class="row-menu-item" type="button" on:click={() => { billReading = reading; billError = ''; }}><i class="bi bi-receipt" aria-hidden="true"></i>{$locale.workflow.issueBill}</button>
              {/if}
              <button class="row-menu-item" type="button" on:click={() => openEdit(reading)} title={reading.billingStatus === 'UNBILLED' ? $locale.meterReadings.edit : $locale.meterReadings.alreadyBilled} disabled={reading.billingStatus !== 'UNBILLED' || !$user?.permissions?.includes('UTILITY_MANAGE')}><i class="bi bi-pencil" aria-hidden="true"></i>{$locale.meterReadings.edit}</button>
              <button class="row-menu-item danger" type="button" on:click={() => removeReading(reading)} title={reading.billingStatus === 'UNBILLED' ? $locale.meterReadings.delete : $locale.meterReadings.alreadyBilled} disabled={reading.billingStatus !== 'UNBILLED'}><i class="bi bi-trash3" aria-hidden="true"></i>{$locale.meterReadings.delete}</button>
            </RowActions>
          </td>
        </tr>
      {/each}</tbody>
    </DataTable>
  </svelte:fragment>

  <svelte:fragment slot="footer">
    <Pagination page={pagination.page} totalPages={pagination.totalPages} previousLabel={$locale.meterReadings.previous} nextLabel={$locale.meterReadings.next} label={$locale.meterReadings.page.replace('{page}', pagination.page).replace('{totalPages}', pagination.totalPages)} summary={resultSummary} onPage={loadReadings} />
  </svelte:fragment>
</PageLayout>

<Modal bind:open={modalOpen} title={editingId ? $locale.meterReadings.edit : $locale.meterReadings.add} description={$locale.meterReadings.description} busy={saving} size="modal-lg" icon="bi-speedometer" closeLabel={$locale.meterReadings.cancel} on:close={closeModal}>
  <form id="meter-reading-form" on:submit|preventDefault={saveReading} novalidate>
    {#if modalError}<div class="alert alert-danger" role="alert">{modalError}</div>{/if}
    <fieldset><legend class="section-label">{$locale.meterReadings.meter}</legend><div class="row g-3">
      <div class="col-12"><label class="form-label" for="reading-meter">{$locale.meterReadings.meter}</label><div class="field-control"><i class="bi bi-speedometer" aria-hidden="true"></i><select class:is-invalid={formErrors.meterId} class="form-select" id="reading-meter" bind:value={form.meterId} on:change={meterChanged} disabled={metersLoading || Boolean(editingId)}><option value="">{metersLoading ? $locale.meterReadings.loading : $locale.meterReadings.selectMeter}</option>{#each meters as meter (meter.id)}<option value={meter.id}>{meterLabel(meter)}</option>{/each}</select></div>{#if formErrors.meterId}<div class="invalid-feedback">{formErrors.meterId}</div>{/if}</div>
    </div></fieldset>
    <fieldset><legend class="section-label">{$locale.meterReadings.reading}</legend><div class="row g-3">
      <div class="col-sm-6"><label class="form-label" for="reading-date">{$locale.meterReadings.date}</label><ShamsiDatePicker invalid={Boolean(formErrors.readingDate)} id="reading-date" bind:value={form.readingDate} on:change={updatePreview} disabled={Boolean(editingId) && form.readingKind === 'MOVE_IN'} />{#if formErrors.readingDate}<div class="invalid-feedback">{formErrors.readingDate}</div>{/if}</div>
      <div class="col-sm-6"><label class="form-label" for="reading-current">{$locale.meterReadings.currentReading}</label><div class="field-control"><i class="bi bi-speedometer" aria-hidden="true"></i><input class:is-invalid={formErrors.currentReading} class="form-control" id="reading-current" type="number" min="0" step="0.001" bind:value={form.currentReading} /></div>{#if formErrors.currentReading}<div class="invalid-feedback">{formErrors.currentReading}</div>{/if}</div>
      <UtilityReadingTerms bind:form {formErrors} {leaseOptions} {previewPrevious} expectedStart={baseline?.periodStart || ''} unit={selectedMeter?.unit || ""} editing={Boolean(editingId)} />
      <div class="col-12"><label class="form-label" for="reading-notes">{$locale.meterReadings.notes}</label><textarea class="form-control" id="reading-notes" rows="3" bind:value={form.notes}></textarea></div>
    </div></fieldset>
  </form>
  <div slot="footer">
    <button class="btn btn-light" type="button" on:click={closeModal} disabled={saving}>{$locale.meterReadings.cancel}</button>
    <button class="btn btn-primary" type="submit" form="meter-reading-form" disabled={saving || previewLoading || !baseline}>{saving ? $locale.meterReadings.loading : editingId ? $locale.meterReadings.update : $locale.meterReadings.save}</button>
  </div>
</Modal>

<Modal open={Boolean(billReading)} title={$locale.workflow.billReview} busy={issuing} on:close={() => billReading = null} closeLabel={$locale.meterReadings.cancel}>
  {#if billReading}
    {#if billError}<p class="alert alert-danger" role="alert">{billError}</p>{/if}
    <p>{billReading.meter.meterNumber} · {billReading.meter.apartment.apartmentNumber}</p>
    <p>{billReading.lease?.contractNumber || ''} · {billReading.lease?.tenant?.firstName || ''} {billReading.lease?.tenant?.lastName || ''}</p>
    <p>{formatShortDate(billReading.periodStart)} → {formatShortDate(billReading.readingDate)}</p>
    <p>{formatReading(billReading.currentReading)} − {formatReading(billReading.previousReading)} = {formatReading(billReading.consumption)} {billReading.meter.unit}</p>
    <p>{formatReading(billReading.consumption)} × {billReading.unitPrice} = <strong>{formatMoney(billReading.amount, billReading.currency || $baseCurrency)}</strong></p>
    <label class="form-label" for="utility-invoice-date">{$locale.invoices.invoiceDate}</label><ShamsiDatePicker id="utility-invoice-date" bind:value={invoiceDate} />
  {/if}
  <div slot="footer"><button type="button" class="btn btn-light" disabled={issuing} on:click={() => billReading = null}>{$locale.meterReadings.cancel}</button><button type="button" class="btn btn-primary" disabled={issuing || !invoiceDate} on:click={issueBill}>{$locale.workflow.issueBill}</button></div>
</Modal>
<style>
  .cell-sub { display: block; color: var(--text-muted); font-size: var(--text-xs); font-weight: var(--weight-medium); }
</style>
