<script>
  /**
   * Voiding a manual journal: the entry stays in the ledger marked as voided and
   * a reason is required, so the register can always say why something changed.
   */
  import { createEventDispatcher } from 'svelte';
  import Modal from '../ui/Modal.svelte';
  import { voidJournal } from '../../services/journals';
  import { locale } from '../../i18n';
  import { formatShortDate } from '../../utils/formatters';
  import { notifySuccess } from '../../stores/toasts';

  const dispatch = createEventDispatcher();

  export let open = false;
  export let entry = null;

  let reason = '';
  let errorMessage = '';
  let saving = false;

  let wasOpen = false;
  $: if (open !== wasOpen) {
    wasOpen = open;
    if (open) { reason = ''; errorMessage = ''; }
  }

  function close() {
    if (saving) return;
    open = false;
  }

  /** Field-level messages from the API are more useful than the generic one. */
  function describeValidation(error) {
    if (error?.status === 401) return '';
    const fields = error?.data?.errors;
    if (fields && typeof fields === 'object') {
      const first = Object.values(fields).flat().filter(Boolean)[0];
      if (first) return String(first);
    }
    return error.message;
  }

  async function submit() {
    if (saving || !entry) return;
    if (!reason.trim()) { errorMessage = $locale.journals.voidReasonRequired; return; }

    saving = true; errorMessage = '';
    try {
      await voidJournal(entry.id, reason.trim());
      notifySuccess($locale.journals.voidedSuccess);
      open = false;
      dispatch('voided', entry);
    } catch (error) {
      errorMessage = describeValidation(error);
    } finally {
      saving = false;
    }
  }
</script>

<Modal
  bind:open
  title={$locale.journals.void}
  description={$locale.journals.voidHint}
  busy={saving}
  icon="bi-x-octagon"
  tone="danger"
  closeLabel={$locale.journals.cancel}
  on:close={close}
>
  <form id="void-journal-form" on:submit|preventDefault={submit} novalidate>
    {#if errorMessage}<div class="alert alert-danger" role="alert">{errorMessage}</div>{/if}
    <p>{$locale.journals.confirmVoid}</p>
    {#if entry}<p class="void-subject"><strong>{entry.journalNumber}</strong> · {formatShortDate(entry.transactionDate)}</p>{/if}
    <label class="form-label" for="void-journal-reason">{$locale.journals.voidReason}</label>
    <textarea id="void-journal-reason" class="form-control" rows="3" bind:value={reason}></textarea>
  </form>
  <div slot="footer-note">{$locale.common.irreversible}</div>
  <div slot="footer">
    <button class="btn btn-light" type="button" on:click={close} disabled={saving}>{$locale.journals.cancel}</button>
    <button class="btn btn-danger" type="submit" form="void-journal-form" disabled={saving || !entry}>
      {saving ? $locale.journals.voiding : $locale.journals.void}
    </button>
  </div>
</Modal>

<style>
  .void-subject { color: var(--text-muted); font-size: var(--text-sm); }
</style>
