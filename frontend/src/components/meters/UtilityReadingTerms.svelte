<script>
  import ShamsiDatePicker from '../ui/ShamsiDatePicker.svelte';
  import { locale } from '../../i18n';
  import { activeCurrencies, baseCurrency } from '../../stores/currency';
  import { formatMoney, formatShortDate } from '../../utils/formatters';
  export let form;
  export let formErrors = {};
  export let leaseOptions = [];
  export let previewPrevious = 0;
  export let unit = '';
  export let editing = false;
  export let expectedStart = '';
  $: if (form.readingKind === 'MOVE_IN' && form.periodStart !== form.readingDate) form = { ...form, periodStart: form.readingDate };
  $: if (form.readingKind !== 'MOVE_IN' && expectedStart && form.periodStart !== expectedStart) form = { ...form, periodStart: expectedStart };
  $: previewConsumption = form.readingKind === 'MOVE_IN' ? 0 : Number(form.currentReading) - Number(previewPrevious);
  $: previewAmount = Math.round((previewConsumption * Number(form.unitPrice) + Number.EPSILON) * 100) / 100;
  const formatReading = value => Number(value).toLocaleString(undefined, { minimumFractionDigits: 3, maximumFractionDigits: 3 });
</script>
<div class="col-sm-6"><label class="form-label" for="reading-period">{$locale.workflow.periodStart}</label><ShamsiDatePicker id="reading-period" bind:value={form.periodStart} disabled={form.readingKind === 'MOVE_IN' || Boolean(expectedStart)} />{#if formErrors.periodStart}<div class="text-danger">{formErrors.periodStart}</div>{/if}</div>
      <div class="col-sm-6"><label class="form-label" for="reading-lease">{$locale.workflow.lease}</label><select class="form-select" id="reading-lease" bind:value={form.leaseId} disabled={Boolean(editing) && form.readingKind === 'MOVE_IN'}><option value="">{$locale.workflow.lease}</option>{#each leaseOptions.filter(lease => lease.status !== 'DRAFT') as lease}<option value={lease.id}>{lease.contractNumber} · {lease.tenant.firstName} {lease.tenant.lastName} · {formatShortDate(lease.startDate)} – {formatShortDate(lease.endDate)}</option>{/each}</select>{#if formErrors.leaseId}<div class="text-danger">{formErrors.leaseId}</div>{/if}</div>
      <div class="col-sm-6"><label class="form-label" for="reading-rate">{$locale.workflow.rate}</label><input class="form-control" id="reading-rate" type="number" min="0.0001" step="0.0001" bind:value={form.unitPrice} />{#if formErrors.unitPrice}<div class="text-danger">{formErrors.unitPrice}</div>{/if}</div>
      <div class="col-sm-6"><label class="form-label" for="reading-currency">{$locale.workflow.currency}</label><select class="form-select" id="reading-currency" bind:value={form.currency}>{#if !$activeCurrencies.some(c => c.code === $baseCurrency)}<option value={$baseCurrency}>{$baseCurrency}</option>{/if}{#each $activeCurrencies as currency}<option value={currency.code}>{currency.code}</option>{/each}</select></div>
      <div class="col-12"><label class="form-label" for="reading-kind">{$locale.workflow.kind}</label><select class="form-select" id="reading-kind" bind:value={form.readingKind} disabled={Boolean(editing)}><option value="BILLING">{$locale.workflow.billing}</option><option value="HANDOVER">{$locale.workflow.handover}</option><option value="MOVE_IN">{$locale.workflow.moveIn}</option><option value="RESET">{$locale.workflow.reset}</option></select></div>
      {#if form.readingKind === 'RESET'}<div class="col-12"><label class="form-label" for="reading-reset">{$locale.workflow.resetBaseline}</label><input class="form-control" id="reading-reset" type="number" min="0" step="0.001" bind:value={form.resetBaseline} disabled={Boolean(editing)} /><p class="form-text">{$locale.workflow.resetHelp}</p>{#if formErrors.resetBaseline}<div class="text-danger">{formErrors.resetBaseline}</div>{/if}</div>{/if}
      <div class="col-12"><div class="alert alert-info" aria-live="polite"><strong>{$locale.workflow.preview}</strong><p>{formatReading(previewPrevious)} → {form.currentReading || '0'} = {formatReading(previewConsumption)} {unit} · {formatMoney(previewAmount, form.currency)}</p><p>{$locale.workflow.review}</p><p>{$locale.workflow.periodHelp}</p></div></div>
