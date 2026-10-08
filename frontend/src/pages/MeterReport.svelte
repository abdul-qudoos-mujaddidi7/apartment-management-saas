<script>
  import { onMount, onDestroy } from 'svelte';
  import { locale } from '../i18n';
  import { getMeter } from '../services/meters';
  import { getMeterReport } from '../services/meterReadings';
  import PageLayout from '../components/ui/PageLayout.svelte';
  import PageToolbar from '../components/ui/PageToolbar.svelte';
  import DataTable from '../components/ui/DataTable.svelte';
  import Pagination from '../components/ui/Pagination.svelte';
  import StatusBadge from '../components/ui/StatusBadge.svelte';
  import ShamsiDatePicker from '../components/ui/ShamsiDatePicker.svelte';
  import DocumentPreview from '../components/printing/DocumentPreview.svelte';
  import { formatMoney, formatNumber, formatShortDate } from '../utils/formatters';
  import { reportCsv } from '../utils/reportCsv';
  import { debounce } from '../utils/debounce';

  export let params = {};
  const icons = { ELECTRICITY: 'lightning-charge', WATER: 'droplet', GAS: 'fire' };
  let ready = false;
  let routeId = null;
  let routeVersion = 0;
  let version = 0;
  let utilityType = 'ELECTRICITY';
  let meter = null;
  let report = null;
  let loading = true;
  let exporting = false;
  let error = '';
  let printReading = null;
  let expandedReading = null;
  let filters = { search: '', buildingId: '', dateFrom: '', dateTo: '' };
  let pageSize = 25;
  $: copy = $locale.meterReport;
  $: activeCount = [filters.buildingId, filters.dateFrom, filters.dateTo].filter(Boolean).length;
  $: if (ready && (params.id || '') !== routeId) initialize();
  const queueSearch = debounce(() => load(1), 250);
  onMount(() => {
    ready = true;
  });
  onDestroy(() => { queueSearch.cancel(); version++; routeVersion++; });

  function requestFilters() { return { ...filters, utilityType, ...(routeId ? { meterId: routeId } : {}), pageSize }; }
  async function initialize() {
    routeId = params.id || '';
    const current = ++routeVersion;
    version++;
    report = null; meter = null; loading = true; error = '';
    filters = { search: '', buildingId: '', dateFrom: '', dateTo: '' };
    try {
      if (routeId) {
        const result = await getMeter(routeId);
        if (current !== routeVersion) return;
        meter = result.meter;
        utilityType = meter.utilityType;
      }
      await load(1);
    } catch (e) { if (current === routeVersion) { error = e.message; loading = false; } }
  }
  async function load(page = 1) {
    queueSearch.cancel();
    if (routeId && !meter) return;
    const current = ++version;
    loading = true; error = ''; report = null; expandedReading = null;
    try {
      const result = await getMeterReport({ ...requestFilters(), page });
      if (current === version) report = result;
    } catch (e) { if (current === version) error = e.message; }
    finally { if (current === version) loading = false; }
  }
  function clearFilters() { filters = { ...filters, buildingId: '', dateFrom: '', dateTo: '' }; load(1); }
  const kindKey = { BILLING: 'billing', MOVE_IN: 'baseline', HANDOVER: 'handover', RESET: 'reset' };
  const statusKey = { UNBILLED: 'unbilledStatus', BILLED: 'billedStatus', PARTIALLY_PAID: 'partialStatus', PAID: 'paidStatus', BASELINE: 'baseline' };
  const statusTone = { UNBILLED: 'neutral', BILLED: 'warning', PARTIALLY_PAID: 'warning', PAID: 'success', BASELINE: 'neutral' };
  const reportUrl = id => `/meters/${encodeURIComponent(id)}/report`;
  async function exportCsv() {
    if (exporting || loading) return;
    exporting = true; error = '';
    const captured = requestFilters();
    try {
      const result = await getMeterReport({ ...captured, export: true });
      const headers = [$locale.meters.meterNumber, $locale.meters.utilityType, $locale.meters.building, $locale.meters.floor,
        $locale.meters.apartment, copy.tenant, $locale.leases.contractNumber, copy.from, copy.to, copy.kind,
        $locale.meterReadings.previousReading, $locale.meterReadings.currentReading, copy.consumption, $locale.meters.unit,
        $locale.meterReadings.unitPrice, copy.currency, copy.charge, copy.paid, copy.balance, $locale.meters.status, copy.invoice, copy.resetBaseline, copy.notes];
      const rows = result.items.map(row => {
        const apartment = row.meter.apartment;
        return [row.meter.meterNumber, $locale.meters[row.meter.utilityType.toLowerCase()], apartment.floor.building.name,
          apartment.floor.name || apartment.floor.floorNumber, apartment.apartmentNumber, row.lease?.tenant?.firstName,
          row.lease?.contractNumber, row.periodStart?.slice(0, 10), row.readingDate.slice(0, 10), copy[kindKey[row.readingKind]],
          row.previousReading, row.currentReading, row.consumption, row.meter.unit, row.unitPrice, row.currency,
          row.amount, row.paidAmount, row.outstanding, copy[statusKey[row.billingStatus]],
          row.billingStatus !== 'UNBILLED' && row.billingStatus !== 'BASELINE' ? row.invoiceItem?.invoice?.invoiceNumber : '', row.resetBaseline, row.notes];
      });
      const url = URL.createObjectURL(new Blob([reportCsv(headers, rows)], { type: 'text/csv;charset=utf-8' }));
      const anchor = document.createElement('a'); anchor.href = url; anchor.download = `meter-report-${captured.meterId || captured.utilityType}.csv`;
      document.body.appendChild(anchor); anchor.click(); anchor.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) { error = e.message; }
    finally { exporting = false; }
  }
