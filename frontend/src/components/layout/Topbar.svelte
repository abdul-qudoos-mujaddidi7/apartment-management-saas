<script>
  import { createEventDispatcher, onMount, onDestroy } from 'svelte';
  import LanguageSwitcher from '../LanguageSwitcher.svelte';
  import { user } from '../../stores/auth';
  import { locale } from '../../i18n';
  import { moduleKeyForLocation } from '../../navigation';

  export let navigationOpen = false;

  const dispatch = createEventDispatcher();

  // Read the initial hash and keep it in sync via hashchange events.
  let currentPath = window.location.hash.slice(1).split('?')[0] || '/';

  function onHashChange() {
    currentPath = window.location.hash.slice(1).split('?')[0] || '/';
  }

  onMount(() => {
    window.addEventListener('hashchange', onHashChange);
  });

  onDestroy(() => {
    window.removeEventListener('hashchange', onHashChange);
  });

  $: moduleKey = moduleKeyForLocation(currentPath);
  $: moduleName = moduleKey ? $locale.dashboard.nav[moduleKey] : '';

  // Sub-navigation for the buildings module
  $: isAccountsModule = moduleKey === 'accounts';
  $: accountsActive = currentPath === '/accounts';
  $: tenantAccountsActive = currentPath === '/tenant-accounts';
  $: isBuildingsModule = moduleKey === 'buildings';
  $: buildingsActive = currentPath === '/buildings';
  $: floorsActive = currentPath === '/floors' || currentPath.startsWith('/buildings/');
  $: apartmentsActive = currentPath === '/apartments' || currentPath.startsWith('/floors/');
  $: isMetersModule = moduleKey === 'meters';
  $: metersActive = currentPath === '/meters' || currentPath.startsWith('/meters/');
  $: meterReadingsActive = currentPath === '/meter-readings' || currentPath.startsWith('/meter-readings/');
  $: isInvoicesModule = moduleKey === 'invoices';
  $: invoicesActive = currentPath === '/invoices' || currentPath.startsWith('/invoices/');
  $: paymentsActive = currentPath === '/payments' || currentPath.startsWith('/payments/');
  $: primaryTabActive = isBuildingsModule ? buildingsActive : isMetersModule ? metersActive : invoicesActive;

  function navigateSub(href) {
    window.location.hash = '#' + href;
  }

  /** Who is signed in, for the identity block at the bar's trailing edge. */
  function initials() {
    return $user?.firstName?.[0]?.toUpperCase() || $user?.email?.[0]?.toUpperCase() || 'U';
  }

</script>

