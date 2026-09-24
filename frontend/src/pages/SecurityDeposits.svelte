<script>
  import PageLayout from '../components/ui/PageLayout.svelte';
  import PageToolbar from '../components/ui/PageToolbar.svelte';
  import DataTable from '../components/ui/DataTable.svelte';
  import Checkbox from '../components/ui/Checkbox.svelte';
  import Pagination from '../components/ui/Pagination.svelte';
  import Modal from '../components/ui/Modal.svelte';
  import StatusBadge from '../components/ui/StatusBadge.svelte';
  import RowActions from '../components/ui/RowActions.svelte';
  import ShamsiDatePicker from '../components/ui/ShamsiDatePicker.svelte';
  import { formatShortDate } from '../utils/formatters';
  import { onMount } from 'svelte';

  import {
    createSecurityDepositTransaction,
    getSecurityDeposit,
    listSecurityDeposits,
    voidSecurityDepositTransaction,
  } from '../services/securityDeposits';
  import { listFinancialAccounts } from '../services/financialAccounts';
  import { locale } from '../i18n';
  import { activeCurrencies, baseCurrency, convertAmount } from '../stores/currency';
  import { sortRows } from '../utils/sortRows';
  import { createSelection, isAllSelected, isSomeSelected, toggleAllSelected, toggleSelected } from '../utils/selection';
  import { formatMoney } from '../utils/formatters';

  const blankTransaction = () => ({
    type: 'RECEIVED', currency: '', amount: '',
    transactionDate: new Date().toISOString().slice(0, 10),
    reason: '', accountId: '', reference: '', notes: '',
  });

  /**
   * Why the deposit is being kept decides where it is credited, so the form
   * asks instead of guessing: rent arrears settle what the tenant already owes,
   * damage is money the deposit was never going to give back as rent.
   */
  const deductionReasons = ['RENT_ARREARS', 'DAMAGE', 'OTHER'];
  let accounts = [];

  let rows = [];
  let sort = { key: null, dir: 'asc' };
  $: view = sortRows(rows, sort.key, sort.dir);
  let pagination = { page: 1, pageSize: 10, total: 0, totalPages: 0 };
  let search = '';
  let loading = false;
  let errorMessage = '';
  let noticeMessage = '';

  let detail = null;
  let detailOpen = false;
  let detailLoading = false;
  let transaction = blankTransaction();
  let transactionError = '';
  let savingTransaction = false;
  let voidReasons = {};
  let voidingId = '';

  onMount(() => {
    loadDeposits();
    // Supporting data: the form falls back to the cash account without it.
    listFinancialAccounts()
      .then((response) => {
        accounts = (response.accounts || response.items || []).filter((account) => account.type === 'ASSET' && account.isActive !== false);
      })
      .catch(() => { accounts = []; });
  });

  async function loadDeposits(page = pagination.page) {
    loading = true;
    errorMessage = '';
    try {
      const response = await listSecurityDeposits({ page, pageSize: pagination.pageSize, search: search.trim() });
      rows = response.items;
      pagination = response.pagination;
    } catch (error) { errorMessage = error.message; }
    finally { loading = false; }
  }

  async function openDetails(leaseId) {
    detailLoading = true;
    detailOpen = true;
    transactionError = '';
    try {
      detail = await getSecurityDeposit(leaseId);
      // Deposits are collected in whatever the tenant pays in, so the default is
      // the currency the deposit was agreed in — the lease's own currency. The
      // summary above is stated in the reporting currency and anything entered
      // here is converted to it on save.
      const leaseCurrency = detail.lease.securityDepositCurrency || detail.lease.currency || $baseCurrency;
      transaction = { ...blankTransaction(), currency: leaseCurrency };
      voidReasons = {};
    } catch (error) { errorMessage = error.message; detailOpen = false; }
    finally { detailLoading = false; }
  }

  function closeDetails() {
    if (savingTransaction || voidingId) return;
    detailOpen = false;
    detail = null;
    transactionError = '';
  }

  async function saveTransaction() {
    transactionError = '';
    if (!transaction.amount || Number(transaction.amount) <= 0) {
      transactionError = $locale.securityDeposits.amount;
      return;
    }
    savingTransaction = true;
    try {
      if (transaction.type === 'DEDUCTION' && !transaction.reason) {
        transactionError = $locale.securityDeposits.reasonRequired;
        return;
      }
      await createSecurityDepositTransaction(detail.lease.id, {
        ...transaction,
        currency: transaction.currency || $baseCurrency,
        amount: Number(transaction.amount),
        reason: transaction.type === 'DEDUCTION' ? transaction.reason : null,
        accountId: transaction.type === 'DEDUCTION' ? null : transaction.accountId || null,
        reference: transaction.reference.trim() || null,
        notes: transaction.notes.trim() || null,
      });
      noticeMessage = $locale.securityDeposits.transactionSaved;
      await openDetails(detail.lease.id);
      await loadDeposits();
    } catch (error) { transactionError = error.message; }
    finally { savingTransaction = false; }
  }

  async function voidTransaction(id) {
    const voidReason = (voidReasons[id] || '').trim();
    if (!voidReason) { transactionError = $locale.securityDeposits.requiredReason; return; }
    transactionError = '';
    voidingId = id;
    try {
      await voidSecurityDepositTransaction(id, voidReason);
      noticeMessage = $locale.securityDeposits.transactionVoided;
      await openDetails(detail.lease.id);
      await loadDeposits();
    } catch (error) { transactionError = error.message; }
    finally { voidingId = ''; }
  }

  function statusTone(status) {
    switch (status) {
      case 'SETTLED': case 'POSTED': case 'RECEIVED': return 'success';
      case 'NOT_PAID': case 'PARTIAL': case 'PARTIALLY_USED': return 'info';
      case 'HELD': return 'warning';
      case 'VOIDED': return 'neutral';
      default: return 'neutral';
    }
  }

  function statusLabel(status) {
    const key = { NOT_PAID: 'notPaid', PARTIAL: 'partial', HELD: 'held', PARTIALLY_USED: 'partiallyUsed', SETTLED: 'settled', POSTED: 'posted', VOIDED: 'voided', RECEIVED: 'received', DEDUCTION: 'deduction', REFUND: 'refund' }[status];
    return key ? $locale.securityDeposits[key] : status;
  }

  $: resultSummary = `${$locale.securityDeposits.title}: ${pagination.total}`;
  // Leading checkbox column — rows are leases, so the key is the lease id.
  let selectedIds = createSelection();
  $: rowIds = rows.map((row) => row.lease.id);
  $: allRowsSelected = isAllSelected(selectedIds, rowIds);
  $: someRowsSelected = isSomeSelected(selectedIds, rowIds);

  function toggleRow(id) { selectedIds = toggleSelected(selectedIds, id); }
  function toggleAllRows() { selectedIds = toggleAllSelected(selectedIds, rowIds); }
