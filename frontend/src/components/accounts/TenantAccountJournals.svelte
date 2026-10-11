<script>
  /**
   * Shared journals for a tenant subledger or a general ledger account.
   *
   * The register shows the whole organisation's ledger; this is the same
   * documents read from one account's side, so it leads with what the entry did
   * (the debit and credit sides, each a way into the account it touched) rather
   * than with the register's numbering. The toolbar, the filters and the row
   * actions follow the register, so an entry written from here is the same
   * document it would be there.
   *
   * The card rules mirror the account page's own so the tab sits in the same
   * surface as the ledger and statement tabs.
   */
  import { onDestroy } from 'svelte';
  import { push } from 'svelte-spa-router';
  import { listJournals } from '../../services/journals';
  import ActionButton from '../ui/ActionButton.svelte';
  import DataTable from '../ui/DataTable.svelte';
  import PageToolbar from '../ui/PageToolbar.svelte';
  import Pagination from '../ui/Pagination.svelte';
  import RowActions from '../ui/RowActions.svelte';
  import StatusBadge from '../ui/StatusBadge.svelte';
  import ShamsiDatePicker from '../ui/ShamsiDatePicker.svelte';
  import JournalDetailsModal from '../journals/JournalDetailsModal.svelte';
  import JournalEntryModal from '../journals/JournalEntryModal.svelte';
  import JournalVoidModal from '../journals/JournalVoidModal.svelte';
  import { locale } from '../../i18n';
  import { debounce } from '../../utils/debounce';
  import { sortRows } from '../../utils/sortRows';
  import { accountNameLabel } from '../../utils/accountLabels';
  import { formatMoney, formatShortDate } from '../../utils/formatters';

  export let tenantId = '';
  /** The tenant's name, used by the heading and to pre-tag a new entry. */
  export let tenantLabel = '';
  export let accountId = '';
  export let accountLabel = '';

  let entries = [];
  let sort = { key: 'transactionDate', dir: 'desc' };
  $: view = sortRows(entries, sort.key, sort.dir);
  let pagination = { page: 1, pageSize: 10, total: 0, totalPages: 0 };
  let filters = { search: '', status: '', referenceType: '', dateFrom: '', dateTo: '' };
  let loading = false;
  let errorMessage = '';

  let detailsOpen = false;
  let detailsEntry = null;
  let formOpen = false;
  let formEntry = null;
  let voidOpen = false;
  let voidingEntry = null;

  const debouncedSearch = debounce(() => load(1), 250);
  let requestVersion = 0;
  onDestroy(() => { debouncedSearch.cancel(); requestVersion += 1; });

  // The tab is only mounted while it is open, so the first read belongs here;
  // a tenant change while it is open reloads the list from scratch.
  let loadedFor = null;
  $: scopeKey = tenantId ? `tenant:${tenantId}` : accountId ? `account:${accountId}` : '';
  $: if (scopeKey && scopeKey !== loadedFor) {
    loadedFor = scopeKey;
    entries = [];
    load(1);
  }
  $: headingLabel = tenantId ? tenantLabel : accountLabel;

  async function load(page = pagination.page) {
    if (!tenantId && !accountId) return;
    const version = ++requestVersion;
    const scope = tenantId ? { tenantId } : { accountId };
    loading = true; errorMessage = '';
    try {
      const response = await listJournals({ page, pageSize: pagination.pageSize, ...scope, ...filters });
      if (version !== requestVersion) return;
      entries = response.items || [];
      pagination = response.pagination;
    } catch (error) {
      if (version === requestVersion && error.status !== 401) errorMessage = error.message;
    } finally { if (version === requestVersion) loading = false; }
  }

  /* --- Row contents ---------------------------------------------------- */

  const tenantName = (tenant) => [tenant?.firstName].filter(Boolean).join(' ') || '—';

  /** A line tagged to a tenant reads as "account · tenant", as it does in the ledger. */
  function lineLabel(line) {
    const account = accountNameLabel(line.account, $locale) || line.account?.name || '—';
    return line.tenant ? `${account} · ${tenantName(line.tenant)}` : account;
  }

  const debitLines = (entry) => (entry.lines || []).filter((line) => line.debit > 0);
  const creditLines = (entry) => (entry.lines || []).filter((line) => line.credit > 0);

  /** Each side of the entry is a way into the account it moved. */
  function openLine(line) {
    if (line.tenantId) return push(`/tenant-accounts/${line.tenantId}`);
    if (line.accountId) return push(`/accounts/${line.accountId}`);
    return undefined;
  }

  const sourceLabel = (entry) => (entry.referenceType ? $locale.accountProfile.sources[entry.referenceType] || entry.referenceType : '—');
  const statusLabel = (status) => (status === 'POSTED' ? $locale.journals.posted : $locale.journals.voided);
  const statusTone = (status) => (status === 'POSTED' ? 'success' : 'danger');
  const editable = (entry) => entry.isManual && entry.status === 'POSTED';
  /** Only the invoice register has a deep link to a single document. */
  const sourceRoute = (entry) => (entry.referenceType === 'INVOICE' && entry.referenceId ? `/invoices?detail=${entry.referenceId}` : '');

  function openDetails(entry) { detailsEntry = entry; detailsOpen = true; }
  function closeDetails() { detailsOpen = false; detailsEntry = null; }
  function openCreate() { formEntry = null; formOpen = true; }
  function openEdit(entry) { formEntry = entry; formOpen = true; }
  function requestVoid(entry) { voidingEntry = entry; voidOpen = true; }

  // A new entry starts the list over so the posting is visible; an edit keeps the
  // page you were reading; a void reloads where you are.
  function afterSaved() { return load(formEntry ? pagination.page : 1); }
  function afterVoided() { return load(pagination.page); }

  function clearFilters() {
    filters = { ...filters, status: '', referenceType: '', dateFrom: '', dateTo: '' };
    load(1);
  }

  $: activeFilterCount = [filters.status, filters.referenceType, filters.dateFrom, filters.dateTo].filter(Boolean).length;
  $: rowNumber = (index) => (pagination.page - 1) * pagination.pageSize + index + 1;
