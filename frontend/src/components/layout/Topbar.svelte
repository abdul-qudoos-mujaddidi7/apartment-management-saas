<script>
  import { createEventDispatcher, onMount, onDestroy } from 'svelte';
  import LeaseNotifications from '../LeaseNotifications.svelte';
  import LanguageSwitcher from '../LanguageSwitcher.svelte';
  import ThemeToggle from '../ThemeToggle.svelte';
  import { user } from '../../stores/auth';
  import { locale } from '../../i18n';
  import { moduleKeyForLocation } from '../../navigation';

  export let navigationOpen = false;

  const dispatch = createEventDispatcher();
  let profileOpen = false;
  let profileContainer;
  let profileButton;

  $: displayName = [$user?.firstName, $user?.lastName].filter(Boolean).join(' ') || $user?.email || '';
  $: if (!$user) profileOpen = false;

  function dismissProfile(event) {
    if (profileOpen && !profileContainer?.contains(event.target)) profileOpen = false;
  }

  function onProfileKeydown(event) {
    if (profileOpen && event.key === 'Escape') {
      profileOpen = false;
      profileButton?.focus();
    }
  }

  // Read the initial hash and keep it in sync via hashchange events.
  let currentPath = window.location.hash.slice(1).split('?')[0] || '/';

  function onHashChange() {
    currentPath = window.location.hash.slice(1).split('?')[0] || '/';
    profileOpen = false;
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
  $: isTenantsModule = moduleKey === 'tenants';
  $: tenantsActive = currentPath === '/tenants' || currentPath.startsWith('/tenants/');
  $: guarantorsActive = currentPath === '/guarantors' || currentPath.startsWith('/guarantors/');
  $: canViewGuarantors = $user?.permissions?.includes('GUARANTOR_VIEW');
  $: isInvoicesModule = moduleKey === 'invoices';
  $: invoicesActive = currentPath === '/invoices' || currentPath.startsWith('/invoices/');
  $: paymentsActive = currentPath === '/payments' || currentPath.startsWith('/payments/');
  $: primaryTabActive = isBuildingsModule ? buildingsActive : isMetersModule ? metersActive : isTenantsModule ? tenantsActive : invoicesActive;

  function navigateSub(href) {
    window.location.hash = '#' + href;
  }

  /** Who is signed in, for the identity block at the bar's trailing edge. */
  function initials() {
    return $user?.firstName?.[0]?.toUpperCase() || $user?.email?.[0]?.toUpperCase() || 'U';
  }

</script>

<svelte:window on:click={dismissProfile} on:focusin={dismissProfile} on:keydown={onProfileKeydown} />

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
        {#if isBuildingsModule || isMetersModule || isInvoicesModule || isAccountsModule || isTenantsModule}
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
      <nav class="app-topbar-subnav buildings-subnav" aria-label="Buildings sub-navigation">
        <span class="subnav-separator" aria-hidden="true">|</span>
        <button
          class="subnav-item"
          class:is-active={floorsActive}
          aria-current={floorsActive ? 'page' : undefined}
          type="button"
          on:click={() => navigateSub('/floors')}
        >
          {$locale.dashboard.nav.floors}
        </button>
        <span class="subnav-separator" aria-hidden="true">|</span>
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
    {#if isTenantsModule && canViewGuarantors}
      <nav class="app-topbar-subnav" aria-label={moduleName}>
        <button
          class="subnav-item"
          class:is-active={guarantorsActive}
          aria-current={guarantorsActive ? 'page' : undefined}
          type="button"
          on:click={() => navigateSub('/guarantors')}
        >
          {$locale.dashboard.nav.guarantors}
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
    <ThemeToggle />
    <LanguageSwitcher compact />
    <LeaseNotifications />

    {#if $user}
      <div class="app-topbar-user" bind:this={profileContainer}>
        <button
          class="profile-trigger"
          class:is-open={profileOpen}
          type="button"
          bind:this={profileButton}
          on:click={() => profileOpen = !profileOpen}
          aria-label={$locale.profile.menu}
          aria-expanded={profileOpen}
          aria-controls="topbar-profile"
        >
          <span class="app-avatar" aria-hidden="true">{initials()}</span>
        </button>
        {#if profileOpen}
          <section id="topbar-profile" class="profile-panel" aria-label={$locale.profile.account}>
            <div class="profile-identity">
              <span class="app-avatar" aria-hidden="true">{initials()}</span>
              <div class="profile-details">
                <strong class="profile-name">{displayName}</strong>
                <span class="profile-email" dir="ltr">{$user.email}</span>
              </div>
            </div>
            <div class="profile-version">
              <span>{$locale.profile.version}</span>
              <span class="app-version" dir="ltr">v{__APP_VERSION__}</span>
            </div>
          </section>
        {/if}
      </div>
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

  .app-topbar-subnav.buildings-subnav {
    margin-inline-start: 0;
    padding-inline-start: 0;
    border-inline-start: 0;
  }

  .subnav-separator {
    color: var(--text-muted);
    font-size: var(--text-lg);
    user-select: none;
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

  .app-topbar-user {
    position: relative;
    display: inline-flex;
    align-items: center;
    gap: 0.65rem;
    padding-inline-start: var(--space-3);
    margin-inline-start: var(--space-2);
    border-inline-start: 1px solid var(--border);
    min-width: 0;
  }

  .profile-trigger {
    display: grid;
    place-items: center;
    width: 44px;
    height: 44px;
    padding: 0;
    border: 1px solid transparent;
    border-radius: 50%;
    background: transparent;
    cursor: pointer;
    transition: background var(--transition), border-color var(--transition);
  }

  .profile-trigger:hover,
  .profile-trigger.is-open {
    background: var(--surface);
    border-color: var(--accent-border);
  }

  .profile-trigger:focus-visible {
    outline: 2px solid var(--accent-text);
    outline-offset: 2px;
  }

  .profile-panel {
    position: absolute;
    inset-block-start: calc(100% + var(--space-2));
    inset-inline-end: 0;
    z-index: 10;
    width: min(320px, calc(100vw - 2 * var(--space-3)));
    padding: var(--space-4);
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    background: var(--surface);
    color: var(--text-strong);
    box-shadow: var(--shadow-lg);
  }

  .profile-identity {
    display: flex;
    align-items: center;
    gap: var(--space-3);
  }

  .profile-details { display: grid; gap: var(--space-1); min-width: 0; }
  .profile-name { font-size: var(--text-sm); overflow-wrap: anywhere; }
  .profile-email { color: var(--text-secondary); font-size: var(--text-sm); overflow-wrap: anywhere; text-align: start; }

  .profile-version {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: var(--space-3);
    margin-block-start: var(--space-4);
    padding-block-start: var(--space-3);
    border-block-start: 1px solid var(--border);
    color: var(--text-secondary);
    font-size: var(--text-sm);
  }

  /* The trailing cluster: theme, language, bell, identity. One gap and one
     control size for all of them, so the row reads as a single object rather
     than as four things that happen to be near each other. */
  .app-topbar-actions {
    display: flex;
    align-items: center;
    gap: var(--space-1);
  }

  .app-version {
    display: inline-flex;
    align-items: center;
    min-height: 1.75rem;
    padding-inline: var(--space-2);
    border: 1px solid var(--border);
    border-radius: var(--radius-pill);
    color: var(--text-secondary);
    background: var(--surface);
    font-family: var(--font-data);
    font-size: var(--text-xs);
    font-weight: var(--weight-semibold);
    line-height: 1;
    white-space: nowrap;
  }

  /* The avatar is a disc in the reference bar, not the console's rounded
     square: at 36px it matches the icon controls' height, and a circle is what
     distinguishes "this is a person" from the three glyphs beside it. */
  .app-topbar-user .app-avatar {
    width: var(--topbar-control);
    height: var(--topbar-control);
    border-radius: 50%;
    font-size: var(--text-sm);
  }

  @media (max-width: 575.98px) {
    .subnav-item { font-size: var(--text-lg); }
  }
</style>