</script>

<svelte:head><title>{meter ? `${copy.detail} · ${meter.meterNumber}` : copy.title} | {$locale.common.apartmentPro}</title></svelte:head>

<div class="meter-report">
  <header class="report-header">
    <div class="report-heading">
      <div class="report-identity">
        <span class="utility-symbol"><i class={`bi bi-${icons[utilityType]}`} aria-hidden="true"></i></span>
        <div><span class="report-eyebrow">{$locale.meters[utilityType.toLowerCase()]}</span><h2>{meter ? `${copy.detail} · ${meter.meterNumber}` : copy.title}</h2><p>{meter ? `${meter.apartment.floor.building.name} · ${meter.apartment.floor.name || meter.apartment.floor.floorNumber} · ${meter.apartment.apartmentNumber}` : copy.description}</p></div>
      </div>
      <div class="header-actions">
        <a class="report-button back-button" href="#/meters"><i class="bi bi-arrow-return-left" aria-hidden="true"></i><span>{copy.back}</span></a>
        <button class="report-button export-button" type="button" disabled={exporting || loading || !report?.pagination.total} on:click={exportCsv}><i class="bi bi-download" aria-hidden="true"></i><span>{exporting ? copy.exporting : copy.export}</span></button>
      </div>
    </div>
    {#if meter}
      <section class="meter-details" aria-label={copy.detail}>
        <dl>
          <div><dt>{$locale.meters.status}</dt><dd><StatusBadge label={$locale.meters[meter.status.toLowerCase()] || meter.status} tone={meter.status === 'ACTIVE' ? 'success' : 'neutral'} /></dd></div>
          <div><dt>{$locale.meters.meterType}</dt><dd>{$locale.meters.meterTypes?.[meter.meterType] || meter.meterType}</dd></div>
          <div><dt>{$locale.meters.installationDate}</dt><dd>{meter.installationDate ? formatShortDate(meter.installationDate) : '—'}</dd></div>
          <div><dt>{copy.initial}</dt><dd><span dir="ltr">{meter.initialReading == null ? '—' : formatNumber(meter.initialReading, 3)} <small>{meter.unit}</small></span></dd></div>
          <div><dt>{$locale.meters.defaultUnitPrice}</dt><dd><span dir="ltr">{formatNumber(meter.defaultUnitPrice, 4)} / {meter.unit}</span></dd></div>
        </dl>
        {#if meter.notes}<p class="meter-note"><i class="bi bi-info-circle" aria-hidden="true"></i>{meter.notes}</p>{/if}
      </section>
    {/if}
  </header>

  {#if report}
    <section class="report-summary" aria-label={copy.summary}>
      <div class="consumption-strip">
        <span class="consumption-label"><i class={`bi bi-${icons[utilityType]}`} aria-hidden="true"></i>{copy.consumption}</span>
        <div>{#each report.summary.consumption as total}<strong dir="ltr">{formatNumber(total.consumption, 3)} <small>{total.unit}</small></strong>{:else}<strong>—</strong>{/each}</div>
      </div>
      <div class="currency-totals">
        {#each report.summary.currencies as total}
          <div class="currency-summary">
            <div class="currency-label"><span>{copy.currency}</span><strong>{total.currency}</strong></div>
            <div class="money-metrics">
              <div><span>{copy.charge}</span><strong dir="ltr">{formatNumber(total.charge, 2)} <small>{total.currency}</small></strong></div>
              <div class="paid-metric"><span>{copy.paid}</span><strong dir="ltr">{formatNumber(total.paid, 2)} <small>{total.currency}</small></strong></div>
              <div class="balance-metric"><span>{copy.balance}</span><strong dir="ltr">{formatNumber(total.outstanding, 2)} <small>{total.currency}</small></strong></div>
              <div><span>{copy.unbilled}</span><strong dir="ltr">{formatNumber(total.unbilled, 2)} <small>{total.currency}</small></strong></div>
            </div>
          </div>
        {/each}
      </div>
    </section>
  {/if}

  <section class="reading-history" aria-label={copy.history}>
    <div class="history-heading"><div><h3>{copy.history}</h3></div>{#if report}<span class="result-count">{formatNumber(report.pagination.total)} {copy.readings}</span>{/if}</div>
    <PageLayout fitContent={true}>
      <svelte:fragment slot="toolbar">
        <PageToolbar bind:search={filters.search} searchPlaceholder={copy.search} onSearch={queueSearch} showAdd={false}
          filtersCount={activeCount} filtersClearLabel={$locale.common.clearFilters} onClearFilters={clearFilters}>
          <svelte:fragment slot="filters">
                <div class="filters-field"><label class="filters-field-label" for="report-from">{copy.from}</label><ShamsiDatePicker id="report-from" bind:value={filters.dateFrom} on:change={() => load(1)} /></div>
            <div class="filters-field"><label class="filters-field-label" for="report-to">{copy.to}</label><ShamsiDatePicker id="report-to" bind:value={filters.dateTo} on:change={() => load(1)} /></div>
          </svelte:fragment>
        </PageToolbar>
      </svelte:fragment>
      <svelte:fragment slot="alerts">{#if error}<div class="alert alert-danger" role="alert">{error}</div>{/if}</svelte:fragment>
      <svelte:fragment slot="content">
        <DataTable {loading} isEmpty={!report?.items.length} loadingLabel={copy.loading} emptyLabel={copy.empty} minTableWidth="68rem" layout="auto" showFooter={false}>
          <thead><tr>
            <th>{copy.period}</th><th>{copy.tenant}</th>
            <th>{copy.registerReadings}</th><th>{copy.consumption}</th><th>{copy.charge}</th><th>{copy.paid}</th><th>{copy.balance}</th><th>{$locale.meters.status}</th><th class="actions-heading">{$locale.common.actions.details}</th>
          </tr></thead>
          <tbody>{#each report?.items || [] as row (row.id)}
            <tr class:reading-expanded={expandedReading === row.id}>
              <td><strong>{formatShortDate(row.readingDate)}</strong><small class="cell-sub">{row.periodStart ? formatShortDate(row.periodStart) : '—'} – {formatShortDate(row.readingDate)}</small><small class="cell-sub reading-kind">{copy[kindKey[row.readingKind]] || row.readingKind}</small></td>
              <td><strong>{row.lease?.tenant?.firstName || '—'}</strong><small class="cell-sub">{row.lease?.contractNumber || '—'}</small></td>
              <td><div class="register-values" dir="ltr"><span title={$locale.meterReadings.previousReading}>{formatNumber(row.previousReading, 3)}</span><i class="bi bi-arrow-right" aria-hidden="true"></i><strong title={$locale.meterReadings.currentReading}>{formatNumber(row.currentReading, 3)}</strong></div><small class="cell-sub">{row.meter.unit}</small></td>
              <td><strong dir="ltr">{formatNumber(row.consumption, 3)} <small>{row.meter.unit}</small></strong><small class="cell-sub" dir="ltr">{formatNumber(row.unitPrice, 4)} {row.currency} / {row.meter.unit}</small></td>
              <td class="money-cell"><strong dir="ltr">{formatNumber(row.amount, 2)}</strong><small class="cell-sub">{row.currency}</small></td>
              <td class="money-cell"><span class="paid-value" dir="ltr">{formatNumber(row.paidAmount, 2)}</span><small class="cell-sub">{row.currency}</small></td>
              <td class="money-cell"><strong class:unpaid-value={row.outstanding > 0} dir="ltr">{formatNumber(row.outstanding, 2)}</strong><small class="cell-sub">{row.currency}</small></td>
              <td><StatusBadge label={copy[statusKey[row.billingStatus]]} tone={statusTone[row.billingStatus]} />{#if !['UNBILLED', 'BASELINE'].includes(row.billingStatus)}<a class="invoice-link" href={`#/invoices?detail=${encodeURIComponent(row.invoiceItem.invoice.id)}`}>{row.invoiceItem.invoice.invoiceNumber}</a>{/if}</td>
              <td class="actions-cell"><div class="reading-actions">
                <button class="icon-button details-toggle" class:is-active={expandedReading === row.id} type="button" aria-label={copy.readingDetails} title={copy.readingDetails} aria-expanded={expandedReading === row.id} aria-controls={`reading-detail-${row.id}`} on:click={() => expandedReading = expandedReading === row.id ? null : row.id}><i class={`bi bi-chevron-${expandedReading === row.id ? 'up' : 'down'}`} aria-hidden="true"></i></button>
                <button class="icon-button print-reading" type="button" aria-label={$locale.printing.print} title={$locale.printing.print} on:click={() => printReading = row}><i class="bi bi-printer" aria-hidden="true"></i></button>
              </div></td>
            </tr>
            {#if expandedReading === row.id}
              <tr class="expanded-details"><td colspan="9"><div id={`reading-detail-${row.id}`} class="reading-detail-grid">
                <div><span>{$locale.meters.meterNumber}</span><a href={`#${reportUrl(row.meterId)}`}>{row.meter.meterNumber}</a></div>
                <div><span>{$locale.meters.building} / {$locale.meters.apartment}</span><strong>{row.meter.apartment.floor.building.name} · {row.meter.apartment.floor.name || row.meter.apartment.floor.floorNumber} · {row.meter.apartment.apartmentNumber}</strong></div>
                <div><span>{copy.kind}</span><strong>{copy[kindKey[row.readingKind]] || row.readingKind}</strong></div>
                {#if row.resetBaseline != null}<div><span>{copy.resetBaseline}</span><strong>{formatNumber(row.resetBaseline, 3)} {row.meter.unit}</strong></div>{/if}
                <div class="detail-notes"><span>{copy.notes}</span><p>{row.notes || '—'}</p></div>
              </div></td></tr>
            {/if}
          {/each}</tbody>
        </DataTable>
      </svelte:fragment>
      <svelte:fragment slot="footer">{#if report}<Pagination page={report.pagination.page} totalPages={report.pagination.totalPages} previousLabel={$locale.meters.previous} nextLabel={$locale.meters.next} onPage={load} itemsPerPage={pageSize} perPageLabel={copy.perPage} onPerPage={size => { pageSize = size; load(1); }} />{/if}</svelte:fragment>
    </PageLayout>
  </section>
</div>
{#if printReading}<DocumentPreview kind="reading" record={printReading} on:close={() => printReading = null} />{/if}

<style>
  .meter-report { display: grid; gap: 0.875rem; min-width: 0; padding-block-end: 1rem; }
  .report-header, .report-summary { border: 1px solid var(--border); background: var(--surface); border-radius: var(--radius-lg); overflow: hidden; }
  .report-heading { display: flex; align-items: center; justify-content: space-between; gap: 1rem; padding: 0.875rem 1rem; }
  .report-identity { display: flex; align-items: center; gap: 1rem; min-width: 0; }
  .utility-symbol { display: grid; place-items: center; flex: 0 0 2.75rem; height: 2.75rem; background: var(--accent-soft); color: var(--accent-text); border: 1px solid var(--accent-soft-border); border-radius: var(--radius-md); font-size: 1.5rem; }
  .report-eyebrow { color: var(--accent-text); font-size: var(--text-sm); font-weight: var(--weight-semibold); }
  h2 { font-size: var(--text-xl); color: var(--text-strong); margin: 0.2rem 0 0; line-height: 1.4; }
  .report-heading p { color: var(--text-secondary); font-size: var(--text-sm); margin: 0.2rem 0 0; }
  .header-actions { display: flex; gap: 0.5rem; align-items: center; flex-shrink: 0; }
  .report-button { display: inline-flex; align-items: center; justify-content: center; gap: 0.5rem; min-height: 44px; padding: 0.6rem 1rem; border: 1px solid var(--border); border-radius: var(--control-radius); color: var(--text-body); background: var(--surface); font-size: var(--text-sm); font-weight: var(--weight-semibold); text-decoration: none; }
  .report-button:hover { border-color: var(--accent); background: var(--accent-soft); }
  .export-button { background: var(--accent); border-color: var(--accent); color: var(--text-on-accent); }
  .export-button:hover { background: var(--accent-hover); color: var(--text-on-accent); }
  .report-button:disabled { opacity: 0.5; cursor: not-allowed; }
  .meter-details { padding: 0.75rem 1rem; border-block-start: 1px solid var(--border); }
  dl { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 1rem; margin: 0; }
  dt { font-size: var(--text-xs); color: var(--text-secondary); font-weight: normal; } dd { margin: 0.3rem 0 0; color: var(--text-strong); font-size: var(--text-sm); font-weight: var(--weight-semibold); }
  .meter-note { display: flex; gap: 0.5rem; margin: 0.5rem 0 0; font-size: var(--text-sm); color: var(--text-secondary); }
  .consumption-strip { display: flex; align-items: center; justify-content: space-between; gap: 1rem; padding: 0.65rem 1rem; background: var(--accent-soft); border-block-end: 1px solid var(--border); }
  .consumption-label { display: flex; align-items: center; gap: 0.6rem; color: var(--accent-text); font-weight: var(--weight-semibold); }
  .consumption-strip > div { display: flex; gap: 1.5rem; flex-wrap: wrap; } .consumption-strip strong { font-size: 1.4rem; line-height: 1.3; color: var(--text-strong); font-variant-numeric: tabular-nums; }
  small { font-size: var(--text-xs); font-weight: normal; color: var(--text-secondary); }
  .currency-summary { display: flex; align-items: stretch; padding: 0.8rem 1rem; gap: 1rem; } .currency-summary + .currency-summary { border-block-start: 1px solid var(--border); }
  .currency-label { display: flex; flex-direction: column; justify-content: flex-start; gap: 0.35rem; min-width: 4rem; padding-inline-end: 1.5rem; border-inline-end: 1px solid var(--border); } .currency-label span { font-size: var(--text-xs); color: var(--text-secondary); } .currency-label strong { color: var(--text-strong); font-size: 1.1rem; line-height: 1.5; }
  .money-metrics { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 1.5rem; flex: 1; min-width: 0; }
  .money-metrics > div { display: grid; align-content: start; justify-items: start; gap: 0.35rem; } .money-metrics span { font-size: var(--text-xs); color: var(--text-secondary); } .money-metrics strong { font-size: 1.1rem; color: var(--text-strong); font-variant-numeric: tabular-nums; line-height: 1.5; white-space: nowrap; }
  .paid-metric strong, .paid-value { color: var(--success); } .balance-metric strong, .unpaid-value { color: var(--warning); }
  .history-heading { display: flex; justify-content: space-between; align-items: center; gap: 1rem; padding: 0.25rem 0 1rem; } h3 { font-size: var(--text-lg); font-weight: var(--weight-semibold); color: var(--text-strong); margin: 0; } .result-count { color: var(--text-secondary); background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-pill); padding: 0.35rem 0.75rem; font-size: var(--text-xs); white-space: nowrap; }
  .reading-history { min-width: 0; } .cell-sub { display: block; margin-block-start: 0.35rem; color: var(--text-secondary); font-size: var(--text-xs); } .reading-kind { color: var(--accent-text); } .meter-link { font-weight: var(--weight-semibold); }
  .register-values { display: flex; align-items: center; gap: 0.5rem; font-variant-numeric: tabular-nums; } .register-values > span, .register-values i { color: var(--text-secondary); } .register-values i { font-size: 0.75rem; }
  .money-cell { font-variant-numeric: tabular-nums; } .invoice-link { display: block; margin-block-start: 0.5rem; font-size: var(--text-xs); }
  .reading-actions { display: flex; gap: 0.25rem; align-items: center; } .icon-button { display: grid; place-items: center; width: 44px; height: 44px; border: 1px solid var(--border); background: var(--surface); color: var(--text-secondary); border-radius: var(--radius-sm); }
  .icon-button:hover, .icon-button.is-active { background: var(--accent-soft); color: var(--accent-text); border-color: var(--accent-soft-border); }
  .reading-expanded { background: var(--accent-soft); } .expanded-details td { background: var(--neutral-soft); padding: 1rem 1.25rem !important; }
  .reading-detail-grid { display: grid; grid-template-columns: 1fr 2fr 1fr; gap: 1rem 2rem; text-align: start; } .reading-detail-grid > div { display: grid; gap: 0.4rem; } .reading-detail-grid span { font-size: var(--text-xs); color: var(--text-secondary); } .reading-detail-grid strong { font-size: var(--text-sm); font-weight: var(--weight-semibold); white-space: normal; } .reading-detail-grid .detail-notes { grid-column: 1 / -1; } .detail-notes p { margin: 0; white-space: pre-wrap; color: var(--text-body); }
  @media (max-width: 1100px) { .report-heading { flex-wrap: wrap; } .header-actions { margin-inline-start: auto; } .money-metrics { gap: 1rem; } dl { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
  @media (max-width: 640px) { .report-heading { padding: 0.75rem; gap: 0.75rem; } .utility-symbol { flex-basis: 2.75rem; height: 2.75rem; } .header-actions { width: 100%; } .report-button { flex: 1; padding-inline: 0.5rem; } .meter-details { padding: 0.75rem; } dl { grid-template-columns: repeat(2, minmax(0, 1fr)); } .consumption-strip { padding: 0.65rem 0.75rem; } .consumption-strip strong { font-size: 1.4rem; } .currency-summary { padding: 0.75rem; flex-direction: column; gap: 0.75rem; } .currency-label { flex-direction: row; justify-content: flex-start; border: 0; padding: 0; align-items: center; } .money-metrics { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0.75rem; } .money-metrics strong { font-size: 1.1rem; } .history-heading { align-items: flex-start; } .reading-detail-grid { grid-template-columns: 1fr 1fr; } .icon-button { width: 44px; height: 44px; } }
</style>
