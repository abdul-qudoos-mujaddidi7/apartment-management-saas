<script>
  /**
   * Index/list page shell — one white panel for the whole page.
   *
   * The panel is the page: one toolbar band on top holding the whole control
   * row (search, tab chips, filters button, actions through `PageToolbar`),
   * then the stats / alert bands, then the scrolling content, then the
   * pagination footer. Hairline dividers separate the bands so the page reads
   * as a single surface instead of a stack of loose cards.
   *
   * Slots: actions, toolbar, stats, alerts, content, footer
   * A default slot renders into the content area too, so
   * `<PageLayout><DataTable /></PageLayout>` works.
   */

  /** Render the `stats` band (needs `stats` slot). */
  export let showStats = false;
  /** Render the `footer` band (needs `footer` slot). */
  export let showFooter = true;
  /** Fill the available page height by default, matching Zeno ERP index pages.
      Set true only when a page explicitly needs a content-sized panel. */
  export let fitContent = false;
  /** Extra class hooks for a single page. */
  export let className = '';
  /** Accessible name for the page region. */
  export let ariaLabel = '';

  $: hasActions = $$slots.actions;
</script>

<div
  class={`index-page ${className}`.trim()}
  class:index-page--fit-content={fitContent}
  aria-label={ariaLabel || undefined}
>
  <section class="index-panel">
    {#if hasActions || $$slots.toolbar}
      <header class="index-toolbar">
        {#if hasActions}
          <div class="index-toolbar-actions">
            <slot name="actions" />
          </div>
        {/if}

        <div class="index-toolbar-main">
          <slot name="toolbar" />
        </div>
      </header>
    {/if}

    {#if showStats && $$slots.stats}
      <section class="index-band index-statistics">
        <slot name="stats" />
      </section>
    {/if}

    {#if $$slots.alerts}
      <div class="index-band index-alerts">
        <slot name="alerts" />
      </div>
    {/if}

    <div class="index-content">
      <slot name="content" />
      <slot />
    </div>

    {#if showFooter && $$slots.footer}
      <footer class="index-footer">
        <slot name="footer" />
      </footer>
    {/if}
  </section>
</div>

<style>
  .index-page {
    display: flex;
    flex-direction: column;
    flex: 1 1 auto;
    width: 100%;
    min-width: 0;
    min-height: 0;
    /* Shared gutter: bands and inner region padding are derived from this so a
       nested DataTable can line its own rows up with the panel. */
    --index-gutter: var(--page-content-pad-inline);
  }

  .index-panel {
    display: flex;
    flex: 1 1 auto;
    flex-direction: column;
    width: 100%;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    background: var(--surface);
    box-shadow: 0 2px 8px rgba(15, 23, 42, 0.025);
  }

  .index-page--fit-content,
  .index-page--fit-content .index-panel,
  .index-page--fit-content .index-content {
    flex-grow: 0;
  }

  /* --- Toolbar band ----------------------------------------------------- */

  /* The toolbar sits on the panel's own white surface, so the search field,
     chips and buttons read as controls on the page instead of a separate
     band; the table's sunken header row is what marks where the list begins.
     PageToolbar owns everything inside it. */
  .index-toolbar {
    position: relative;
    z-index: 50; /* keeps open filter popovers above the table */
    display: flex;
    align-items: center;
    gap: 0.75rem;
    flex: 0 0 auto;
    min-height: 3.5rem;
    padding: 0.625rem var(--index-gutter);
    overflow: visible;
    background: var(--surface);
  }

  .index-toolbar-actions {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    flex: 0 0 auto;
    min-width: 0;
  }

  .index-toolbar-main {
    display: flex;
    align-items: center;
    flex: 1 1 auto;
    min-width: 0;
  }

  /* --- Content bands ---------------------------------------------------- */

  .index-band {
    flex: 0 0 auto;
    padding: 0.75rem var(--index-gutter);
    border-block-end: 1px solid var(--border);
    background: var(--surface-muted);
  }

  .index-alerts {
    display: grid;
    gap: var(--space-2);
    background: var(--surface);
  }

  /* Pages pass the `alerts` slot unconditionally and gate each message inside
     it, so an alert-free page would otherwise show a blank white strip with a
     hairline above the table. Collapse the band while it holds no elements
     (not `:empty`, which whitespace text nodes in the slot would defeat). */
  .index-alerts:not(:has(> *)) {
    display: none;
  }

  .index-alerts :global(.alert) { margin: 0; }

  .index-content {
    position: relative;
    z-index: 1;
    display: flex;
    flex: 1 1 auto;
    flex-direction: column;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
    background: transparent;
    padding-inline: 0;
  }

  /* Inside the panel the table region *is* the panel, so its own chrome would
     only draw a card inside a card. */
  .index-content :global(.data-table-panel) {
    border: 0;
    border-radius: 0;
    background: transparent;
    box-shadow: none;
  }

  .index-content :global(.panel-loader),
  .index-content :global(.index-table-state) {
    display: grid;
    flex: 1 1 auto;
    place-items: center;
    min-height: 12rem;
  }

  /* --- Footer band ------------------------------------------------------ */

  .index-footer {
    position: relative;
    z-index: 10;
    flex: 0 0 auto;
    border-block-start: 1px solid var(--border);
    background: var(--surface);
    padding: 0.75rem var(--index-gutter) 0.875rem;
  }

  /* --- Responsive ------------------------------------------------------- */

  @media (max-width: 767.98px) {
    /* The panel keeps its own scroll area on small screens too — a table that
       scrolls behind a pinned header beats a page that scrolls the chrome
       away. Only the toolbar rearranges: page actions above the control row,
       which wraps into search / chips / buttons. */
    .index-toolbar {
      align-items: stretch;
      flex-direction: column;
      gap: 0.625rem;
      min-height: auto;
    }

    .index-toolbar-actions {
      order: 1;
      flex-wrap: wrap;
    }

    .index-toolbar-main {
      order: 2;
      width: 100%;
    }

    .index-band {
      padding-inline: var(--space-3);
    }

    .index-content {
      padding-inline: 0;
    }

    .index-footer {
      padding-inline: var(--space-3);
    }
  }
</style>
