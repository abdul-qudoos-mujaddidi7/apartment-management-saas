<script>
  import PageLayout from '../components/ui/PageLayout.svelte';
  import PageToolbar from '../components/ui/PageToolbar.svelte';
  import DataTable from '../components/ui/DataTable.svelte';
  import Checkbox from '../components/ui/Checkbox.svelte';
  import Pagination from '../components/ui/Pagination.svelte';
  import Modal from '../components/ui/Modal.svelte';
  import BuildingSelect from '../components/buildings/BuildingSelect.svelte';
  import StatusBadge from '../components/ui/StatusBadge.svelte';
  import ActionButton from '../components/ui/ActionButton.svelte';
  import ShamsiDatePicker from '../components/ui/ShamsiDatePicker.svelte';
  import { formatShortDate } from '../utils/formatters';
  import { onMount } from 'svelte';

  import { api } from '../services/api';
  import { listFloors } from '../services/floors';
  import { listApartments } from '../services/apartments';
  import { listLeases, createLease, updateLease, deleteLease } from '../services/leases';
  import { activeCurrencies, baseCurrency, loadCurrencies } from '../stores/currency';
  import { locale } from '../i18n';
  import { createSelection, isAllSelected, isSomeSelected, toggleAllSelected, toggleSelected } from '../utils/selection';
  import { formatMoney } from '../utils/formatters';

  const blankForm = () => ({
    tenantId: '', buildingId: '', floorId: '', apartmentId: '',
    contractNumber: '', startDate: '', endDate: '',
    monthlyRent: '', securityDeposit: '0', paymentDueDay: '1',
    /* The currency the rent is stated in. Empty means the reporting currency,
       which is what every lease agreed before this field existed is in. */
    currency: '',
    status: 'DRAFT', notes: ''
  });

  let leases = [];
  let tenants = [];
  let buildings = [];
  let floors = [];
  let apartments = [];
  let loading = false;
  let saving = false;
  let optionsLoading = false;
  let modalOpen = false;
  let detail = null;
  let editing = null;
  let errorMessage = '';
  let noticeMessage = '';
  let modalError = '';
  let search = '';
  let pagination = { page: 1, pageSize: 10, total: 0, totalPages: 0 };
  let form = blankForm();

  onMount(async () => {
    try { await Promise.all([loadLeases(1), loadOptions()]); }
    catch (error) { errorMessage = error?.message || 'Unable to load leases.'; }
    // The currency list is supporting data: the page works without it.
    loadCurrencies().catch(() => {});
  });

  // The code the rent is read in, for the amount fields and the list.
  $: formCurrency = form.currency || $baseCurrency;

  async function loadLeases(page = pagination.page) {
    loading = true;
    errorMessage = '';
    try {
      const response = await listLeases({ page, pageSize: pagination.pageSize, search: search.trim() });
      leases = response.items;
      pagination = response.pagination;
    } catch (error) { errorMessage = error?.message || 'Unable to load leases.'; }
    finally { loading = false; }
  }

  async function loadOptions() {
    optionsLoading = true;
    try {
      const [tenantResponse, buildingResponse] = await Promise.all([
        api.get('/tenants?page=1&pageSize=100'),
        api.get('/buildings?page=1&pageSize=100')
      ]);
      tenants = tenantResponse.items || [];
      buildings = buildingResponse.items || [];
    } catch (error) { errorMessage = error?.message || 'Unable to load form options.'; }
    finally { optionsLoading = false; }
  }

  async function loadFloorsForBuilding(buildingId) {
    if (!buildingId) { floors = []; return; }
    const response = await listFloors({ buildingId, page: 1, pageSize: 100 });
    floors = response.items || [];
  }

  async function loadApartmentsForFloor(floorId) {
    if (!floorId) { apartments = []; return; }
    const response = await listApartments({ floorId, page: 1, pageSize: 100 });
    apartments = response.items || [];
  }

  async function buildingChanged() {
    form = { ...form, floorId: '', apartmentId: '' };
    floors = [];
    apartments = [];
    modalError = '';
    if (!form.buildingId) return;
    try { await loadFloorsForBuilding(form.buildingId); }
    catch (error) { modalError = error?.message || 'Unable to load floors.'; }
  }

  async function floorChanged() {
    form = { ...form, apartmentId: '' };
    apartments = [];
    modalError = '';
    if (!form.floorId) return;
    try { await loadApartmentsForFloor(form.floorId); }
    catch (error) { modalError = error?.message || 'Unable to load apartments.'; }
  }

  /*
   * Picking the apartment is what the rent is being agreed for, so the lease
   * adopts the currency that apartment's rent is stated in — the apartment was
   * let at 1,200 USD, so its lease is in USD. The currency stays a normal select
   * afterwards: a lease can be agreed in any currency the workspace trades in.
   */
  function apartmentChanged() {
    const apartment = apartments.find((entry) => entry.id === form.apartmentId);
    if (apartment?.rentCurrency) form = { ...form, currency: apartment.rentCurrency };
  }

  function openNew() {
    editing = null;
    // A new lease starts in the reporting currency, which is the common case.
    form = { ...blankForm(), currency: $baseCurrency };
    floors = [];
    apartments = [];
    modalError = '';
    errorMessage = '';
    noticeMessage = '';
    modalOpen = true;
  }

  async function openEdit(lease) {
    editing = lease;
    modalError = '';
    errorMessage = '';
    noticeMessage = '';
    const buildingId = lease.apartment.floor.building.id;
    const floorId = lease.apartment.floor.id;
    const apartmentId = lease.apartment.id;
    form = {
      ...blankForm(),
      tenantId: lease.tenant.id,
      buildingId, floorId: '', apartmentId: '',
      contractNumber: lease.contractNumber,
      startDate: lease.startDate.slice(0, 10),
      endDate: lease.endDate.slice(0, 10),
      monthlyRent: lease.monthlyRent,
      securityDeposit: lease.securityDeposit,
      currency: lease.currency || '',
      paymentDueDay: String(lease.paymentDueDay),
      status: lease.status,
      notes: lease.notes || ''
    };
    modalOpen = true;
    try {
      await loadFloorsForBuilding(buildingId);
      form = { ...form, floorId };
      await loadApartmentsForFloor(floorId);
      form = { ...form, apartmentId };
    } catch (error) { modalError = error?.message || 'Unable to load lease location.'; }
  }

  function closeModal() {
    if (saving) return;
    modalOpen = false;
    editing = null;
    modalError = '';
  }

  function validateForm() {
    if (!form.tenantId) return $locale.leases.tenant;
    if (!form.buildingId) return $locale.leases.building;
    if (!form.floorId) return $locale.leases.floor;
    if (!form.apartmentId) return $locale.leases.apartment;
    if (!form.contractNumber.trim()) return $locale.leases.contractNumber;
    if (!form.startDate || !form.endDate) return $locale.leases.period;
    if (new Date(form.startDate) >= new Date(form.endDate)) return 'End date must be after start date.';
    if (!Number.isFinite(Number(form.monthlyRent)) || Number(form.monthlyRent) <= 0) return $locale.leases.monthlyRent;
    if (!Number.isFinite(Number(form.securityDeposit)) || Number(form.securityDeposit) < 0) return $locale.leases.securityDeposit;
    const dueDay = Number(form.paymentDueDay);
    if (!Number.isInteger(dueDay) || dueDay < 1 || dueDay > 28) return $locale.leases.paymentDueDay;
    return '';
  }

  async function saveLease() {
    const validationError = validateForm();
    if (validationError) { modalError = validationError; return; }
    saving = true;
    modalError = '';
    errorMessage = '';
    noticeMessage = '';
    const payload = {
      tenantId: form.tenantId,
      apartmentId: form.apartmentId,
      contractNumber: form.contractNumber.trim(),
      startDate: form.startDate,
      endDate: form.endDate,
      monthlyRent: Number(form.monthlyRent),
      securityDeposit: Number(form.securityDeposit),
      currency: formCurrency,
      paymentDueDay: Number(form.paymentDueDay),
      status: form.status,
      notes: form.notes.trim() || null
    };
    try {
      if (editing) { await updateLease(editing.id, payload); noticeMessage = $locale.leases.updated; }
      else { await createLease(payload); noticeMessage = $locale.leases.saved; }
      closeModal();
      await loadLeases(1);
    } catch (error) { modalError = error?.message || 'Unable to save lease.'; }
    finally { saving = false; }
  }

  async function changeStatus(lease, status) {
    errorMessage = '';
    noticeMessage = '';
    try {
      await updateLease(lease.id, { status });
      noticeMessage = status === 'ACTIVE' ? $locale.leases.activated : $locale.leases.terminated;
      await loadLeases(pagination.page);
    } catch (error) { errorMessage = error?.message || 'Unable to update lease status.'; }
  }

  async function removeLease(lease) {
    if (!window.confirm($locale.leases.confirmDelete)) return;
    errorMessage = '';
    noticeMessage = '';
    try {
      await deleteLease(lease.id);
      const nextPage = leases.length === 1 && pagination.page > 1 ? pagination.page - 1 : pagination.page;
      await loadLeases(nextPage);
    } catch (error) { errorMessage = error?.message || 'Unable to delete lease.'; }
  }

  function statusTone(status) {
    switch (status) {
      case 'ACTIVE': return 'success';
      case 'DRAFT': return 'neutral';
      case 'EXPIRED': return 'warning';
      case 'TERMINATED': return 'danger';
      default: return 'neutral';
    }
  }

  function statusLabel(status) {
    switch (status) {
      case 'ACTIVE': return $locale.leases.active;
      case 'DRAFT': return $locale.leases.draft;
      case 'TERMINATED': return $locale.leases.terminate;
      default: return status;
    }
  }

  $: resultSummary = `${$locale.leases.title}: ${pagination.total}`;
  // Leading checkbox column — ids of the rows currently rendered.
  let selectedIds = createSelection();
  $: rowIds = leases.map((lease) => lease.id);
  $: allRowsSelected = isAllSelected(selectedIds, rowIds);
  $: someRowsSelected = isSomeSelected(selectedIds, rowIds);

  function toggleRow(id) { selectedIds = toggleSelected(selectedIds, id); }
  function toggleAllRows() { selectedIds = toggleAllSelected(selectedIds, rowIds); }