</script>

<svelte:head>
  <title>{$locale.securityDeposits.title} | {$locale.common.apartmentPro}</title>
</svelte:head>

<PageLayout>
  <svelte:fragment slot="toolbar">
    <PageToolbar bind:search searchPlaceholder={$locale.securityDeposits.search} onSearch={() => loadDeposits(1)} showAdd={false} />
  </svelte:fragment>

  <svelte:fragment slot="alerts">
    {#if errorMessage}<div class="alert alert-danger" role="alert">{errorMessage}</div>{/if}
    {#if noticeMessage}<div class="alert alert-success" role="status">{noticeMessage}</div>{/if}
  </svelte:fragment>

  <svelte:fragment slot="content">
    <DataTable {loading} isEmpty={rows.length === 0} loadingLabel={$locale.securityDeposits.loading} emptyLabel={$locale.securityDeposits.empty} emptyIcon="bi-shield-check" minTableWidth="82rem" showFooter={!loading && rows.length > 0}>
      <thead>
        <tr>
          <th class="select-column"><Checkbox checked={allRowsSelected} indeterminate={someRowsSelected} label={$locale.common.selectAll} on:change={toggleAllRows} /></th>
          <th data-sort="lease.tenant.lastName">{$locale.securityDeposits.tenant}</th>
          <th data-sort="lease.apartment.floor.building.name">{$locale.securityDeposits.building}</th>
          <th data-sort="lease.apartment.floor.name">{$locale.securityDeposits.floor}</th>
          <th data-sort="lease.apartment.apartmentNumber">{$locale.securityDeposits.apartment}</th>
          <th data-sort="lease.contractNumber">{$locale.securityDeposits.contractNumber}</th>
          <th class="money-cell" data-sort="summary.requiredDeposit">{$locale.securityDeposits.required}</th>
          <th class="money-cell" data-sort="summary.received">{$locale.securityDeposits.received}</th>
          <th class="money-cell" data-sort="summary.deductions">{$locale.securityDeposits.deductions}</th>
          <th class="money-cell" data-sort="summary.refunded">{$locale.securityDeposits.refunded}</th>
          <th class="amount-cell" data-sort="summary.balance">{$locale.securityDeposits.balance}</th>
          <th data-sort="summary.status">{$locale.securityDeposits.status}</th>
          <th class="actions-heading"><span class="visually-hidden">{$locale.securityDeposits.details}</span></th>
        </tr>
      </thead>
      <tbody>
        {#each view as row (row.lease.id)}
          <tr class:is-selected={selectedIds.has(row.lease.id)}>
            <td class="select-column"><Checkbox checked={selectedIds.has(row.lease.id)} label={$locale.common.selectRow} on:change={() => toggleRow(row.lease.id)} /></td>
            <td class="tenant-name">{row.lease.tenant.firstName} {row.lease.tenant.lastName}</td>
            <td>{row.lease.apartment.floor.building.name}</td>
            <td>{row.lease.apartment.floor.name}</td>
            <td class="data-cell">{row.lease.apartment.apartmentNumber}</td>
            <td class="contract-number">{row.lease.contractNumber}</td>
            <td class="money-cell">{formatMoney(row.summary.requiredDeposit)}</td>
            <td class="money-cell">{formatMoney(row.summary.received)}</td>
            <td class="money-cell">{formatMoney(row.summary.deductions)}</td>
            <td class="money-cell">{formatMoney(row.summary.refunded)}</td>
            <td class="amount-cell">{formatMoney(row.summary.balance)}</td>
            <td><StatusBadge label={statusLabel(row.summary.status)} tone={statusTone(row.summary.status)} /></td>
            <td class="actions-cell">
              <RowActions label={$locale.securityDeposits.details}>
                <button class="row-menu-item" type="button" on:click={() => openDetails(row.lease.id)}>
                  <i class="bi bi-eye" aria-hidden="true"></i>
                  {$locale.securityDeposits.details}
                </button>
              </RowActions>
            </td>
          </tr>
        {/each}
      </tbody>
    </DataTable>
  </svelte:fragment>

  <svelte:fragment slot="footer">
    <Pagination page={pagination.page} totalPages={pagination.totalPages} previousLabel={$locale.securityDeposits.previous} nextLabel={$locale.securityDeposits.next} label={$locale.securityDeposits.page.replace('{page}', pagination.page).replace('{totalPages}', pagination.totalPages)} summary={resultSummary} onPage={loadDeposits} />
  </svelte:fragment>
</PageLayout>

<Modal bind:open={detailOpen} title={$locale.securityDeposits.title} busy={savingTransaction || Boolean(voidingId)} size="modal-xl" icon="bi-shield-check" closeLabel={$locale.securityDeposits.close} on:close={closeDetails}>
  {#if detailLoading && !detail}
    <div class="text-center py-5"><div class="spinner-border text-primary" role="status"><span class="visually-hidden">{$locale.securityDeposits.loading}</span></div></div>
  {:else if detail}
    {#if transactionError}<div class="alert alert-danger" role="alert">{transactionError}</div>{/if}
    <div class="lease-context">
      <span><strong>{$locale.securityDeposits.tenant}</strong>{detail.lease.tenant.firstName} {detail.lease.tenant.lastName}</span>
      <span><strong>{$locale.securityDeposits.building}</strong>{detail.lease.apartment.floor.building.name}</span>
      <span><strong>{$locale.securityDeposits.floor}</strong>{detail.lease.apartment.floor.name}</span>
      <span><strong>{$locale.securityDeposits.apartment}</strong>{detail.lease.apartment.apartmentNumber}</span>
      <span><strong>{$locale.securityDeposits.contractNumber}</strong>{detail.lease.contractNumber}</span>
      <span><strong>{$locale.securityDeposits.leaseStatus}</strong>{detail.lease.status}</span>
    </div>

    <section class="summary-grid" aria-label={$locale.securityDeposits.status}>
      {#each [['required', detail.summary.requiredDeposit], ['received', detail.summary.received], ['deductions', detail.summary.deductions], ['refunded', detail.summary.refunded], ['balance', detail.summary.balance], ['remaining', detail.summary.remainingToCollect]] as item}
        <article><span>{$locale.securityDeposits[item[0]]}</span><strong>{formatMoney(item[1], $baseCurrency)}</strong></article>
      {/each}
    </section>

    <section class="transaction-form">
      <h3>{$locale.securityDeposits.add}</h3>
      <form on:submit|preventDefault={saveTransaction} novalidate>
        <div class="row g-3">
          <div class="col-md-3">
            <label class="form-label" for="transaction-type">{$locale.securityDeposits.type}</label>
            <select class="form-select" id="transaction-type" bind:value={transaction.type}>
              <option value="RECEIVED">{$locale.securityDeposits.received}</option>
              <option value="DEDUCTION">{$locale.securityDeposits.deduction}</option>
              <option value="REFUND">{$locale.securityDeposits.refund}</option>
            </select>
          </div>
          {#if transaction.type === 'DEDUCTION'}
            <div class="col-md-3">
              <label class="form-label" for="transaction-reason">{$locale.securityDeposits.reason}</label>
              <select class="form-select" id="transaction-reason" bind:value={transaction.reason} required>
                <option value="">{$locale.securityDeposits.chooseReason}</option>
                {#each deductionReasons as value (value)}
                  <option value={value}>{$locale.securityDeposits.reasons[value]}</option>
                {/each}
              </select>
            </div>
          {:else}
            <div class="col-md-3">
              <label class="form-label" for="transaction-account">{$locale.securityDeposits.account}</label>
              <select class="form-select" id="transaction-account" bind:value={transaction.accountId}>
                <option value="">{$locale.securityDeposits.defaultAccount}</option>
                {#each accounts as account (account.id)}
                  <option value={account.id}>{account.code} — {account.name}</option>
                {/each}
              </select>
            </div>
          {/if}
          <div class="col-md-3">
            <label class="form-label" for="transaction-currency">{$locale.currencies.currency}</label>
            <select class="form-select" id="transaction-currency" bind:value={transaction.currency}>
              {#each $activeCurrencies as currency (currency.id)}
                <option value={currency.code}>{currency.code} — {currency.name}</option>
              {/each}
            </select>
          </div>
          <div class="col-md-3">
            <label class="form-label" for="transaction-amount">{$locale.securityDeposits.amount}</label>
            <input class="form-control" id="transaction-amount" type="number" inputmode="decimal" min="0.01" step="0.01" bind:value={transaction.amount} required />
          </div>
          <div class="col-md-3">
            <label class="form-label" for="transaction-date">{$locale.securityDeposits.date}</label>
            <ShamsiDatePicker id="transaction-date" bind:value={transaction.transactionDate} required />
          </div>
          <div class="col-md-3">
            <label class="form-label" for="transaction-reference">{$locale.securityDeposits.reference}</label>
            <input class="form-control" id="transaction-reference" bind:value={transaction.reference} />
          </div>
          <div class="col-12">
            <label class="form-label" for="transaction-notes">{$locale.securityDeposits.notes}</label>
            <textarea class="form-control" id="transaction-notes" rows="2" bind:value={transaction.notes}></textarea>
            {#if transaction.type !== 'RECEIVED'}<p class="form-text">{$locale.securityDeposits.available}: {formatMoney(detail.summary.balance, $baseCurrency)}</p>{/if}
            {#if (transaction.currency || $baseCurrency) !== $baseCurrency && Number(transaction.amount) > 0}
              <p class="form-text">
                {formatMoney(transaction.amount, transaction.currency)}
                = {formatMoney(convertAmount(transaction.amount, transaction.currency, $baseCurrency, $activeCurrencies, $baseCurrency), $baseCurrency)}
              </p>
            {/if}
          </div>
          <div class="col-12">
            <button class="btn btn-primary" type="submit" disabled={savingTransaction}>
              {savingTransaction ? $locale.securityDeposits.saving : $locale.securityDeposits.save}
            </button>
          </div>
        </div>
      </form>
    </section>

    <section class="history-section">
      <h3>{$locale.securityDeposits.history}</h3>
      {#if detail.transactions.length === 0}
        <p class="history-empty">—</p>
      {:else}
        <div class="table-responsive">
          <table class="table history-table align-middle mb-0">
            <thead>
              <tr>
                <th>{$locale.securityDeposits.date}</th>
                <th>{$locale.securityDeposits.type}</th>
                <th>{$locale.securityDeposits.amount}</th>
                <th>{$locale.securityDeposits.reference}</th>
                <th>{$locale.securityDeposits.notes}</th>
                <th>{$locale.securityDeposits.status}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {#each detail.transactions as item (item.id)}
                <tr>
                  <td>{formatShortDate(item.transactionDate)}</td>
                  <td>
                    {statusLabel(item.type)}
                    {#if item.reason}
                      <small class="cell-sub">{$locale.securityDeposits.reasons[item.reason]}</small>
                    {/if}
                  </td>
                  <td class="money-cell">
                    {formatMoney(item.amount, item.currency)}
                    {#if item.currency !== $baseCurrency}
                      <small class="cell-sub">{formatMoney(item.baseAmount, $baseCurrency)}</small>
                    {/if}
                  </td>
                  <td>{item.reference || '—'}
                    {#if item.account}
                      <small class="cell-sub">{item.account.code} — {item.account.name}</small>
                    {/if}
                  </td>
                  <td>{item.notes || '—'}</td>
                  <td><StatusBadge label={statusLabel(item.status)} tone={item.status === 'VOIDED' ? 'neutral' : 'success'} /></td>
                  <td>
                    {#if item.status === 'POSTED'}
                      <div class="void-action">
                        <label class="visually-hidden" for={`void-${item.id}`}>{$locale.securityDeposits.voidReason}</label>
                        <input class="form-control form-control-sm" id={`void-${item.id}`} bind:value={voidReasons[item.id]} placeholder={$locale.securityDeposits.voidReason} />
                        <button class="btn btn-sm btn-outline-danger" type="button" disabled={voidingId === item.id} on:click={() => voidTransaction(item.id)}>
                          {voidingId === item.id ? $locale.securityDeposits.voiding : $locale.securityDeposits.void}
                        </button>
                      </div>
                    {:else}
                      <small>{item.voidReason}</small>
                    {/if}
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      {/if}
    </section>
  {/if}

  <div slot="footer">
    <button class="btn btn-light" type="button" on:click={closeDetails} disabled={savingTransaction || Boolean(voidingId)}>{$locale.securityDeposits.close}</button>
  </div>
</Modal>

<style>
  .details-button { min-height: 2.25rem; padding: 0.4rem 0.7rem; font-size: 0.76rem; }
  .lease-context { display: flex; flex-wrap: wrap; gap: 0.8rem 1.5rem; padding-bottom: 1rem; border-bottom: 1px solid var(--border); color: var(--text-body); font-size: 0.8rem; }
  .lease-context span { display: grid; gap: 0.15rem; }
  .lease-context strong { color: var(--brand-800); font-size: 0.7rem; text-transform: uppercase; }
  .summary-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 0.75rem; margin: 1.25rem 0; }
  .summary-grid article { padding: 0.8rem; border: 1px solid var(--border); border-radius: 0.55rem; background: var(--surface-muted); }
  .summary-grid span, .summary-grid strong { display: block; }
  .summary-grid span { color: var(--text-muted); font-size: 0.72rem; }
  .summary-grid strong { margin-top: 0.3rem; color: var(--text-strong); font-size: 1rem; }
  .transaction-form, .history-section { padding-top: 1.25rem; border-top: 1px solid var(--border); }
  .history-section { margin-top: 1.5rem; }
  .transaction-form h3, .history-section h3 { margin: 0 0 1rem; color: var(--text-strong); font-size: 1rem; }
  .history-empty { margin: 0; color: var(--text-muted); }
  .void-action { display: flex; gap: 0.35rem; min-width: 17rem; }
  .void-action .form-control { min-height: 2rem; }
  .void-action .btn { white-space: nowrap; }
  @media (max-width: 600px) {
    .summary-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .void-action { min-width: 15rem; flex-direction: column; }
  }
</style>
