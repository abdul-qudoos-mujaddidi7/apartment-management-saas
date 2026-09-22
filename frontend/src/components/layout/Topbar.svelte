<script>
  import { createEventDispatcher, onMount, onDestroy } from 'svelte';
  import { replace } from 'svelte-spa-router';
  import LanguageSwitcher from '../LanguageSwitcher.svelte';
  import { signOut } from '../../stores/auth';
  import { locale } from '../../i18n';
  import { moduleKeyForLocation } from '../../navigation';

  export let navigationOpen = false;

  const dispatch = createEventDispatcher();
  let loggingOut = false;

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

  async function handleLogout() {
    if (loggingOut) return;
    loggingOut = true;
    try {
      await signOut();
      await replace('/login');
    } catch (error) {
      console.error('Logout failed:', error);
    } finally {
      loggingOut = false;
    }
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
        <span class="subnav-divider" aria-hidden="true">|</span>
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
    <button
      class="logout-button"
      type="button"
      on:click={handleLogout}
      disabled={loggingOut}
    >
      <i class="bi bi-box-arrow-right" aria-hidden="true"></i>
      <span>{loggingOut ? $locale.common.loggingOut : $locale.common.logout}</span>
    </button>
  </div>
</header>

<style>
  .app-topbar-subnav {
    display: flex;
    align-items: center;
    gap: var(--space-1);
    margin-inline-start: var(--space-4);
    padding-inline-start: var(--space-4);
    border-inline-start: 1px solid var(--border);
  }

  .subnav-item {
    padding: var(--space-1) var(--space-2);
    border: 0;
    border-radius: var(--radius-sm);
    color: var(--text-strong);
    background: transparent;
    font-size: var(--text-lg);
    font-weight: var(--weight-heavy);
    letter-spacing: var(--tracking-tight);
    cursor: pointer;
    transition: color var(--transition), background var(--transition);
    white-space: nowrap;
  }

  .subnav-item:hover {
    color: var(--text-strong);
    background: var(--grey-200);
  }

  .subnav-divider {
    color: var(--border);
    font-size: var(--text-lg);
    user-select: none;
  }

  .subnav-item.is-active {
    color: var(--accent);
    background: var(--accent-highlight);
  }

  @media (max-width: 575.98px) {
    .subnav-item { font-size: var(--text-lg); }
  }
</style>
