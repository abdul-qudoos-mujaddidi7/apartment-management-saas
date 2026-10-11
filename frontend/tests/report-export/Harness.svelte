<script>
  /**
   * A stand-in for a report page: the same Export control a real page mounts,
   * over a statement shaped like the tenant ledger, plus the raw byte access
   * the browser test asserts on. The page deliberately holds no export code of
   * its own — everything below the button is the shared engine.
   */
  import { onMount } from 'svelte';
  import ExportMenu from '../../src/components/ui/ExportMenu.svelte';
  import { language, setLanguage } from '../../src/i18n';
  import { createReport } from '../../src/utils/report/model.js';
  import { buildXlsx } from '../../src/utils/report/excel.js';
  import { buildPdf } from '../../src/utils/report/pdf.js';

  const COLUMNS = [
    { label: 'Date', kind: 'date' },
    { label: 'Reference', kind: 'text' },
    { label: 'Description', kind: 'text' },
    { label: 'Debit', kind: 'money' },
    { label: 'Credit', kind: 'money' },
    { label: 'Balance', kind: 'money' }
  ];

  const ROWS = [
    ['2026-04-01', 'INV-0001 · Rent', 'April rent — Apartment 4B', 12000, 0, 12000],
    ['2026-04-04', 'RCPT-0112 · Payment', 'Bank transfer received', 0, 12000, 0],
    ['2026-05-01', 'INV-0004 · Rent', 'May rent — Apartment 4B', 12000, 0, 12000],
    ['2026-05-09', 'RCPT-0121 · Payment', 'Cash receipt', 0, 8000, 4000],
    ['2026-05-20', 'MTR-0031 · Electricity', 'Meter 31, 214 kWh at 12.50', 2675, 0, 6675],
    ['2026-06-01', 'INV-0009 · Rent', 'June rent — Apartment 4B', 12000, 0, 18675],
    ['2026-06-06', 'RCPT-0130 · Payment', 'Bank transfer received', 0, 18675, 0],
    ['2026-06-18', 'ADJ-0002 · Adjustment', 'Service fee credited for the power cut on 3 June', 0, 1500, -1500],
    ['2026-07-01', 'INV-0015 · Rent', 'July rent — Apartment 4B', 12000, 0, 10500],
    ['2026-07-11', 'RCPT-0144 · Payment', 'Cash receipt', 0, 10500, 0]
  ];

  const TOTALS = ['Total', '', '', 48675, 50675, 0];

  let previewUrl = '';
  let busy = false;

  // The harness states its own language so a test run does not inherit one.
  onMount(() => setLanguage('en'));
  $: languageCode = $language;

  /** What the page exports: a description, never a file. */
  function report() {
    return createReport({
      title: languageCode === 'en' ? 'Tenant Statement' : 'صورتحساب مستأجر',
      subtitle: languageCode === 'en' ? 'Nasrin Habibi · Apartment 4B · Parkview Residence' : 'نصرین حبیبی · آپارتمان ۴B · پارک‌ویو',
      company: 'Parkview Estates',
      meta: [languageCode === 'en' ? 'March — July 2026' : 'حمل تا اسد ۱۴۰۵'],
      metrics: [
        { label: languageCode === 'en' ? 'Opening balance' : 'موجودی اولیه', value: '0.00 AFN' },
        { label: languageCode === 'en' ? 'Charged' : 'بدهکار', value: '48,675.00 AFN' },
        { label: languageCode === 'en' ? 'Received' : 'پرداخت‌شده', value: '50,675.00 AFN' },
        { label: languageCode === 'en' ? 'Closing balance' : 'موجودی نهایی', value: '-2,000.00 AFN' }
      ],
      columns: COLUMNS,
      rows: ROWS,
      totals: TOTALS,
      currency: 'AFN',
      fileName: 'tenant-statement',
      sheetName: 'Statement',
      language: languageCode
    });
  }

  /** The same file the button would save, handed to the test instead. */
  async function bytes(format) {
    const report_ = report();
    const output = format === 'pdf' ? await buildPdf(report_) : buildXlsx(report_);
    const buffer = output instanceof Blob ? await output.arrayBuffer() : output;
    return toBase64(buffer);
  }

  function toBase64(buffer) {
    const bytes_ = new Uint8Array(buffer);
    let binary = '';
    for (let index = 0; index < bytes_.length; index += 0x8000) {
      binary += String.fromCharCode.apply(null, bytes_.subarray(index, index + 0x8000));
    }
    return btoa(binary);
  }

  /** Render the PDF in the page so it can be looked at, not just asserted on. */
  async function preview() {
    busy = true;
    try {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      previewUrl = URL.createObjectURL(await buildPdf(report()));
    } finally {
      busy = false;
    }
  }

  if (typeof window !== 'undefined') {
    window.__reportExport = { bytes, report, preview };
  }
</script>

<main class="harness">
  <header class="harness-head">
    <div>
      <p class="harness-kicker">Export harness</p>
      <h1>Tenant Statement</h1>
      <p class="harness-copy">124 entries · 10 shown · AFN</p>
    </div>
    <div class="harness-actions">
      <button type="button" class="harness-button" on:click={() => setLanguage('en')}>EN</button>
      <button type="button" class="harness-button" on:click={() => setLanguage('fa')}>دری</button>
      <button type="button" class="harness-button" on:click={() => setLanguage('ps')}>پښتو</button>
      <ExportMenu {report} />
    </div>
  </header>

  <table class="table">
    <thead>
      <tr>{#each COLUMNS as column}<th>{column.label}</th>{/each}</tr>
    </thead>
    <tbody>
      {#each ROWS as row}
        <tr>{#each row as value}<td>{value}</td>{/each}</tr>
      {/each}
    </tbody>
  </table>

  <div class="harness-actions harness-actions-foot">
    <button type="button" class="harness-button" disabled={busy} on:click={preview}>
      {busy ? 'Rendering…' : 'Preview the PDF here'}
    </button>
    <span data-preview-state>{previewUrl ? 'ready' : ''}</span>
  </div>

  {#if previewUrl}
    <iframe class="harness-frame" title="Report PDF" src={previewUrl}></iframe>
  {/if}
</main>

<style>
  .harness {
    max-width: 72rem;
    margin: 0 auto;
    padding: 2rem 1.5rem 4rem;
  }

  .harness-head {
    display: flex;
    align-items: end;
    justify-content: space-between;
    gap: 1rem;
    flex-wrap: wrap;
    margin-bottom: 1.5rem;
  }

  .harness-kicker {
    margin: 0;
    color: var(--text-muted);
    font-size: var(--text-xs);
    font-weight: var(--weight-heavy);
    letter-spacing: var(--tracking-wide);
    text-transform: uppercase;
  }

  .harness-head h1 {
    margin: 0.35rem 0 0.2rem;
    font-size: 1.5rem;
  }

  .harness-copy {
    margin: 0;
    color: var(--text-muted);
    font-size: var(--text-sm);
  }

  .harness-actions {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .harness-actions-foot {
    margin-top: 1.25rem;
  }

  .harness-button {
    height: 2.5rem;
    padding: 0 0.9rem;
    border: 1px solid var(--border);
    border-radius: var(--control-radius);
    background: var(--surface);
    color: var(--text-secondary);
    font-size: var(--text-sm);
    font-weight: var(--weight-semibold);
    cursor: pointer;
  }

  .harness-frame {
    width: 100%;
    height: 70rem;
    margin-top: 1.25rem;
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    background: var(--surface);
  }
</style>
