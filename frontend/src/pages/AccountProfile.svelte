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
  import { accountTabFromSearch } from '../utils/accountTabs';
  import StatusBadge from '../components/ui/StatusBadge.svelte';
  import Pagination from '../components/ui/Pagination.svelte';
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
  $: sources = summary?.bySource || [];
  $: years = summary?.byYear || [];
  $: yearTotals = years.reduce(
    (sum, row) => ({ entries: sum.entries + row.entries, debit: sum.debit + row.debit, credit: sum.credit + row.credit, net: sum.net + row.net }),
    { entries: 0, debit: 0, credit: 0, net: 0 },
  );

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
      ledger = { items: response.items || [], page: response.pagination.page, pageSize: response.pagination.pageSize, total: response.pagination.total, totalPages: response.pagination.totalPages };
    } catch (error) {
      if (requestedId === accountId) errorMessage = error.message;
    } finally {
      if (requestedId === accountId) ledgerLoading = false;
    }
  }

  async function loadStatement(page) {
    const requestedId = accountId;
    statementLoading = true;
    try {
      const response = await getAccountLedger(requestedId, { page, pageSize: statement.pageSize, from: statementFrom, to: statementTo });
      if (requestedId !== accountId) return;
      statement = { items: response.items || [], page: response.pagination.page, pageSize: response.pagination.pageSize, total: response.pagination.total, totalPages: response.pagination.totalPages };
    } catch (error) {
      if (requestedId === accountId) errorMessage = error.message;
    } finally {
      if (requestedId === accountId) statementLoading = false;
    }
  }


  function clearDates() {
    statementFrom = '';
    statementTo = '';
    void loadStatement(1);
  }

  function entrySub(line) {
    if (!line.journal.currency || line.journal.currency === base) return '';
    return `${formatMoney(line.debit, line.journal.currency)} @ ${line.journal.exchangeRate}`;
  }

  function exportStatement() {
    const headers = [$locale.accounts.date, $locale.accounts.journal, $locale.accounts.descriptionColumn, $locale.accountProfile.source, $locale.accounts.debit, $locale.accounts.credit, $locale.accounts.balance];
    const rows = statement.items.map((line) => [
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
  }

  /** A label from a source map, falling back to the raw value rather than a blank. */
  function sourceLabel(referenceType) {
    if (!referenceType) return '—';
    return $locale.accountProfile.sources[referenceType] || referenceType;
  }

  function paginationLabel(page, totalPages) {
    return $locale.common.page.replace('{page}', page).replace('{totalPages}', totalPages);
  }

  function summaryLabel(set) {
    return $locale.accountProfile.showingEntries
      .replace('{from}', (set.page - 1) * set.pageSize + 1)
      .replace('{to}', Math.min(set.page * set.pageSize, set.total))
      .replace('{total}', set.total);
  }
</script>

<svelte:head>
  <title>{account ? name : $locale.accountProfile.title} | {$locale.common.apartmentPro}</title>
</svelte:head>

<div class="account-profile-page">

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
        { key: 'debit', value: account.debit, icon: 'bi-arrow-down-left-circle', emphasis: false },
        { key: 'credit', value: account.credit, icon: 'bi-arrow-up-right-circle', emphasis: false },
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

    {#if tab === 'ledger'}
      <section class="section-card record-card" aria-labelledby="account-ledger">
        <header class="section-heading record-heading">
          <span class="section-icon" aria-hidden="true"><i class="bi bi-journal-text"></i></span>
          <h3 id="account-ledger">{$locale.accountProfile.ledger}</h3>
        </header>
        {#if ledgerLoading && ledger.items.length === 0}
          <p class="empty record-empty" role="status">{$locale.accounts.loading}</p>
        {:else if ledger.items.length === 0}
          <p class="empty record-empty">{$locale.accountProfile.noEntries}</p>
        {:else}
          <div class="table-responsive">
            <table class="table align-middle mb-0">
              <thead>
                <tr>
                  <th>{$locale.accounts.date}</th>
                  <th>{$locale.accounts.journal}</th>
                  <th>{$locale.accounts.descriptionColumn}</th>
                  <th>{$locale.accounts.tenant}</th>
                  <th class="amount-cell">{$locale.accounts.debit}</th>
                  <th class="amount-cell">{$locale.accounts.credit}</th>
                </tr>
              </thead>
              <tbody>
                {#each ledger.items as line (line.id)}
                  <tr>
                    <td>{formatShortDate(line.journal.transactionDate)}</td>
                    <td class="data-value">{line.journal.journalNumber}</td>
                    <td>{line.description || line.journal.description || '—'}{#if entrySub(line)}<small class="cell-sub">{entrySub(line)}</small>{/if}</td>
                    <td>{line.tenant?.firstName || '—'}</td>
                    <td class="amount-cell">{formatMoney(line.baseDebit, base)}</td>
                    <td class="amount-cell">{formatMoney(line.baseCredit, base)}</td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
          {#if ledger.totalPages > 1}
            <footer class="record-footer">
              <Pagination
                page={ledger.page}
                totalPages={ledger.totalPages}
                previousLabel={$locale.common.previous}
                nextLabel={$locale.common.next}
                label={paginationLabel(ledger.page, ledger.totalPages)}
                summary={summaryLabel(ledger)}
                onPage={(page) => loadLedger(page)}
              />
            </footer>
          {/if}
        {/if}
      </section>
    {/if}

    {#if tab === 'statement'}
      <section class="section-card record-card" aria-labelledby="account-statement">
        <header class="section-heading record-heading">
          <span class="section-icon" aria-hidden="true"><i class="bi bi-file-earmark-spreadsheet"></i></span>
          <h3 id="account-statement">{$locale.accountProfile.statement}</h3>
        </header>
        <div class="statement-filters">
          <div class="filters-field">
            <label class="filters-field-label" for="statement-from">{$locale.accountProfile.dateFrom}</label>
            <ShamsiDatePicker id="statement-from" bind:value={statementFrom} on:change={() => loadStatement(1)} />
          </div>
          <div class="filters-field">
            <label class="filters-field-label" for="statement-to">{$locale.accountProfile.dateTo}</label>
            <ShamsiDatePicker id="statement-to" bind:value={statementTo} on:change={() => loadStatement(1)} />
          </div>
          <button class="btn btn-light btn-sm" type="button" on:click={clearDates}>{$locale.accountProfile.clearDates}</button>
          <button class="btn btn-outline-primary btn-sm" type="button" on:click={exportStatement} disabled={statement.items.length === 0}>
            <i class="bi bi-download" aria-hidden="true"></i>
            {$locale.accountProfile.exportCsv}
          </button>
        </div>
        {#if statementLoading && statement.items.length === 0}
          <p class="empty record-empty" role="status">{$locale.accounts.loading}</p>
        {:else if statement.items.length === 0}
          <p class="empty record-empty">{$locale.accountProfile.noEntriesInPeriod}</p>
        {:else}
          <div class="table-responsive">
            <table class="table align-middle mb-0">
              <thead>
                <tr>
                  <th>{$locale.accounts.date}</th>
                  <th>{$locale.accounts.journal}</th>
                  <th>{$locale.accountProfile.source}</th>
                  <th>{$locale.accounts.descriptionColumn}</th>
                  <th class="amount-cell">{$locale.accounts.debit}</th>
                  <th class="amount-cell">{$locale.accounts.credit}</th>
                  <th class="amount-cell">{$locale.accounts.balance}</th>
                </tr>
              </thead>
              <tbody>
                {#each statement.items as line (line.id)}
                  <tr>
                    <td>{formatShortDate(line.journal.transactionDate)}</td>
                    <td class="data-value">{line.journal.journalNumber}</td>
                    <td>{sourceLabel(line.journal.referenceType)}</td>
                    <td>{line.description || line.journal.description || '—'}</td>
                    <td class="amount-cell">{line.baseDebit ? formatMoney(line.baseDebit, base) : '—'}</td>
                    <td class="amount-cell">{line.baseCredit ? formatMoney(line.baseCredit, base) : '—'}</td>
                    <td class="amount-cell money-value">{formatMoney(line.balanceAfter, base)}</td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
          <footer class="record-footer">
            <Pagination
              page={statement.page}
              totalPages={statement.totalPages}
              previousLabel={$locale.common.previous}
              nextLabel={$locale.common.next}
              label={paginationLabel(statement.page, statement.totalPages)}
              summary={summaryLabel(statement)}
              onPage={(page) => loadStatement(page)}
            />
          </footer>
        {/if}
      </section>
    {/if}

    {#if tab === 'annual'}
      <section class="section-card record-card" aria-labelledby="account-annual">
        <header class="section-heading record-heading">
          <span class="section-icon" aria-hidden="true"><i class="bi bi-calendar3"></i></span>
          <h3 id="account-annual">{$locale.accountProfile.annual}</h3>
        </header>
        {#if years.length === 0}
          <p class="empty record-empty">{$locale.accountProfile.noEntries}</p>
        {:else}
          <div class="table-responsive">
            <table class="table align-middle mb-0">
              <thead>
                <tr>
                  <th>{$locale.accountProfile.year}</th>
                  <th class="amount-cell">{$locale.accountProfile.entries}</th>
                  <th class="amount-cell">{$locale.accounts.debit}</th>
                  <th class="amount-cell">{$locale.accounts.credit}</th>
                  <th class="amount-cell">{$locale.accountProfile.netMovement}</th>
                </tr>
              </thead>
              <tbody>
                {#each years as row (row.year)}
                  <tr>
                    <td class="data-value">{row.year}</td>
                    <td class="amount-cell">{row.entries}</td>
                    <td class="amount-cell">{formatMoney(row.debit, base)}</td>
                    <td class="amount-cell">{formatMoney(row.credit, base)}</td>
                    <td class="amount-cell money-value">{formatMoney(row.net, base)}</td>
                  </tr>
                {/each}
              </tbody>
              <tfoot>
                <tr>
                  <td>{$locale.accountProfile.totals}</td>
                  <td class="amount-cell">{yearTotals.entries}</td>
                  <td class="amount-cell">{formatMoney(yearTotals.debit, base)}</td>
                  <td class="amount-cell">{formatMoney(yearTotals.credit, base)}</td>
                  <td class="amount-cell money-value">{formatMoney(yearTotals.net, base)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        {/if}
      </section>
    {/if}

    {#if tab === 'documents'}
      <section class="section-card record-card" aria-labelledby="account-documents">
        <header class="section-heading record-heading">
          <span class="section-icon" aria-hidden="true"><i class="bi bi-diagram-3"></i></span>
          <h3 id="account-documents">{$locale.accountProfile.documents}</h3>
        </header>
        {#if sources.length === 0}
          <p class="empty record-empty">{$locale.accountProfile.noEntries}</p>
        {:else}
          <div class="table-responsive">
            <table class="table align-middle mb-0">
              <thead>
                <tr>
                  <th>{$locale.accountProfile.source}</th>
                  <th class="amount-cell">{$locale.accountProfile.entries}</th>
                  <th class="amount-cell">{$locale.accounts.debit}</th>
                  <th class="amount-cell">{$locale.accounts.credit}</th>
                  <th class="amount-cell">{$locale.accountProfile.netMovement}</th>
                </tr>
              </thead>
              <tbody>
                {#each sources as row (row.referenceType)}
                  <tr>
                    <td>{sourceLabel(row.referenceType)}</td>
                    <td class="amount-cell">{row.entries}</td>
                    <td class="amount-cell">{formatMoney(row.debit, base)}</td>
                    <td class="amount-cell">{formatMoney(row.credit, base)}</td>
                    <td class="amount-cell money-value">{formatMoney(row.net, base)}</td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        {/if}
      </section>
    {/if}
  {/if}
</div>

<style>
  .account-profile-page { display: flex; flex: 1 1 auto; flex-direction: column; min-width: 0; gap: var(--space-4); padding-block-end: var(--space-4); }

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

  .record-card { overflow: hidden; padding: 0; }
  .record-heading { margin: 0; padding: var(--space-4); }
  .record-card :global(.table) { --bs-table-bg: transparent; }
  .record-card :global(.table > :not(caption) > * > *) { padding-inline: var(--space-4); }
  .record-card :global(.table thead th) { background: var(--surface-hover); }
  .record-card :global(.table tbody tr:last-child > *) { border-block-end: 0; }
  .record-card :global(.table tfoot td) { border-block-start: 2px solid var(--border-strong); color: var(--text-strong); font-weight: var(--weight-bold); background: var(--surface-hover); }
  .record-card small { margin-inline-start: .3rem; color: var(--text-muted); font-family: var(--font-ui); font-size: var(--text-xs); font-weight: var(--weight-regular); }
  .cell-sub { display: block; color: var(--text-muted); font-family: var(--font-ui); font-size: var(--text-xs); font-weight: var(--weight-regular); }
  .record-empty { padding: 0 var(--space-4) var(--space-4); }
  .record-footer { border-block-start: 1px solid var(--border); padding: var(--space-2) var(--space-4); }
  .statement-filters { display: flex; align-items: flex-end; gap: var(--space-3); flex-wrap: wrap; padding: 0 var(--space-4) var(--space-4); }
  .filters-field { display: flex; flex-direction: column; gap: .3rem; min-width: 11rem; }
  .filters-field-label { color: var(--text-muted); font-size: .69rem; font-weight: var(--weight-bold); letter-spacing: .045em; text-transform: uppercase; }
  .empty { margin: 0; color: var(--text-muted); font-size: var(--text-sm); }
  .amount-cell { text-align: end; font-variant-numeric: tabular-nums; }

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