</script>

<section class="section-card record-card" aria-labelledby="account-journals">
  <header class="section-heading record-heading">
    <span class="section-icon" aria-hidden="true"><i class="bi bi-journal-bookmark"></i></span>
    <h3 id="account-journals">{headingLabel ? `${headingLabel} · ` : ''}{$locale.accountProfile.journals}</h3>
    <ActionButton icon="bi-plus-lg" label={$locale.journals.add} on:click={openCreate} />
  </header>

  <div class="journal-toolbar">
    <PageToolbar
      bind:search={filters.search}
      searchPlaceholder={$locale.journals.search}
      showAdd={false}
      onSearch={debouncedSearch}
      filtersLabel={$locale.common.filters}
      filtersCount={activeFilterCount}
      filtersClearLabel={$locale.common.clearFilters}
      onClearFilters={clearFilters}
    >
      <svelte:fragment slot="filters">
        <div class="filters-field">
          <label class="filters-field-label" for="tenant-journal-status">{$locale.journals.status}</label>
          <select class="form-select" id="tenant-journal-status" bind:value={filters.status} on:change={() => load(1)}>
            <option value="">{$locale.journals.allStatuses}</option>
            <option value="POSTED">{$locale.journals.posted}</option>
            <option value="VOIDED">{$locale.journals.voided}</option>
          </select>
        </div>
        <div class="filters-field">
          <label class="filters-field-label" for="tenant-journal-source">{$locale.journals.source}</label>
          <select class="form-select" id="tenant-journal-source" bind:value={filters.referenceType} on:change={() => load(1)}>
            <option value="">{$locale.journals.allSources}</option>
            <option value="MANUAL">{$locale.journals.manual}</option>
            <option value="INVOICE">{$locale.journals.invoice}</option>
            <option value="PAYMENT">{$locale.journals.payment}</option>
          </select>
        </div>
        <div class="filters-field">
          <label class="filters-field-label" for="tenant-journal-from">{$locale.journals.dateFrom}</label>
          <ShamsiDatePicker id="tenant-journal-from" bind:value={filters.dateFrom} on:change={() => load(1)} />
        </div>
        <div class="filters-field">
          <label class="filters-field-label" for="tenant-journal-to">{$locale.journals.dateTo}</label>
          <ShamsiDatePicker id="tenant-journal-to" bind:value={filters.dateTo} on:change={() => load(1)} />
        </div>
      </svelte:fragment>
    </PageToolbar>
  </div>

  {#if errorMessage}
    <div class="alert alert-danger journal-alert" role="alert">{errorMessage}</div>
  {/if}

  <DataTable
    {loading}
    isEmpty={entries.length === 0}
    loadingLabel={$locale.journals.loading}
    emptyLabel={$locale.accountProfile.noJournals}
    emptyIcon="bi-journal-bookmark"
    minTableWidth="76rem"
    showFooter={!loading && entries.length > 0}
    sortKey={sort.key}
    sortDir={sort.dir}
    on:sort={(event) => (sort = event.detail)}
  >
    <thead>
      <tr>
        <th class="col-start">#</th>
        <th data-sort="transactionDate">{$locale.journals.date}</th>
        <th data-sort="journalNumber">{$locale.journals.journalNumber}</th>
        <th>{$locale.journals.account}</th>
        <th data-sort="description">{$locale.journals.description}</th>
        <th class="amount-cell" data-sort="debitTotal">{$locale.journals.debit}</th>
        <th class="amount-cell" data-sort="creditTotal">{$locale.journals.credit}</th>
        <th data-sort="referenceType">{$locale.journals.source}</th>
        <th data-sort="status">{$locale.journals.status}</th>
        <th class="actions-heading"><span class="visually-hidden">{$locale.journals.actions}</span></th>
      </tr>
    </thead>
    <tbody>
      {#each view as entry, index (entry.id)}
        <tr>
          <td class="col-start cell-muted">{rowNumber(index)}</td>
          <td>{formatShortDate(entry.transactionDate)}</td>
          <td><strong>{entry.journalNumber}</strong></td>
          <td>
            <div class="account-pair">
              {#each debitLines(entry) as line (line.id)}
                <button class="account-chip is-debit" type="button" title={lineLabel(line)} on:click={() => openLine(line)}>{lineLabel(line)}</button>
              {/each}
              {#each creditLines(entry) as line (line.id)}
                <button class="account-chip is-credit" type="button" title={lineLabel(line)} on:click={() => openLine(line)}>{lineLabel(line)}</button>
              {/each}
            </div>
          </td>
          <td class="description-cell">{entry.description || '—'}</td>
          <td class="amount-cell">{formatMoney(entry.debitTotal, entry.currency)}</td>
          <td class="amount-cell">{formatMoney(entry.creditTotal, entry.currency)}</td>
          <td><StatusBadge label={sourceLabel(entry)} tone={entry.isManual ? 'info' : 'neutral'} /></td>
          <td><StatusBadge label={statusLabel(entry.status)} tone={statusTone(entry.status)} /></td>
          <td class="actions-cell">
            <RowActions label={$locale.journals.actions}>
              <button class="row-menu-item" type="button" on:click={() => openDetails(entry)}><i class="bi bi-eye" aria-hidden="true"></i>{$locale.common.actions.view}</button>
              {#if sourceRoute(entry)}
                <button class="row-menu-item" type="button" on:click={() => push(sourceRoute(entry))}><i class="bi bi-receipt" aria-hidden="true"></i>{$locale.accountProfile.openInvoice}</button>
              {/if}
              {#if editable(entry)}
                <button class="row-menu-item" type="button" on:click={() => openEdit(entry)}><i class="bi bi-pencil" aria-hidden="true"></i>{$locale.common.actions.edit}</button>
                <button class="row-menu-item warning" type="button" on:click={() => requestVoid(entry)}><i class="bi bi-x-circle" aria-hidden="true"></i>{$locale.common.actions.void}</button>
              {/if}
            </RowActions>
          </td>
        </tr>
      {/each}
    </tbody>
  </DataTable>

  {#if !loading && entries.length > 0}
    <footer class="record-footer">
      <Pagination
        page={pagination.page}
        totalPages={pagination.totalPages}
        label={$locale.journals.page.replace('{page}', pagination.page).replace('{totalPages}', pagination.totalPages)}
        previousLabel={$locale.journals.previous}
        nextLabel={$locale.journals.next}
        onPage={load}
      />
    </footer>
  {/if}
</section>

<JournalDetailsModal bind:open={detailsOpen} entry={detailsEntry} on:close={closeDetails} />
<JournalEntryModal bind:open={formOpen} entry={formEntry} preset={tenantId ? { tenantId, tenantLabel } : { accountId }} on:saved={afterSaved} />
<JournalVoidModal bind:open={voidOpen} entry={voidingEntry} on:voided={afterVoided} />

<style>
  .section-card { display: flex; flex: 1 1 auto; flex-direction: column; min-width: 0; min-height: 0; overflow: hidden; padding: 0; border: 1px solid var(--border); border-radius: var(--radius-lg); background: var(--surface); box-shadow: var(--shadow-sm); }
  .section-heading { display: flex; align-items: center; gap: .65rem; min-height: 2rem; margin: 0; padding: var(--space-4); flex-shrink: 0; flex-wrap: wrap; }
  .section-heading h3 { margin: 0; flex: 1; color: var(--text-strong); font-size: var(--text-base); font-weight: var(--weight-bold); }
  .section-icon { display: grid; flex: 0 0 auto; place-items: center; width: 2rem; height: 2rem; border-radius: .6rem; color: var(--accent-text); background: var(--accent-soft); font-size: .9rem; }
  .journal-toolbar { flex-shrink: 0; padding: 0 var(--space-4) var(--space-3); }
  .journal-alert { margin: 0 var(--space-4) var(--space-3); }
  /* The two sides stack: a column in a fixed-layout table is narrow, and two long
     account names side by side would push past the cell and be clipped by it. */
  .account-pair { display: flex; flex-direction: column; align-items: flex-start; gap: .25rem; max-width: 100%; }
  /* Each side of the entry is a chip: the debit side reads in the register's
     red, the credit side in its green, and both are ways into the account. */
  .account-chip { max-width: 100%; overflow: hidden; padding: .12rem .5rem; border: 1px solid var(--border); border-radius: var(--radius-pill); background: var(--surface-muted); color: var(--text-strong); font: inherit; font-size: var(--text-xs); font-weight: var(--weight-semibold); text-overflow: ellipsis; white-space: nowrap; cursor: pointer; transition: border-color var(--transition), background var(--transition); }
  .account-chip.is-debit { border-color: #f3cccc; background: #feecec; color: #b91c1c; }
  .account-chip.is-credit { border-color: #c6e9d6; background: #e9f9ef; color: #047857; }
  .account-chip:hover { border-color: var(--accent-border); }
  .account-chip:focus-visible { outline: 0; border-color: var(--accent-border); box-shadow: var(--ring); }
  .description-cell { max-width: 20rem; overflow: hidden; text-overflow: ellipsis; }
  .amount-cell { font-variant-numeric: tabular-nums; }
  .record-footer { flex-shrink: 0; padding: var(--space-2) var(--space-4); border-block-start: 1px solid var(--border); }
  .cell-muted { color: var(--text-muted); }

  @media (max-width: 700px) {
    .section-heading { padding: var(--space-3); }
    .journal-toolbar { padding-inline: var(--space-3); }
    .journal-alert { margin-inline: var(--space-3); }
    .record-footer { padding-inline: var(--space-3); }
  }
</style>
