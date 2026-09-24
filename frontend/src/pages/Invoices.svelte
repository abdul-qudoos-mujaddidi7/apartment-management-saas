<script>
  import { onDestroy, onMount } from 'svelte';
  import { api } from '../services/api';
  import { listLeases } from '../services/leases';
  import { listMeterReadings } from '../services/meterReadings';
  import { cancelInvoice, createInvoice, deleteInvoice, getInvoice, listInvoices, updateInvoice } from '../services/invoices';
  import PageLayout from '../components/ui/PageLayout.svelte';
  import DataTable from '../components/ui/DataTable.svelte';
  import PageToolbar from '../components/ui/PageToolbar.svelte';
  import TabFilters from '../components/ui/TabFilters.svelte';
  import Checkbox from '../components/ui/Checkbox.svelte';
  import Pagination from '../components/ui/Pagination.svelte';
  import Modal from '../components/ui/Modal.svelte';
  import StatusBadge from '../components/ui/StatusBadge.svelte';
  import RowActions from '../components/ui/RowActions.svelte';
  import ShamsiDatePicker from '../components/ui/ShamsiDatePicker.svelte';
  import ReceivePaymentModal from '../components/payments/ReceivePaymentModal.svelte';
  import { locale, translate } from '../i18n';
  import { activeCurrencies, baseCurrency, toBase } from '../stores/currency';
  import { notifySuccess } from '../stores/toasts';
  import { debounce } from '../utils/debounce';
  import { createSelection, isAllSelected, isSomeSelected, toggleAllSelected, toggleSelected } from '../utils/selection';
  import { formatMoney, formatShortDate } from '../utils/formatters';
  import { sortRows } from '../utils/sortRows';

  const ITEM_TYPES = ['RENT', 'ELECTRICITY', 'WATER', 'GAS', 'SERVICE_FEE', 'OTHER'];
  const UTILITY_TYPES = ['ELECTRICITY', 'WATER', 'GAS'];
  // The wording a charge type carries, by the key that wording lives under.
  const TYPE_LABELS = { RENT: 'rent', ELECTRICITY: 'electricity', WATER: 'water', GAS: 'gas', SERVICE_FEE: 'serviceFee', OTHER: 'other' };
  const STATUSES = ['UNPAID', 'PARTIALLY_PAID', 'PAID', 'OVERDUE', 'CANCELLED'];
  /*
   * A line the user types, and a line billed from a meter reading: the second
   * carries its reading's id and the figures that reading was priced at, and the
   * server re-derives them from the reading when the invoice is raised.
   */
  const newItem = () => ({ type: 'RENT', description: '', quantity: 1, unitPrice: '', meterReadingId: null, amount: null });
  // No currency of its own: every charge carries the one it was agreed in, and
  // the invoice adds them up in the organization's reporting currency.
  const emptyForm = () => ({ leaseId: '', invoiceDate: new Date().toISOString().slice(0, 10), dueDate: '', notes: '', items: [newItem()] });

  let invoices = [];
  let sort = { key: null, dir: 'asc' };
  $: view = sortRows(invoices, sort.key, sort.dir);
  let pagination = { page: 1, pageSize: 10, total: 0, totalPages: 0 };
  let filters = { search: '', buildingId: '', status: '', dateFrom: '', dateTo: '' };
  let selectedIds = createSelection();

  // Status is a chip row in the toolbar; the panel holds what chips cannot say.
  $: statusTabs = [{ key: '', label: $locale.common.all }, ...STATUSES.map((status) => ({ key: status, label: statusLabel(status) }))];
  $: activeFilterCount = [filters.buildingId, filters.dateFrom, filters.dateTo].filter(Boolean).length;

  $: rowIds = invoices.map((invoice) => invoice.id);
  $: allRowsSelected = isAllSelected(selectedIds, rowIds);
  $: someRowsSelected = isSomeSelected(selectedIds, rowIds);
  let buildings = [];
  /*
   * The active leases — one per let apartment — and the unbilled readings of the
   * apartment the chosen one is for. Both are supporting data: the form is
   * usable while they load, and a utility line simply stays a typed line when
   * there is no reading behind it.
   */
  let leases = [];
  let readings = [];
  let readingsLoading = false;
  let loading = false;
  let saving = false;
  let errorMessage = '';
  let modalError = '';
  let modalOpen = false;
  let detailsOpen = false;
  let detailsInvoice = null;
  let paymentInvoice = null;
  let paymentModalOpen = false;
  let editingId = null;
  let formErrors = {};
  let form = emptyForm();

  const debouncedSearch = debounce(() => loadInvoices(1), 250);
  onDestroy(() => debouncedSearch.cancel());
  function queueSearch() { debouncedSearch(); }

  onMount(async () => { try { await Promise.all([loadBuildings(), loadInvoices(1)]); } catch (error) { await handleRequestError(error); } });

  async function handleRequestError(error) { if (error.status === 401) return true; errorMessage = error.message; return false; }
  async function loadBuildings() { const response = await api.get('/buildings?page=1&pageSize=100'); buildings = response.items || []; }

  async function loadInvoices(page = pagination.page) {
    loading = true; errorMessage = '';
    try { const response = await listInvoices({ page, pageSize: pagination.pageSize, ...filters }); invoices = response.items; pagination = response.pagination; }
    catch (error) { await handleRequestError(error); }
    finally { loading = false; }
  }

  function handleStatusChange(event) { filters = { ...filters, status: event.detail }; loadInvoices(1); }
  function clearFilters() { filters = { ...filters, buildingId: '', dateFrom: '', dateTo: '' }; loadInvoices(1); }
  function toggleRow(id) { selectedIds = toggleSelected(selectedIds, id); }
  function toggleAllRows() { selectedIds = toggleAllSelected(selectedIds, rowIds); }

  function resetModal() { modalOpen = false; modalError = ''; formErrors = {}; }
  function closeModal() { if (!saving) resetModal(); }
  /*
   * The apartment is the choice, so the picker offers the active leases: each
   * one is an apartment that is let, and it names the tenant it is let to. A
   * tenant who rents two apartments therefore appears twice, once per apartment,
   * which is the point — the apartment is what is billed.
   */
  async function openCreate() {
    editingId = null; readings = []; modalError = ''; formErrors = {}; form = emptyForm(); modalOpen = true;
    try { const response = await listLeases({ status: 'ACTIVE', page: 1, pageSize: 100 }); leases = response.items || []; }
    catch (error) { modalError = error.message; }
  }

  function selectedLease() { return leases.find((l) => l.id === form.leaseId); }

  /*
   * Choosing the apartment adopts its lease's terms: the rent it is let for and
   * the service fee it carries, each in the currency that lease states it in,
   * plus the unbilled readings standing against that apartment.
   */
  async function apartmentChanged() {
    const lease = selectedLease();
    if (!lease) { readings = []; return; }
    applyLeaseDefaults(lease);
    await loadReadings(lease.apartment.id);
    form = { ...form, items: form.items.map((item, index) => resolveReading(item, index)) };
  }

  async function loadReadings(apartmentId) {
    readings = [];
    if (!apartmentId) return;
    readingsLoading = true;
    try {
      const response = await listMeterReadings({ apartmentId, unbilled: true, page: 1, pageSize: 100 });
      // Oldest first: the reading that has been waiting longest is the one a
      // utility line is filled from.
      readings = (response.items || []).slice().sort((a, b) => String(a.readingDate).localeCompare(String(b.readingDate)));
    } catch (error) { modalError = error.message; }
    finally { readingsLoading = false; }
  }

  /*
   * What the lease says a rent or a fee line should read, in the currency that
   * lease states it in: the line carries the currency now, so a fee agreed in
   * another one is billed as it stands instead of being converted by hand.
   */
  function applyLeaseDefaults(lease) {
    const items = form.items.map((item) => {
      if (item.meterReadingId) return item;
      if (item.type === 'RENT') {
        return { ...item, description: item.description || $locale.invoices.monthlyRent, quantity: 1, unitPrice: lease.monthlyRent };
      }
      if (item.type === 'SERVICE_FEE') {
        return { ...item, description: item.description || $locale.invoices.serviceFee, quantity: 1, unitPrice: Number(lease.serviceFee) || 0 };
      }
      return item;
    });
    form = { ...form, items };
  }

  /*
   * The currency a charge is stated in — the same rule the server applies, so
   * what the form shows is what will be posted. Rent keeps the lease's rent
   * currency, the fee keeps its own, a meter reading is priced in the base
   * currency the meter was priced in, and a typed charge is base too.
   */
  function lineCurrency(item) {
    if (item.meterReadingId) return $baseCurrency;
    if (item.type === 'RENT') return chosenLease?.currency || $baseCurrency;
    if (item.type === 'SERVICE_FEE') return chosenLease?.serviceFeeCurrency || chosenLease?.currency || $baseCurrency;
    return $baseCurrency;
  }

  /* Readings of a utility that no other line is already billing. */
  function availableReadings(type, excludeIndex) {
    return readings.filter((reading) => reading.meter.utilityType === type
      && !form.items.some((item, index) => index !== excludeIndex && item.meterReadingId === reading.id));
  }

  function billedFrom(item, reading) {
    return {
      ...item,
      type: reading.meter.utilityType,
      meterReadingId: reading.id,
      description: utilityDescription(reading),
      quantity: Number(reading.consumption),
      unitPrice: Number(reading.unitPrice),
      amount: Number(reading.amount),
    };
  }

  function utilityDescription(reading) {
    const label = $locale.invoices[reading.meter.utilityType.toLowerCase()];
    const consumption = Number(reading.consumption).toLocaleString(undefined, { minimumFractionDigits: 3, maximumFractionDigits: 3 });
    return `${label} - Meter ${reading.meter.meterNumber} - ${consumption} ${reading.meter.unit}`;
  }

  /*
   * A utility line is filled from the readings already loaded: choosing the type
   * is what bills one, because a charge that has a reading behind it is not an
   * amount to be typed from memory. A utility with no reading left stays a typed
   * line, and anything that is not a utility simply drops its reading.
   */
  function resolveReading(item, index) {
    if (!UTILITY_TYPES.includes(item.type)) return { ...item, meterReadingId: null, amount: null };
    const [reading] = availableReadings(item.type, index);
    return reading ? billedFrom(item, reading) : { ...item, meterReadingId: null, amount: null };
  }

  function updateItem(index, next) { form = { ...form, items: form.items.map((item, i) => (i === index ? next : item)) }; }

  function typeChanged(index, type) {
    let next = resolveReading({ ...form.items[index], type }, index);

    // A service-fee line is part of the selected lease, not an amount the user
    // should have to remember or type again.
    if (type === 'SERVICE_FEE' && chosenLease) {
      next = {
        ...next,
        description: $locale.invoices.serviceFee,
        quantity: 1,
        unitPrice: Number(chosenLease.serviceFee) || 0,
      };
    }

    updateItem(index, next);
  }

  function readingChanged(index, readingId) {
    const item = form.items[index];
    const reading = readings.find((entry) => entry.id === readingId);
    updateItem(index, reading ? billedFrom(item, reading) : { ...item, meterReadingId: null, amount: null });
  }

  function addItem() { form = { ...form, items: [...form.items, newItem()] }; }
  function removeItem(index) { if (form.items.length === 1) return; form = { ...form, items: form.items.filter((_, i) => i !== index) }; }

  async function openEdit(invoice) {
    try {
      const response = await getInvoice(invoice.id);
      const fi = response.invoice;
      const lease = fi.lease;
      editingId = fi.id; modalError = ''; formErrors = {}; modalOpen = true;
      // The invoice's lease is fixed once it exists, so it is the only lease on
      // offer and the tenant it belongs to is the one shown.
      leases = [lease];
      // A saved invoice is re-stated under the rule it was posted under: the
      // lines are shown in the currencies their sources state, which is what
      // saving recomputes them as.
      form = { leaseId: lease.id, invoiceDate: fi.invoiceDate.slice(0, 10), dueDate: fi.dueDate ? fi.dueDate.slice(0, 10) : '', notes: fi.notes || '', items: fi.items.map((item) => ({ type: item.type, meterReadingId: item.meterReadingId || null, description: item.description, quantity: item.quantity, unitPrice: item.unitPrice, amount: item.amount })) };
      readings = [];
    } catch (error) { await handleRequestError(error); modalError = error.message; }
  }

  async function openDetails(invoice) { try { detailsInvoice = (await getInvoice(invoice.id)).invoice; detailsOpen = true; } catch (error) { await handleRequestError(error); } }
  function closeDetails() { detailsOpen = false; detailsInvoice = null; }
  function openReceivePayment(invoice) { paymentInvoice = invoice; paymentModalOpen = true; }
  function closeReceivePayment() { paymentModalOpen = false; paymentInvoice = null; }

  function validateForm() {
    const copy = $locale.invoices; const errors = {};
    if (!form.leaseId) errors.leaseId = translate('invoices.required', { field: copy.apartment });
    if (!form.invoiceDate) errors.invoiceDate = translate('invoices.required', { field: copy.invoiceDate });
    if (form.dueDate && form.dueDate < form.invoiceDate) errors.dueDate = copy.invalidDates;
    form.items.forEach((item, index) => {
      // A line billed from a meter reading carries that reading's own figures:
      // the server derives them, so there is nothing here to type-check.
      if (item.meterReadingId) return;
      if (!item.description.trim()) errors[`item-${index}-description`] = translate('invoices.required', { field: copy.itemDescription });
      if (Number(item.quantity) <= 0) errors[`item-${index}-quantity`] = copy.positiveQuantity;
      if (item.unitPrice === '' || Number(item.unitPrice) < 0) errors[`item-${index}-unitPrice`] = copy.notNegative;
    });
    formErrors = errors;
    return Object.keys(errors).length === 0;
  }

  /* A reading's own amount, not quantity times price: the two are rounded
     separately when the reading is priced, and the invoice charges the reading. */
  function itemAmount(item) { return item.meterReadingId ? Number(item.amount) || 0 : (Number(item.quantity) || 0) * (Number(item.unitPrice) || 0); }
  /*
   * The invoice's totals are reporting-currency figures, so every line is
   * converted at today's rate into them — the rate the server resolves and
   * freezes on the invoice when it posts it.
   */
  function baseAmountOf(item) { return toBase(itemAmount(item), lineCurrency(item), $activeCurrencies, $baseCurrency); }
  $: previewTotal = form.items.reduce((total, item) => total + baseAmountOf(item), 0);
  $: hasForeignLine = form.items.some((item) => lineCurrency(item) !== $baseCurrency);

  async function saveInvoice() {
    if (!validateForm()) return;
    saving = true; modalError = ''; errorMessage = '';
    const payload = { invoiceDate: form.invoiceDate, dueDate: form.dueDate || null, notes: form.notes.trim() || null, items: form.items.map(serializeItem) };
    try {
      if (editingId) { await updateInvoice(editingId, payload); notifySuccess($locale.invoices.updated); }
      else { await createInvoice({ leaseId: form.leaseId, ...payload }); notifySuccess($locale.invoices.saved); }
      resetModal(); await loadInvoices(1);
    } catch (error) {
      if (await handleRequestError(error)) return;
      if (error.data?.errors) { formErrors = Object.fromEntries(Object.entries(error.data.errors).map(([field, messages]) => [field, messages[0]])); }
      else { modalError = error.message; }
    } finally { saving = false; }
  }

  async function removeInvoice(invoice) {
    if (!window.confirm($locale.invoices.confirmDelete)) return;
    errorMessage = '';
    try { await deleteInvoice(invoice.id); notifySuccess($locale.invoices.deleted); await loadInvoices(invoices.length === 1 && pagination.page > 1 ? pagination.page - 1 : pagination.page); }
    catch (error) { await handleRequestError(error); }
  }

  async function cancelExistingInvoice(invoice) {
    if (!window.confirm($locale.invoices.confirmCancel)) return;
    errorMessage = '';
    try { await cancelInvoice(invoice.id); notifySuccess($locale.invoices.cancelledSuccess); await loadInvoices(pagination.page); }
    catch (error) { await handleRequestError(error); }
  }

  const serializeItem = (item) => (item.meterReadingId
    ? { type: item.type, meterReadingId: item.meterReadingId }
    : { type: item.type, description: item.description.trim(), quantity: Number(item.quantity), unitPrice: Number(item.unitPrice) });
  const itemTypeLabel = (type) => $locale.invoices[TYPE_LABELS[type]] || type;
  // A reading is named by when it was taken, what it used and which meter: the
  // three things that tell two readings of the same utility apart.
  const readingLabel = (reading) => `${formatShortDate(reading.readingDate)} · ${Number(reading.consumption).toLocaleString(undefined, { maximumFractionDigits: 3 })} ${reading.meter.unit} · ${reading.meter.meterNumber}`;
  $: chosenLease = leases.find((lease) => lease.id === form.leaseId) || null;
  const statusLabel = (status) => $locale.invoices[status.toLowerCase().replace('_', '')];
  const statusTone = (status) => ({ PAID: 'success', PARTIALLY_PAID: 'warning', OVERDUE: 'danger', CANCELLED: 'neutral', UNPAID: 'info' }[status] || 'neutral');
  const tenantName = (lease) => `${lease.tenant.firstName} ${lease.tenant.lastName}`.trim();
  // The apartment, and who it is let to: what is being billed, and to whom.
  const leaseLabel = (lease) => `${lease.apartment.apartmentNumber}${lease.apartment.name ? ` — ${lease.apartment.name}` : ''} · ${tenantName(lease)} · ${lease.apartment.floor.building.name}`;
  const tenantLabel = (lease) => [tenantName(lease), lease.tenant.phone].filter(Boolean).join(' — ');
  const invoiceTypes = (invoice) => { const types = [...new Set((invoice.items || []).map((item) => item.type))]; return types.map(itemTypeLabel).join(', ') || '—'; };
  $: resultSummary = `${$locale.invoices.title}: ${pagination.total}`;
