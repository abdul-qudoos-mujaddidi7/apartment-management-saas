<script>
  import { onDestroy, onMount } from 'svelte';
  import { getTenantAccount, getTenantLedger, listTenantAccounts } from '../services/tenantAccounts';
  import PageLayout from '../components/ui/PageLayout.svelte';
  import DataTable from '../components/ui/DataTable.svelte';
  import Checkbox from '../components/ui/Checkbox.svelte';
  import PageToolbar from '../components/ui/PageToolbar.svelte';
  import Pagination from '../components/ui/Pagination.svelte';
  import Modal from '../components/ui/Modal.svelte';
  import { locale } from '../i18n';
  import { debounce } from '../utils/debounce';
  import { createSelection, isAllSelected, isSomeSelected, toggleAllSelected, toggleSelected } from '../utils/selection';
  import { formatMoney } from '../utils/formatters';

  let loading = true;
  let accounts = [];
  let error = '';
  let search = '';
  let pagination = { page: 1, totalPages: 0, pageSize: 10 };
  let selected = null;
  let ledger = [];
  let ledgerOpen = false;

  const debouncedSearch = debounce(() => load(1), 250);
  onDestroy(() => debouncedSearch.cancel());
  function queueSearch() { debouncedSearch(); }

  onMount(async () => { try { await load(); } catch (requestError) { error = requestError.message; } finally { loading = false; } });

  async function load(page = pagination.page) {
    loading = true;
    try { const response = await listTenantAccounts({ page, pageSize: pagination.pageSize, search }); accounts = response.items || []; pagination = response.pagination; }
    catch (requestError) { error = requestError.message; }
    finally { loading = false; }
  }

  async function view(account) {
    try {
      selected = (await getTenantAccount(account.tenantId)).account;
      ledgerOpen = true;
      ledger = (await getTenantLedger(account.tenantId)).items || [];
    } catch (requestError) { error = requestError.message; }
  }

  const tenantName = (account) => `${account.tenant.firstName} ${account.tenant.lastName}`.trim();
  const lease = (account) => account.tenant.leases?.[0];
  $: resultSummary = `${$locale.tenantAccounts.title}: ${pagination.total ?? ''}`;
  // Leading checkbox column — ids of the rows currently rendered.
  let selectedIds = createSelection();
  $: rowIds = accounts.map((account) => account.id);
  $: allRowsSelected = isAllSelected(selectedIds, rowIds);
  $: someRowsSelected = isSomeSelected(selectedIds, rowIds);

  function toggleRow(id) { selectedIds = toggleSelected(selectedIds, id); }
  function toggleAllRows() { selectedIds = toggleAllSelected(selectedIds, rowIds); }
</script>

<svelte:head><title>{$locale.tenantAccounts.title} | {$locale.common.apartmentPro}</title></svelte:head>

<PageLayout>
  <svelte:fragment slot="toolbar">
    <PageToolbar bind:search onSearch={queueSearch} showAdd={false} searchPlaceholder={$locale.tenantAccounts.search} />
  </svelte:fragment>

  <svelte:fragment slot="alerts">
    {#if error}<div class="alert alert-danger" role="alert">{error}</div>{/if}
  </svelte:fragment>

  <svelte:fragment slot="content">
    <DataTable {loading} isEmpty={accounts.length === 0} loadingLabel={$locale.tenantAccounts.loading} emptyLabel={$locale.tenantAccounts.empty} emptyIcon="bi-person-vcard" showFooter={!loading && accounts.length > 0}>
      <thead>
        <tr>
          <th class="select-column"><Checkbox checked={allRowsSelected} indeterminate={someRowsSelected} label={$locale.common.selectAll} on:change={toggleAllRows} /></th>
          <th>{$locale.tenantAccounts.tenant}</th>
          <th>{$locale.tenantAccounts.building}</th>
          <th>{$locale.tenantAccounts.floor}</th>
          <th>{$locale.tenantAccounts.apartment}</th>
          <th>{$locale.tenantAccounts.balance}</th>
          <th><span class="visually-hidden">{$locale.tenantAccounts.viewAccount}</span></th>
        </tr>
      </thead>
      <tbody>
        {#each accounts as account (account.id)}
          <tr class:is-selected={selectedIds.has(account.id)}>
            <td class="select-column"><Checkbox checked={selectedIds.has(account.id)} label={$locale.common.selectRow} on:change={() => toggleRow(account.id)} /></td>
            <td><strong>{tenantName(account)}</strong></td>
            <td>{lease(account)?.apartment.floor.building.name || '—'}</td>
            <td>{lease(account)?.apartment.floor.name || lease(account)?.apartment.floor.floorNumber || '—'}</td>
            <td>{lease(account)?.apartment.apartmentNumber || '—'}</td>
            <td class="amount-cell">{formatMoney(account.balance)}</td>
            <td><button class="btn btn-outline-primary btn-sm" type="button" on:click={() => view(account)}>{$locale.tenantAccounts.viewAccount}</button></td>
          </tr>
        {/each}
      </tbody>
    </DataTable>
  </svelte:fragment>

  <svelte:fragment slot="footer">
    <Pagination
      page={pagination.page}
      totalPages={pagination.totalPages}
      previousLabel={$locale.tenantAccounts.previous}
      nextLabel={$locale.tenantAccounts.next}
      label={$locale.tenantAccounts.page.replace('{page}', pagination.page).replace('{totalPages}', pagination.totalPages)}
      summary={resultSummary}
      onPage={load}
    />
  </svelte:fragment>
</PageLayout>

<Modal
  bind:open={ledgerOpen}
  title={selected ? tenantName(selected) : ''}
  size="modal-xl"
  closeLabel={$locale.common.close}
  on:close={() => (selected = null)}
>
  {#if selected}
    <p class="text-muted">{$locale.tenantAccounts.balance}: <strong>{formatMoney(selected.balance)}</strong></p>
  {/if}
  <div class="table-responsive">
    <table class="table">
      <thead><tr><th>{$locale.tenantAccounts.date}</th><th>{$locale.tenantAccounts.reference}</th><th>{$locale.tenantAccounts.descriptionColumn}</th><th>{$locale.tenantAccounts.debit}</th><th>{$locale.tenantAccounts.credit}</th><th>{$locale.tenantAccounts.balanceAfter}</th></tr></thead>
      <tbody>{#each ledger as entry (entry.id)}<tr><td class="date-cell">{entry.transactionDate.slice(0, 10)}</td><td>{entry.referenceType} — {entry.referenceId}</td><td>{entry.description || '—'}</td><td class="amount-cell">{formatMoney(entry.debit)}</td><td class="amount-cell">{formatMoney(entry.credit)}</td><td class="amount-cell">{formatMoney(entry.balanceAfter)}</td></tr>{/each}</tbody>
    </table>
  </div>
  <div slot="footer">
    <button class="btn btn-light" type="button" on:click={() => (selected = null)}>{$locale.common.close}</button>
  </div>
</Modal>
