<script>
  import { onDestroy, onMount } from 'svelte';
  import { api } from '../services/api';
  import { listApartments } from '../services/apartments';
  import { listFloors } from '../services/floors';
  import { listLeases } from '../services/leases';
  import { cancelInvoice, createInvoice, deleteInvoice, getInvoice, listInvoices, updateInvoice } from '../services/invoices';
  import PageLayout from '../components/ui/PageLayout.svelte';
  import DataTable from '../components/ui/DataTable.svelte';
  import PageToolbar from '../components/ui/PageToolbar.svelte';
  import TabFilters from '../components/ui/TabFilters.svelte';
  import Checkbox from '../components/ui/Checkbox.svelte';
  import Pagination from '../components/ui/Pagination.svelte';
  import Modal from '../components/ui/Modal.svelte';
  import BuildingSelect from '../components/buildings/BuildingSelect.svelte';
  import StatusBadge from '../components/ui/StatusBadge.svelte';
  import ReceivePaymentModal from '../components/payments/ReceivePaymentModal.svelte';
  import { locale, translate } from '../i18n';
  import { activeCurrencies, baseCurrency, convertAmount } from '../stores/currency';
  import { debounce } from '../utils/debounce';
  import { createSelection, isAllSelected, isSomeSelected, toggleAllSelected, toggleSelected } from '../utils/selection';
  import { formatMoney } from '../utils/formatters';

  const ITEM_TYPES = ['RENT', 'ELECTRICITY', 'WATER', 'GAS', 'OTHER'];
  const STATUSES = ['UNPAID', 'PARTIALLY_PAID', 'PAID', 'OVERDUE', 'CANCELLED'];
  const newItem = () => ({ type: 'RENT', description: '', quantity: 1, unitPrice: '' });
  const emptyForm = () => ({ buildingId: '', floorId: '', apartmentId: '', leaseId: '', invoiceDate: new Date().toISOString().slice(0, 10), dueDate: '', currency: '', notes: '', items: [newItem()] });

  let invoices = [];
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
  let floors = [];
  let apartments = [];
  let leases = [];
  // The invoice's currency. Left empty it means the organization's reporting
  // currency, which is what a single-currency organization always gets.
  $: formCurrency = form.currency || $baseCurrency;
  let loading = false;
  let saving = false;
  let errorMessage = '';
  let noticeMessage = '';
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

  onMount(async () => { try { await loadBuildings(); await loadInvoices(1); } catch (error) { await handleRequestError(error); } });

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
  function openCreate() { editingId = null; floors = []; apartments = []; leases = []; form = { ...emptyForm(), currency: $baseCurrency }; modalError = ''; formErrors = {}; modalOpen = true; }

  async function loadFloors(buildingId) { floors = buildingId ? ((await listFloors({ buildingId, page: 1, pageSize: 100 })).items || []) : []; }
  async function loadApartments(floorId) { apartments = floorId ? ((await listApartments({ floorId, page: 1, pageSize: 100 })).items || []) : []; }
  async function loadLeases(apartmentId, selectedLease = null) { leases = apartmentId ? ((await listLeases({ apartmentId, page: 1, pageSize: 100 })).items || []) : []; if (selectedLease && !leases.some((l) => l.id === selectedLease.id)) { leases = [selectedLease, ...leases]; } }

  async function buildingChanged() { form = { ...form, floorId: '', apartmentId: '', leaseId: '' }; apartments = []; leases = []; try { await loadFloors(form.buildingId); } catch (error) { modalError = error.message; } }
  async function floorChanged() { form = { ...form, apartmentId: '', leaseId: '' }; leases = []; try { await loadApartments(form.floorId); } catch (error) { modalError = error.message; } }
  async function apartmentChanged() { form = { ...form, leaseId: '' }; try { await loadLeases(form.apartmentId); } catch (error) { modalError = error.message; } }
  function selectedLease() { return leases.find((l) => l.id === form.leaseId); }
  /*
   * Picking a lease adopts that lease's terms: the rent it charges and the
   * currency it is stated in. A USD lease therefore raises a USD invoice, which
   * the server then prices at the rate in force for the invoice date.
   */
  function leaseChanged() {
    const lease = selectedLease();
    if (!lease) return;
    const patch = lease.currency ? { currency: lease.currency } : {};
    if (form.items.length === 1 && form.items[0].type === 'RENT') patch.items = [{ ...form.items[0], unitPrice: lease.monthlyRent }];
    if (Object.keys(patch).length) form = { ...form, ...patch };
  }
  function addItem() { form = { ...form, items: [...form.items, newItem()] }; }
  function removeItem(index) { if (form.items.length === 1) return; form = { ...form, items: form.items.filter((_, i) => i !== index) }; }

  async function openEdit(invoice) {
    try {
      const response = await getInvoice(invoice.id);
      const fi = response.invoice;
      const lease = fi.lease; const apartment = lease.apartment; const floor = apartment.floor;
      editingId = fi.id; modalError = ''; formErrors = {}; modalOpen = true;
      form = { buildingId: floor.building.id, floorId: '', apartmentId: '', leaseId: '', invoiceDate: fi.invoiceDate.slice(0, 10), dueDate: fi.dueDate ? fi.dueDate.slice(0, 10) : '', currency: fi.currency || $baseCurrency, notes: fi.notes || '', items: fi.items.map((item) => ({ type: item.type, description: item.description, quantity: item.quantity, unitPrice: item.unitPrice })) };
      await loadFloors(floor.building.id); form = { ...form, floorId: floor.id };
      await loadApartments(floor.id); form = { ...form, apartmentId: apartment.id };
      await loadLeases(apartment.id, lease); form = { ...form, leaseId: lease.id };
    } catch (error) { await handleRequestError(error); modalError = error.message; }
  }

  async function openDetails(invoice) { try { detailsInvoice = (await getInvoice(invoice.id)).invoice; detailsOpen = true; } catch (error) { await handleRequestError(error); } }
  function closeDetails() { detailsOpen = false; detailsInvoice = null; }
  function openReceivePayment(invoice) { paymentInvoice = invoice; paymentModalOpen = true; }
  function closeReceivePayment() { paymentModalOpen = false; paymentInvoice = null; }

  function validateForm() {
    const copy = $locale.invoices; const errors = {};
    if (!form.leaseId) errors.leaseId = translate('invoices.required', { field: copy.lease });
    if (!form.invoiceDate) errors.invoiceDate = translate('invoices.required', { field: copy.invoiceDate });
    if (form.dueDate && form.dueDate < form.invoiceDate) errors.dueDate = copy.invalidDates;
    form.items.forEach((item, index) => {
      if (!item.description.trim()) errors[`item-${index}-description`] = translate('invoices.required', { field: copy.itemDescription });
      if (Number(item.quantity) <= 0) errors[`item-${index}-quantity`] = copy.positiveQuantity;
      if (item.unitPrice === '' || Number(item.unitPrice) < 0) errors[`item-${index}-unitPrice`] = copy.notNegative;
    });
    formErrors = errors;
    return Object.keys(errors).length === 0;
  }

  function itemAmount(item) { return (Number(item.quantity) || 0) * (Number(item.unitPrice) || 0); }
  $: previewTotal = form.items.reduce((total, item) => total + itemAmount(item), 0);
  // What the invoice adds up to in the reporting currency, at today's rate — the
  // rate is resolved and frozen by the server when the invoice is posted.
  $: previewBaseTotal = convertAmount(previewTotal, formCurrency, $baseCurrency, $activeCurrencies, $baseCurrency);
  $: formRate = convertAmount(1, formCurrency, $baseCurrency, $activeCurrencies, $baseCurrency);

  async function saveInvoice() {
    if (!validateForm()) return;
    saving = true; modalError = ''; errorMessage = ''; noticeMessage = '';
    const payload = { invoiceDate: form.invoiceDate, dueDate: form.dueDate || null, currency: formCurrency, notes: form.notes.trim() || null, items: form.items.map((item) => ({ type: item.type, description: item.description.trim(), quantity: Number(item.quantity), unitPrice: Number(item.unitPrice) })) };
    try {
      if (editingId) { await updateInvoice(editingId, payload); noticeMessage = $locale.invoices.updated; }
      else { await createInvoice({ leaseId: form.leaseId, ...payload }); noticeMessage = $locale.invoices.saved; }
      resetModal(); await loadInvoices(1);
    } catch (error) {
      if (await handleRequestError(error)) return;
      if (error.data?.errors) { formErrors = Object.fromEntries(Object.entries(error.data.errors).map(([field, messages]) => [field, messages[0]])); }
      else { modalError = error.message; }
    } finally { saving = false; }
  }

  async function removeInvoice(invoice) {
    if (!window.confirm($locale.invoices.confirmDelete)) return;
    errorMessage = ''; noticeMessage = '';
    try { await deleteInvoice(invoice.id); noticeMessage = $locale.invoices.deleted; await loadInvoices(invoices.length === 1 && pagination.page > 1 ? pagination.page - 1 : pagination.page); }
    catch (error) { await handleRequestError(error); }
  }

  async function cancelExistingInvoice(invoice) {
    if (!window.confirm($locale.invoices.confirmCancel)) return;
    errorMessage = ''; noticeMessage = '';
    try { await cancelInvoice(invoice.id); noticeMessage = $locale.invoices.cancelledSuccess; await loadInvoices(pagination.page); }
    catch (error) { await handleRequestError(error); }
  }

  const itemTypeLabel = (type) => $locale.invoices[type.toLowerCase()];
  const statusLabel = (status) => $locale.invoices[status.toLowerCase().replace('_', '')];
  const statusTone = (status) => ({ PAID: 'success', PARTIALLY_PAID: 'warning', OVERDUE: 'danger', CANCELLED: 'neutral', UNPAID: 'info' }[status] || 'neutral');
  const tenantName = (lease) => `${lease.tenant.firstName} ${lease.tenant.lastName}`.trim();
  const leaseLabel = (lease) => `${lease.contractNumber} — ${tenantName(lease)}`;
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
          <input class="form-control" id="invoice-filter-from" type="date" bind:value={filters.dateFrom} on:change={() => loadInvoices(1)} />
        </div>
        <div class="filters-field">
          <label class="filters-field-label" for="invoice-filter-to">{$locale.invoices.dateTo}</label>
          <input class="form-control" id="invoice-filter-to" type="date" bind:value={filters.dateTo} on:change={() => loadInvoices(1)} />
        </div>
      </svelte:fragment>
    </PageToolbar>
  </svelte:fragment>

  <svelte:fragment slot="alerts">
    {#if errorMessage}<div class="alert alert-danger" role="alert">{errorMessage}</div>{/if}
    {#if noticeMessage}<div class="alert alert-success" role="status">{noticeMessage}</div>{/if}
  </svelte:fragment>

  <svelte:fragment slot="content">
    <DataTable loading={loading} isEmpty={invoices.length === 0} loadingLabel={$locale.invoices.loading} emptyLabel={$locale.invoices.empty} emptyIcon="bi-receipt" className="invoices-table" minTableWidth="88rem" showFooter={!loading && invoices.length > 0}>
      <button slot="empty-action" class="btn btn-primary" type="button" on:click={openCreate}>{$locale.invoices.add}</button>
      <thead><tr>
        <th class="select-column"><Checkbox checked={allRowsSelected} indeterminate={someRowsSelected} label={$locale.common.selectAll} on:change={toggleAllRows} /></th>
        <th>{$locale.invoices.invoiceNumber}</th><th>{$locale.invoices.invoiceDate}</th><th>{$locale.invoices.dueDate}</th><th>{$locale.invoices.type}</th><th>{$locale.invoices.tenant}</th><th>{$locale.invoices.building}</th><th>{$locale.invoices.apartment}</th><th>{$locale.invoices.contractNumber}</th><th>{$locale.invoices.total}</th><th>{$locale.invoices.paid}</th><th>{$locale.invoices.balance}</th><th>{$locale.invoices.status}</th><th><span class="visually-hidden">{$locale.invoices.view}</span></th>
      </tr></thead>
      <tbody>{#each invoices as invoice (invoice.id)}
        <tr class:is-selected={selectedIds.has(invoice.id)}>
          <td class="select-column"><Checkbox checked={selectedIds.has(invoice.id)} label={$locale.common.selectRow} on:change={() => toggleRow(invoice.id)} /></td>
          <td class="invoice-number">{invoice.invoiceNumber}</td><td class="date-cell">{invoice.invoiceDate.slice(0, 10)}</td><td class="date-cell">{invoice.dueDate ? invoice.dueDate.slice(0, 10) : '—'}</td><td class="invoice-types">{invoiceTypes(invoice)}</td><td class="tenant-name">{tenantName(invoice.lease)}</td><td>{invoice.lease.apartment.floor.building.name}</td><td><strong>{invoice.lease.apartment.apartmentNumber}</strong>{#if invoice.lease.apartment.name}<small class="cell-sub">{invoice.lease.apartment.name}</small>{/if}</td><td>{invoice.lease.contractNumber}</td><td class="amount-cell">{formatMoney(invoice.total, invoice.currency)}</td><td class="amount-cell">{formatMoney(invoice.paidAmount, invoice.currency)}</td><td class="amount-cell">{formatMoney(invoice.total - invoice.paidAmount, invoice.currency)}</td><td><StatusBadge label={statusLabel(invoice.status)} tone={statusTone(invoice.status)} /></td>
          <td class="actions-cell"><button class="icon-button" type="button" on:click={() => openDetails(invoice)} aria-label={$locale.invoices.view}><i class="bi bi-eye" aria-hidden="true"></i></button>{#if invoice.status !== 'PAID' && invoice.status !== 'CANCELLED'}<button class="icon-button" type="button" on:click={() => openReceivePayment(invoice)} aria-label={$locale.payments.receivePayment}><i class="bi bi-credit-card-2-front" aria-hidden="true"></i></button>{/if}<button class="icon-button" type="button" on:click={() => openEdit(invoice)} aria-label={$locale.invoices.edit} disabled={invoice.status === 'CANCELLED'}><i class="bi bi-pencil" aria-hidden="true"></i></button>{#if invoice.status !== 'CANCELLED'}<button class="icon-button warning" type="button" on:click={() => cancelExistingInvoice(invoice)} aria-label={$locale.invoices.cancelInvoice}><i class="bi bi-x-circle" aria-hidden="true"></i></button>{/if}<button class="icon-button danger" type="button" on:click={() => removeInvoice(invoice)} aria-label={$locale.invoices.delete}><i class="bi bi-trash3" aria-hidden="true"></i></button></td>
        </tr>
      {/each}</tbody>
    </DataTable>
  </svelte:fragment>

  <svelte:fragment slot="footer">
    <Pagination page={pagination.page} totalPages={pagination.totalPages} previousLabel={$locale.invoices.previous} nextLabel={$locale.invoices.next} label={$locale.invoices.page.replace('{page}', pagination.page).replace('{totalPages}', pagination.totalPages)} summary={resultSummary} onPage={loadInvoices} />
  </svelte:fragment>
</PageLayout>

<!-- Create/Edit Modal -->
<Modal bind:open={modalOpen} title={editingId ? $locale.invoices.edit : $locale.invoices.add} busy={saving} size="modal-xl" closeLabel={$locale.invoices.cancel} on:close={closeModal}>
  <form id="invoice-form" on:submit|preventDefault={saveInvoice} novalidate>
    {#if modalError}<div class="alert alert-danger" role="alert">{modalError}</div>{/if}
    <fieldset><legend class="section-label">{$locale.invoices.location}</legend><div class="row g-3">
      <div class="col-sm-6 col-lg-3"><BuildingSelect selectId="invoice-building" label={$locale.invoices.building} buildings={buildings} bind:value={form.buildingId} on:change={buildingChanged} placeholder={$locale.invoices.selectBuilding} disabled={Boolean(editingId)} /></div>
      <div class="col-sm-6 col-lg-3"><label class="form-label" for="invoice-floor">{$locale.invoices.floor}</label><select class="form-select" id="invoice-floor" bind:value={form.floorId} on:change={floorChanged} disabled={!form.buildingId || Boolean(editingId)}><option value="">{$locale.invoices.selectFloor}</option>{#each floors as floor (floor.id)}<option value={floor.id}>{floor.name || floor.floorNumber}</option>{/each}</select></div>
      <div class="col-sm-6 col-lg-3"><label class="form-label" for="invoice-apartment">{$locale.invoices.apartment}</label><select class="form-select" id="invoice-apartment" bind:value={form.apartmentId} on:change={apartmentChanged} disabled={!form.floorId || Boolean(editingId)}><option value="">{$locale.invoices.selectApartment}</option>{#each apartments as apartment (apartment.id)}<option value={apartment.id}>{apartment.apartmentNumber}{apartment.name ? ` — ${apartment.name}` : ''}</option>{/each}</select></div>
      <div class="col-sm-6 col-lg-3"><label class="form-label" for="invoice-lease">{$locale.invoices.lease}</label><select class:is-invalid={formErrors.leaseId} class="form-select" id="invoice-lease" bind:value={form.leaseId} on:change={leaseChanged} disabled={!form.apartmentId || Boolean(editingId)}><option value="">{$locale.invoices.selectLease}</option>{#each leases as lease (lease.id)}<option value={lease.id}>{leaseLabel(lease)}</option>{/each}</select>{#if formErrors.leaseId}<div class="invalid-feedback">{formErrors.leaseId}</div>{/if}</div>
    </div></fieldset>
    <fieldset><legend class="section-label">{$locale.invoices.details}</legend><div class="row g-3">
      <div class="col-sm-6"><label class="form-label" for="invoice-date">{$locale.invoices.invoiceDate}</label><input class:is-invalid={formErrors.invoiceDate} class="form-control" id="invoice-date" type="date" bind:value={form.invoiceDate} />{#if formErrors.invoiceDate}<div class="invalid-feedback">{formErrors.invoiceDate}</div>{/if}</div>
      <div class="col-sm-6"><label class="form-label" for="invoice-due-date">{$locale.invoices.dueDate}</label><input class:is-invalid={formErrors.dueDate} class="form-control" id="invoice-due-date" type="date" bind:value={form.dueDate} />{#if formErrors.dueDate}<div class="invalid-feedback">{formErrors.dueDate}</div>{/if}</div>
      <div class="col-sm-6"><label class="form-label" for="invoice-currency">{$locale.currencies.currency}</label><select class="form-select" id="invoice-currency" bind:value={form.currency}>{#each $activeCurrencies as currency (currency.id)}<option value={currency.code}>{currency.code} — {currency.name}</option>{/each}</select></div>
      <div class="col-sm-6"><label class="form-label" for="invoice-notes">{$locale.invoices.notes}</label><textarea class="form-control" id="invoice-notes" rows="2" bind:value={form.notes}></textarea></div>
      {#if formCurrency !== $baseCurrency}
        <div class="col-12">
          <p class="currency-preview">
            1 {formCurrency} = {formatMoney(formRate, $baseCurrency)} — {$locale.currencies.rateDateHint}
          </p>
        </div>
      {/if}
    </div></fieldset>
    <fieldset><div class="items-heading"><legend class="section-label">{$locale.invoices.items}</legend><button class="btn btn-outline-primary btn-sm" type="button" on:click={addItem}><i class="bi bi-plus-lg" aria-hidden="true"></i>{$locale.invoices.addItem}</button></div><div class="table-responsive"><table class="table items-table"><thead><tr><th>{$locale.invoices.type}</th><th>{$locale.invoices.itemDescription}</th><th>{$locale.invoices.quantity}</th><th>{$locale.invoices.unitPrice}</th><th>{$locale.invoices.amount}</th><th><span class="visually-hidden">{$locale.invoices.removeItem}</span></th></tr></thead><tbody>{#each form.items as item, index (index)}<tr><td><select class="form-select" bind:value={item.type}>{#each ITEM_TYPES as type (type)}<option value={type}>{itemTypeLabel(type)}</option>{/each}</select></td><td><input class:is-invalid={formErrors[`item-${index}-description`]} class="form-control" bind:value={item.description} />{#if formErrors[`item-${index}-description`]}<div class="invalid-feedback">{formErrors[`item-${index}-description`]}</div>{/if}</td><td><input class:is-invalid={formErrors[`item-${index}-quantity`]} class="form-control" type="number" min="0.001" step="0.001" bind:value={item.quantity} />{#if formErrors[`item-${index}-quantity`]}<div class="invalid-feedback">{formErrors[`item-${index}-quantity`]}</div>{/if}</td><td><input class:is-invalid={formErrors[`item-${index}-unitPrice`]} class="form-control" type="number" min="0" step="0.01" bind:value={item.unitPrice} />{#if formErrors[`item-${index}-unitPrice`]}<div class="invalid-feedback">{formErrors[`item-${index}-unitPrice`]}</div>{/if}</td><td class="amount-cell">{formatMoney(itemAmount(item), formCurrency)}</td><td><button class="icon-button danger" type="button" on:click={() => removeItem(index)} disabled={form.items.length === 1} aria-label={$locale.invoices.removeItem}><i class="bi bi-trash3" aria-hidden="true"></i></button></td></tr>{/each}</tbody></table></div><div class="invoice-preview"><span>{$locale.invoices.subtotal}</span><strong>{formatMoney(previewTotal, formCurrency)}</strong><span>{$locale.invoices.total}</span><strong>{formatMoney(previewTotal, formCurrency)}</strong>{#if formCurrency !== $baseCurrency}<span>{$locale.currencies.baseRate}</span><strong>{formatMoney(previewBaseTotal, $baseCurrency)}</strong>{/if}</div></fieldset>
  </form>
  <div slot="footer">
    <button class="btn btn-light" type="button" on:click={closeModal} disabled={saving}>{$locale.invoices.cancel}</button>
    <button class="btn btn-primary" type="submit" form="invoice-form" disabled={saving}>{saving ? $locale.invoices.loading : editingId ? $locale.invoices.update : $locale.invoices.save}</button>
  </div>
</Modal>

<!-- Details Modal -->
<Modal bind:open={detailsOpen} title={$locale.invoices.invoiceDetails} size="modal-lg" closeLabel={$locale.common.close} on:close={closeDetails}>
  {#if detailsInvoice}
    <p class="details-eyebrow">{detailsInvoice.invoiceNumber}</p>
    <dl class="invoice-meta"><div><dt>{$locale.invoices.tenant}</dt><dd>{tenantName(detailsInvoice.lease)}</dd></div><div><dt>{$locale.invoices.contractNumber}</dt><dd>{detailsInvoice.lease.contractNumber}</dd></div><div><dt>{$locale.invoices.building}</dt><dd>{detailsInvoice.lease.apartment.floor.building.name}</dd></div><div><dt>{$locale.invoices.floor}</dt><dd>{detailsInvoice.lease.apartment.floor.name || detailsInvoice.lease.apartment.floor.floorNumber}</dd></div><div><dt>{$locale.invoices.apartment}</dt><dd>{detailsInvoice.lease.apartment.apartmentNumber}</dd></div><div><dt>{$locale.invoices.status}</dt><dd><StatusBadge label={statusLabel(detailsInvoice.status)} tone={statusTone(detailsInvoice.status)} /></dd></div><div><dt>{$locale.invoices.invoiceDate}</dt><dd>{detailsInvoice.invoiceDate.slice(0, 10)}</dd></div><div><dt>{$locale.invoices.dueDate}</dt><dd>{detailsInvoice.dueDate ? detailsInvoice.dueDate.slice(0, 10) : '—'}</dd></div></dl>
    <div class="table-responsive"><table class="table items-table"><thead><tr><th>{$locale.invoices.itemDescription}</th><th>{$locale.invoices.type}</th><th>{$locale.invoices.quantity}</th><th>{$locale.invoices.unitPrice}</th><th>{$locale.invoices.amount}</th><th>{$locale.invoices.paid}</th><th>{$locale.invoices.balance}</th><th>{$locale.invoices.status}</th></tr></thead><tbody>{#each detailsInvoice.items as item (item.id)}<tr><td>{item.description}</td><td>{itemTypeLabel(item.type)}</td><td class="amount-cell">{item.quantity}</td><td class="amount-cell">{formatMoney(item.unitPrice, detailsInvoice.currency)}</td><td class="amount-cell">{formatMoney(item.amount, detailsInvoice.currency)}</td><td class="amount-cell">{formatMoney(item.paidAmount || 0, detailsInvoice.currency)}</td><td class="amount-cell">{formatMoney(item.balance != null ? item.balance : item.amount, detailsInvoice.currency)}</td><td><StatusBadge label={statusLabel(item.paymentStatus || 'UNPAID')} tone={statusTone(item.paymentStatus || 'UNPAID')} /></td></tr>{/each}</tbody></table></div>
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

<ReceivePaymentModal open={paymentModalOpen} invoice={paymentInvoice} on:close={closeReceivePayment} on:saved={async () => { noticeMessage = $locale.payments.saved; closeReceivePayment(); await loadInvoices(pagination.page); }} />

<style>
  .cell-sub { display: block; color: var(--text-muted); font-size: var(--text-xs); font-weight: var(--weight-medium); }
  .tenant-name { color: var(--text-strong); font-weight: var(--weight-bold); }
  .invoice-types { max-inline-size: 15rem; white-space: normal; }
  .invoice-number { font-family: var(--font-data); font-variant-numeric: tabular-nums; font-weight: var(--weight-bold); color: var(--text-strong); }
  .icon-button.warning { color: var(--warning); }
  .icon-button.warning:hover { border-color: var(--warning-border); background: var(--warning-soft); }
  .items-heading { display: flex; align-items: center; justify-content: space-between; gap: 1rem; margin-block-end: 0.5rem; }
  .items-heading .section-label { margin: 0; }
  .items-table { min-inline-size: 50rem; }
  .items-table .form-control, .items-table .form-select { min-inline-size: 7rem; }
  .invoice-preview, .invoice-summary { display: flex; align-items: center; justify-content: flex-end; gap: 0.6rem 1rem; flex-wrap: wrap; margin-block-start: 1rem; color: var(--text-muted); font-size: var(--text-sm); }
  .invoice-preview strong, .invoice-summary strong { color: var(--text-strong); font-family: var(--font-data); font-variant-numeric: tabular-nums; }
  .invoice-summary span { display: grid; gap: 0.18rem; min-inline-size: 8rem; }
  .details-eyebrow { margin: 0 0 0.75rem; color: var(--text-muted); font-size: var(--text-xs); font-weight: var(--weight-heavy); letter-spacing: var(--tracking-wide); text-transform: uppercase; }
  .currency-preview { margin: 0; color: var(--text-secondary); font-size: var(--text-sm); }
  .invoice-meta { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 1rem; margin-block-end: 1.25rem; }
  .invoice-meta div { min-width: 0; }
  .invoice-meta dt { color: var(--text-muted); font-size: var(--text-xs); font-weight: var(--weight-heavy); }
  .invoice-meta dd { margin: 0.2rem 0 0; color: var(--text-strong); font-size: var(--text-sm); font-weight: var(--weight-bold); }
  @media (max-width: 575.98px) { .invoice-meta { grid-template-columns: 1fr; } }
</style>
