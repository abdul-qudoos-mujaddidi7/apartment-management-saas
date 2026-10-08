<script>
  import { onMount } from 'svelte';
  import { push } from 'svelte-spa-router';
  import { listAccounts } from '../services/accounts';
  import PageLayout from '../components/ui/PageLayout.svelte';
  import DataTable from '../components/ui/DataTable.svelte';
  import Checkbox from '../components/ui/Checkbox.svelte';
  import Pagination from '../components/ui/Pagination.svelte';
  import { locale } from '../i18n';
  import { createSelection, isAllSelected, isSomeSelected, toggleAllSelected, toggleSelected } from '../utils/selection';
  import { accountNameLabel, accountTypeLabel } from '../utils/accountLabels';
  import { baseCurrency } from '../stores/currency';
  import { formatMoney } from '../utils/formatters';

  let loading = true;
  let accounts = [];
  let error = '';

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

  /** The register is an index into each account's file, not a dead end. */
  function openAccount(id) { push(`/accounts/${id}`); }

  onMount(async () => {
    try { accounts = (await listAccounts()).items || []; }
    catch (requestError) { error = requestError.message; }
    finally { loading = false; }
  });

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
          <th>ID</th>
          <th>{$locale.accounts.name}</th>
          <th>{$locale.accounts.type}</th>
          <th class="amount-cell">{$locale.accounts.balance}</th>
        </tr>
      </thead>
      <tbody>
        {#each pagedAccounts as account, index (account.id)}
          <tr class:is-selected={selectedIds.has(account.id)} class="account-row" on:click={() => openAccount(account.id)}>
            <td class="select-column" on:click|stopPropagation>
              <Checkbox checked={selectedIds.has(account.id)} label={$locale.common.selectRow} on:change={() => toggleRow(account.id)} />
            </td>
            <td class="data-cell">{startIdx + index + 1}</td>
            <td>
              <button class="account-link" type="button" on:click={(event) => { event.stopPropagation(); openAccount(account.id); }}>
                {accountNameLabel(account, $locale)}
              </button>
            </td>
            <td>{accountTypeLabel(account.type, $locale)}</td>
            <td class="amount-cell">{formatMoney(account.balance, account.baseCurrency || $baseCurrency)}</td>
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

<style>
  /* The row is the link; the name is the keyboard-reachable handle for it. */
  .account-row { cursor: pointer; }
  .account-link { padding: 0; border: 0; color: var(--accent-text); background: none; font: inherit; font-weight: var(--weight-semibold); text-align: start; }
  .account-link:hover { color: var(--accent-hover); text-decoration: underline; }
  .account-link:focus-visible { outline: 0; border-radius: var(--radius-sm); box-shadow: var(--ring); }
</style>
