<script>
  /**
   * Export — one control, two files.
   *
   * A page hands this component the *description* of its report (see
   * `utils/report/model.js`) and nothing else: no writer is named here, no
   * button is disabled by hand, and no page has to know that Excel and PDF are
   * two different code paths. Pressing a format builds the file, hands it to
   * the browser and reports either the failure or nothing at all — a saved
   * download is its own confirmation.
   *
   * `report` may be a plain object or a function. A function is the better
   * call on a list page: it is read at the moment of the press, so what is
   * exported is the data on screen now, not the data at first render.
   */

  import { onDestroy, onMount } from 'svelte';
  import { locale } from '../../i18n';
  import { exportReport } from '../../utils/report';
  import { notifyError } from '../../stores/toasts';

  /** The report spec, or a function returning one (optionally a promise). */
  export let report = null;
  /** Overrides the button caption; defaults to the shared "Export". */
  export let label = '';
  /** Extra reason to refuse — an empty list, a failed load, a missing filter. */
  export let disabled = false;
  /** Which edge the menu hangs from. */
  export let align = 'end';

  let open = false;
  let busy = '';
  let anchor;

  const MENU_ID = 'export-menu';
  const ICONS = { excel: 'bi-file-earmark-spreadsheet', pdf: 'bi-file-earmark-pdf' };

  const options = [
    { format: 'excel', label: () => $locale.reportExport.excel, icon: ICONS.excel },
    { format: 'pdf', label: () => $locale.reportExport.pdf, icon: ICONS.pdf }
  ];

  function close(returnFocus = false) {
    open = false;
    if (returnFocus) anchor?.querySelector('.export-trigger')?.focus();
  }

  function handleDocumentPointerDown(event) {
    if (open && anchor && !anchor.contains(event.target)) open = false;
  }

  function handleDocumentKeydown(event) {
    if (event.key !== 'Escape' || !open || event.defaultPrevented) return;
    event.preventDefault();
    close(true);
  }

  onMount(() => {
    document.addEventListener('pointerdown', handleDocumentPointerDown);
    document.addEventListener('keydown', handleDocumentKeydown);
  });

  onDestroy(() => {
    document.removeEventListener('pointerdown', handleDocumentPointerDown);
    document.removeEventListener('keydown', handleDocumentKeydown);
  });

  async function run(format) {
    if (busy) return;
    close();
    busy = format;
    try {
      // Read at press time, so a filter changed a second ago is in the file.
      const spec = typeof report === 'function' ? await report() : report;
      if (!spec) return;
      await exportReport(spec, format);
    } catch (error) {
      console.error('Report export failed:', error);
      notifyError($locale.reportExport.failed);
    } finally {
      busy = '';
    }
  }
</script>

<div class="export-anchor" bind:this={anchor}>
  <button
    class="export-trigger"
    class:is-busy={Boolean(busy)}
    type="button"
    data-print-exclude
    disabled={disabled || Boolean(busy)}
    aria-haspopup="menu"
    aria-expanded={open}
    aria-controls={MENU_ID}
    on:click={() => (open = !open)}
  >
    {#if busy}
      <span class="spinner-border spinner-border-sm" aria-hidden="true"></span>
    {:else}
      <i class="bi bi-download" aria-hidden="true"></i>
    {/if}
    <span>{busy ? $locale.reportExport.preparing : label || $locale.reportExport.label}</span>
    <i class="bi bi-chevron-down export-caret" aria-hidden="true"></i>
  </button>

  {#if open}
    <div class="export-menu" id={MENU_ID} role="menu" aria-label={$locale.reportExport.label} class:align-start={align === 'start'}>
      {#each options as option (option.format)}
        <button class="export-option" type="button" role="menuitem" on:click={() => run(option.format)}>
          <i class={`bi ${option.icon}`} aria-hidden="true"></i>
          <span>{option.label()}</span>
        </button>
      {/each}
    </div>
  {/if}
</div>

<style>
  /* The trigger is deliberately the quiet neighbour of the primary button: an
     export is a side door out of the page, not the action the page exists for. */
  .export-anchor {
    position: relative;
    flex: 0 0 auto;
  }

  .export-trigger {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    height: 2.5rem;
    padding: 0 0.7rem 0 0.8rem;
    border: 1px solid var(--border);
    border-radius: var(--control-radius);
    background: var(--surface);
    color: var(--text-secondary);
    font-size: var(--text-sm);
    font-weight: var(--weight-semibold);
    cursor: pointer;
    white-space: nowrap;
    transition: color var(--transition), background var(--transition), border-color var(--transition);
  }

  .export-trigger:hover:not(:disabled),
  .export-trigger[aria-expanded='true'] {
    color: var(--accent-text);
    border-color: var(--accent-soft-border);
    background: var(--accent-soft);
  }

  .export-trigger:disabled {
    cursor: not-allowed;
    opacity: 0.6;
  }

  .export-trigger i {
    font-size: 0.9rem;
  }

  .export-caret {
    font-size: 0.65rem !important;
    color: var(--text-muted);
  }

  .export-menu {
    position: absolute;
    z-index: 60;
    inset-block-start: calc(100% + 0.4rem);
    inset-inline-end: 0;
    display: grid;
    gap: 0.15rem;
    min-inline-size: 12rem;
    padding: 0.35rem;
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    background: var(--surface);
    box-shadow: var(--shadow-lg);
  }

  .export-menu.align-start {
    inset-inline-end: auto;
    inset-inline-start: 0;
  }

  .export-option {
    display: flex;
    align-items: center;
    gap: 0.55rem;
    padding: 0.5rem 0.6rem;
    border: 0;
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--text-secondary);
    font-size: var(--text-sm);
    font-weight: var(--weight-medium);
    text-align: start;
    cursor: pointer;
    transition: color var(--transition), background var(--transition);
  }

  .export-option:hover {
    color: var(--accent-text);
    background: var(--accent-soft);
  }

  .export-option i {
    color: var(--accent);
    font-size: 1rem;
  }

  @media (max-width: 575.98px) {
    .export-anchor {
      position: static;
    }

    .export-menu {
      inset-inline: 0;
      min-inline-size: auto;
    }
  }
</style>
