<script>
  import { locale, language } from '../../i18n';
  import { user } from '../../stores/auth';
  import { baseCurrency } from '../../stores/currency';
  import { formatShortDate, toDocumentDigits } from '../../utils/formatters';
  import '../../styles/document-print.css';
  export let record;
  export let kind = 'invoice';
  $: invoice = kind === 'invoice';
  $: lease = record.lease;
  $: apartment = invoice ? lease?.apartment : record.meter?.apartment;
  $: currency = record.currency || $baseCurrency;
  $: organization = $user?.organizations?.find(o => o.id === $user.organizationId)?.name || $user?.organizations?.[0]?.name || 'ApartmentPro';
  $: purpose = $locale.workflow[{ BILLING:'billing', HANDOVER:'handover', MOVE_IN:'moveIn', RESET:'reset' }[record.readingKind] || 'billing'];
  $: status = invoice ? $locale.invoices[record.status?.toLowerCase().replace('_','')] : $locale.meterReadings[{ UNBILLED:'unbilled', BILLED:'billed', PARTIALLY_PAID:'partiallyPaid', PAID:'paid' }[record.billingStatus]];
  $: number = (value, precision = 3) => toDocumentDigits(Number(value || 0).toLocaleString('en-US', { maximumFractionDigits:precision }), $language);
  $: money = (value, code = currency, precision = 2) => `${toDocumentDigits(Number(value || 0).toLocaleString('en-US', { minimumFractionDigits:precision, maximumFractionDigits:precision }), $language)} ${code}`;
  $: date = value => value ? toDocumentDigits(formatShortDate(value), $language) : '—';
  $: typeLabel = type => $locale.invoices[{ SERVICE_FEE:'serviceFee' }[type] || type?.toLowerCase()] || type;
</script>
<article class="document-sheet" lang={$language} dir={$language === 'en' ? 'ltr' : 'rtl'} aria-label={invoice ? $locale.printing.invoice : $locale.printing.reading}>
  <header class="document-head">
    <div><div class="document-brand">{organization}</div><h1>{invoice ? $locale.printing.invoice : $locale.printing.reading}</h1>{#if !invoice}<span>{typeLabel(record.meter.utilityType)} · {purpose}</span>{/if}</div>
    <div class="document-reference"><span class="document-label">{invoice ? $locale.invoices.invoiceNumber : $locale.meterReadings.meterNumber}</span><strong><bdi>{invoice ? record.invoiceNumber : record.meter.meterNumber}</bdi></strong><br /><span class="document-status">{status || '—'}</span></div>
  </header>
  <dl class="document-facts">
    <div><dt>{$locale.invoices.tenant}</dt><dd>{lease ? `${lease.tenant?.firstName || ''} ${lease.tenant?.lastName || ''}` : $locale.printing.unassigned}</dd></div>
    <div><dt>{$locale.invoices.contractNumber}</dt><dd><bdi>{lease?.contractNumber || '—'}</bdi></dd></div>
    <div><dt>{$locale.invoices.location}</dt><dd>{apartment?.floor?.building?.name} / {apartment?.floor?.name || number(apartment?.floor?.floorNumber)} / <bdi>{apartment?.apartmentNumber}</bdi></dd></div>
    <div><dt>{invoice ? $locale.invoices.invoiceDate : $locale.meterReadings.date}</dt><dd>{date(invoice ? record.invoiceDate : record.readingDate)}</dd></div>
    {#if invoice}<div><dt>{$locale.invoices.dueDate}</dt><dd>{date(record.dueDate)}</dd></div>{:else}<div><dt>{$locale.workflow.periodStart}</dt><dd>{date(record.periodStart)} — {date(record.readingDate)}</dd></div>{/if}
  </dl>
  {#if invoice}
    <table><thead><tr><th>{$locale.invoices.itemDescription}</th><th>{$locale.invoices.quantity}</th><th>{$locale.invoices.unitPrice}</th><th>{$locale.invoices.amount}</th><th>{$locale.invoices.paid}</th><th>{$locale.invoices.balance}</th></tr></thead><tbody>
      {#each record.items || [] as item}<tr><td>{item.description || typeLabel(item.type)}<span class="document-label">{typeLabel(item.type)}</span></td><td class="document-number">{number(item.quantity)}</td><td class="document-number">{money(item.unitPrice,item.currency || currency, item.meterReadingId ? 4 : 2)}</td><td class="document-number">{money(item.amount,item.currency || currency)}</td><td class="document-number">{money(item.paidAmount,item.currency || currency)}</td><td class="document-number">{money(item.balance ?? item.amount,item.currency || currency)}</td></tr>{/each}
    </tbody></table>
    <div class="document-totals"><div><span>{$locale.invoices.total}</span><strong>{money(record.total)}</strong></div><div><span>{$locale.invoices.paid}</span><strong>{money(record.paidAmount)}</strong></div><div class="document-grand"><span>{$locale.invoices.balance}</span><strong>{money(Math.max(0,record.total - record.paidAmount))}</strong></div></div>
    {#if new Set((record.items || []).map(i => i.currency || currency)).size > 1}<p class="document-label">{$locale.printing.currencyHint} {currency}</p>{/if}
  {:else}
    <div class="document-readings"><div><span class="document-label">{$locale.meterReadings.previousReading}</span><strong>{number(record.previousReading)}</strong>{record.meter.unit}</div><div><span class="document-label">{$locale.meterReadings.currentReading}</span><strong>{number(record.currentReading)}</strong>{record.meter.unit}</div><div><span class="document-label">{$locale.meterReadings.consumption}</span><strong>{number(record.consumption)}</strong>{record.meter.unit}</div></div>
    {#if record.readingKind === 'MOVE_IN'}<p class="document-note">{$locale.printing.baseline}</p>{:else}<p class="document-number">{number(record.currentReading)} − {number(record.previousReading)} = {number(record.consumption)} {record.meter.unit}</p>{/if}
    {#if record.resetBaseline != null}<p>{$locale.workflow.resetBaseline}: <strong>{number(record.resetBaseline)} {record.meter.unit}</strong></p>{/if}
    <div class="document-totals"><div><span>{$locale.meterReadings.unitPrice}</span><strong>{money(record.unitPrice,currency,4)} / {record.meter.unit}</strong></div><div class="document-grand"><span>{$locale.meterReadings.amount}</span><strong>{money(record.amount)}</strong></div><div><span>{$locale.workflow.paid}</span><strong>{money(record.paidAmount)}</strong></div><div><span>{$locale.workflow.outstanding}</span><strong>{money(record.outstanding)}</strong></div></div>
    {#if record.invoiceItem?.invoice}<p>{$locale.invoices.invoiceNumber}: <bdi>{record.invoiceItem.invoice.invoiceNumber}</bdi> · {$locale.invoices[record.invoiceItem.invoice.status?.toLowerCase().replace('_','')]}</p>{/if}
    <p class="document-label">{$locale.printing.readingNotice}</p>
  {/if}
  {#if record.notes}<div class="document-note"><span class="document-label">{$locale.invoices.notes}</span>{record.notes}</div>{/if}
  <footer class="document-foot">{organization} · {$locale.printing.recordCopy}</footer>
</article>
