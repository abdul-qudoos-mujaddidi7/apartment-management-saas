<script>
  /**
   * One journal entry, read-only: the date, source and status, then the lines
   * with their totals. Shared by the Journals register and the journals tab on an
   * account's file, so both read the same document the same way.
   */
  import { createEventDispatcher } from 'svelte';
  import Modal from '../ui/Modal.svelte';
  import StatusBadge from '../ui/StatusBadge.svelte';
  import { locale } from '../../i18n';
  import { formatMoney, formatShortDate } from '../../utils/formatters';

  const dispatch = createEventDispatcher();

  export let open = false;
  export let entry = null;

  /* The dialog closes itself and tells the page, so a page that holds the open
     flag on its own (to clear the entry it was showing) still hears about it. */
  function close() {
    open = false;
    dispatch('close');
  }

  const tenantName = (tenant) => [tenant?.firstName].filter(Boolean).join(' ') || '—';

  /** A line tagged to a tenant reads as "account · tenant" everywhere. */
  function accountLabel(line) {
    const account = line.account ? line.account.name : '—';
    return line.tenant ? `${account} · ${tenantName(line.tenant)}` : account;
  }

  /** Source labels come from the shared map, so an unknown type shows as itself. */
  const sourceLabel = (type) => (type ? $locale.accountProfile.sources[type] || type : '—');
  const statusLabel = (status) => (status === 'POSTED' ? $locale.journals.posted : $locale.journals.voided);
  const statusTone = (status) => (status === 'POSTED' ? 'success' : 'danger');
</script>

<Modal
  bind:open
  title={entry ? entry.journalNumber : ''}
  description={$locale.journals.detailsHint}
  size="modal-lg"
  icon="bi-journal-text"
  closeLabel={$locale.common.close}
  on:close={close}
>
  {#if entry}
    <dl class="journal-details">
      <div><dt>{$locale.journals.date}</dt><dd>{formatShortDate(entry.transactionDate)}</dd></div>
      <div><dt>{$locale.journals.source}</dt><dd><StatusBadge label={sourceLabel(entry.referenceType)} tone={entry.isManual ? 'info' : 'neutral'} /></dd></div>
      <div><dt>{$locale.journals.status}</dt><dd><StatusBadge label={statusLabel(entry.status)} tone={statusTone(entry.status)} /></dd></div>
      <div><dt>{$locale.journals.description}</dt><dd>{entry.description || '—'}</dd></div>
    </dl>

    {#if entry.status === 'VOIDED' && entry.voidReason}
      <p class="journal-void-reason"><strong>{$locale.journals.voidReasonLabel}:</strong> {entry.voidReason}</p>
    {/if}

    <div class="table-responsive">
      <table class="table journal-lines-table">
        <thead>
          <tr>
            <th>{$locale.journals.account}</th>
            <th>{$locale.journals.memo}</th>
            <th class="text-end">{$locale.journals.debit}</th>
            <th class="text-end">{$locale.journals.credit}</th>
          </tr>
        </thead>
        <tbody>
          {#each entry.lines as line (line.id)}
            <tr>
              <td>{accountLabel(line)}</td>
              <td>{line.description || '—'}</td>
              <td class="amount-cell text-end">{line.debit ? formatMoney(line.debit, entry.currency) : '—'}</td>
              <td class="amount-cell text-end">{line.credit ? formatMoney(line.credit, entry.currency) : '—'}</td>
            </tr>
          {/each}
        </tbody>
        <tfoot>
          <tr>
            <th colspan="2">{$locale.journals.totals}</th>
            <td class="amount-cell text-end">{formatMoney(entry.debitTotal, entry.currency)}</td>
            <td class="amount-cell text-end">{formatMoney(entry.creditTotal, entry.currency)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  {/if}

  <div slot="footer">
    <button class="btn btn-light" type="button" on:click={close}>{$locale.common.close}</button>
  </div>
</Modal>

<style>
  .journal-details { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 1rem; margin: 0; }
  .journal-details dt { color: var(--text-muted); font-size: 0.8rem; }
  .journal-details dd { margin: 0.25rem 0 0; font-weight: 600; }
  .journal-void-reason { margin: 1rem 0; padding: 0.625rem 0.75rem; border: 1px solid var(--danger-border, var(--border)); border-radius: var(--radius-sm); background: var(--danger-soft, var(--surface-muted)); font-size: var(--text-sm); }
  .journal-lines-table { margin-block-end: 0; }
  .journal-lines-table th { white-space: nowrap; }
  .journal-lines-table tfoot th { color: var(--text-muted); font-size: var(--text-xs); letter-spacing: var(--tracking-wide); text-transform: uppercase; }
  .amount-cell { font-variant-numeric: tabular-nums; }

  @media (max-width: 767px) {
    .journal-details { grid-template-columns: 1fr; }
  }
</style>
