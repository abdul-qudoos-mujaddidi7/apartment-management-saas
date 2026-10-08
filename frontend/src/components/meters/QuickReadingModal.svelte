<script>
  import { createEventDispatcher, onDestroy, onMount } from 'svelte';
  import Modal from '../ui/Modal.svelte';
  import ShamsiDatePicker from '../ui/ShamsiDatePicker.svelte';
  import { locale } from '../../i18n';
  import { activeCurrencies, baseCurrency } from '../../stores/currency';
  import { listMeters } from '../../services/meters';
  import { createMeterReading, readingBaseline } from '../../services/meterReadings';
  import { formatMoney } from '../../utils/formatters';

  export let lease;
  export let utilityType;
  const dispatch = createEventDispatcher();
  let meters = [];
  let loading = true;
  let saving = false;
  let error = '';
  let baseline = null;
  let previewLoading = false;
  let version = 0;
  let disposed = false;
  let form = { meterId: '', readingDate: new Date().toISOString().slice(0, 10), periodStart: '', currentReading: '', unitPrice: '', currency: $baseCurrency, notes: '' };
  $: meter = meters.find(entry => entry.id === form.meterId);
  $: consumption = form.currentReading === '' || !baseline ? 0 : Number(form.currentReading) - Number(baseline.previousReading);

  onDestroy(() => { disposed = true; version++; });
  onMount(async () => {
    try {
      let page = 1;
      let totalPages = 1;
      const options = [];
      do {
        const response = await listMeters({ apartmentId: lease.apartment.id, utilityType, status: 'ACTIVE', page, pageSize: 100 });
        if (disposed) return;
        options.push(...(response.items || []));
        totalPages = response.pagination?.totalPages || 1;
        page++;
      } while (page <= totalPages);
      meters = options;
      if (meters.length === 1) { form.meterId = meters[0].id; await meterChanged(); }
    } catch (failure) { if (!disposed) error = failure.message; }
    finally { if (!disposed) loading = false; }
  });

  async function updatePreview() {
    const request = ++version;
    baseline = null;
    error = '';
    previewLoading = false;
    const selected = meters.find(entry => entry.id === form.meterId);
    if (!selected || !form.readingDate) return;
    previewLoading = true;
    try {
      const result = await readingBaseline(selected, form.readingDate);
      if (request !== version || disposed) return;
      baseline = result;
      form = { ...form, periodStart: result?.periodStart || '' };
    } catch (failure) { if (request === version && !disposed) error = failure.message; }
    finally { if (request === version && !disposed) previewLoading = false; }
  }

  async function meterChanged() {
    const selected = meters.find(entry => entry.id === form.meterId);
    form = { ...form, currentReading: '', unitPrice: selected?.defaultUnitPrice ?? '', periodStart: '' };
    await updatePreview();
  }

  async function save() {
    if (saving || previewLoading || !baseline) return;
    error = '';
    if (form.currentReading === '' || !Number.isFinite(Number(form.currentReading)) || consumption < 0) { error = $locale.meterReadings.currentReadingTooLow; return; }
    if (!form.periodStart || form.periodStart > form.readingDate) { error = $locale.workflow.periodHelp; return; }
    if (!Number.isFinite(Number(form.unitPrice)) || Number(form.unitPrice) <= 0) { error = $locale.workflow.rate; return; }
    saving = true;
    try {
      const response = await createMeterReading({ ...form, leaseId: lease.id, readingKind: 'BILLING', currentReading: Number(form.currentReading), unitPrice: Number(form.unitPrice), notes: form.notes.trim() || null });
      dispatch('saved', response.meterReading);
    } catch (failure) {
      error = Object.values(failure.data?.errors || {}).flat().join(' ') || failure.message;
    } finally { saving = false; }
  }
</script>

<Modal open title={$locale.meterReadings.add} description={`${lease.apartment.apartmentNumber} · ${$locale.invoices[utilityType.toLowerCase()]}`} busy={saving} size="modal-lg" icon="bi-speedometer" closeLabel={$locale.meterReadings.cancel} on:close={() => dispatch('close')}>
  <form id="invoice-quick-reading" class="row g-3" on:submit|preventDefault={save}>
    {#if error}<div class="col-12"><div class="alert alert-danger" role="alert">{error}</div></div>{/if}
    <div class="col-12">
      <label class="form-label" for="quick-reading-meter">{$locale.meterReadings.meter}</label>
      <select id="quick-reading-meter" class="form-select" bind:value={form.meterId} on:change={meterChanged} disabled={loading || saving} required>
        <option value="">{loading ? $locale.meterReadings.loading : $locale.meterReadings.selectMeter}</option>
        {#each meters as entry}<option value={entry.id}>{entry.meterNumber} · {entry.unit}</option>{/each}
      </select>
      {#if !loading && !meters.length}<p class="form-text">{$locale.meters.empty}</p>{/if}
    </div>
    <div class="col-sm-6"><label class="form-label" for="quick-reading-date">{$locale.meterReadings.date}</label><ShamsiDatePicker id="quick-reading-date" bind:value={form.readingDate} on:change={updatePreview} disabled={saving} /></div>
    <div class="col-sm-6"><label class="form-label" for="quick-reading-current">{$locale.meterReadings.currentReading}</label><input id="quick-reading-current" class="form-control" type="number" min={baseline?.previousReading ?? 0} step="0.001" bind:value={form.currentReading} disabled={saving} required /></div>
    <div class="col-sm-6"><label class="form-label" for="quick-reading-period">{$locale.workflow.periodStart}</label><ShamsiDatePicker id="quick-reading-period" bind:value={form.periodStart} disabled={saving || Boolean(baseline?.periodStart)} /></div>
    <div class="col-sm-6"><label class="form-label" for="quick-reading-rate">{$locale.workflow.rate}</label><input id="quick-reading-rate" class="form-control" type="number" min="0.0001" step="0.0001" bind:value={form.unitPrice} disabled={saving} required /></div>
    <div class="col-sm-6"><label class="form-label" for="quick-reading-currency">{$locale.workflow.currency}</label><select id="quick-reading-currency" class="form-select" bind:value={form.currency} disabled={saving}>{#if !$activeCurrencies.some(entry => entry.code === $baseCurrency)}<option value={$baseCurrency}>{$baseCurrency}</option>{/if}{#each $activeCurrencies as entry}<option value={entry.code}>{entry.code}</option>{/each}</select></div>
    <div class="col-12"><label class="form-label" for="quick-reading-notes">{$locale.meterReadings.notes}</label><textarea id="quick-reading-notes" class="form-control" rows="2" bind:value={form.notes} disabled={saving}></textarea></div>
    {#if baseline}<div class="col-12"><div class="alert alert-info mb-0" aria-live="polite">{$locale.meterReadings.previousReading}: {baseline.previousReading} · {$locale.meterReadings.consumption}: {consumption.toFixed(3)} {meter?.unit || ''} · {formatMoney(Math.round(consumption * Number(form.unitPrice) * 100) / 100, form.currency)}</div></div>{/if}
  </form>
  <div slot="footer">
    <button class="btn btn-light" type="button" disabled={saving} on:click={() => dispatch('close')}>{$locale.meterReadings.cancel}</button>
    <button class="btn btn-primary" type="submit" form="invoice-quick-reading" disabled={saving || loading || previewLoading || !baseline}><i class="bi bi-plus-lg" aria-hidden="true"></i>{$locale.meterReadings.save}</button>
  </div>
</Modal>