</script>

<svelte:head><title>{$locale.invoices.title} | {$locale.common.apartmentPro}</title></svelte:head>

<PageLayout>
  <svelte:fragment slot="toolbar">
    <PageToolbar
      bind:search={filters.search}
      searchPlaceholder={$locale.invoices.search}
      addLabel={$locale.invoices.add}
      onSearch={queueSearch}
      onAdd={openCreate}
      filtersLabel={$locale.common.filters}
      filtersCount={activeFilterCount}
      filtersClearLabel={$locale.common.clearFilters}
      onClearFilters={clearFilters}
    >
      <svelte:fragment slot="tabs">
        <TabFilters tabs={statusTabs} active={filters.status} on:select={handleStatusChange} />
      </svelte:fragment>

      <svelte:fragment slot="filters">
        <div class="filters-field">
          <label class="filters-field-label" for="invoice-filter-building">{$locale.invoices.building}</label>
          <select class="form-select" id="invoice-filter-building" bind:value={filters.buildingId} on:change={() => loadInvoices(1)}>
            <option value="">{$locale.invoices.allBuildings}</option>
            {#each buildings as building (building.id)}<option value={building.id}>{building.name}</option>{/each}
          </select>
        </div>
        <div class="filters-field">
          <label class="filters-field-label" for="invoice-filter-from">{$locale.invoices.dateFrom}</label>
          <ShamsiDatePicker id="invoice-filter-from" bind:value={filters.dateFrom} on:change={() => loadInvoices(1)} />
        </div>
        <div class="filters-field">
          <label class="filters-field-label" for="invoice-filter-to">{$locale.invoices.dateTo}</label>
          <ShamsiDatePicker id="invoice-filter-to" bind:value={filters.dateTo} on:change={() => loadInvoices(1)} />
        </div>
      </svelte:fragment>
    </PageToolbar>
  </svelte:fragment>

  <svelte:fragment slot="alerts">
    {#if errorMessage}<div class="alert alert-danger" role="alert">{errorMessage}</div>{/if}
  </svelte:fragment>

  <svelte:fragment slot="content">
    <DataTable loading={loading} isEmpty={invoices.length === 0} loadingLabel={$locale.invoices.loading} emptyLabel={$locale.invoices.empty} emptyIcon="bi-receipt" className="invoices-table" minTableWidth="88rem" showFooter={!loading && invoices.length > 0} sortKey={sort.key} sortDir={sort.dir} on:sort={(event) => (sort = event.detail)}>
      <button slot="empty-action" class="btn btn-primary" type="button" on:click={openCreate}>{$locale.invoices.add}</button>
      <thead><tr>
        <th class="select-column"><Checkbox checked={allRowsSelected} indeterminate={someRowsSelected} label={$locale.common.selectAll} on:change={toggleAllRows} /></th>
        <th data-sort="invoiceNumber">{$locale.invoices.invoiceNumber}</th><th data-sort="invoiceDate">{$locale.invoices.invoiceDate}</th><th data-sort="dueDate">{$locale.invoices.dueDate}</th><th>{$locale.invoices.type}</th><th data-sort="lease.tenant.lastName">{$locale.invoices.tenant}</th><th data-sort="lease.apartment.floor.building.name">{$locale.invoices.building}</th><th data-sort="lease.apartment.apartmentNumber">{$locale.invoices.apartment}</th><th data-sort="lease.contractNumber">{$locale.invoices.contractNumber}</th><th class="amount-cell" data-sort="total">{$locale.invoices.total}</th><th class="amount-cell" data-sort="paidAmount">{$locale.invoices.paid}</th><th class="amount-cell">{$locale.invoices.balance}</th><th data-sort="status">{$locale.invoices.status}</th><th class="actions-heading"><span class="visually-hidden">{$locale.invoices.view}</span></th>
      </tr></thead>
      <tbody>{#each view as invoice (invoice.id)}
        <tr class:is-selected={selectedIds.has(invoice.id)}>
          <td class="select-column"><Checkbox checked={selectedIds.has(invoice.id)} label={$locale.common.selectRow} on:change={() => toggleRow(invoice.id)} /></td>
          <td class="invoice-number">{invoice.invoiceNumber}</td><td class="date-cell">{formatShortDate(invoice.invoiceDate)}</td><td class="date-cell">{formatShortDate(invoice.dueDate)}</td><td class="invoice-types">{invoiceTypes(invoice)}</td><td class="tenant-name">{tenantName(invoice.lease)}</td><td>{invoice.lease.apartment.floor.building.name}</td><td><strong>{invoice.lease.apartment.apartmentNumber}</strong>{#if invoice.lease.apartment.name}<small class="cell-sub">{invoice.lease.apartment.name}</small>{/if}</td><td>{invoice.lease.contractNumber}</td><td class="amount-cell">{formatMoney(invoice.total, invoice.currency)}</td><td class="amount-cell">{formatMoney(invoice.paidAmount, invoice.currency)}</td><td class="amount-cell">{formatMoney(invoice.total - invoice.paidAmount, invoice.currency)}</td><td><StatusBadge label={statusLabel(invoice.status)} tone={statusTone(invoice.status)} /></td>
          <td class="actions-cell">
            <RowActions label={$locale.invoices.view}>
              <button class="row-menu-item" type="button" on:click={() => openDetails(invoice)}><i class="bi bi-eye" aria-hidden="true"></i>{$locale.common.actions.view}</button>
              {#if invoice.status !== 'PAID' && invoice.status !== 'CANCELLED'}
                <button class="row-menu-item" type="button" on:click={() => openReceivePayment(invoice)}><i class="bi bi-credit-card-2-front" aria-hidden="true"></i>{$locale.payments.receivePayment}</button>
              {/if}
              <button class="row-menu-item" type="button" on:click={() => openEdit(invoice)} disabled={invoice.status === 'CANCELLED'}><i class="bi bi-pencil" aria-hidden="true"></i>{$locale.common.actions.edit}</button>
              {#if invoice.status !== 'CANCELLED'}
                <button class="row-menu-item warning" type="button" on:click={() => cancelExistingInvoice(invoice)}><i class="bi bi-x-circle" aria-hidden="true"></i>{$locale.common.actions.cancel}</button>
              {/if}
              <button class="row-menu-item danger" type="button" on:click={() => removeInvoice(invoice)}><i class="bi bi-trash3" aria-hidden="true"></i>{$locale.invoices.delete}</button>
            </RowActions>
          </td>
        </tr>
      {/each}</tbody>
    </DataTable>
  </svelte:fragment>

  <svelte:fragment slot="footer">
    <Pagination page={pagination.page} totalPages={pagination.totalPages} previousLabel={$locale.invoices.previous} nextLabel={$locale.invoices.next} label={$locale.invoices.page.replace('{page}', pagination.page).replace('{totalPages}', pagination.totalPages)} summary={resultSummary} onPage={loadInvoices} />
  </svelte:fragment>
</PageLayout>

<!-- Create/Edit Modal -->
<Modal bind:open={modalOpen} title={editingId ? $locale.invoices.edit : $locale.invoices.add} description={$locale.invoices.formHint} busy={saving} size="modal-xl" icon="bi-receipt" closeLabel={$locale.invoices.cancel} on:close={closeModal}>
  <form id="invoice-form" on:submit|preventDefault={saveInvoice} novalidate>
    {#if modalError}<div class="alert alert-danger" role="alert">{modalError}</div>{/if}
    <fieldset><legend class="section-label">{$locale.invoices.location}</legend><div class="row g-3">
      <!-- The apartment is the choice: one tenant can rent more than one, so the
           apartment is what is billed. Its lease names the tenant and the terms,
           and the fields under this are that lease read back. -->
      <div class="col-sm-6">
        <label class="form-label" for="invoice-apartment">{$locale.invoices.apartment}</label>
        <div class="field-control">
          <i class="bi bi-door-open" aria-hidden="true"></i>
          <select class:is-invalid={formErrors.leaseId} class="form-select" id="invoice-apartment" bind:value={form.leaseId} on:change={apartmentChanged} disabled={Boolean(editingId) || leases.length === 0}>
            <option value="">{$locale.invoices.selectApartment}</option>
            {#each leases as lease (lease.id)}<option value={lease.id}>{leaseLabel(lease)}</option>{/each}
          </select>
        </div>
        {#if formErrors.leaseId}<div class="invalid-feedback">{formErrors.leaseId}</div>{/if}
        {#if !editingId && leases.length === 0}<p class="field-hint">{$locale.invoices.noActiveLease}</p>{/if}
      </div>
      <div class="col-sm-6">
        <label class="form-label" for="invoice-tenant-name">{$locale.invoices.tenant}</label>
        <div class="field-control">
          <i class="bi bi-person" aria-hidden="true"></i>
          <input class="form-control" id="invoice-tenant-name" value={chosenLease ? tenantLabel(chosenLease) : '—'} readonly />
        </div>
      </div>
      <div class="col-sm-6 col-lg-4">
        <label class="form-label" for="invoice-building-name">{$locale.invoices.building}</label>
        <div class="field-control">
          <i class="bi bi-building" aria-hidden="true"></i>
          <input class="form-control" id="invoice-building-name" value={chosenLease ? chosenLease.apartment.floor.building.name : '—'} readonly />
        </div>
      </div>
      <div class="col-sm-6 col-lg-4">
        <label class="form-label" for="invoice-floor-name">{$locale.invoices.floor}</label>
        <div class="field-control">
          <i class="bi bi-layers" aria-hidden="true"></i>
          <input class="form-control" id="invoice-floor-name" value={chosenLease ? chosenLease.apartment.floor.name || chosenLease.apartment.floor.floorNumber : '—'} readonly />
        </div>
      </div>
      <div class="col-sm-6 col-lg-4">
        <label class="form-label" for="invoice-contract-number">{$locale.invoices.contractNumber}</label>
        <div class="field-control">
          <i class="bi bi-file-earmark-text" aria-hidden="true"></i>
          <input class="form-control" id="invoice-contract-number" value={chosenLease ? chosenLease.contractNumber : '—'} readonly />
        </div>
      </div>
    </div></fieldset>
    <fieldset><legend class="section-label">{$locale.invoices.details}</legend><div class="row g-3">
      <div class="col-sm-6"><label class="form-label" for="invoice-date">{$locale.invoices.invoiceDate}</label><ShamsiDatePicker invalid={Boolean(formErrors.invoiceDate)} id="invoice-date" bind:value={form.invoiceDate} />{#if formErrors.invoiceDate}<div class="invalid-feedback">{formErrors.invoiceDate}</div>{/if}</div>
      <div class="col-sm-6"><label class="form-label" for="invoice-due-date">{$locale.invoices.dueDate}</label><ShamsiDatePicker invalid={Boolean(formErrors.dueDate)} id="invoice-due-date" bind:value={form.dueDate} />{#if formErrors.dueDate}<div class="invalid-feedback">{formErrors.dueDate}</div>{/if}</div>
      <div class="col-12"><label class="form-label" for="invoice-notes">{$locale.invoices.notes}</label><textarea class="form-control" id="invoice-notes" rows="2" bind:value={form.notes}></textarea></div>
    </div></fieldset>
    <fieldset>
      <div class="items-heading">
        <legend class="section-label">{$locale.invoices.items}</legend>
        <button class="btn btn-outline-primary btn-sm" type="button" on:click={addItem}><i class="bi bi-plus-lg" aria-hidden="true"></i>{$locale.invoices.addItem}</button>
      </div>
      <div class="table-responsive">
        <table class="table items-table">
          <thead><tr><th>{$locale.invoices.type}</th><th>{$locale.invoices.itemDescription}</th><th>{$locale.invoices.quantity}</th><th>{$locale.invoices.unitPrice}</th><th>{$locale.invoices.lineCurrency}</th><th>{$locale.invoices.amount}</th><th><span class="visually-hidden">{$locale.invoices.removeItem}</span></th></tr></thead>
          <tbody>
            {#each form.items as item, index (index)}
              <tr class:utility-item={Boolean(item.meterReadingId)}>
                <td>
                  <select class="form-select" value={item.type} on:change={(event) => typeChanged(index, event.currentTarget.value)}>
                    {#each ITEM_TYPES as type (type)}<option value={type}>{itemTypeLabel(type)}</option>{/each}
                  </select>
                </td>
                <td>
                  {#if UTILITY_TYPES.includes(item.type) && !editingId}
                    <!-- A utility charge is a reading, so what is chosen here is
                         which reading; the amount is the reading's own. -->
                    <select class="form-select" value={item.meterReadingId || ''} on:change={(event) => readingChanged(index, event.currentTarget.value)}>
                      <option value="">{readingsLoading ? $locale.invoices.loadingUtilities : $locale.invoices.selectReading}</option>
                      {#each availableReadings(item.type, index) as reading (reading.id)}<option value={reading.id}>{readingLabel(reading)}</option>{/each}
                    </select>
                    {#if item.description}<small class="reading-detail">{item.description}</small>{/if}
                  {:else}
                    <input class:is-invalid={formErrors[`item-${index}-description`]} class="form-control" bind:value={item.description} disabled={Boolean(item.meterReadingId)} />
                    {#if formErrors[`item-${index}-description`]}<div class="invalid-feedback">{formErrors[`item-${index}-description`]}</div>{/if}
                  {/if}
                </td>
                <td>
                  <input class:is-invalid={formErrors[`item-${index}-quantity`]} class="form-control" type="number" min="0.001" step="0.001" bind:value={item.quantity} disabled={Boolean(item.meterReadingId) || item.type === 'SERVICE_FEE'} />
                  {#if formErrors[`item-${index}-quantity`]}<div class="invalid-feedback">{formErrors[`item-${index}-quantity`]}</div>{/if}
                </td>
                <td>
                  <input class:is-invalid={formErrors[`item-${index}-unitPrice`]} class="form-control" type="number" min="0" step="0.01" bind:value={item.unitPrice} disabled={Boolean(item.meterReadingId) || item.type === 'SERVICE_FEE'} />
                  {#if formErrors[`item-${index}-unitPrice`]}<div class="invalid-feedback">{formErrors[`item-${index}-unitPrice`]}</div>{/if}
                </td>
                <td class="line-currency">{lineCurrency(item)}</td>
                <td class="amount-cell">
                  {formatMoney(itemAmount(item), lineCurrency(item))}
                  {#if lineCurrency(item) !== $baseCurrency}<small class="cell-sub">{formatMoney(baseAmountOf(item), $baseCurrency)}</small>{/if}
                </td>
                <td><button class="icon-button danger" type="button" on:click={() => removeItem(index)} disabled={form.items.length === 1} aria-label={$locale.invoices.removeItem}><i class="bi bi-trash3" aria-hidden="true"></i></button></td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
      {#if hasForeignLine}
        <p class="field-hint">{translate('invoices.mixedCurrencyHint', { currency: $baseCurrency })}</p>
      {/if}
      <div class="invoice-preview"><span>{$locale.invoices.subtotal}</span><strong>{formatMoney(previewTotal, $baseCurrency)}</strong><span>{$locale.invoices.total}</span><strong>{formatMoney(previewTotal, $baseCurrency)}</strong></div>
    </fieldset>
  </form>
  <div slot="footer">
    <button class="btn btn-light" type="button" on:click={closeModal} disabled={saving}>{$locale.invoices.cancel}</button>
    <button class="btn btn-primary" type="submit" form="invoice-form" disabled={saving}>{saving ? $locale.invoices.loading : editingId ? $locale.invoices.update : $locale.invoices.save}</button>
  </div>
</Modal>

<!-- Details Modal -->
<Modal bind:open={detailsOpen} title={$locale.invoices.invoiceDetails} description={$locale.invoices.description} icon="bi-receipt" size="modal-lg" closeLabel={$locale.common.close} on:close={closeDetails}>
  {#if detailsInvoice}
    <p class="details-eyebrow">{detailsInvoice.invoiceNumber}</p>
    <dl class="invoice-meta"><div><dt>{$locale.invoices.tenant}</dt><dd>{tenantName(detailsInvoice.lease)}</dd></div><div><dt>{$locale.invoices.contractNumber}</dt><dd>{detailsInvoice.lease.contractNumber}</dd></div><div><dt>{$locale.invoices.building}</dt><dd>{detailsInvoice.lease.apartment.floor.building.name}</dd></div><div><dt>{$locale.invoices.floor}</dt><dd>{detailsInvoice.lease.apartment.floor.name || detailsInvoice.lease.apartment.floor.floorNumber}</dd></div><div><dt>{$locale.invoices.apartment}</dt><dd>{detailsInvoice.lease.apartment.apartmentNumber}</dd></div><div><dt>{$locale.invoices.status}</dt><dd><StatusBadge label={statusLabel(detailsInvoice.status)} tone={statusTone(detailsInvoice.status)} /></dd></div><div><dt>{$locale.invoices.invoiceDate}</dt><dd>{formatShortDate(detailsInvoice.invoiceDate)}</dd></div><div><dt>{$locale.invoices.dueDate}</dt><dd>{formatShortDate(detailsInvoice.dueDate)}</dd></div></dl>
    <div class="table-responsive"><table class="table items-table"><thead><tr><th>{$locale.invoices.itemDescription}</th><th>{$locale.invoices.type}</th><th>{$locale.invoices.quantity}</th><th>{$locale.invoices.unitPrice}</th><th>{$locale.invoices.amount}</th><th>{$locale.invoices.paid}</th><th>{$locale.invoices.balance}</th><th>{$locale.invoices.status}</th></tr></thead><tbody>{#each detailsInvoice.items as item (item.id)}<tr><td>{item.description}</td><td>{itemTypeLabel(item.type)}</td><td class="amount-cell">{item.quantity}</td><td class="amount-cell">{formatMoney(item.unitPrice, item.currency || detailsInvoice.currency)}</td><td class="amount-cell">{formatMoney(item.amount, item.currency || detailsInvoice.currency)}</td><td class="amount-cell">{formatMoney(item.paidAmount || 0, item.currency || detailsInvoice.currency)}</td><td class="amount-cell">{formatMoney(item.balance != null ? item.balance : item.amount, item.currency || detailsInvoice.currency)}</td><td><StatusBadge label={statusLabel(item.paymentStatus || 'UNPAID')} tone={statusTone(item.paymentStatus || 'UNPAID')} /></td></tr>{/each}</tbody></table></div>
    <div class="invoice-summary"><span>{$locale.invoices.subtotal}<strong>{formatMoney(detailsInvoice.subtotal, detailsInvoice.currency)}</strong></span><span>{$locale.invoices.paid}<strong>{formatMoney(detailsInvoice.paidAmount, detailsInvoice.currency)}</strong></span><span>{$locale.invoices.balance}<strong>{formatMoney(detailsInvoice.total - detailsInvoice.paidAmount, detailsInvoice.currency)}</strong></span><span>{$locale.invoices.total}<strong>{formatMoney(detailsInvoice.total, detailsInvoice.currency)}</strong></span>{#if detailsInvoice.currency !== $baseCurrency}<span>{$locale.currencies.baseRate}<strong>{formatMoney(detailsInvoice.baseTotal, $baseCurrency)}</strong></span>{/if}</div>
  {/if}
  <div slot="footer">
    {#if detailsInvoice?.status !== 'PAID' && detailsInvoice?.status !== 'CANCELLED'}
      <button class="btn btn-primary" type="button" on:click={() => { openReceivePayment(detailsInvoice); closeDetails(); }}>
        <i class="bi bi-credit-card-2-front" aria-hidden="true"></i>{$locale.payments.receivePayment}
      </button>
    {/if}
    <button class="btn btn-light" type="button" on:click={closeDetails}>{$locale.common.close}</button>
  </div>
</Modal>

<ReceivePaymentModal open={paymentModalOpen} invoice={paymentInvoice} on:close={closeReceivePayment} on:saved={async () => { notifySuccess($locale.payments.saved); closeReceivePayment(); await loadInvoices(pagination.page); }} />

<style>
  .cell-sub { display: block; color: var(--text-muted); font-size: var(--text-xs); font-weight: var(--weight-medium); }
  .tenant-name { color: var(--text-strong); font-weight: var(--weight-bold); }
  .invoice-types { max-inline-size: 15rem; white-space: normal; }
  .invoice-number { font-family: var(--font-data); font-variant-numeric: tabular-nums; font-weight: var(--weight-bold); color: var(--text-strong); }
  .items-heading { display: flex; align-items: center; justify-content: space-between; gap: 1rem; margin-block-end: 0.5rem; }
  .items-heading .section-label { margin: 0; }
  .items-table { min-inline-size: 50rem; }
  .items-table .form-control, .items-table .form-select { min-inline-size: 7rem; }
  /* A line billed from a reading is not typed: it is the reading, so it reads
     back as one with the rest of its own figures beside it. */
  .items-table :global(tr.utility-item) { background: var(--surface-muted); }
  .reading-detail { display: block; margin-block-start: 0.25rem; color: var(--text-muted); font-size: var(--text-xs); }
  /* The currency a charge is stated in: not a control, just the fact that says
     what the amount beside it means. */
  .line-currency { color: var(--text-secondary); font-size: var(--text-sm); font-weight: var(--weight-bold); letter-spacing: var(--tracking-wide); }
  .invoice-preview, .invoice-summary { display: flex; align-items: center; justify-content: flex-end; gap: 0.6rem 1rem; flex-wrap: wrap; margin-block-start: 1rem; color: var(--text-muted); font-size: var(--text-sm); }
  .invoice-preview strong, .invoice-summary strong { color: var(--text-strong); font-family: var(--font-data); font-variant-numeric: tabular-nums; }
  .invoice-summary span { display: grid; gap: 0.18rem; min-inline-size: 8rem; }
  .details-eyebrow { margin: 0 0 0.75rem; color: var(--text-muted); font-size: var(--text-xs); font-weight: var(--weight-heavy); letter-spacing: var(--tracking-wide); text-transform: uppercase; }

  .invoice-meta { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 1rem; margin-block-end: 1.25rem; }
  .invoice-meta div { min-width: 0; }
  .invoice-meta dt { color: var(--text-muted); font-size: var(--text-xs); font-weight: var(--weight-heavy); }
  .invoice-meta dd { margin: 0.2rem 0 0; color: var(--text-strong); font-size: var(--text-sm); font-weight: var(--weight-bold); }
  @media (max-width: 575.98px) { .invoice-meta { grid-template-columns: 1fr; } }
</style>
