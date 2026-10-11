<script>
  import { onDestroy, onMount } from 'svelte';
  import { listJournals } from '../services/journals';
  import { listAccounts } from '../services/accounts';
  import PageLayout from '../components/ui/PageLayout.svelte';
  import DataTable from '../components/ui/DataTable.svelte';
  import Checkbox from '../components/ui/Checkbox.svelte';
  import PageToolbar from '../components/ui/PageToolbar.svelte';
  import Pagination from '../components/ui/Pagination.svelte';
  import StatusBadge from '../components/ui/StatusBadge.svelte';
  import RowActions from '../components/ui/RowActions.svelte';
  import ExportMenu from '../components/ui/ExportMenu.svelte';
  import ShamsiDatePicker from '../components/ui/ShamsiDatePicker.svelte';
  import JournalDetailsModal from '../components/journals/JournalDetailsModal.svelte';
  import JournalEntryModal from '../components/journals/JournalEntryModal.svelte';
  import JournalVoidModal from '../components/journals/JournalVoidModal.svelte';
  import { formatShortDate, formatMoney } from '../utils/formatters';
  import { locale } from '../i18n';
  import { sortRows } from '../utils/sortRows';
  import { debounce } from '../utils/debounce';
  import { createSelection, isAllSelected, isSomeSelected, toggleAllSelected, toggleSelected } from '../utils/selection';
  import { accountNameLabel } from '../utils/accountLabels';
  import { activeCurrencies, baseCurrency, toBase } from '../stores/currency';
  import { createReport } from '../utils/report/model.js';
  import { reportIdentity } from '../utils/report/identity.js';

  /* Manual entries carry every line themselves; document postings are owned by
     the invoice or payment that generated them, so they are read-only here. */
  let entries = [];
  let sort = { key: null, dir: 'asc' };
  $: view = sortRows(entries, sort.key, sort.dir);
  let accounts = [];
  let pagination = { page: 1, pageSize: 10, total: 0, totalPages: 0 };
  let filters = { search: '', status: '', referenceType: '', accountId: '', dateFrom: '', dateTo: '' };
  let loading = false;
  let errorMessage = '';

  let detailsEntry = null;
  let detailsOpen = false;

  /* The register writes and edits through the shared entry form; `formEntry`
     says which one is open — null is a new entry. */
  let formOpen = false;
  let formEntry = null;

  let voidOpen = false;
  let voidingEntry = null;

  const debouncedSearch = debounce(() => loadJournals(1), 250);
  onDestroy(() => debouncedSearch.cancel());
  function queueSearch() { debouncedSearch(); }

  onMount(async () => {
    try {
      accounts = (await listAccounts()).items || [];
      await loadJournals(1);
    } catch (error) { await handleRequestError(error); }
  });

  async function handleRequestError(error) { if (error.status === 401) return true; errorMessage = error.message; return false; }

  async function loadJournals(page = pagination.page) {
    loading = true; errorMessage = '';
    try {
      const response = await listJournals({ page, pageSize: pagination.pageSize, ...filters });
      entries = response.items || [];
      pagination = response.pagination;
    } catch (error) { await handleRequestError(error); }
    finally { loading = false; }
  }

  /*
   * The register as a file: every posting the current filters match, with the
   * two money columns restated in the reporting currency so the closing band
   * is one honest pair of totals. Both writers read this one description.
   */
  async function journalsReport() {
    const items = []; let page = 1, pages = 1;
    do {
      const response = await listJournals({ page, pageSize: 100, ...filters });
      items.push(...(response.items || []));
      pages = response.pagination?.totalPages || 1;
      page++;
    } while (page <= pages);

    const rows = sortRows(items, sort.key, sort.dir).map((entry) => [
      entry.journalNumber,
      entry.transactionDate.slice(0, 10),
      sourceLabel(entry),
      entry.description || '',
      toBase(entry.debitTotal, entry.currency, $activeCurrencies, $baseCurrency),
      toBase(entry.creditTotal, entry.currency, $activeCurrencies, $baseCurrency),
      statusLabel(entry.status)
    ]);
    const sum = (index) => rows.reduce((total, row) => total + (Number(row[index]) || 0), 0);
    const account = accounts.find((entry) => entry.id === filters.accountId);
    const scope = [
      filters.status ? statusLabel(filters.status) : '',
      filters.referenceType ? sourceLabel({ referenceType: filters.referenceType }) : '',
      account ? accountNameLabel(account, $locale) : '',
      filters.dateFrom || filters.dateTo ? `${filters.dateFrom || '…'} → ${filters.dateTo || '…'}` : ''
    ].filter(Boolean).join(' · ');

    return createReport({
      ...reportIdentity(),
      title: $locale.journals.title,
      subtitle: scope,
      metrics: [
        { label: $locale.journals.debit, value: formatMoney(sum(4), $baseCurrency) },
        { label: $locale.journals.credit, value: formatMoney(sum(5), $baseCurrency) }
      ],
      columns: [
        { label: $locale.journals.journalNumber },
        { label: $locale.journals.date, kind: 'date' },
        { label: $locale.journals.source },
        { label: $locale.journals.description },
        { label: $locale.journals.debit, kind: 'money' },
        { label: $locale.journals.credit, kind: 'money' },
        { label: $locale.journals.status }
      ],
      rows,
      totals: [$locale.accounts.totals, '', '', '', sum(4), sum(5), ''],
      fileName: 'journals',
      sheetName: $locale.journals.title
    });
  }

  function openDetails(entry) { detailsEntry = entry; detailsOpen = true; }
  function closeDetails() { detailsOpen = false; detailsEntry = null; }

  function openCreate() { formEntry = null; formOpen = true; }
  function openEdit(entry) { formEntry = entry; formOpen = true; }
  /* An edit keeps you on the page you were reading; a new entry starts the list
     over so the posting you just made is visible. */
  function afterSaved() { return loadJournals(formEntry ? pagination.page : 1); }

  function requestVoid(entry) { voidingEntry = entry; voidOpen = true; }
  function afterVoided() { return loadJournals(pagination.page); }

  /* --- Table helpers --------------------------------------------------- */

  /** A line tagged to a tenant reads as "account · tenant" everywhere. */
  function sourceLabel(entry) { return entry.referenceType ? ($locale.accountProfile.sources[entry.referenceType] || entry.referenceType) : '—'; }
  function sourceTone(entry) { return entry.isManual ? 'info' : 'neutral'; }
  function statusLabel(status) { return status === 'POSTED' ? $locale.journals.posted : $locale.journals.voided; }
  function statusTone(status) { return status === 'POSTED' ? 'success' : 'danger'; }
  const editable = (entry) => entry.isManual && entry.status === 'POSTED';

  let selectedIds = createSelection();
  $: rowIds = entries.map((entry) => entry.id);
  $: allRowsSelected = isAllSelected(selectedIds, rowIds);
  $: someRowsSelected = isSomeSelected(selectedIds, rowIds);

  function toggleRow(id) { selectedIds = toggleSelected(selectedIds, id); }
  function toggleAllRows() { selectedIds = toggleAllSelected(selectedIds, rowIds); }

  $: activeFilterCount = [filters.status, filters.referenceType, filters.accountId, filters.dateFrom, filters.dateTo].filter(Boolean).length;
  function clearFilters() {
    filters = { ...filters, status: '', referenceType: '', accountId: '', dateFrom: '', dateTo: '' };
    loadJournals(1);
  }

  $: resultSummary = `${$locale.journals.title}: ${pagination.total}`;
