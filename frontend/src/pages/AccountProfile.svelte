<script>
  /**
   * One ledger account's file. The register is a list of balances; this is the
   * account behind each row — what it is, every entry posted to it, a dated
   * statement, its year-by-year movement, and the documents that moved it.
   *
   * The tab is a route param (`/accounts/:id?tab=…`) rather than component
   * state, so each section is a deep link that survives a reload and the back
   * button, matching the Settings module.
   *
   * Every figure comes from the account endpoints — the balance from the same
   * base-currency mirrors the register sums — so nothing here can disagree with
   * the Accounts list.
   */
  import { onMount } from 'svelte';
  import { push } from 'svelte-spa-router';
  import AccountLedger from '../components/accounts/TenantAccountLedger.svelte';
  import SecurityDeposits from './SecurityDeposits.svelte';
  import AccountJournals from '../components/accounts/TenantAccountJournals.svelte';
  import { accountTabFromSearch } from '../utils/accountTabs';
  import StatusBadge from '../components/ui/StatusBadge.svelte';
  import ShamsiDatePicker from '../components/ui/ShamsiDatePicker.svelte';
  import { getAccount, getAccountLedger, getAccountSummary } from '../services/accounts';
  import { locale } from '../i18n';
  import { baseCurrency } from '../stores/currency';
  import { accountNameLabel, accountTypeLabel } from '../utils/accountLabels';
  import { formatMoney, formatShortDate } from '../utils/formatters';
  import { reportCsv } from '../utils/reportCsv';

  export let params = {};

  const TYPE_TONES = { ASSET: 'info', LIABILITY: 'warning', EQUITY: 'neutral', INCOME: 'success', EXPENSE: 'danger' };

  let accountId = null;
  let account = null;
  let summary = null;
  let loading = true;
  let errorMessage = '';

  let ledger = { items: [], page: 1, pageSize: 20, total: 0, totalPages: 1 };
  let ledgerLoading = false;

  let statement = { items: [], page: 1, pageSize: 20, total: 0, totalPages: 1 };
  let statementLoading = false;
  let statementLoaded = false;
  let statementFrom = '';
  let statementTo = '';

  // The router hands a component its path params but not the querystring, so the
  // tab is read from the hash directly and kept in sync the way the topbar
  // tracks the current route.
  let search = window.location.hash.split('?')[1] || '';

  $: tab = accountTabFromSearch(search);

  onMount(() => {
    const readSearch = () => { search = window.location.hash.split('?')[1] || ''; };
    window.addEventListener('hashchange', readSearch);
    return () => window.removeEventListener('hashchange', readSearch);
  });

  $: if (params.id && params.id !== accountId) {
    accountId = params.id;
    account = null;
    summary = null;
    ledger = { ...ledger, items: [], page: 1, total: 0, totalPages: 1 };
    statement = { ...statement, items: [], page: 1, total: 0, totalPages: 1 };
    statementLoaded = false;
    statementFrom = '';
    statementTo = '';
    errorMessage = '';
    void load();
  }

  // The Statement section is only fetched once it is opened (or its dates move),
  // so visiting an account never pays for a section nobody looked at.
  $: if (account && tab === 'statement' && !statementLoaded) {
    statementLoaded = true;
    void loadStatement(1);
  }

  $: base = account?.baseCurrency || $baseCurrency;
  $: name = account ? accountNameLabel(account, $locale) : '';
  $: typeLabel = account ? accountTypeLabel(account.type, $locale) : '';

  const emptyTotals = () => ({ openingBalance: 0, debit: 0, credit: 0, closingBalance: 0 });
  function ledgerView(result) {
    return { ...result, items: result.items.map(line => ({ id: line.id, transactionDate: line.journal.transactionDate, referenceType: line.journal.referenceType, referenceNumber: line.journal.journalNumber, description: line.description || line.journal.description, debit: line.baseDebit, credit: line.baseCredit, balanceAfter: line.balanceAfter })), pagination: { page: result.page, totalPages: result.totalPages } };
  }
  $: ledgerResult = ledgerView(ledger);
  $: statementResult = ledgerView(statement);

  async function load() {
    const requestedId = accountId;
    loading = true;
    try {
      const [accountResponse, summaryResponse] = await Promise.all([
        getAccount(requestedId),
        getAccountSummary(requestedId),
      ]);
      if (requestedId !== accountId) return;
      account = accountResponse.account;
      summary = summaryResponse;
      await loadLedger(1);
    } catch (error) {
      if (requestedId !== accountId) return;
      errorMessage = error.message || $locale.accountProfile.loadError;
    } finally {
      if (requestedId === accountId) loading = false;
    }
  }

  async function loadLedger(page) {
    const requestedId = accountId;
    ledgerLoading = true;
    try {
      const response = await getAccountLedger(requestedId, { page, pageSize: ledger.pageSize });
      if (requestedId !== accountId) return;
      ledger = { items: response.items || [], page: response.pagination.page, pageSize: response.pagination.pageSize, total: response.pagination.total, totalPages: response.pagination.totalPages, totals: response.totals || emptyTotals() };
    } catch (error) {
      if (requestedId === accountId) errorMessage = error.message;
    } finally {
      if (requestedId === accountId) ledgerLoading = false;
    }
  }

  let statementVersion = 0;
  async function loadStatement(page) {
    const version = ++statementVersion;
    const requestedId = accountId;
    errorMessage = '';
    statement = { ...statement, items: [], totals: emptyTotals() };
    if (statementFrom && statementTo && statementFrom > statementTo) { errorMessage = $locale.tenantAccountProfile.invalidDates; statementLoading = false; return; }
    statementLoading = true;
    try {
      const response = await getAccountLedger(requestedId, { page, pageSize: statement.pageSize, from: statementFrom, to: statementTo });
      if (requestedId !== accountId || version !== statementVersion) return;
      statement = { items: response.items || [], page: response.pagination.page, pageSize: response.pagination.pageSize, total: response.pagination.total, totalPages: response.pagination.totalPages, totals: response.totals || emptyTotals() };
    } catch (error) {
      if (requestedId === accountId && version === statementVersion) errorMessage = error.message;
    } finally {
      if (requestedId === accountId && version === statementVersion) statementLoading = false;
    }
  }


  function clearDates() {
    statementFrom = '';
    statementTo = '';
    void loadStatement(1);
  }


  let exporting = false;
  async function exportStatement() {
    if (exporting) return;
    exporting = true;
    const id = accountId, from = statementFrom, to = statementTo;
    try {
    const items = []; let page = 1, pages = 1;
    do { const response = await getAccountLedger(id, { page, pageSize: 100, from, to }); if (id !== accountId || from !== statementFrom || to !== statementTo) return; items.push(...response.items); pages = response.pagination.totalPages; page++; } while (page <= pages);
    const headers = [$locale.accounts.date, $locale.accounts.journal, $locale.accounts.descriptionColumn, $locale.accountProfile.source, $locale.accounts.debit, $locale.accounts.credit, $locale.accounts.balance];
    const rows = items.map((line) => [
      line.journal.transactionDate.slice(0, 10),
      line.journal.journalNumber,
      line.description || line.journal.description || '',
      sourceLabel(line.journal.referenceType),
      line.baseDebit || '',
      line.baseCredit || '',
      line.balanceAfter,
    ]);
    const url = URL.createObjectURL(new Blob([reportCsv(headers, rows)], { type: 'text/csv;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `account-statement-${accountId}.csv`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) { errorMessage = error.message || $locale.accountProfile.loadError; } finally { exporting = false; }
  }

  /** A label from a source map, falling back to the raw value rather than a blank. */
  function sourceLabel(referenceType) {
    if (!referenceType) return '—';
    return $locale.accountProfile.sources[referenceType] || referenceType;
  }

</script>

<svelte:head>
  <title>{account ? name : $locale.accountProfile.title} | {$locale.common.apartmentPro}</title>
</svelte:head>

<div class="account-profile-page">
  <div class="profile-breadcrumb"><button type="button" on:click={() => push('/accounts')}><i class="bi bi-arrow-return-left" aria-hidden="true"></i> {$locale.accounts.title}</button><span>/</span><span>{name || $locale.accountProfile.title}</span></div>

  <h1 class="visually-hidden">{$locale.accountProfile.title}</h1>

  {#if errorMessage}
    <div class="alert alert-danger" role="alert">{errorMessage}</div>
  {/if}

  {#if loading && !account}
    <div class="page-loader" role="status">
      <div class="spinner-border text-primary" aria-hidden="true"></div>
      <span>{$locale.accountProfile.loading}</span>
    </div>
  {/if}

  {#if account}
    {#if tab === 'overview'}
      <section class="identity-hero" aria-labelledby="account-name">
        <span class="hero-icon" aria-hidden="true"><i class="bi bi-bank"></i></span>

        <div class="identity-copy">
          <p class="profile-kicker">{$locale.accountProfile.title}</p>
          <div class="name-row">
            <h2 id="account-name">{name}</h2>
            <StatusBadge label={typeLabel} tone={TYPE_TONES[account.type] || 'neutral'} />
            <StatusBadge
              label={account.isActive ? $locale.accountProfile.active : $locale.accountProfile.inactive}
              tone={account.isActive ? 'success' : 'neutral'}
            />
          </div>
        </div>

        <aside class="hero-balance" aria-label={$locale.accounts.balance}>
          <span class="summary-label">{$locale.accounts.balance}</span>
          <strong>{formatMoney(account.balance, base)}</strong>
        </aside>
      </section>

      <section class="account-strip" aria-label={$locale.accountProfile.details}>
        {#each [
          { key: 'debit', value: account.baseDebit ?? account.debit, icon: 'bi-arrow-down-left-circle', emphasis: false },
          { key: 'credit', value: account.baseCredit ?? account.credit, icon: 'bi-arrow-up-right-circle', emphasis: false },
          { key: 'balance', value: account.balance, icon: 'bi-wallet2', emphasis: true },
        ] as metric}
          <article class:is-emphasis={metric.emphasis} class="metric">
            <span class="metric-icon" aria-hidden="true"><i class={`bi ${metric.icon}`}></i></span>
            <div>
              <span class="metric-label">{$locale.accounts[metric.key]}</span>
              <strong>{formatMoney(metric.value, base)}</strong>
            </div>
          </article>
        {/each}
      </section>

      <section class="section-card"><header class="section-heading"><span class="section-icon" aria-hidden="true"><i class="bi bi-card-list"></i></span><h3>{$locale.accountProfile.details}</h3></header>
        <dl class="account-facts">{#each [{ label: $locale.accounts.name, value: name }, { label: $locale.accounts.type, value: typeLabel }, { label: $locale.accountProfile.kind, value: account.systemKey ? $locale.accountProfile.builtIn : $locale.accountProfile.custom }, { label: $locale.accountProfile.statusLabel, value: account.isActive ? $locale.accountProfile.active : $locale.accountProfile.inactive }, { label: $locale.accountProfile.entries, value: summary?.totals?.entries ?? ledger.total }, { label: $locale.leases.currency, value: base }] as fact}<div><dt>{fact.label}</dt><dd>{fact.value ?? '—'}</dd></div>{/each}</dl>
      </section>
      {#if account.systemKey === 'SECURITY_DEPOSIT_LIABILITY'}
        <SecurityDeposits embedded on:change={load} />
      {/if}

    {/if}

    {#if tab === 'financial-report'}
      <section class="section-card record-card" aria-labelledby="account-ledger">
        <header class="section-heading record-heading"><span class="section-icon" aria-hidden="true"><i class="bi bi-journal-text"></i></span><h3 id="account-ledger">{name} · {$locale.accountProfile['financial-report']}</h3></header>
        <AccountLedger result={ledgerResult} loading={ledgerLoading} {base} onPage={loadLedger} />
      </section>
    {/if}

    {#if tab === 'statement'}
      <section class="section-card record-card" aria-labelledby="account-statement">
        <header class="section-heading record-heading">
          <span class="section-icon" aria-hidden="true"><i class="bi bi-file-earmark-spreadsheet"></i></span>
          <h3 id="account-statement">{name} · {$locale.accountProfile.statement}</h3>
        </header>
        <div class="statement-filters">
          <div class="filters-field">
            <label class="filters-field-label" for="statement-from">{$locale.accountProfile.dateFrom}</label>
            <ShamsiDatePicker id="statement-from" bind:value={statementFrom} disabled={exporting} on:change={() => loadStatement(1)} />
          </div>
          <div class="filters-field">
            <label class="filters-field-label" for="statement-to">{$locale.accountProfile.dateTo}</label>
            <ShamsiDatePicker id="statement-to" bind:value={statementTo} disabled={exporting} on:change={() => loadStatement(1)} />
          </div>
          <button class="btn btn-light btn-sm" type="button" on:click={clearDates}>{$locale.accountProfile.clearDates}</button>
          <button class="btn btn-outline-primary btn-sm" type="button" on:click={exportStatement} disabled={exporting || statementLoading || statement.items.length === 0}>
            <i class="bi bi-download" aria-hidden="true"></i>
            {$locale.accountProfile.exportCsv}
          </button>
        </div>
        {#if !statementLoading}<div class="statement-summary">{#each ['openingBalance','debit','credit','closingBalance'] as key}<div><span>{['debit','credit'].includes(key) ? $locale.accounts[key] : $locale.accountProfile[key]}</span><strong>{formatMoney((statement.totals || emptyTotals())[key],base)}</strong></div>{/each}</div>{/if}
        <AccountLedger result={statementResult} loading={statementLoading} {base} statement={true} onPage={loadStatement} />
      </section>
    {/if}

    {#if tab === 'journals'}
      {#key accountId}
        <AccountJournals {accountId} accountLabel={name} />
      {/key}
    {/if}

  {/if}
</div>

<style>
  .profile-breadcrumb { display:flex; align-items:center; gap:.6rem; color:var(--text-muted); font-size:var(--text-xs); flex-shrink:0; }
  .profile-breadcrumb button { border:0; background:none; color:var(--accent-text); font:inherit; padding:.25rem 0; }
  .account-facts { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:1.2rem; margin:0; }
  .account-facts dt { color:var(--text-muted); font-size:var(--text-xs); font-weight:400; margin-bottom:.3rem; }
  .account-facts dd { margin:0; color:var(--text-strong); font-size:var(--text-sm); font-weight:600; overflow-wrap:anywhere; }
  .statement-summary { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:1rem; padding:var(--space-3) var(--space-4); background:var(--surface-muted); border-block:1px solid var(--border); flex-shrink:0; }
  .statement-summary span { display:block; color:var(--text-muted); font-size:var(--text-xs); }
  .statement-summary strong { display:block; margin-top:.3rem; font-size:var(--text-sm); overflow-wrap:anywhere; font-variant-numeric:tabular-nums; }
  @media(max-width:700px) { .account-facts,.statement-summary { grid-template-columns:repeat(2,minmax(0,1fr)); } }
  @media(max-width:480px) { .account-facts { grid-template-columns:1fr; } }

  .account-profile-page { display: flex; flex: 1 1 auto; flex-direction: column; min-width: 0; min-height: 0; gap: var(--space-4); }
  .identity-hero, .account-strip { flex-shrink: 0; }

  .page-loader { display: grid; place-items: center; align-content: center; gap: var(--space-3); min-height: 24rem; color: var(--text-muted); font-size: var(--text-sm); }

  .identity-hero { display: grid; grid-template-columns: auto minmax(18rem, 1fr) minmax(14rem, auto); align-items: center; gap: var(--space-5); padding: var(--space-5); border: 1px solid #dbe9f7; border-radius: var(--radius-lg); background: radial-gradient(120% 170% at 8% 0%, rgba(30,108,165,.14), rgba(30,108,165,0) 54%), linear-gradient(155deg,#fcfdff 0%,#f2f7fc 57%,#e9f2fa 100%); box-shadow: var(--shadow-sm), inset 0 1px 0 rgba(255,255,255,.8); }
  .hero-icon { display: grid; place-items: center; width: 5.5rem; height: 5.5rem; border: 4px solid rgba(255,255,255,.92); border-radius: 1.35rem; color: var(--accent-text); background: linear-gradient(145deg,#e8f3fc,#d6e9f8); font-size: 2rem; box-shadow: 0 8px 24px rgba(31,65,96,.16); }
  .identity-copy { min-width: 0; }
  .profile-kicker { margin: 0 0 .3rem; color: var(--accent-text); font-size: var(--text-xs); font-weight: var(--weight-bold); letter-spacing: .08em; text-transform: uppercase; }
  .name-row { display: flex; align-items: center; gap: .75rem; flex-wrap: wrap; }
  .name-row h2 { margin: 0; color: var(--text-strong); font-size: clamp(1.45rem,2.3vw,2rem); font-weight: var(--weight-bold); line-height: 1.18; }
  .hero-balance { display: flex; flex-direction: column; gap: .15rem; min-width: 14rem; padding: .9rem 1rem; border: 1px solid rgba(30,108,165,.13); border-radius: var(--radius-md); background: rgba(255,255,255,.7); }
  .hero-balance .summary-label { color: var(--text-secondary); font-size: var(--text-xs); font-weight: var(--weight-semibold); }
  .hero-balance strong { color: var(--text-strong); font-family: var(--font-data); font-size: 1.3rem; font-variant-numeric: tabular-nums; }

  .account-strip { display: grid; grid-template-columns: repeat(3,minmax(0,1fr)); overflow: hidden; border: 1px solid var(--border); border-radius: var(--radius-lg); background: var(--surface); box-shadow: var(--shadow-sm); }
  .metric { display: flex; align-items: center; gap: .7rem; min-width: 0; padding: .9rem 1rem; border-inline-start: 1px solid var(--border); }
  .metric:first-child { border-inline-start: 0; }
  .metric.is-emphasis { background: var(--accent-soft); }
  .metric-icon { display: grid; flex: 0 0 auto; place-items: center; width: 2rem; height: 2rem; border-radius: .6rem; color: var(--accent-text); background: var(--accent-soft); font-size: .9rem; }
  .metric > div { min-width: 0; }
  .metric-label { display: block; overflow: hidden; color: var(--text-muted); font-size: .7rem; font-weight: var(--weight-semibold); letter-spacing: .035em; text-overflow: ellipsis; text-transform: uppercase; white-space: nowrap; }
  .metric strong { display: block; margin-block-start: .1rem; overflow: hidden; color: var(--text-strong); font-family: var(--font-data); font-size: .98rem; font-variant-numeric: tabular-nums; text-overflow: ellipsis; white-space: nowrap; }


  .section-card { min-width: 0; padding: var(--space-4); border: 1px solid var(--border); border-radius: var(--radius-lg); background: var(--surface); box-shadow: var(--shadow-sm); }
  .section-heading { display: flex; align-items: center; gap: .65rem; min-height: 2rem; margin-block-end: var(--space-4); }
  .section-heading h3 { margin: 0 auto 0 0; color: var(--text-strong); font-size: var(--text-base); font-weight: var(--weight-bold); }
  :global([dir='rtl']) .section-heading h3 { margin: 0 0 0 auto; }
  .section-icon { display: grid; flex: 0 0 auto; place-items: center; width: 2rem; height: 2rem; border-radius: .6rem; color: var(--accent-text); background: var(--accent-soft); font-size: .9rem; }
  .data-value,.money-value { color: var(--text-strong); font-family: var(--font-data); font-weight: var(--weight-semibold); font-variant-numeric: tabular-nums; }

  .record-card { display: flex; flex: 1 1 auto; flex-direction: column; min-height: 0; overflow: hidden; padding: 0; }
  .record-heading { flex-shrink: 0; margin: 0; padding: var(--space-4); }
  .record-card :global(.table) { --bs-table-bg: transparent; }
  .record-card :global(.table > :not(caption) > * > *) { padding-inline: var(--space-4); }
  .record-card :global(.table thead th) { background: var(--surface-hover); }
  .record-card :global(.table tbody tr:last-child > *) { border-block-end: 0; }
  .record-card :global(.table tfoot td) { border-block-start: 2px solid var(--border-strong); color: var(--text-strong); font-weight: var(--weight-bold); background: var(--surface-hover); }
  .statement-filters { display: flex; flex-shrink: 0; align-items: flex-end; gap: var(--space-3); flex-wrap: wrap; padding: 0 var(--space-4) var(--space-4); }
  .filters-field { display: flex; flex-direction: column; gap: .3rem; min-width: 11rem; }
  .filters-field-label { color: var(--text-muted); font-size: .69rem; font-weight: var(--weight-bold); letter-spacing: .045em; text-transform: uppercase; }

  @media (max-width: 1120px) {
    .identity-hero { grid-template-columns: auto 1fr; }
    .hero-balance { grid-column: 1/-1; min-width: 0; }
    .account-strip { grid-template-columns: repeat(2,minmax(0,1fr)); }
    .metric:nth-child(3) { border-inline-start: 0; border-block-start: 1px solid var(--border); }
  }
  @media (max-width: 820px) {
  }
  @media (max-width: 600px) {
    .name-row { justify-content: center; }
    .identity-hero { grid-template-columns: 1fr; justify-items: center; padding: var(--space-4); text-align: center; }
    .hero-icon { width: 4.5rem; height: 4.5rem; }
    .hero-balance { text-align: start; }
    .account-strip { grid-template-columns: 1fr; }
    .metric,.metric:nth-child(3) { border-inline-start: 0; border-block-start: 1px solid var(--border); }
    .metric:first-child { border-block-start: 0; }
    .section-card { padding: var(--space-3); }
    .record-card { padding: 0; }
    .record-heading { padding: var(--space-3); }
    .record-card :global(.table > :not(caption) > * > *) { padding-inline: var(--space-3); }
    .statement-filters { padding-inline: var(--space-3); }
    .filters-field { min-width: 0; flex: 1 1 100%; }
  }
</style>

