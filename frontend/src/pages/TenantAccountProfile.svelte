<script>
  import { onMount, onDestroy } from 'svelte';
  import { push } from 'svelte-spa-router';
  import { locale } from '../i18n';
  import { baseCurrency } from '../stores/currency';
  import { getTenantAccount, getTenantLedger } from '../services/tenantAccounts';
  import { accountTabFromSearch, tenantAccountTabs } from '../utils/accountTabs';
  import { formatMoney, formatShortDate } from '../utils/formatters';
  import { reportCsv } from '../utils/reportCsv';
  import StatusBadge from '../components/ui/StatusBadge.svelte';
  import ShamsiDatePicker from '../components/ui/ShamsiDatePicker.svelte';
  import TenantAccountLedger from '../components/accounts/TenantAccountLedger.svelte';
  import TenantAccountJournals from '../components/accounts/TenantAccountJournals.svelte';
  export let params = {};
  let tenantId = '', account = null, loading = false, error = '', ledgerLoading = false, statementLoading = false, exporting = false;
  let ledgerVersion = 0, statementVersion = 0, profileVersion = 0;
  const empty = () => ({ items: [], pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 }, totals: { debit: 0, credit: 0, openingBalance: 0, closingBalance: 0 } });
  let ledger = empty(), statement = empty(), statementLoaded = false, from = '', to = '';
  let search = window.location.hash.split('?')[1] || '';
  $: tab = accountTabFromSearch(search, tenantAccountTabs);
  $: base = account?.baseCurrency || $baseCurrency;
  $: lease = account?.tenant.leases?.[0];
  $: name = account?.tenant.firstName || '';
  $: if (params.id && params.id !== tenantId) { tenantId = params.id; account = null; ledger = empty(); statement = empty(); from = ''; to = ''; statementLoaded = false; error = ''; ledgerVersion++; statementVersion++; load(); }
  $: if (account && tab === 'statement' && !statementLoaded) { statementLoaded = true; loadStatement(1); }
  onMount(() => { const changed = () => { search = window.location.hash.split('?')[1] || ''; }; window.addEventListener('hashchange',changed); return () => window.removeEventListener('hashchange',changed); });
  onDestroy(() => { profileVersion++; ledgerVersion++; statementVersion++; });
  async function load() {
    const id = tenantId, version = ++profileVersion; loading = true; error = '';
    try { const response = await getTenantAccount(id); if (id !== tenantId || version !== profileVersion) return; account = response.account; await loadLedger(1); }
    catch (e) { if (id === tenantId && version === profileVersion) error = $locale.accountProfile.loadError; }
    finally { if (id === tenantId && version === profileVersion) loading = false; }
  }
  async function loadLedger(page = 1) {
    const id = tenantId, version = ++ledgerVersion; ledgerLoading = true;
    try { const response = await getTenantLedger(id,{ page, pageSize: 20 }); if (id === tenantId && version === ledgerVersion) ledger = response; }
    catch (e) { if (id === tenantId && version === ledgerVersion) error = $locale.accountProfile.loadError; }
    finally { if (id === tenantId && version === ledgerVersion) ledgerLoading = false; }
  }
  async function loadStatement(page = 1) {
    const id = tenantId, version = ++statementVersion; error = ''; statementLoading = true;
    statement = empty();
    if (from && to && from > to) { error = $locale.tenantAccountProfile.invalidDates; statementLoading = false; return; }
    try { const response = await getTenantLedger(id,{ page, pageSize: 20, from, to }); if (id === tenantId && version === statementVersion) statement = response; }
    catch (e) { if (id === tenantId && version === statementVersion) error = $locale.accountProfile.loadError; }
    finally { if (id === tenantId && version === statementVersion) statementLoading = false; }
  }
  function clearDates() { from = ''; to = ''; loadStatement(1); }
  async function exportStatement() {
    if (exporting) return;
    const id = tenantId, selectedFrom = from, selectedTo = to; exporting = true; error = '';
    try {
      const rows = []; let page = 1, pages = 1;
      do { const response = await getTenantLedger(id,{ page, pageSize: 100, from: selectedFrom, to: selectedTo }); if (id !== tenantId || selectedFrom !== from || selectedTo !== to) return; rows.push(...response.items); pages = response.pagination.totalPages; page++; } while (page <= pages);
      const t = $locale.tenantAccounts;
      const csv = reportCsv([t.date,t.reference,t.descriptionColumn,t.debit,t.credit,t.balanceAfter],rows.map(entry => [formatShortDate(entry.transactionDate),`${$locale.accountProfile.sources[entry.referenceType] || entry.referenceType}${entry.referenceNumber ? ' · ' + entry.referenceNumber : ''}`,entry.description || '',entry.debit,entry.credit,entry.balanceAfter]));
      const url = URL.createObjectURL(new Blob([csv],{ type: 'text/csv;charset=utf-8;' })); const anchor = document.createElement('a'); anchor.href = url; anchor.download = `tenant-statement-${base}.csv`; anchor.click(); setTimeout(() => URL.revokeObjectURL(url),1000);
    } catch (e) { error = $locale.accountProfile.loadError; } finally { exporting = false; }
  }