</script>

<svelte:head>
  <title>{$locale.leases.title} | {$locale.common.apartmentPro}</title>
</svelte:head>

<PageLayout>
  <svelte:fragment slot="toolbar">
    <PageToolbar
      bind:search
      searchPlaceholder={$locale.leases.search}
      onSearch={() => loadLeases(1)}
      addLabel={$locale.leases.new}
      onAdd={openNew}
    />
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
      isEmpty={leases.length === 0}
      loadingLabel={$locale.leases.loading}
      emptyLabel={$locale.leases.empty}
      emptyIcon="bi-file-earmark-text"
      minTableWidth="72rem"
      showFooter={!loading && leases.length > 0}
    >
      <ActionButton slot="empty-action" icon="bi-plus-lg" label={$locale.leases.new} on:click={openNew} />

      <thead>
        <tr>
          <th class="select-column"><Checkbox checked={allRowsSelected} indeterminate={someRowsSelected} label={$locale.common.selectAll} on:change={toggleAllRows} /></th>
          <th>{$locale.leases.contractNumber}</th>
          <th>{$locale.leases.tenant}</th>
          <th>{$locale.leases.building}</th>
          <th>{$locale.leases.floor}</th>
          <th>{$locale.leases.apartment}</th>
          <th>{$locale.leases.period}</th>
          <th>{$locale.leases.monthlyRent}</th>
          <th>{$locale.leases.status}</th>
          <th class="actions-heading"><span class="visually-hidden">{$locale.leases.details}</span></th>
        </tr>
      </thead>

      <tbody>
        {#each leases as lease (lease.id)}
          <tr class:is-selected={selectedIds.has(lease.id)}>
            <td class="select-column"><Checkbox checked={selectedIds.has(lease.id)} label={$locale.common.selectRow} on:change={() => toggleRow(lease.id)} /></td>
            <td class="contract-number">{lease.contractNumber}</td>
            <td class="tenant-name">{lease.tenant.firstName} {lease.tenant.lastName}</td>
            <td>{lease.apartment.floor.building.name}</td>
            <td>{lease.apartment.floor.name}</td>
            <td class="data-cell">{lease.apartment.apartmentNumber}</td>
            <td class="date-cell">{formatShortDate(lease.startDate)} – {formatShortDate(lease.endDate)}</td>
            <td class="money-cell">{formatMoney(lease.monthlyRent, lease.currency)}</td>
            <td><StatusBadge label={statusLabel(lease.status)} tone={statusTone(lease.status)} /></td>
            <td class="actions-cell">
              <button class="row-action" type="button" on:click={() => (detail = lease)} aria-label={$locale.leases.details}>
                <i class="bi bi-eye" aria-hidden="true"></i>
                <span>{$locale.leases.details}</span>
              </button>
              <button class="row-action" type="button" on:click={() => openEdit(lease)} aria-label={$locale.leases.edit}>
                <i class="bi bi-pencil" aria-hidden="true"></i>
                <span>{$locale.common.actions.edit}</span>
              </button>
              {#if lease.status === 'DRAFT'}
                <button class="row-action success" type="button" on:click={() => changeStatus(lease, 'ACTIVE')} aria-label={$locale.leases.activate}>
                  <i class="bi bi-check2-circle" aria-hidden="true"></i>
                  <span>{$locale.leases.activate}</span>
                </button>
              {/if}
              {#if lease.status === 'ACTIVE'}
                <button class="row-action warning" type="button" on:click={() => changeStatus(lease, 'TERMINATED')} aria-label={$locale.leases.terminate}>
                  <i class="bi bi-stop-circle" aria-hidden="true"></i>
                  <span>{$locale.leases.terminate}</span>
                </button>
              {/if}
              <button class="row-action danger" type="button" on:click={() => removeLease(lease)} aria-label={$locale.leases.delete}>
                <i class="bi bi-trash3" aria-hidden="true"></i>
                <span>{$locale.leases.delete}</span>
              </button>
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
      previousLabel={$locale.securityDeposits.previous}
      nextLabel={$locale.securityDeposits.next}
      label={$locale.securityDeposits.page.replace('{page}', pagination.page).replace('{totalPages}', pagination.totalPages)}
      summary={resultSummary}
      onPage={loadLeases}
    />
  </svelte:fragment>
</PageLayout>

<!-- Edit/Create Modal -->
<Modal
  bind:open={modalOpen}
  title={editing ? $locale.leases.edit : $locale.leases.new}
  busy={saving}
  size="modal-lg"
  closeLabel={$locale.leases.cancel}
  on:close={closeModal}
>
  <form id="lease-form" on:submit|preventDefault={saveLease} novalidate>
    {#if modalError}
      <div class="alert alert-danger" role="alert">{modalError}</div>
    {/if}
    <div class="row g-3">
      <div class="col-md-6">
        <label class="form-label" for="lease-tenant">{$locale.leases.tenant}</label>
        <select class="form-select" id="lease-tenant" bind:value={form.tenantId} disabled={optionsLoading} required>
          <option value="">{$locale.leases.select}</option>
          {#each tenants as tenant (tenant.id)}
            <option value={tenant.id}>{tenant.firstName} {tenant.lastName} — {tenant.phone}</option>
          {/each}
        </select>
      </div>
      <div class="col-md-6">
        <BuildingSelect
          selectId="lease-building"
          label={$locale.leases.building}
          buildings={buildings}
          bind:value={form.buildingId}
          on:change={buildingChanged}
          placeholder={$locale.leases.select}
          required
          disabled={optionsLoading}
        />
      </div>
      <div class="col-md-6">
        <label class="form-label" for="lease-floor">{$locale.leases.floor}</label>
        <select class="form-select" id="lease-floor" bind:value={form.floorId} on:change={floorChanged} disabled={!form.buildingId} required>
          <option value="">{$locale.leases.select}</option>
          {#each floors as floor (floor.id)}
            <option value={floor.id}>{floor.name}</option>
          {/each}
        </select>
      </div>
      <div class="col-md-6">
        <label class="form-label" for="lease-apartment">{$locale.leases.apartment}</label>
        <select class="form-select" id="lease-apartment" bind:value={form.apartmentId} on:change={apartmentChanged} disabled={!form.floorId} required>
          <option value="">{$locale.leases.select}</option>
          {#each apartments as apartment (apartment.id)}
            <option value={apartment.id} disabled={apartment.status !== 'AVAILABLE' && apartment.id !== editing?.apartment?.id}>
              {apartment.apartmentNumber} — {apartment.name}
            </option>
          {/each}
        </select>
      </div>
      <div class="col-md-6">
        <label class="form-label" for="lease-contract-number">{$locale.leases.contractNumber}</label>
        <input class="form-control" id="lease-contract-number" type="text" bind:value={form.contractNumber} required />
      </div>
      <div class="col-md-6">
        <label class="form-label" for="lease-start-date">{$locale.leases.startDate}</label>
        <ShamsiDatePicker id="lease-start-date" bind:value={form.startDate} required />
      </div>
      <div class="col-md-6">
        <label class="form-label" for="lease-end-date">{$locale.leases.endDate}</label>
        <ShamsiDatePicker id="lease-end-date" bind:value={form.endDate} required />
      </div>
      <div class="col-md-4">
        <label class="form-label" for="lease-monthly-rent">{$locale.leases.monthlyRent}</label>
        <input class="form-control" id="lease-monthly-rent" type="number" min="0.01" step="0.01" bind:value={form.monthlyRent} required />
      </div>
      <div class="col-md-4">
        <label class="form-label" for="lease-security-deposit">{$locale.leases.securityDeposit}</label>
        <input class="form-control" id="lease-security-deposit" type="number" min="0" step="0.01" bind:value={form.securityDeposit} required />
      </div>
      <div class="col-md-4">
        <label class="form-label" for="lease-currency">{$locale.currencies.currency}</label>
        <select class="form-select" id="lease-currency" bind:value={form.currency}>
          {#each $activeCurrencies as currency (currency.id)}
            <option value={currency.code}>{currency.code} — {currency.name}</option>
          {/each}
        </select>
        <div class="form-text">{$locale.leases.currencyHint}</div>
      </div>
      <div class="col-md-6">
        <label class="form-label" for="lease-payment-due-day">{$locale.leases.paymentDueDay}</label>
        <input class="form-control" id="lease-payment-due-day" type="number" min="1" max="28" step="1" bind:value={form.paymentDueDay} required />
      </div>
      <div class="col-md-6">
        <label class="form-label" for="lease-status">{$locale.leases.status}</label>
        <select class="form-select" id="lease-status" bind:value={form.status}>
          <option value="DRAFT">{$locale.leases.draft}</option>
          <option value="ACTIVE">{$locale.leases.active}</option>
        </select>
      </div>
      <div class="col-12">
        <label class="form-label" for="lease-notes">{$locale.leases.notes}</label>
        <textarea class="form-control" id="lease-notes" rows="3" bind:value={form.notes}></textarea>
      </div>
    </div>
  </form>

  <div slot="footer">
    <button class="btn btn-light" type="button" on:click={closeModal} disabled={saving}>{$locale.leases.cancel}</button>
    <button class="btn btn-primary" type="submit" form="lease-form" disabled={saving}>
      {saving ? $locale.leases.loading : $locale.leases.save}
    </button>
  </div>
</Modal>

<!-- Detail Modal -->
<Modal open={Boolean(detail)} title={$locale.leases.details} size="modal-lg" closeLabel={$locale.leases.cancel} on:close={() => (detail = null)}>
  {#if detail}
    <div class="detail-grid">
      <div class="detail-item"><span>{$locale.leases.tenant}</span><strong>{detail.tenant.firstName} {detail.tenant.lastName}</strong></div>
      <div class="detail-item"><span>{$locale.leases.contractNumber}</span><strong>{detail.contractNumber}</strong></div>
      <div class="detail-item"><span>{$locale.leases.building}</span><strong>{detail.apartment.floor.building.name}</strong></div>
      <div class="detail-item"><span>{$locale.leases.floor}</span><strong>{detail.apartment.floor.name}</strong></div>
      <div class="detail-item"><span>{$locale.leases.apartment}</span><strong>{detail.apartment.apartmentNumber}</strong></div>
      <div class="detail-item"><span>{$locale.leases.status}</span><StatusBadge label={statusLabel(detail.status)} tone={statusTone(detail.status)} /></div>
      <div class="detail-item"><span>{$locale.leases.startDate}</span><strong>{formatShortDate(detail.startDate)}</strong></div>
      <div class="detail-item"><span>{$locale.leases.endDate}</span><strong>{formatShortDate(detail.endDate)}</strong></div>
      <div class="detail-item"><span>{$locale.leases.currency}</span><strong>{detail.currency}</strong></div>
      <div class="detail-item"><span>{$locale.leases.monthlyRent}</span><strong>{formatMoney(detail.monthlyRent, detail.currency)}</strong></div>
      <div class="detail-item"><span>{$locale.leases.securityDeposit}</span><strong>{formatMoney(detail.securityDeposit, detail.currency)}</strong></div>
      <div class="detail-item"><span>{$locale.leases.paymentDueDay}</span><strong>{detail.paymentDueDay}</strong></div>
    </div>
    <div class="detail-notes"><span>{$locale.leases.notes}</span><p>{detail.notes || '—'}</p></div>
  {/if}

  <div slot="footer">
    <button class="btn btn-light" type="button" on:click={() => (detail = null)}>{$locale.leases.cancel}</button>
  </div>
</Modal>

<style>
  .detail-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0.8rem; }
  .detail-item { padding: 0.85rem; border: 1px solid var(--border); border-radius: 0.55rem; background: var(--surface-muted); }
  .detail-item > span, .detail-notes > span { display: block; margin-bottom: 0.25rem; color: var(--text-muted); font-size: 0.7rem; font-weight: 700; text-transform: uppercase; }
  .detail-item strong { color: var(--text-strong); font-size: 0.88rem; }
  .detail-notes { margin-top: 1rem; padding-top: 1rem; border-top: 1px solid var(--border); }
  .detail-notes p { margin: 0; color: var(--text-body); font-size: 0.84rem; white-space: pre-wrap; }
  @media (max-width: 700px) { .detail-grid { grid-template-columns: 1fr; } }
</style>
