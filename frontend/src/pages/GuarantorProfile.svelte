<script>
  import { onDestroy } from 'svelte';
  import { push } from 'svelte-spa-router';
  import { getGuarantorProfile } from '../services/guarantors';
  import { locale } from '../i18n';
  import { user } from '../stores/auth';
  import { notifySuccess } from '../stores/toasts';
  import { formatMoney, formatShortDate } from '../utils/formatters';
  import { mediaUrl } from '../utils/media';
  import StatusBadge from '../components/ui/StatusBadge.svelte';
  import DataTable from '../components/ui/DataTable.svelte';
  import Pagination from '../components/ui/Pagination.svelte';
  import GuarantorFormModal from '../components/guarantors/GuarantorFormModal.svelte';

  export let params = {};
  let guarantorId = '';
  let profile = null;
  let loading = false;
  let error = '';
  let editing = false;
  let requestVersion = 0;
  let brokenDocument = '';
  $: canView = $user?.permissions?.includes('GUARANTOR_VIEW');
  $: canManage = $user?.permissions?.includes('GUARANTOR_MANAGE');
  $: if (params.id && params.id !== guarantorId) {
    guarantorId = params.id; profile = null; error = ''; editing = false; brokenDocument = '';
    load(1);
  }
  $: guarantor = profile?.guarantor;
  $: fullName = guarantor ? `${guarantor.firstName} ${guarantor.lastName}`.trim() : '';
  $: initials = guarantor ? [guarantor.firstName, guarantor.lastName].map(part => part.trim().charAt(0)).join('').toUpperCase() : '';
  async function load(page = 1) {
    const version = ++requestVersion;
    loading = true; error = '';
    try {
      const response = await getGuarantorProfile(guarantorId, { page });
      if (version === requestVersion) profile = response;
    } catch (e) { if (version === requestVersion) error = e.message; }
    finally { if (version === requestVersion) loading = false; }
  }
  function saved(event) {
    if (event.detail.id !== guarantorId) return;
    profile = { ...profile, guarantor: event.detail };
    brokenDocument = '';
    notifySuccess($locale.guarantors.saved);
  }
  const tones = { ACTIVE: 'success', DRAFT: 'neutral', EXPIRED: 'warning', TERMINATED: 'danger' };
  onDestroy(() => requestVersion++);
</script>