</script>
<svelte:head><title>{name || $locale.tenantAccountProfile.title} | {$locale.common.apartmentPro}</title></svelte:head>
<div class="account-profile-page">
  <div class="profile-breadcrumb"><button type="button" on:click={() => push('/tenant-accounts')}><i class="bi bi-arrow-return-left" aria-hidden="true"></i> {$locale.tenantAccounts.title}</button><span>/</span><span>{name || $locale.tenantAccountProfile.title}</span></div>
  {#if error}<div class="alert alert-danger" role="alert">{error} <button class="btn btn-sm btn-light" on:click={() => tab === 'statement' && account ? loadStatement(1) : load()}>{$locale.common.retry}</button></div>{/if}
  {#if loading && !account}<div class="page-loader" role="status"><div class="spinner-border text-primary" aria-hidden="true"></div><span>{$locale.accountProfile.loading}</span></div>{/if}
  {#if account}
    {#if tab === 'overview'}
      <section class="identity-hero" aria-labelledby="tenant-account-name">
        <span class="hero-icon" aria-hidden="true"><i class="bi bi-person-vcard"></i></span>
        <div class="identity-copy"><p class="profile-kicker">{$locale.tenantAccountProfile.title}</p><div class="name-row"><h2 id="tenant-account-name">{name}</h2><StatusBadge label={account.tenant.status === 'ACTIVE' ? $locale.accountProfile.active : $locale.accountProfile.inactive} tone={account.tenant.status === 'ACTIVE' ? 'success' : 'neutral'} /></div><a class="tenant-phone" href={`tel:${account.tenant.phone}`}>{account.tenant.phone}</a></div>
        <aside class="hero-balance" aria-label={$locale.tenantAccounts.balance}><span class="summary-label">{$locale.tenantAccounts.balance}</span><strong>{formatMoney(account.balance,base)}</strong></aside>
      </section>
      <section class="account-strip" aria-label={$locale.accountProfile.details}>{#each [{ key: 'debit', value: account.debit, icon: 'bi-arrow-down-left-circle' }, { key: 'credit', value: account.credit, icon: 'bi-arrow-up-right-circle' }, { key: 'balance', value: account.balance, icon: 'bi-wallet2' }] as metric}<article class="metric" class:is-emphasis={metric.key === 'balance'}><span class="metric-icon" aria-hidden="true"><i class={`bi ${metric.icon}`}></i></span><div><span class="metric-label">{$locale.tenantAccounts[metric.key]}</span><strong>{formatMoney(metric.value,base)}</strong></div></article>{/each}</section>
      <section class="section-card"><header class="section-heading"><span class="section-icon" aria-hidden="true"><i class="bi bi-person-lines-fill"></i></span><h3>{$locale.accountProfile.details}</h3><button class="btn btn-outline-primary btn-sm" on:click={() => push(`/tenants/${tenantId}`)}>{$locale.tenantAccountProfile.viewTenant}</button></header>
        <dl class="tenant-facts">{#each [{ label: $locale.tenantAccounts.building, value: lease?.apartment.floor.building.name },{ label: $locale.tenantAccounts.floor, value: lease?.apartment.floor.name || lease?.apartment.floor.floorNumber },{ label: $locale.tenantAccounts.apartment, value: lease?.apartment.apartmentNumber },{ label: $locale.leases.contractNumber, value: lease?.contractNumber },{ label: $locale.tenantProfile.nationalId, value: account.tenant.nationalId },{ label: $locale.accountProfile.entries, value: account.entries },{ label: $locale.tenantProfile.address, value: account.tenant.address }] as fact}<div><dt>{fact.label}</dt><dd>{fact.value ?? '—'}</dd></div>{/each}</dl>
      </section>
    {:else if tab === 'financial-report'}
      <section class="section-card record-card"><header class="section-heading record-heading"><span class="section-icon" aria-hidden="true"><i class="bi bi-journal-text"></i></span><h3>{name} · {$locale.accountProfile['financial-report']}</h3></header><TenantAccountLedger result={ledger} loading={ledgerLoading} {base} onPage={loadLedger} /></section>
    {:else if tab === 'statement'}
      <section class="section-card record-card"><header class="section-heading record-heading"><span class="section-icon" aria-hidden="true"><i class="bi bi-file-earmark-spreadsheet"></i></span><h3>{name} · {$locale.accountProfile.statement}</h3></header>
        <div class="statement-filters"><div class="filters-field"><label class="filters-field-label" for="tenant-statement-from">{$locale.accountProfile.dateFrom}</label><ShamsiDatePicker id="tenant-statement-from" bind:value={from} disabled={exporting} on:change={() => loadStatement(1)} /></div><div class="filters-field"><label class="filters-field-label" for="tenant-statement-to">{$locale.accountProfile.dateTo}</label><ShamsiDatePicker id="tenant-statement-to" bind:value={to} disabled={exporting} on:change={() => loadStatement(1)} /></div><button class="btn btn-light btn-sm" disabled={exporting} on:click={clearDates}>{$locale.accountProfile.clearDates}</button><button class="btn btn-outline-primary btn-sm" disabled={exporting || statementLoading || !statement.items.length} on:click={exportStatement}><i class="bi bi-download" aria-hidden="true"></i> {$locale.accountProfile.exportCsv}</button></div>
        {#if !statementLoading}<div class="statement-summary">{#each ['openingBalance','debit','credit','closingBalance'] as key}<div><span>{['debit','credit'].includes(key) ? $locale.tenantAccounts[key] : $locale.accountProfile[key]}</span><strong>{formatMoney(statement.totals[key],base)}</strong></div>{/each}</div>{/if}
        <TenantAccountLedger result={statement} loading={statementLoading} {base} statement={true} onPage={loadStatement} />
      </section>
    {:else if tab === 'journals'}
      <TenantAccountJournals {tenantId} tenantLabel={name} />
    {/if}
  {/if}
</div>

<style>
  .account-profile-page { display: flex; flex: 1 1 auto; flex-direction: column; min-width: 0; min-height: 0; gap: var(--space-4); }
  .profile-breadcrumb { display: flex; align-items: center; gap: .6rem; color: var(--text-muted); font-size: var(--text-xs); flex-shrink: 0; }
  .profile-breadcrumb button { display: flex; align-items: center; gap: .45rem; border: 0; background: none; padding: .25rem 0; color: var(--accent-text); font: inherit; font-weight: 600; }
  .page-loader { display: grid; place-items: center; align-content: center; gap: var(--space-3); min-height: 24rem; color: var(--text-muted); font-size: var(--text-sm); }
  .identity-hero { display: grid; grid-template-columns: auto minmax(18rem,1fr) minmax(14rem,auto); align-items: center; gap: var(--space-5); padding: var(--space-5); border: 1px solid #dbe9f7; border-radius: var(--radius-lg); background: radial-gradient(120% 170% at 8% 0%,rgba(30,108,165,.14),rgba(30,108,165,0) 54%),linear-gradient(155deg,#fcfdff 0%,#f2f7fc 57%,#e9f2fa 100%); box-shadow: var(--shadow-sm),inset 0 1px 0 rgba(255,255,255,.8); flex-shrink: 0; }
  .hero-icon { display: grid; place-items: center; width: 5.5rem; height: 5.5rem; border: 4px solid rgba(255,255,255,.92); border-radius: 1.35rem; color: var(--accent-text); background: linear-gradient(145deg,#e8f3fc,#d6e9f8); font-size: 2rem; box-shadow: 0 8px 24px rgba(31,65,96,.16); }
  .identity-copy { min-width: 0; } .profile-kicker { margin: 0 0 .3rem; color: var(--accent-text); font-size: var(--text-xs); font-weight: var(--weight-bold); letter-spacing: .08em; text-transform: uppercase; }
  .name-row { display: flex; align-items: center; gap: .75rem; flex-wrap: wrap; } .name-row h2 { margin: 0; color: var(--text-strong); font-size: clamp(1.45rem,2.3vw,2rem); font-weight: var(--weight-bold); line-height: 1.18; overflow-wrap: anywhere; }
  .tenant-phone { display: inline-block; margin-top: .65rem; color: var(--text-secondary); font-size: var(--text-sm); text-decoration: none; direction: ltr; }
  .hero-balance { display: flex; flex-direction: column; gap: .15rem; min-width: 14rem; padding: .9rem 1rem; border: 1px solid rgba(30,108,165,.13); border-radius: var(--radius-md); background: rgba(255,255,255,.7); }
  .summary-label { color: var(--text-secondary); font-size: var(--text-xs); font-weight: var(--weight-semibold); } .hero-balance strong { color: var(--text-strong); font-family: var(--font-data); font-size: 1.3rem; font-variant-numeric: tabular-nums; }
  .account-strip { display: grid; grid-template-columns: repeat(3,minmax(0,1fr)); overflow: hidden; border: 1px solid var(--border); border-radius: var(--radius-lg); background: var(--surface); box-shadow: var(--shadow-sm); flex-shrink: 0; }
  .metric { display: flex; align-items: center; gap: .7rem; min-width: 0; padding: .9rem 1rem; border-inline-start: 1px solid var(--border); } .metric:first-child { border-inline-start: 0; } .metric.is-emphasis { background: var(--accent-soft); }
  .metric-icon,.section-icon { display: grid; flex: 0 0 auto; place-items: center; width: 2rem; height: 2rem; border-radius: .6rem; color: var(--accent-text); background: var(--accent-soft); font-size: .9rem; }
  .metric > div { min-width: 0; } .metric-label { display: block; color: var(--text-muted); font-size: .7rem; font-weight: var(--weight-semibold); } .metric strong { display: block; margin-top: .1rem; color: var(--text-strong); font-family: var(--font-data); font-size: .98rem; font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
  .section-card { min-width: 0; padding: var(--space-4); border: 1px solid var(--border); border-radius: var(--radius-lg); background: var(--surface); box-shadow: var(--shadow-sm); flex-shrink: 0; }
  .section-heading { display: flex; align-items: center; gap: .65rem; min-height: 2rem; margin-bottom: var(--space-4); flex-wrap: wrap; } .section-heading h3 { margin: 0; color: var(--text-strong); font-size: var(--text-base); font-weight: var(--weight-bold); flex: 1; }
  .tenant-facts { display: grid; grid-template-columns: repeat(3,minmax(0,1fr)); gap: 1.2rem; margin: 0; } .tenant-facts dt { color: var(--text-muted); font-size: var(--text-xs); font-weight: 400; margin-bottom: .3rem; } .tenant-facts dd { margin: 0; font-size: var(--text-sm); font-weight: 600; color: var(--text-strong); overflow-wrap: anywhere; }
  .record-card { display: flex; flex: 1 1 auto; flex-direction: column; min-height: 0; overflow: hidden; padding: 0; } .record-heading { flex-shrink: 0; margin: 0; padding: var(--space-4); }
  .statement-filters { display: flex; flex-shrink: 0; align-items: flex-end; gap: var(--space-3); flex-wrap: wrap; padding: 0 var(--space-4) var(--space-4); } .filters-field { display: flex; flex-direction: column; gap: .3rem; min-width: 11rem; } .filters-field-label { color: var(--text-muted); font-size: .69rem; font-weight: var(--weight-bold); }
  .statement-summary { display: grid; grid-template-columns: repeat(4,minmax(0,1fr)); gap: 1rem; padding: var(--space-3) var(--space-4); background: var(--surface-muted); border-block: 1px solid var(--border); flex-shrink: 0; } .statement-summary span { display: block; color: var(--text-muted); font-size: var(--text-xs); } .statement-summary strong { display: block; margin-top: .3rem; color: var(--text-strong); font-size: var(--text-sm); overflow-wrap: anywhere; font-variant-numeric: tabular-nums; }
  @media(max-width:1120px) { .identity-hero { grid-template-columns: auto minmax(0,1fr); } .hero-balance { grid-column: 1 / -1; min-width: 0; } }
  @media(max-width:700px) { .tenant-facts { grid-template-columns: repeat(2,minmax(0,1fr)); } .account-strip { grid-template-columns: 1fr; } .metric { border-inline-start: 0; border-top: 1px solid var(--border); } .metric:first-child { border-top: 0; } .statement-summary { grid-template-columns: repeat(2,minmax(0,1fr)); } .filters-field { min-width: 0; flex: 1 1 100%; } }
  @media(max-width:480px) { .identity-hero { padding: var(--space-4); gap: var(--space-3); } .hero-icon { width: 3.5rem; height: 3.5rem; font-size: 1.5rem; } .tenant-facts { grid-template-columns: 1fr; } }
</style>
