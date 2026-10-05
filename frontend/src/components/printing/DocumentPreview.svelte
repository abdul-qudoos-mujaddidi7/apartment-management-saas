<script>
  import Modal from '../ui/Modal.svelte';
  import FinancialDocument from './FinancialDocument.svelte';
  import { locale, language } from '../../i18n';
  import { printDocument } from '../../utils/printDocument';
  import { invoiceItemDocument } from '../../utils/invoiceItemDocument';
  import { invoiceItemTitle } from '../../utils/invoiceItemTitle';
  import { createEventDispatcher } from 'svelte';
  export let record = null;
  export let kind = 'invoice';
  let documentElement;
  let printing = false;
  let error = '';
  let selectedItem = null;
  let previousRecord;
  $: if (record !== previousRecord) { selectedItem = null; error = ''; previousRecord = record; }
  $: displayedRecord = selectedItem ? invoiceItemDocument(record, selectedItem) : record;
  $: individualItem = kind === 'invoice' && displayedRecord?.itemOnly;
  $: previewTitle = individualItem ? invoiceItemTitle(displayedRecord.items[0], $locale.printing) : $locale.printing.preview;
  const dispatch = createEventDispatcher();
  async function print() {
    printing = true; error = '';
    try {
      const title = individualItem
        ? `${previewTitle} - ${record.invoiceNumber}`
        : kind === 'invoice' ? record.invoiceNumber : kind === 'payment' ? record.paymentNumber : record.meter.meterNumber;
      await printDocument(documentElement.querySelector('.document-sheet'), { title, language: $language });
    }
    catch { error = $locale.printing.error; }
    finally { printing = false; }
  }
</script>
<Modal open={!!record} title={previewTitle} icon="bi-printer" bodyClass="document-preview-body" busy={printing} closeLabel={$locale.common.close} on:close={() => dispatch('close')}>
  {#if error}<div class="alert alert-danger" role="alert">{error}</div>{/if}
  {#if record}<div class="document-preview-stage" bind:this={documentElement}><FinancialDocument record={displayedRecord} {kind} on:printItem={(event) => { selectedItem = event.detail; error = ''; }} /></div>{/if}
  <div slot="footer">
    {#if selectedItem}<button class="btn btn-outline-secondary" type="button" disabled={printing} on:click={() => selectedItem = null}>{$locale.printing.fullInvoice}</button>{/if}
    <button class="btn btn-light" type="button" disabled={printing} on:click={() => dispatch('close')}>{$locale.common.close}</button>
    <button class="btn btn-primary" type="button" disabled={printing} on:click={print}><i class="bi bi-printer" aria-hidden="true"></i>{$locale.printing.print}</button>
  </div>
</Modal>

<style>
  :global(.modal-body.document-preview-body) { background: transparent; padding: 0; }
  .document-preview-stage { min-width: 0; }
  .document-preview-stage :global(.document-sheet) { margin: 0; max-width: none; border: 0; border-radius: 0; padding-block-start: 12px; }
</style>
