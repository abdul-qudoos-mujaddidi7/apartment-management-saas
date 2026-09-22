<script>
  import { onDestroy, onMount } from 'svelte';
  import { getPayment, listPayments, voidPayment } from '../services/payments';
  import PageLayout from '../components/ui/PageLayout.svelte';
  import DataTable from '../components/ui/DataTable.svelte';
  import Checkbox from '../components/ui/Checkbox.svelte';
  import PageToolbar from '../components/ui/PageToolbar.svelte';
  import Pagination from '../components/ui/Pagination.svelte';
  import Modal from '../components/ui/Modal.svelte';
  import StatusBadge from '../components/ui/StatusBadge.svelte';
  import ShamsiDatePicker from '../components/ui/ShamsiDatePicker.svelte';
  import { locale } from '../i18n';
  import { debounce } from '../utils/debounce';
  import { createSelection, isAllSelected, isSomeSelected, toggleAllSelected, toggleSelected } from '../utils/selection';
  import { formatMoney, formatShortDate } from '../utils/formatters';

  const tenantName = (payment) => `${payment.tenant?.firstName || ''} ${payment.tenant?.lastName || ''}`.trim() || '—';
  let payments = [];
  let pagination = { page: 1, pageSize: 10, total: 0, totalPages: 0 };
  let filters = { search: '', status: '', dateFrom: '', dateTo: '' };
  let loading = false;
  let errorMessage = '';
  let noticeMessage = '';
  let detailsPayment = null;
  let detailsOpen = false;
  let voidingPayment = null;
  let voidOpen = false;
  let voidReason = '';
  let modalError = '';
  let saving = false;

  const debouncedSearch = debounce(() => loadPayments(1), 250);
  onDestroy(() => debouncedSearch.cancel());
  function queueSearch() { debouncedSearch(); }

  onMount(async () => { try { await loadPayments(1); } catch (error) { await handleRequestError(error); } });

  async function handleRequestError(error) { if (error.status === 401) return true; errorMessage = error.message; return false; }

  async function loadPayments(page = pagination.page) {
    loading = true; errorMessage = '';
    try { const response = await listPayments({ page, pageSize: pagination.pageSize, ...filters }); payments = response.items || []; pagination = response.pagination; }
    catch (error) { await handleRequestError(error); }
    finally { loading = false; }
  }

  async function openDetails(payment) { try { detailsPayment = (await getPayment(payment.id)).payment; detailsOpen = true; } catch (error) { await handleRequestError(error); } }
  function closeDetails() { detailsOpen = false; detailsPayment = null; }
  function requestVoid(payment) { voidingPayment = payment; voidOpen = true; voidReason = ''; modalError = ''; }
  function closeVoid() { if (saving) return; voidOpen = false; voidingPayment = null; modalError = ''; }

  async function submitVoid() {
    if (!voidReason.trim()) { modalError = $locale.payments.voidReasonRequired; return; }
    saving = true;
    try { await voidPayment(voidingPayment.id, voidReason.trim()); noticeMessage = $locale.payments.voidedSuccess; closeVoid(); await loadPayments(pagination.page); }
    catch (error) { if (!(await handleRequestError(error))) modalError = error.message; }
    finally { saving = false; }
  }

  function paymentTone(status) { return status === 'POSTED' ? 'success' : 'danger'; }
  function paymentLabel(status) { return status === 'POSTED' ? $locale.payments.posted : $locale.payments.voided; }
  $: resultSummary = `${$locale.payments.title}: ${pagination.total}`;
  // Leading checkbox column — ids of the rows currently rendered.
  let selectedIds = createSelection();
  $: rowIds = payments.map((payment) => payment.id);
  $: allRowsSelected = isAllSelected(selectedIds, rowIds);
  $: someRowsSelected = isSomeSelected(selectedIds, rowIds);

  function toggleRow(id) { selectedIds = toggleSelected(selectedIds, id); }
  function toggleAllRows() { selectedIds = toggleAllSelected(selectedIds, rowIds); }

  // The filters live in the toolbar's panel, so the button carries the count.
  $: activeFilterCount = [filters.status, filters.dateFrom, filters.dateTo].filter(Boolean).length;
  function clearFilters() { filters = { ...filters, status: '', dateFrom: '', dateTo: '' }; loadPayments(1); }
