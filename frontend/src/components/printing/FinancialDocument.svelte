<script>
  import { createEventDispatcher } from 'svelte';
  import { locale, language } from '../../i18n';
  import { baseCurrency } from '../../stores/currency';
  import { formatShortDate } from '../../utils/formatters';
  import { invoiceItemTitle } from '../../utils/invoiceItemTitle';
  import '../../styles/document-print.css';
  export let record;
  export let kind = 'invoice';
  const dispatch = createEventDispatcher();
  $: invoice = kind === 'invoice';
  $: payment = kind === 'payment';
  $: documentTitle = payment ? $locale.printing.payment : invoice ? (record.itemOnly ? invoiceItemTitle(record.items[0], $locale.printing) : $locale.printing.invoice) : $locale.printing.reading;
  $: referenceLabel = payment ? $locale.payments.paymentNumber : invoice ? $locale.invoices.invoiceNumber : $locale.meterReadings.meterNumber;
  $: referenceNumber = payment ? record.paymentNumber : invoice ? record.invoiceNumber : record.meter?.meterNumber;
  $: lease = record.lease;
  $: apartment = invoice || payment ? lease?.apartment : record.meter?.apartment;
  $: tenant = payment ? record.tenant : lease?.tenant;
  $: currency = record.currency || $baseCurrency;
  $: purpose = $locale.workflow[{ BILLING:'billing', HANDOVER:'handover', MOVE_IN:'moveIn', RESET:'reset' }[record.readingKind] || 'billing'];
  $: status = payment ? $locale.payments[record.status === 'POSTED' ? 'posted' : 'voided'] : invoice ? $locale.invoices[record.status?.toLowerCase().replace('_','')] : $locale.meterReadings[{ UNBILLED:'unbilled', BILLED:'billed', PARTIALLY_PAID:'partiallyPaid', PAID:'paid' }[record.billingStatus]];
  $: number = (value, precision = 3) => Number(value || 0).toLocaleString('en-US', { maximumFractionDigits:precision });
  $: money = (value, code = currency, precision = 2) => `${Number(value || 0).toLocaleString('en-US', { minimumFractionDigits:precision, maximumFractionDigits:precision })} ${code}`;
  $: date = value => value ? formatShortDate(value) : '—';
  $: typeLabel = type => $locale.invoices[{ SERVICE_FEE:'serviceFee' }[type] || type?.toLowerCase()] || type;
