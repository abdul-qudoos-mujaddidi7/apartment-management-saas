<script>
  import Modal from '../ui/Modal.svelte';
  import FinancialDocument from './FinancialDocument.svelte';
  import { locale, language } from '../../i18n';
  import { printDocument } from '../../utils/printDocument';
  import { createEventDispatcher } from 'svelte';
  export let record = null;
  export let kind = 'invoice';
  let documentElement;
  let printing = false;
  let error = '';
  const dispatch = createEventDispatcher();
  async function print() {
    printing = true; error = '';
    try { await printDocument(documentElement.querySelector('.document-sheet'), { title: kind === 'invoice' ? record.invoiceNumber : record.meter.meterNumber, language: $language }); }
    catch { error = $locale.printing.error; }
    finally { printing = false; }
  }
</script>
<Modal open={!!record} title={$locale.printing.preview} description={$locale.printing.hint} icon="bi-printer" size="modal-xl" busy={printing} closeLabel={$locale.common.close} on:close={() => dispatch('close')}>
  {#if error}<div class="alert alert-danger" role="alert">{error}</div>{/if}
  {#if record}<div bind:this={documentElement}><FinancialDocument {record} {kind} /></div>{/if}
  <div slot="footer">
    <button class="btn btn-light" type="button" disabled={printing} on:click={() => dispatch('close')}>{$locale.common.close}</button>
    <button class="btn btn-primary" type="button" disabled={printing} on:click={print}><i class="bi bi-printer" aria-hidden="true"></i>{$locale.printing.print}</button>
  </div>
</Modal>
