<script>
  import Pagination from '../ui/Pagination.svelte';
  import { locale } from '../../i18n';
  import { formatMoney, formatShortDate } from '../../utils/formatters';
  export let result = { items: [], pagination: { page: 1, totalPages: 0 } };
  export let loading = false;
  export let base = 'AFN';
  export let onPage = () => {};
  export let statement = false;
  $: t = $locale.tenantAccounts;
  const source = value => $locale.accountProfile.sources[value] || value;
</script>
{#if loading}<p class="ledger-empty" role="status">{t.loading}</p>
{:else if !result.items.length}<p class="ledger-empty">{statement ? $locale.accountProfile.noEntriesInPeriod : $locale.accountProfile.noEntries}</p>
{:else}
  <div class="table-responsive">
    <table class="table align-middle mb-0">
      <thead><tr><th>{t.date}</th><th>{t.reference}</th><th>{t.descriptionColumn}</th><th class="amount-cell">{t.debit}</th><th class="amount-cell">{t.credit}</th><th class="amount-cell">{t.balanceAfter}</th></tr></thead>
      <tbody>{#each result.items as entry (entry.id)}<tr>
        <td class="date-cell">{formatShortDate(entry.transactionDate)}</td>
        <td><strong>{source(entry.referenceType)}</strong>{#if entry.referenceNumber}<small class="reference-number">{entry.referenceNumber}</small>{/if}</td>
        <td>{entry.description || '—'}</td>
        <td class="amount-cell">{entry.debit ? formatMoney(entry.debit,base) : '—'}</td><td class="amount-cell">{entry.credit ? formatMoney(entry.credit,base) : '—'}</td><td class="amount-cell balance-cell">{formatMoney(entry.balanceAfter,base)}</td>
      </tr>{/each}</tbody>
    </table>
  </div>
  <footer class="record-footer"><Pagination page={result.pagination.page} totalPages={result.pagination.totalPages} previousLabel={t.previous} nextLabel={t.next} label={t.page.replace('{page}',result.pagination.page).replace('{totalPages}',result.pagination.totalPages)} {onPage} /></footer>
{/if}
<style>
  .table-responsive { flex: 1 1 auto; min-height: 0; overflow: auto; } .table { --bs-table-bg: transparent; min-width: 680px; } th,td { padding-inline: var(--space-4); } th { background: var(--surface-hover); } .amount-cell { text-align: end; white-space: nowrap; font-variant-numeric: tabular-nums; } .balance-cell { font-weight: 600; } .reference-number { display: block; color: var(--text-muted); font-size: var(--text-xs); } .ledger-empty { display: grid; place-items: center; min-height: 10rem; padding: var(--space-4); color: var(--text-muted); font-size: var(--text-sm); margin: 0; } .record-footer { padding: var(--space-2) var(--space-4); border-top: 1px solid var(--border); }
</style>