</script>
<article class="document-sheet" lang={$language} dir={$language === 'en' ? 'ltr' : 'rtl'} aria-label={documentTitle}>
  <header class="document-head">
    <div class="document-heading"><h1>{documentTitle}</h1>{#if !invoice && !payment}<span class="document-subtitle">{typeLabel(record.meter.utilityType)} · {purpose}</span>{/if}</div>
    <div class="document-reference"><span class="document-label">{referenceLabel}</span><strong><bdi>{referenceNumber}</bdi></strong><span class="document-status">{status || '—'}</span></div>
  </header>
  <dl class="document-facts">
    <div><dt>{$locale.invoices.tenant}</dt><dd>{tenant ? `${tenant.firstName || ''}` : $locale.printing.unassigned}</dd></div>
    <div><dt>{$locale.invoices.contractNumber}</dt><dd><bdi>{lease?.contractNumber || '—'}</bdi></dd></div>
    <div><dt>{$locale.invoices.location}</dt><dd>{#if apartment}{apartment.floor?.building?.name} / {apartment.floor?.name || number(apartment.floor?.floorNumber)} / <bdi>{apartment.apartmentNumber}</bdi>{:else}—{/if}</dd></div>
    <div><dt>{payment ? $locale.payments.paymentDate : invoice ? $locale.invoices.invoiceDate : $locale.meterReadings.date}</dt><dd><bdi>{date(payment ? record.paymentDate : invoice ? record.invoiceDate : record.readingDate)}</bdi></dd></div>
    {#if payment}
      <div><dt>{$locale.payments.receiveInto}</dt><dd>{record.receiveAccount?.name || '—'}</dd></div>
      {#if record.reference}<div><dt>{$locale.payments.reference}</dt><dd><bdi>{record.reference}</bdi></dd></div>{/if}
    {:else if invoice}<div><dt>{$locale.invoices.dueDate}</dt><dd><bdi>{date(record.dueDate)}</bdi></dd></div>{:else}<div class="document-period"><dt>{$locale.workflow.periodStart}</dt><dd><bdi>{date(record.periodStart)} — {date(record.readingDate)}</bdi></dd></div>{/if}
  </dl>
  {#if payment}
    {#if record.allocations?.length}
      <table class="document-payment-allocations">
        <thead><tr><th>{$locale.payments.invoice}</th><th>{$locale.payments.charge}</th><th>{$locale.payments.amount}</th></tr></thead>
        <tbody>{#each record.allocations.filter(allocation => allocation.amount > 0) as allocation (allocation.id)}
          <tr><td><bdi>{allocation.invoiceItem?.invoice?.invoiceNumber || '—'}</bdi></td><td>{allocation.invoiceItem?.description || typeLabel(allocation.invoiceItem?.type)}</td><td class="document-number">{money(allocation.amount)}</td></tr>
        {/each}</tbody>
      </table>
    {/if}
    <div class="document-totals">
      <div class="document-grand"><span>{$locale.payments.amount}</span><strong>{money(record.amount)}</strong></div>
      <div><span>{$locale.payments.allocated}</span><strong>{money(record.allocatedAmount)}</strong></div>
      <div><span>{$locale.payments.unallocated}</span><strong>{money(record.unallocatedAmount)}</strong></div>
    </div>
    {#if record.status === 'VOIDED' && record.voidReason}<div class="document-note"><span class="document-label">{$locale.payments.voidReason}</span>{record.voidReason}</div>{/if}
  {:else if invoice}
    <table><thead><tr><th>{$locale.invoices.itemDescription}</th><th>{$locale.invoices.quantity}</th><th>{$locale.invoices.unitPrice}</th><th>{$locale.invoices.amount}</th><th>{$locale.invoices.paid}</th><th>{$locale.invoices.balance}</th></tr></thead><tbody>
      {#each record.items || [] as item}<tr><td>{item.description || typeLabel(item.type)}<span class="document-label">{typeLabel(item.type)}</span>{#if !record.itemOnly}<button class="document-item-print" type="button" data-print-exclude aria-label={`${$locale.printing.printItem}: ${item.description || typeLabel(item.type)}`} on:click={() => dispatch('printItem', item)}><i class="bi bi-printer" aria-hidden="true"></i><span>{$locale.printing.printItem}</span></button>{/if}</td><td class="document-number">{number(item.quantity)}</td><td class="document-number">{money(item.unitPrice,item.currency || currency, item.meterReadingId ? 4 : 2)}</td><td class="document-number">{money(item.amount,item.currency || currency)}</td><td class="document-number">{money(item.paidAmount,item.currency || currency)}</td><td class="document-number">{money(item.balance ?? Math.max(0, Number(item.amount) - Number(item.paidAmount || 0)),item.currency || currency)}</td></tr>{/each}
    </tbody></table>
    <div class="document-totals"><div><span>{$locale.invoices.total}</span><strong>{money(record.total)}</strong></div><div><span>{$locale.invoices.paid}</span><strong>{money(record.paidAmount)}</strong></div><div class="document-grand"><span>{$locale.invoices.balance}</span><strong>{money(record.itemBalance ?? Math.max(0,record.total - record.paidAmount))}</strong></div></div>
    {#if new Set((record.items || []).map(i => i.currency || currency)).size > 1}<p class="document-label">{$locale.printing.currencyHint} {currency}</p>{/if}
  {:else}
    <div class="document-readings"><div><span class="document-label">{$locale.meterReadings.previousReading}</span><strong><bdi>{number(record.previousReading)}</bdi></strong><span class="document-unit">{record.meter.unit}</span></div><div><span class="document-label">{$locale.meterReadings.currentReading}</span><strong><bdi>{number(record.currentReading)}</bdi></strong><span class="document-unit">{record.meter.unit}</span></div><div class="document-consumption"><span class="document-label">{$locale.meterReadings.consumption}</span><strong><bdi>{number(record.consumption)}</bdi></strong><span class="document-unit">{record.meter.unit}</span></div></div>
    {#if record.readingKind === 'MOVE_IN'}<p class="document-note">{$locale.printing.baseline}</p>{:else}<p class="document-number document-calculation">{number(record.currentReading)} − {number(record.previousReading)} = {number(record.consumption)} {record.meter.unit}</p>{/if}
    {#if record.resetBaseline != null}<p>{$locale.workflow.resetBaseline}: <strong>{number(record.resetBaseline)} {record.meter.unit}</strong></p>{/if}
    <div class="document-totals"><div><span>{$locale.meterReadings.unitPrice}</span><strong>{money(record.unitPrice,currency,4)} / {record.meter.unit}</strong></div><div class="document-grand"><span>{$locale.meterReadings.amount}</span><strong>{money(record.amount)}</strong></div><div><span>{$locale.workflow.paid}</span><strong>{money(record.paidAmount)}</strong></div><div><span>{$locale.workflow.outstanding}</span><strong>{money(record.outstanding)}</strong></div></div>
    {#if record.invoiceItem?.invoice}<p>{$locale.invoices.invoiceNumber}: <bdi>{record.invoiceItem.invoice.invoiceNumber}</bdi> · {$locale.invoices[record.invoiceItem.invoice.status?.toLowerCase().replace('_','')]}</p>{/if}
    <p class="document-label">{$locale.printing.readingNotice}</p>
  {/if}
  {#if record.notes}<div class="document-note"><span class="document-label">{$locale.invoices.notes}</span>{record.notes}</div>{/if}
</article>
