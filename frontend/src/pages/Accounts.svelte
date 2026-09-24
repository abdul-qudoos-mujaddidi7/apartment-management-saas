<script>
  import { onMount } from 'svelte';
  import { getAccountLedger, listAccounts } from '../services/accounts';
  import PageLayout from '../components/ui/PageLayout.svelte';
  import DataTable from '../components/ui/DataTable.svelte';
  import Checkbox from '../components/ui/Checkbox.svelte';
  import Pagination from '../components/ui/Pagination.svelte';
  import Modal from '../components/ui/Modal.svelte';
  import { locale } from '../i18n';
  import { createSelection, isAllSelected, isSomeSelected, toggleAllSelected, toggleSelected } from '../utils/selection';
  import { baseCurrency } from '../stores/currency';
  import { formatMoney, formatShortDate } from '../utils/formatters';

  let loading = true;
  let accounts = [];
  let error = '';
  let selectedAccount = null;
  let ledger = [];
  let ledgerOpen = false;

  /* --- Pagination --------------------------------------------------- */
  let page = 1;
  let perPage = 25;

  $: totalPages = Math.max(1, Math.ceil(accounts.length / perPage));
  $: page = Math.min(page, totalPages);
  $: startIdx = (page - 1) * perPage;
  $: pagedAccounts = accounts.slice(startIdx, startIdx + perPage);
  $: summary = accounts.length
    ? $locale.accounts.showing
        .replace('{from}', startIdx + 1)
        .replace('{to}', Math.min(startIdx + perPage, accounts.length))
        .replace('{total}', accounts.length)
    : '';

  function handlePageChange(p) { page = p; }
  function handlePerPageChange(size) { perPage = size; page = 1; }

  onMount(async () => {
    try { accounts = (await listAccounts()).items || []; }
    catch (requestError) { error = requestError.message; }
    finally { loading = false; }
  });

  async function openLedger(account) {
    try {
      selectedAccount = account;
      ledgerOpen = true;
      ledger = (await getAccountLedger(account.id)).items || [];
    } catch (requestError) { error = requestError.message; }
  }
  // Leading checkbox column — ids of the rows currently rendered.
  let selectedIds = createSelection();
  $: rowIds = pagedAccounts.map((account) => account.id);
  $: allRowsSelected = isAllSelected(selectedIds, rowIds);
  $: someRowsSelected = isSomeSelected(selectedIds, rowIds);

  function toggleRow(id) { selectedIds = toggleSelected(selectedIds, id); }
  function toggleAllRows() { selectedIds = toggleAllSelected(selectedIds, rowIds); }
</script>

<svelte:head><title>{$locale.accounts.title} | {$locale.common.apartmentPro}</title></svelte:head>

<PageLayout>
  <svelte:fragment slot="alerts">
    {#if error}<div class="alert alert-danger" role="alert">{error}</div>{/if}
  </svelte:fragment>

  <svelte:fragment slot="content">
    <DataTable loading={loading} isEmpty={accounts.length === 0} loadingLabel={$locale.accounts.loading} emptyLabel={$locale.accounts.empty} emptyIcon="bi-bank">
      <thead>
        <tr>
          <th class="select-column"><Checkbox checked={allRowsSelected} indeterminate={someRowsSelected} label={$locale.common.selectAll} on:change={toggleAllRows} /></th>
          <th>{$locale.accounts.code}</th>
          <th>{$locale.accounts.name}</th>
          <th>{$locale.accounts.type}</th>
          <th class="amount-cell">{$locale.accounts.debit}</th>
          <th class="amount-cell">{$locale.accounts.credit}</th>
          <th class="amount-cell">{$locale.accounts.balance}</th>
          <th><span class="visually-hidden">{$locale.accounts.viewLedger}</span></th>
        </tr>
      </thead>
      <tbody>
        {#each pagedAccounts as account (account.id)}
          <tr class:is-selected={selectedIds.has(account.id)}>
            <td class="select-column"><Checkbox checked={selectedIds.has(account.id)} label={$locale.common.selectRow} on:change={() => toggleRow(account.id)} /></td>
            <td class="data-cell">{account.code}</td>
            <td><strong>{account.name}</strong></td>
            <td>{account.type}</td>
            <td class="amount-cell">{formatMoney(account.baseDebit != null ? account.baseDebit : account.debit, $baseCurrency)}</td>
            <td class="amount-cell">{formatMoney(account.baseCredit != null ? account.baseCredit : account.credit, $baseCurrency)}</td>
            <td class="amount-cell">{formatMoney(account.balance, account.baseCurrency || $baseCurrency)}</td>
            <td><button class="btn btn-outline-primary btn-sm" type="button" on:click={() => openLedger(account)}>{$locale.accounts.viewLedger}</button></td>
          </tr>
        {/each}
      </tbody>
    </DataTable>
  </svelte:fragment>

  <svelte:fragment slot="footer">
    <Pagination
      page={page}
      totalPages={totalPages}
      previousLabel={$locale.common.previous}
      nextLabel={$locale.common.next}
      label={$locale.common.page.replace('{page}', page).replace('{totalPages}', totalPages)}
      summary={summary}
      itemsPerPage={perPage}
      perPageOptions={[10, 25, 50, 100]}
      perPageLabel={$locale.common.perPage || 'Per page'}
      onPage={handlePageChange}
      onPerPage={handlePerPageChange}
    />
  </svelte:fragment>
</PageLayout>

<Modal
  bind:open={ledgerOpen}
  icon="bi-journal-bookmark"
  title={selectedAccount ? `${selectedAccount.code} — ${selectedAccount.name}` : ''}
  description={$locale.accounts.description}
  size="modal-xl"
  closeLabel={$locale.common.close}
  on:close={() => (selectedAccount = null)}
>
  <div class="table-responsive">
    <table class="table">
      <thead><tr><th>{$locale.accounts.date}</th><th>{$locale.accounts.journal}</th><th>{$locale.accounts.descriptionColumn}</th><th class="amount-cell">{$locale.accounts.debit}</th><th class="amount-cell">{$locale.accounts.credit}</th></tr></thead>
      <tbody>{#each ledger as entry (entry.id)}<tr><td class="date-cell">{formatShortDate(entry.journal.transactionDate)}</td><td>{entry.journal.journalNumber}</td><td>{entry.description || entry.journal.description || '—'}{#if entry.journal.currency && entry.journal.currency !== $baseCurrency}<small class="cell-sub">{formatMoney(entry.debit, entry.journal.currency)} @ {entry.journal.exchangeRate}</small>{/if}</td><td class="amount-cell">{formatMoney(entry.baseDebit, $baseCurrency)}</td><td class="amount-cell">{formatMoney(entry.baseCredit, $baseCurrency)}</td></tr>{/each}</tbody>
    </table>
  </div>
  <div slot="footer">
    <button class="btn btn-light" type="button" on:click={() => (selectedAccount = null)}>{$locale.common.close}</button>
  </div>
</Modal>