</script>

<svelte:head><title>{$locale.journals.title} | {$locale.common.apartmentPro}</title></svelte:head>

<PageLayout>
  <svelte:fragment slot="toolbar">
    <PageToolbar
      bind:search={filters.search}
      searchPlaceholder={$locale.journals.search}
      addLabel={$locale.journals.add}
      onAdd={openCreate}
      onSearch={queueSearch}
      filtersLabel={$locale.common.filters}
      filtersCount={activeFilterCount}
      filtersClearLabel={$locale.common.clearFilters}
      onClearFilters={clearFilters}
    >
      <svelte:fragment slot="actions">
        <ExportMenu report={journalsReport} disabled={loading || !entries.length} />
      </svelte:fragment>
      <svelte:fragment slot="filters">
        <div class="filters-field">
          <label class="filters-field-label" for="journal-filter-status">{$locale.journals.status}</label>
          <select class="form-select" id="journal-filter-status" bind:value={filters.status} on:change={() => loadJournals(1)}>
            <option value="">{$locale.journals.allStatuses}</option>
            <option value="POSTED">{$locale.journals.posted}</option>
            <option value="VOIDED">{$locale.journals.voided}</option>
          </select>
        </div>
        <div class="filters-field">
          <label class="filters-field-label" for="journal-filter-source">{$locale.journals.source}</label>
          <select class="form-select" id="journal-filter-source" bind:value={filters.referenceType} on:change={() => loadJournals(1)}>
            <option value="">{$locale.journals.allSources}</option>
            <option value="MANUAL">{$locale.journals.manual}</option>
            <option value="INVOICE">{$locale.journals.invoice}</option>
            <option value="PAYMENT">{$locale.journals.payment}</option>
          </select>
        </div>
        <div class="filters-field">
          <label class="filters-field-label" for="journal-filter-account">{$locale.journals.account}</label>
          <select class="form-select" id="journal-filter-account" bind:value={filters.accountId} on:change={() => loadJournals(1)}>
            <option value="">{$locale.journals.allAccounts}</option>
            {#each accounts as account (account.id)}
              <option value={account.id}>{accountNameLabel(account, $locale)}</option>
            {/each}
          </select>
        </div>
        <div class="filters-field">
          <label class="filters-field-label" for="journal-filter-from">{$locale.journals.dateFrom}</label>
          <ShamsiDatePicker id="journal-filter-from" bind:value={filters.dateFrom} on:change={() => loadJournals(1)} />
        </div>
        <div class="filters-field">
          <label class="filters-field-label" for="journal-filter-to">{$locale.journals.dateTo}</label>
          <ShamsiDatePicker id="journal-filter-to" bind:value={filters.dateTo} on:change={() => loadJournals(1)} />
        </div>
      </svelte:fragment>
    </PageToolbar>
  </svelte:fragment>

  <svelte:fragment slot="alerts">
    {#if errorMessage}<div class="alert alert-danger" role="alert">{errorMessage}</div>{/if}
  </svelte:fragment>

  <svelte:fragment slot="content">
    <DataTable loading={loading} isEmpty={entries.length === 0} loadingLabel={$locale.journals.loading} emptyLabel={$locale.journals.empty} emptyIcon="bi-journal-text" minTableWidth="68rem" showFooter={!loading && entries.length > 0} sortKey={sort.key} sortDir={sort.dir} on:sort={(event) => (sort = event.detail)}>
      <thead>
        <tr>
          <th class="select-column"><Checkbox checked={allRowsSelected} indeterminate={someRowsSelected} label={$locale.common.selectAll} on:change={toggleAllRows} /></th>
          <th data-sort="journalNumber">{$locale.journals.journalNumber}</th>
          <th data-sort="transactionDate">{$locale.journals.date}</th>
          <th data-sort="source">{$locale.journals.source}</th>
          <th data-sort="description">{$locale.journals.description}</th>
          <th class="amount-cell" data-sort="debitTotal">{$locale.journals.debit}</th>
          <th class="amount-cell" data-sort="creditTotal">{$locale.journals.credit}</th>
          <th data-sort="status">{$locale.journals.status}</th>
          <th class="actions-heading"><span class="visually-hidden">{$locale.journals.actions}</span></th>
        </tr>
      </thead>
      <tbody>
        {#each view as entry (entry.id)}
          <tr class:is-selected={selectedIds.has(entry.id)}>
            <td class="select-column"><Checkbox checked={selectedIds.has(entry.id)} label={$locale.common.selectRow} on:change={() => toggleRow(entry.id)} /></td>
            <td><strong>{entry.journalNumber}</strong></td>
            <td class="date-cell">{formatShortDate(entry.transactionDate)}</td>
            <td><StatusBadge label={sourceLabel(entry)} tone={sourceTone(entry)} /></td>
            <td class="description-cell">{entry.description || '—'}</td>
            <td class="amount-cell">{formatMoney(entry.debitTotal, entry.currency)}</td>
            <td class="amount-cell">{formatMoney(entry.creditTotal, entry.currency)}</td>
            <td><StatusBadge label={statusLabel(entry.status)} tone={statusTone(entry.status)} /></td>
            <td class="actions-cell">
              <RowActions label={$locale.journals.actions}>
                <button class="row-menu-item" type="button" on:click={() => openDetails(entry)}><i class="bi bi-eye" aria-hidden="true"></i>{$locale.common.actions.view}</button>
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
  </svelte:fragment>

  <svelte:fragment slot="footer">
    <Pagination page={pagination.page} totalPages={pagination.totalPages} label={$locale.journals.page.replace('{page}', pagination.page).replace('{totalPages}', pagination.totalPages)} previousLabel={$locale.journals.previous} nextLabel={$locale.journals.next} summary={resultSummary} onPage={loadJournals} />
  </svelte:fragment>
</PageLayout>

<JournalDetailsModal bind:open={detailsOpen} entry={detailsEntry} on:close={closeDetails} />
<JournalEntryModal bind:open={formOpen} entry={formEntry} on:saved={afterSaved} />
<JournalVoidModal bind:open={voidOpen} entry={voidingEntry} on:voided={afterVoided} />

<style>
  .description-cell { max-width: 22rem; overflow: hidden; text-overflow: ellipsis; }
</style>
