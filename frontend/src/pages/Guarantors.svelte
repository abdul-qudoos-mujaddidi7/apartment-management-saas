<script>
  import { onMount } from 'svelte';
  import { push } from 'svelte-spa-router';
  import PageLayout from '../components/ui/PageLayout.svelte';
  import PageToolbar from '../components/ui/PageToolbar.svelte';
  import DataTable from '../components/ui/DataTable.svelte';
  import Pagination from '../components/ui/Pagination.svelte';
  import RowActions from '../components/ui/RowActions.svelte';
  import GuarantorFormModal from '../components/guarantors/GuarantorFormModal.svelte';
  import { listGuarantors, deleteGuarantor } from '../services/guarantors';
  import { mediaUrl } from '../utils/media';
  import { locale } from '../i18n';
  import { user } from '../stores/auth';
  import { notifySuccess } from '../stores/toasts';
  let items = [], search = '', error = '', loading = false, open = false, editing = null;
  let pagination = { page: 1, pageSize: 10, total: 0, totalPages: 0 };
  let version = 0;
  $: canView = $user?.permissions?.includes('GUARANTOR_VIEW');
  $: canManage = $user?.permissions?.includes('GUARANTOR_MANAGE');
  async function load(page = 1) {
    if (!canView) return;
    const request = ++version; loading = true;
    try { const response = await listGuarantors({ page, pageSize: pagination.pageSize, search }); if (request === version) { items = response.items; pagination = response.pagination; error = ''; } }
    catch (e) { if (request === version) error = e.message; }
    finally { if (request === version) loading = false; }
  }
  function add() { editing = null; open = true; }
  function view(id) { push(`/guarantors/${encodeURIComponent(id)}`); }
  async function remove(g) { if (!window.confirm($locale.guarantors.confirmDelete)) return; try { await deleteGuarantor(g.id); await load(items.length === 1 && pagination.page > 1 ? pagination.page - 1 : pagination.page); } catch(e) { error = e.message; } }
  function saved() { notifySuccess($locale.guarantors.saved); load(pagination.page); }
  onMount(() => load());
</script>
<svelte:head><title>{$locale.guarantors.title} | {$locale.common.apartmentPro}</title></svelte:head>
{#if canView}
<PageLayout>
  <svelte:fragment slot="toolbar"><PageToolbar bind:search searchPlaceholder={$locale.guarantors.search} onSearch={() => load(1)} showAdd={canManage} addLabel={$locale.guarantors.add} onAdd={add} /></svelte:fragment>
  <svelte:fragment slot="alerts">{#if error}<div class="alert alert-danger" role="alert">{error}</div>{/if}</svelte:fragment>
  <svelte:fragment slot="content">
    <DataTable {loading} isEmpty={items.length === 0} loadingLabel={$locale.guarantors.loading} emptyLabel={$locale.guarantors.empty} emptyIcon="bi-person-check" minTableWidth="50rem">
      <thead><tr>{#each ['name','phone','nationalId','address','document'] as key}<th>{$locale.guarantors[key]}</th>{/each}<th>{$locale.guarantors.actions}</th></tr></thead>
      <tbody>{#each items as g (g.id)}<tr><td><button class="profile-link" type="button" on:click={() => view(g.id)}>{g.firstName} {g.lastName}</button></td><td dir="ltr">{g.phone}</td><td>{g.nationalId || '—'}</td><td>{g.address || '—'}</td><td>{#if g.documentUrl}<a href={mediaUrl(g.documentUrl)} target="_blank" rel="noopener">{$locale.guarantors.document}</a>{:else}—{/if}</td><td>
        <RowActions label={$locale.guarantors.actions}><button class="row-menu-item" type="button" on:click={() => view(g.id)}>{$locale.guarantors.view}</button>{#if canManage}<button class="row-menu-item" type="button" on:click={() => { editing = g; open = true; }}>{$locale.guarantors.edit}</button><button class="row-menu-item danger" type="button" on:click={() => remove(g)}>{$locale.guarantors.delete}</button>{/if}</RowActions>
      </td></tr>{/each}</tbody>
    </DataTable>
  </svelte:fragment>
  <svelte:fragment slot="footer"><Pagination page={pagination.page} totalPages={pagination.totalPages} previousLabel={$locale.leases.previous} nextLabel={$locale.leases.next} summary={`${$locale.guarantors.title}: ${pagination.total}`} onPage={load} /></svelte:fragment>
</PageLayout>
{:else}<div class="alert alert-danger" role="alert">{$locale.guarantors.forbidden}</div>{/if}
<GuarantorFormModal bind:open guarantor={editing} on:saved={saved} />
<style>
  .profile-link { border: 0; padding: 0; color: var(--accent-text); background: none; text-align: start; font-weight: var(--weight-semibold); }
  .profile-link:focus-visible { outline: 2px solid var(--accent); outline-offset: 3px; }
</style>
