<script>
  import { link, replace } from 'svelte-spa-router';

  import { locale } from '../i18n';
  import { settingsPages } from '../navigation';
  import Currencies from './Currencies.svelte';
  import LeaseContractSettings from './LeaseContractSettings.svelte';
  import Profile from './Profile.svelte';

  /**
   * Settings is a module with pages rather than a rail full of rows.
   *
   * The router hands the page segment (`/settings/currencies` → `currencies`)
   * down as a param, so a page here is a real route: it survives a bookmark, a
   * reload and the back button, and the menu is rendered from the same list the
   * routes come from, so a page cannot exist in one and be missing from the
   * other. The layout is one surface split in two — the module's pages on the
   * inline-start edge, the open page beside them — because that is what makes a
   * settings screen read as a place you are working in rather than a folder you
   * keep opening.
   */
  export let params = {};

  /* A page is matched on its URL segment, not on its label key: the menu row
     for the contract settings is `leaseContract` while the address it lives at
     is `/settings/lease-contract`. Matching segments is what keeps the open
     page and the highlighted row the same thing. */
  $: knownPage = settingsPages.find(entry => entry.segment === params.page) || null;
  $: activePage = knownPage || settingsPages[0];
  $: pageLabel = $locale.dashboard.nav[activePage.key];

  // An address that matches no page — an old bookmark, a typo, a page that was
  // removed — is corrected to the first one rather than left showing a page the
  // URL does not name. Correcting it here rather than once on mount matters:
  // the module stays mounted while its pages change, so a bad address can
  // arrive long after the first render.
  $: if (params.page && !knownPage) void replace(settingsPages[0].href);
</script>

<div class="settings-shell">
  <nav class="settings-menu" aria-label={$locale.settings.menuLabel}>
    {#each settingsPages as entry (entry.key)}
      <a
        use:link
        href={entry.href}
        class="settings-menu-item"
        class:is-active={activePage.segment === entry.segment}
        aria-current={activePage.segment === entry.segment ? 'page' : undefined}
      >
        <i class={`bi ${entry.icon}`} aria-hidden="true"></i>
        <span>{$locale.dashboard.nav[entry.key]}</span>
      </a>
    {/each}
  </nav>

  <div class="settings-panel" aria-label={pageLabel} tabindex="-1">
    {#if activePage.key === 'currencies'}
      <Currencies />
    {:else if activePage.key === 'leaseContract'}
      <LeaseContractSettings />
    {:else}
      <Profile />
    {/if}
  </div>
</div>

<style>
  .settings-shell {
    display: grid;
    /* `minmax(0, 1fr)` on the row is what lets a page scroll inside its own
       column: without it the row would size to its content and push the panel
       past the bottom of the viewport, past the bar and the rail with it. */
    grid-template-columns: 15.5rem minmax(0, 1fr);
    grid-template-rows: minmax(0, 1fr);
    gap: var(--space-4);
    flex: 1 1 auto;
    width: 100%;
    min-height: 0;
  }

  .settings-menu {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
    min-height: 0;
    padding: var(--space-2);
    overflow-y: auto;
    border: 1px solid var(--card-border);
    border-radius: var(--radius-lg);
    background: var(--surface);
    box-shadow: var(--card-shadow);
  }

  .settings-menu-item {
    position: relative;
    display: flex;
    align-items: center;
    gap: 0.7rem;
    flex-shrink: 0;
    min-height: 2.75rem;
    padding: 0.45rem 0.75rem;
    border-radius: var(--radius-md);
    color: var(--text-secondary);
    font-size: var(--text-sm);
    line-height: 1.5;
    font-weight: var(--weight-semibold);
    text-decoration: none;
    transition: background-color var(--transition), color var(--transition);
  }

  .settings-menu-item > i {
    flex: 0 0 1.15rem;
    color: var(--text-muted);
    font-size: 1rem;
    text-align: center;
    transition: color var(--transition);
  }

  .settings-menu-item:hover {
    background: var(--surface-hover);
    color: var(--accent-text);
  }

  .settings-menu-item:hover > i { color: var(--accent-text); }

  .settings-menu-item.is-active {
    background: var(--accent-soft);
    color: var(--accent-text);
    font-weight: var(--weight-heavy);
  }

  .settings-menu-item.is-active > i { color: var(--accent-text); }

  .settings-menu-item:focus-visible {
    outline: 2px solid var(--accent-text);
    outline-offset: -2px;
  }

  .settings-panel {
    display: flex;
    flex-direction: column;
    min-width: 0;
    min-height: 0;
    overflow-y: auto;
  }

  /* Below the rail's breakpoint there is no room for two columns: the menu
     becomes a scroller of chips above the page, which stays reachable without
     taking a third of a phone screen to say three words. */
  @media (max-width: 991.98px) {
    .settings-shell {
      grid-template-columns: minmax(0, 1fr);
      grid-template-rows: auto minmax(0, 1fr);
      gap: var(--space-3);
    }

    .settings-menu {
      flex-direction: row;
      gap: var(--space-1);
      padding: var(--space-2);
      overflow-x: auto;
      overflow-y: hidden;
      scrollbar-width: none;
    }

    .settings-menu::-webkit-scrollbar { display: none; width: 0; height: 0; }

    .settings-menu-item { white-space: nowrap; }

  }

  @media (max-width: 991.98px), (pointer: coarse) {
    .settings-menu-item { min-height: 44px; }
  }

  @media (prefers-reduced-motion: reduce) {
    .settings-menu-item, .settings-menu-item > i { transition: none; }
  }
</style>