<header class="app-topbar">
  <div class="app-topbar-module">
    <button
      class="nav-toggle"
      type="button"
      on:click={() => dispatch('toggleNav')}
      aria-label={$locale.dashboard.toggleNavigation}
      aria-expanded={navigationOpen}
    >
      <i class="bi bi-list" aria-hidden="true"></i>
    </button>

    {#if moduleName}
      <h1 class="app-topbar-title">
        {#if isBuildingsModule || isMetersModule || isInvoicesModule || isAccountsModule}
          <button
            class="subnav-item"
            class:is-active={isAccountsModule ? accountsActive : primaryTabActive}
            aria-current={(isAccountsModule ? accountsActive : primaryTabActive) ? 'page' : undefined}
            type="button"
            on:click={() => navigateSub('/' + moduleKey)}
          >{moduleName}</button>
        {:else}
          {moduleName}
        {/if}
      </h1>
    {/if}

    {#if isBuildingsModule}
      <nav class="app-topbar-subnav" aria-label="Buildings sub-navigation">
        <button
          class="subnav-item"
          class:is-active={floorsActive}
          aria-current={floorsActive ? 'page' : undefined}
          type="button"
          on:click={() => navigateSub('/floors')}
        >
          {$locale.dashboard.nav.floors || 'Floors'}
        </button>
        <button
          class="subnav-item"
          class:is-active={apartmentsActive}
          aria-current={apartmentsActive ? 'page' : undefined}
          type="button"
          on:click={() => navigateSub('/apartments')}
        >
          {$locale.dashboard.nav.apartments}
        </button>
      </nav>
    {/if}
    {#if isAccountsModule}
      <nav class="app-topbar-subnav" aria-label="Accounts sub-navigation">
        <button
          class="subnav-item"
          class:is-active={tenantAccountsActive}
          aria-current={tenantAccountsActive ? 'page' : undefined}
          type="button"
          on:click={() => navigateSub('/tenant-accounts')}
        >
          {$locale.dashboard.nav.tenantAccounts}
        </button>
      </nav>
    {/if}
    {#if isMetersModule || isInvoicesModule}
      <nav class="app-topbar-subnav" aria-label={moduleName}>
        <button
          class="subnav-item"
          class:is-active={isMetersModule ? meterReadingsActive : paymentsActive}
          aria-current={(isMetersModule ? meterReadingsActive : paymentsActive) ? 'page' : undefined}
          type="button"
          on:click={() => navigateSub(isMetersModule ? '/meter-readings' : '/payments')}
        >
          {isMetersModule ? $locale.dashboard.nav.meterReadings : $locale.dashboard.nav.payments}
        </button>
      </nav>
    {/if}
  </div>

  <div class="app-topbar-actions">
    <LanguageSwitcher />

    <!-- Identity, not a menu: the name and address are the whole point of the
         block, and signing out lives at the foot of the rail, so a disclosure
         chevron here would promise a menu that does not exist. -->
    {#if $user}
      <span class="app-topbar-user">
        <span class="app-avatar" aria-hidden="true">{initials()}</span>
        <span class="app-user">
          <span class="app-user-name">{$user.firstName || $user.email}</span>
          <span class="app-user-meta">{$user.email}</span>
        </span>
      </span>
    {/if}
  </div>
</header>

<style>
  .app-topbar-subnav {
    display: flex;
    align-items: center;
    /* The rule under an active tab is the separator now, so the tabs need more
       air between them than a chip row does and no divider glyph. */
    gap: var(--space-3);
    margin-inline-start: var(--space-4);
    padding-inline-start: var(--space-4);
    border-inline-start: 1px solid var(--border);
  }

  /* Tabs, not chips. The current one is named in the accent and marked with a
     2.5px rule under the word, so "where am I" is answered by colour plus a
     mark, rather than by a fill that has to hold its own against the wash
     behind the bar. A tab sits on a transparent 2.5px border whether or not it
     is active, so nothing shifts by a pixel when you move between them. */
  .subnav-item {
    padding: 0.3rem 0.15rem 0.35rem;
    border: 0;
    border-block-end: 2.5px solid transparent;
    border-radius: 0;
    color: var(--text-secondary);
    background: transparent;
    font-size: var(--text-lg);
    font-weight: var(--weight-semibold);
    letter-spacing: var(--tracking-tight);
    cursor: pointer;
    transition: color var(--transition), border-color var(--transition);
    white-space: nowrap;
  }

  .subnav-item:hover {
    color: var(--accent-text);
    border-block-end-color: var(--accent-border);
  }

  .subnav-item.is-active {
    color: var(--accent-text);
    border-block-end-color: var(--accent-text);
  }

  /* Identity block: avatar, name, address — the same shape the rail's account
     card uses, so the two read as one person in two places. */
  .app-topbar-user {
    display: inline-flex;
    align-items: center;
    gap: 0.65rem;
    padding-inline-start: var(--space-2);
    margin-inline-start: var(--space-1);
    min-width: 0;
  }

  .app-topbar-user .app-user { min-width: 0; }

  @media (max-width: 767.98px) {
    /* Below the shell's breakpoint the address is the first thing to go: the
       name plus the avatar still identify the account. */
    .app-topbar-user .app-user-meta { display: none; }
  }

  @media (max-width: 575.98px) {
    .subnav-item { font-size: var(--text-lg); }
    .app-topbar-user .app-user { display: none; }
  }
</style>