<svelte:head><title>{fullName || $locale.guarantors.profile} | {$locale.common.apartmentPro}</title></svelte:head>
<div class="guarantor-profile-page">
  <nav class="breadcrumb-row" aria-label={$locale.guarantors.profile}>
    <button type="button" on:click={() => push('/guarantors')}><i class="bi bi-person-check" aria-hidden="true"></i> {$locale.guarantors.title}</button>
    <i class="bi bi-chevron-right" aria-hidden="true"></i>
    <span aria-current="page">{fullName || $locale.guarantors.profile}</span>
  </nav>
  {#if !canView}
    <div class="alert alert-danger" role="alert">{$locale.guarantors.forbidden}</div>
  {:else}
    {#if error}<div class="alert alert-danger" role="alert">{error} <button class="btn btn-light" type="button" on:click={() => load(profile?.pagination.page || 1)}>{$locale.common.retry}</button></div>{/if}
    {#if loading && !profile}<div class="page-loader" role="status"><span class="spinner-border text-primary" aria-hidden="true"></span> {$locale.guarantors.loading}</div>{/if}
    {#if guarantor}
      <section class="identity-hero" aria-labelledby="guarantor-name">
        <span class="portrait-fallback" aria-hidden="true">{initials}</span>
        <div class="identity-copy">
          <p class="profile-kicker">{$locale.guarantors.profile}</p>
          <h1 id="guarantor-name">{fullName}</h1>
          <div class="contact-row"><a href={`tel:${guarantor.phone}`}><i class="bi bi-telephone" aria-hidden="true"></i> <bdi>{guarantor.phone}</bdi></a><span><i class="bi bi-calendar3" aria-hidden="true"></i> {$locale.guarantors.registeredOn} {formatShortDate(guarantor.createdAt)}</span></div>
        </div>
        {#if canManage}<button type="button" class="btn btn-light" on:click={() => editing = true}><i class="bi bi-pencil" aria-hidden="true"></i> {$locale.guarantors.edit}</button>{/if}
      </section>

      <section class="account-strip" aria-label={$locale.guarantors.guaranteedLeases}>
        {#each [['totalLeases','bi-file-earmark-text'],['activeLeases','bi-check2-circle'],['draftLeases','bi-pencil-square'],['closedLeases','bi-archive']] as [key, icon]}
          <article class="metric"><span class="metric-icon" aria-hidden="true"><i class={`bi ${icon}`}></i></span><div><span class="metric-label">{$locale.guarantors[key]}</span><strong>{profile.summary[key]}</strong></div></article>
        {/each}
      </section>

      <div class="overview-grid">
        <section class="section-card" aria-labelledby="guarantor-identity">
          <header class="section-heading"><span class="section-icon" aria-hidden="true"><i class="bi bi-person-vcard"></i></span><h2 id="guarantor-identity">{$locale.tenantProfile.identity}</h2></header>
          <dl class="facts">
            <div class="fact-wide"><dt>{$locale.guarantors.name}</dt><dd>{fullName}</dd></div>
            {#each ['phone','alternatePhone','nationalId','address'] as key}
              <div class:fact-wide={key === 'address'}><dt>{$locale.guarantors[key]}</dt><dd>{#if key.toLowerCase().includes('phone') && guarantor[key]}<a href={`tel:${guarantor[key]}`}><bdi>{guarantor[key]}</bdi></a>{:else}{guarantor[key] || '—'}{/if}</dd></div>
            {/each}
          </dl>
          {#if guarantor.notes}<div class="notes"><i class="bi bi-sticky" aria-hidden="true"></i><p><strong>{$locale.guarantors.notes}</strong><span>{guarantor.notes}</span></p></div>{/if}
        </section>
        <section class="section-card" aria-labelledby="guarantor-document">
          <header class="section-heading"><span class="section-icon" aria-hidden="true"><i class="bi bi-card-image"></i></span><h2 id="guarantor-document">{$locale.guarantors.document}</h2></header>
          {#if !guarantor.documentUrl}<p class="empty-state">{$locale.tenantProfile.documentsEmpty}</p>
          {:else if brokenDocument === guarantor.documentUrl}<p class="empty-state" role="status">{$locale.tenantProfile.documentMissing}</p>
          {:else}<a class="document" href={mediaUrl(guarantor.documentUrl)} target="_blank" rel="noopener" title={$locale.tenantProfile.openDocument}><img src={mediaUrl(guarantor.documentUrl)} alt={$locale.guarantors.document} loading="lazy" on:error={() => brokenDocument = guarantor.documentUrl} /><span><i class="bi bi-box-arrow-up-right" aria-hidden="true"></i> {$locale.tenantProfile.openDocument}</span></a>{/if}
        </section>
      </div>

      <section class="section-card record-card" aria-labelledby="guaranteed-leases" aria-busy={loading}>
        <header class="section-heading record-heading"><span class="section-icon" aria-hidden="true"><i class="bi bi-file-earmark-text"></i></span><h2 id="guaranteed-leases">{$locale.guarantors.guaranteedLeases}</h2></header>
        {#if !profile.canViewLeases}<p class="empty-state">{$locale.guarantors.leasePermissionRequired}</p>
        {:else}
          <DataTable {loading} isEmpty={profile.leases.length === 0} emptyLabel={$locale.guarantors.noLeases} loadingLabel={$locale.guarantors.loading} emptyIcon="bi-file-earmark-text" minTableWidth="60rem">
            <thead><tr><th>{$locale.leases.contractNumber}</th><th>{$locale.leases.tenant}</th><th>{$locale.leases.building}</th><th>{$locale.leases.apartment}</th><th>{$locale.leases.period}</th><th>{$locale.leases.monthlyRent}</th><th>{$locale.leases.status}</th><th>{$locale.guarantors.actions}</th></tr></thead>
            <tbody>{#each profile.leases as lease (lease.id)}<tr>
              <td><button class="table-link" type="button" on:click={() => push(`/leases?detail=${encodeURIComponent(lease.id)}`)}>{lease.contractNumber}</button></td>
              <td>{#if lease.tenant.deletedAt}{lease.tenant.firstName} {lease.tenant.lastName}{:else}<button class="table-link" type="button" on:click={() => push(`/tenants/${encodeURIComponent(lease.tenant.id)}`)}>{lease.tenant.firstName} {lease.tenant.lastName}</button>{/if}</td>
              <td>{lease.apartment.floor.building.name}<small>{$locale.leases.floor}: {lease.apartment.floor.name || lease.apartment.floor.floorNumber}</small></td>
              <td>{lease.apartment.apartmentNumber}</td><td>{formatShortDate(lease.startDate)} — {formatShortDate(lease.endDate)}</td><td>{formatMoney(lease.monthlyRent, lease.currency)}</td>
              <td><StatusBadge label={$locale.tenantProfile.leaseStatuses[lease.status] || lease.status} tone={tones[lease.status] || 'neutral'} /></td>
              <td><button class="btn btn-light" type="button" on:click={() => push(`/leases/${encodeURIComponent(lease.id)}/contract`)}>{$locale.leaseContract.viewContract}</button></td>
            </tr>{/each}</tbody>
          </DataTable>
          <Pagination page={profile.pagination.page} totalPages={profile.pagination.totalPages} previousLabel={$locale.leases.previous} nextLabel={$locale.leases.next} onPage={load} />
        {/if}
      </section>
      {#key guarantorId}<GuarantorFormModal bind:open={editing} {guarantor} on:saved={saved} />{/key}
    {/if}
  {/if}
</div>

<style>
  .guarantor-profile-page { display: flex; flex-direction: column; gap: var(--space-5); width: 100%; min-width: 0; }
  .breadcrumb-row { display: flex; align-items: center; gap: var(--space-2); color: var(--text-muted); font-size: var(--text-sm); }
  .breadcrumb-row button { display: flex; align-items: center; gap: var(--space-2); padding: 0; border: 0; color: var(--accent-text); background: none; }
  :global([dir='rtl']) .breadcrumb-row > i { transform: rotate(180deg); }
  .identity-hero { display: grid; grid-template-columns: auto minmax(0,1fr) auto; align-items: center; gap: var(--space-5); padding: var(--space-6); border: 1px solid var(--border); border-radius: var(--radius-xl); background: var(--surface); }
  .portrait-fallback { display: grid; place-items: center; width: 6rem; height: 6rem; border-radius: 50%; background: var(--accent-soft); color: var(--accent-text); font-size: 2rem; font-weight: var(--weight-bold); }
  .profile-kicker { margin: 0 0 var(--space-1); color: var(--text-muted); font-size: var(--text-xs); font-weight: var(--weight-semibold); }
  .identity-copy h1 { margin: 0; color: var(--text-strong); font-size: var(--text-2xl); overflow-wrap: anywhere; }
  .contact-row { display: flex; gap: var(--space-4); flex-wrap: wrap; margin-block-start: var(--space-3); color: var(--text-muted); font-size: var(--text-sm); }
  a { color: var(--accent-text); text-decoration: none; }
  .account-strip { display: grid; grid-template-columns: repeat(4,minmax(0,1fr)); border: 1px solid var(--border); border-radius: var(--radius-lg); background: var(--surface); overflow: hidden; }
  .metric { display: flex; align-items: center; gap: var(--space-3); padding: var(--space-4); border-inline-start: 1px solid var(--border); }
  .metric:first-child { border-inline-start: 0; }
  .metric-icon,.section-icon { display: grid; place-items: center; flex-shrink: 0; width: 2.25rem; height: 2.25rem; border-radius: var(--radius-md); background: var(--accent-soft); color: var(--accent-text); }
  .metric-label { display: block; color: var(--text-muted); font-size: var(--text-xs); }
  .metric strong { display: block; color: var(--text-strong); font-size: var(--text-xl); font-variant-numeric: tabular-nums; }
  .overview-grid { display: grid; grid-template-columns: minmax(0,1.3fr) minmax(0,1fr); gap: var(--space-5); }
  .section-card { min-width: 0; padding: var(--space-5); border: 1px solid var(--border); border-radius: var(--radius-lg); background: var(--surface); }
  .section-heading { display: flex; align-items: center; gap: var(--space-3); margin-block-end: var(--space-4); }
  .section-heading h2 { margin: 0; color: var(--text-strong); font-size: var(--text-base); font-weight: var(--weight-semibold); }
  .facts { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: var(--space-4); margin: 0; }
  .facts dt { margin-block-end: var(--space-1); color: var(--text-muted); font-size: var(--text-xs); }
  .facts dd { margin: 0; color: var(--text-strong); font-size: var(--text-sm); white-space: pre-wrap; overflow-wrap: anywhere; }
  .fact-wide { grid-column: 1/-1; }
  .notes { display: flex; gap: var(--space-3); margin-block-start: var(--space-5); padding-block-start: var(--space-4); border-block-start: 1px solid var(--border); color: var(--text-muted); }
  .notes p { margin: 0; min-width: 0; font-size: var(--text-sm); }
  .notes strong,.notes span { display: block; }
  .notes span { margin-block-start: var(--space-2); white-space: pre-wrap; overflow-wrap: anywhere; }
  .document { display: flex; flex-direction: column; gap: var(--space-3); }
  .document img { width: 100%; max-height: 18rem; object-fit: contain; border: 1px solid var(--border); border-radius: var(--radius-md); background: var(--surface-muted); }
  .document span { font-size: var(--text-sm); }
  .empty-state { margin: 0; padding: var(--space-5); color: var(--text-muted); font-size: var(--text-sm); text-align: center; }
  .record-card { padding: 0; overflow: hidden; }
  .record-heading { margin: 0; padding: var(--space-5); border-block-end: 1px solid var(--border); }
  .table-link { border: 0; padding: 0; background: none; color: var(--accent-text); font-weight: var(--weight-semibold); text-align: start; }
  td small { display: block; color: var(--text-muted); }
  .page-loader { display: flex; justify-content: center; align-items: center; gap: var(--space-3); padding: var(--space-6); }
  button:focus-visible,a:focus-visible { outline: 2px solid var(--accent); outline-offset: 3px; }
  @media (max-width: 820px) { .overview-grid { grid-template-columns: 1fr; } .account-strip { grid-template-columns: repeat(2,minmax(0,1fr)); } .metric:nth-child(3) { border-inline-start: 0; } .metric:nth-child(n+3) { border-block-start: 1px solid var(--border); } }
  @media (max-width: 600px) { .identity-hero { grid-template-columns: 1fr; justify-items: center; text-align: center; padding: var(--space-4); } .contact-row { justify-content: center; } .facts { grid-template-columns: 1fr; } .section-card { padding: var(--space-3); } .record-card { padding: 0; } }
</style>