</script>

<svelte:head><title>{$locale.payments.title} | {$locale.common.apartmentPro}</title></svelte:head>

<PageLayout>
  <svelte:fragment slot="toolbar">
    <PageToolbar
      bind:search={filters.search}
      searchPlaceholder={$locale.payments.search}
      showAdd={false}
      onSearch={queueSearch}
      filtersLabel={$locale.common.filters}
      filtersCount={activeFilterCount}
      filtersClearLabel={$locale.common.clearFilters}
      onClearFilters={clearFilters}
    >
      <svelte:fragment slot="filters">
        <div class="filters-field">
          <label class="filters-field-label" for="payment-filter-status">{$locale.payments.status}</label>
          <select class="form-select" id="payment-filter-status" bind:value={filters.status} on:change={() => loadPayments(1)}>
            <option value="">{$locale.payments.allStatuses}</option>
            <option value="POSTED">{$locale.payments.posted}</option>
            <option value="VOIDED">{$locale.payments.voided}</option>
          </select>
        </div>
        <div class="filters-field">
          <label class="filters-field-label" for="payment-filter-from">{$locale.payments.dateFrom}</label>
          <ShamsiDatePicker id="payment-filter-from" bind:value={filters.dateFrom} on:change={() => loadPayments(1)} />
        </div>
        <div class="filters-field">
          <label class="filters-field-label" for="payment-filter-to">{$locale.payments.dateTo}</label>
          <ShamsiDatePicker id="payment-filter-to" bind:value={filters.dateTo} on:change={() => loadPayments(1)} />
        </div>
      </svelte:fragment>
    </PageToolbar>
  </svelte:fragment>

  <svelte:fragment slot="alerts">
    {#if noticeMessage}<div class="alert alert-success" role="status">{noticeMessage}</div>{/if}
    {#if errorMessage}<div class="alert alert-danger" role="alert">{errorMessage}</div>{/if}
  </svelte:fragment>

  <svelte:fragment slot="content">
    <DataTable loading={loading} isEmpty={payments.length === 0} loadingLabel={$locale.payments.loading} emptyLabel={$locale.payments.empty} emptyIcon="bi-credit-card" minTableWidth="72rem" showFooter={!loading && payments.length > 0}>
      <thead><tr><th class="select-column"><Checkbox checked={allRowsSelected} indeterminate={someRowsSelected} label={$locale.common.selectAll} on:change={toggleAllRows} /></th><th>{$locale.payments.paymentNumber}</th><th>{$locale.payments.paymentDate}</th><th>{$locale.payments.tenant}</th><th>{$locale.payments.building}</th><th>{$locale.payments.apartment}</th><th>{$locale.payments.receiveInto}</th><th>{$locale.payments.method}</th><th>{$locale.payments.amount}</th><th>{$locale.payments.allocated}</th><th>{$locale.payments.unallocated}</th><th>{$locale.payments.status}</th><th><span class="visually-hidden">{$locale.payments.actions}</span></th></tr></thead>
      <tbody>{#each payments as payment (payment.id)}
        <tr class:is-selected={selectedIds.has(payment.id)}>
          <td class="select-column"><Checkbox checked={selectedIds.has(payment.id)} label={$locale.common.selectRow} on:change={() => toggleRow(payment.id)} /></td>
          <td><strong>{payment.paymentNumber}</strong></td><td class="date-cell">{formatShortDate(payment.paymentDate)}</td><td>{tenantName(payment)}</td><td>{payment.lease?.apartment?.floor?.building?.name || '—'}</td><td class="data-cell">{payment.lease?.apartment?.apartmentNumber || '—'}</td><td>{payment.receiveAccount.code} — {payment.receiveAccount.name}</td><td>{$locale.paymentMethods[payment.paymentMethod]}</td><td class="amount-cell">{formatMoney(payment.amount, payment.currency)}</td><td class="amount-cell">{formatMoney(payment.allocatedAmount, payment.currency)}</td><td class="amount-cell">{formatMoney(payment.unallocatedAmount, payment.currency)}</td><td><StatusBadge label={paymentLabel(payment.status)} tone={paymentTone(payment.status)} /></td>
          <td class="actions-cell"><button class="icon-button" type="button" on:click={() => openDetails(payment)} aria-label={$locale.payments.view}><i class="bi bi-eye" aria-hidden="true"></i></button>{#if payment.status === 'POSTED'}<button class="icon-button warning" type="button" on:click={() => requestVoid(payment)} aria-label={$locale.payments.void}><i class="bi bi-x-circle" aria-hidden="true"></i></button>{/if}</td>
        </tr>
      {/each}</tbody>
    </DataTable>
  </svelte:fragment>

  <svelte:fragment slot="footer">
    <Pagination page={pagination.page} totalPages={pagination.totalPages} label={$locale.payments.page.replace('{page}', pagination.page).replace('{totalPages}', pagination.totalPages)} previousLabel={$locale.payments.previous} nextLabel={$locale.payments.next} summary={resultSummary} onPage={loadPayments} />
  </svelte:fragment>
</PageLayout>

<!-- Details Modal -->
<Modal bind:open={detailsOpen} title={detailsPayment ? detailsPayment.paymentNumber : ''} size="modal-lg" closeLabel={$locale.common.close} on:close={closeDetails}>
  {#if detailsPayment}
    <dl class="payment-details"><div><dt>{$locale.payments.tenant}</dt><dd>{tenantName(detailsPayment)}</dd></div><div><dt>{$locale.payments.amount}</dt><dd>{formatMoney(detailsPayment.amount, detailsPayment.currency)}</dd></div><div><dt>{$locale.payments.status}</dt><dd><StatusBadge label={paymentLabel(detailsPayment.status)} tone={paymentTone(detailsPayment.status)} /></dd></div><div><dt>{$locale.payments.reference}</dt><dd>{detailsPayment.reference || '—'}</dd></div></dl>
    <h3 class="h6 mt-4">{$locale.payments.allocations}</h3>
    <div class="table-responsive"><table class="table"><thead><tr><th>{$locale.payments.invoice}</th><th>{$locale.payments.charge}</th><th class="text-end">{$locale.payments.amount}</th></tr></thead><tbody>{#each detailsPayment.allocations.filter(a => a.amount > 0) as allocation (allocation.id)}<tr><td>{allocation.invoiceItem.invoice.invoiceNumber}</td><td>{allocation.invoiceItem.description || allocation.invoiceItem.type}</td><td class="amount-cell text-end">{formatMoney(allocation.amount, detailsPayment.currency)}</td></tr>{/each}</tbody></table></div>
  {/if}
  <div slot="footer">
    <button class="btn btn-light" type="button" on:click={closeDetails}>{$locale.common.close}</button>
  </div>
</Modal>

<!-- Void Modal -->
<Modal bind:open={voidOpen} title={$locale.payments.void} busy={saving} closeLabel={$locale.payments.cancel} on:close={closeVoid}>
  <form id="void-payment-form" on:submit|preventDefault={submitVoid} novalidate>
    {#if modalError}<div class="alert alert-danger" role="alert">{modalError}</div>{/if}
    <p>{$locale.payments.confirmVoid}</p>
    <label class="form-label" for="void-reason">{$locale.payments.voidReason}</label>
    <textarea id="void-reason" class="form-control" rows="3" bind:value={voidReason}></textarea>
  </form>
  <div slot="footer">
    <button class="btn btn-light" type="button" on:click={closeVoid} disabled={saving}>{$locale.payments.cancel}</button>
    <button class="btn btn-danger" type="submit" form="void-payment-form" disabled={saving}>{saving ? $locale.payments.voiding : $locale.payments.void}</button>
  </div>
</Modal>

<style>
  .icon-button.warning { color: var(--warning); }
  .icon-button.warning:hover { border-color: var(--warning-border); background: var(--warning-soft); }
  .payment-details { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 1rem; }
  .payment-details dt { color: var(--text-muted); font-size: .8rem; }
  .payment-details dd { margin: .25rem 0 0; font-weight: 600; }
  @media (max-width: 767px) { .payment-details { grid-template-columns: 1fr; } }
</style>
