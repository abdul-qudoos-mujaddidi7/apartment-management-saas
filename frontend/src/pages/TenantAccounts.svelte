<script>
  import { onDestroy, onMount } from 'svelte';
  import { listTenantAccounts } from '../services/tenantAccounts';
  import { push } from 'svelte-spa-router';
  import PageLayout from '../components/ui/PageLayout.svelte';
  import DataTable from '../components/ui/DataTable.svelte';
  import Checkbox from '../components/ui/Checkbox.svelte';
  import PageToolbar from '../components/ui/PageToolbar.svelte';
  import ExportMenu from '../components/ui/ExportMenu.svelte';
  import Pagination from '../components/ui/Pagination.svelte';
  import { locale } from '../i18n';
  import { debounce } from '../utils/debounce';
  import { createSelection, isAllSelected, isSomeSelected, toggleAllSelected, toggleSelected } from '../utils/selection';
  import { formatMoney } from '../utils/formatters';
  import { createReport } from '../utils/report/model.js';
  import { reportIdentity } from '../utils/report/identity.js';

  let loading = true;
  let accounts = [];
  let error = '';
  let search = '';
  let pagination = { page: 1, totalPages: 0, pageSize: 10 };

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

  /*
   * Every account the search matches, as one file. Balances are stated in the
   * reporting currency the ledger keeps them in, so a totals row can stand
   * under the list; both writers read this one description.
   */
  async function accountsReport() {
    const items = []; let page = 1, pages = 1;
    do {
      const response = await listTenantAccounts({ page, pageSize: 100, search });
      items.push(...(response.items || []));
      pages = response.pagination?.totalPages || 1;
      page++;
    } while (page <= pages);

    const rows = items.map((account) => [
      tenantName(account),
      lease(account)?.apartment.floor.building.name || '',
      lease(account)?.apartment.floor.name || lease(account)?.apartment.floor.floorNumber || '',
      lease(account)?.apartment.apartmentNumber || '',
      Number(account.balance) || 0
    ]);
    const totalBalance = rows.reduce((total, row) => total + (Number(row[4]) || 0), 0);

    return createReport({
      ...reportIdentity(),
      title: $locale.tenantAccounts.title,
      subtitle: search.trim(),
      metrics: [{ label: $locale.tenantAccounts.balance, value: formatMoney(totalBalance) }],
      columns: [
        { label: $locale.tenantAccounts.tenant },
        { label: $locale.tenantAccounts.building },
        { label: $locale.tenantAccounts.floor },
        { label: $locale.tenantAccounts.apartment },
        { label: $locale.tenantAccounts.balance, kind: 'money' }
      ],
      rows,
      totals: [$locale.accounts.totals, '', '', '', totalBalance],
      fileName: 'tenant-accounts',
      sheetName: $locale.tenantAccounts.title
    });
  }

  function view(account) { push(`/tenant-accounts/${account.tenantId}`); }

  const tenantName = (account) => `${account.tenant.firstName}`.trim();
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
    <PageToolbar bind:search onSearch={queueSearch} showAdd={false} searchPlaceholder={$locale.tenantAccounts.search}>
      <svelte:fragment slot="actions">
        <ExportMenu report={accountsReport} disabled={loading || !accounts.length} />
      </svelte:fragment>
    </PageToolbar>
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
          <tr class="account-row" class:is-selected={selectedIds.has(account.id)} on:click={() => view(account)}>
            <td class="select-column" on:click|stopPropagation><Checkbox checked={selectedIds.has(account.id)} label={$locale.common.selectRow} on:change={() => toggleRow(account.id)} /></td>
            <td><button class="account-link" type="button" on:click|stopPropagation={() => view(account)}>{tenantName(account)}</button></td>
            <td>{lease(account)?.apartment.floor.building.name || '—'}</td>
            <td>{lease(account)?.apartment.floor.name || lease(account)?.apartment.floor.floorNumber || '—'}</td>
            <td>{lease(account)?.apartment.apartmentNumber || '—'}</td>
            <td class="amount-cell">{formatMoney(account.balance)}</td>
            <td><button class="btn btn-outline-primary btn-sm" type="button" on:click|stopPropagation={() => view(account)}>{$locale.tenantAccounts.viewAccount}</button></td>
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

<style>
  .account-row { cursor: pointer; }
  .account-link { padding: 0; border: 0; color: var(--accent-text); background: none; font: inherit; font-weight: var(--weight-semibold); text-align: start; }
  .account-link:hover { color: var(--accent-hover); text-decoration: underline; }
  .account-link:focus-visible { outline: 0; border-radius: var(--radius-sm); box-shadow: var(--ring); }
</style>

