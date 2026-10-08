<script>
  import { createEventDispatcher, onMount, onDestroy, tick } from 'svelte';
  import Notifications from '../Notifications.svelte';
  import LanguageSwitcher from '../LanguageSwitcher.svelte';
  import ThemeToggle from '../ThemeToggle.svelte';
  import { user, signOut } from '../../stores/auth';
  import { replace } from 'svelte-spa-router';
  import { locale } from '../../i18n';
  import { moduleKeyForLocation } from '../../navigation';

  export let navigationOpen = false;

  const dispatch = createEventDispatcher();
  let profileOpen = false;
  let profileContainer;
  let profileButton;
  let loggingOut = false;
  let profileError = '';

  $: displayName = [$user?.firstName, $user?.lastName].filter(Boolean).join(' ') || $user?.username || '';
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

  async function toggleProfile() {
    profileError = '';
    profileOpen = !profileOpen;
    if (profileOpen) { await tick(); profileContainer?.querySelector('[data-profile-link]')?.focus(); }
  }

  function profileMenuKeydown(event) {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const items = [...profileContainer.querySelectorAll('[data-profile-link]:not(:disabled)')];
    if (!items.length) return;
    const index = items.indexOf(document.activeElement);
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
    items[next]?.focus();
  }

  async function handleProfileLogout() {
    if (loggingOut) return;
    loggingOut = true;
    profileError = '';
    try { await signOut(); await replace('/login'); }
    catch (error) { profileError = $locale.profile.logoutFailed; }
    finally { loggingOut = false; }
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
  $: assetsActive = currentPath === '/assets' || currentPath.startsWith('/apartments/');
  $: isMetersModule = moduleKey === 'meters';
  $: metersActive = currentPath === '/meters' || currentPath.startsWith('/meters/');
  $: meterReadingsActive = currentPath === '/meter-readings' || currentPath.startsWith('/meter-readings/');
  $: isTenantsModule = moduleKey === 'tenants';
  $: tenantsActive = currentPath === '/tenants' || currentPath.startsWith('/tenants/');
  // Leases are a tab in the Tenants module: their list, their details and the
  // printed contract all light it up.
  $: leasesActive = currentPath === '/leases' || currentPath.startsWith('/leases/');
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
    return $user?.firstName?.[0]?.toUpperCase() || $user?.username?.[0]?.toUpperCase() || 'U';
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
        <span class="subnav-separator" aria-hidden="true">|</span>
        <button
          class="subnav-item"
          class:is-active={assetsActive}
          aria-current={assetsActive ? 'page' : undefined}
          type="button"
          on:click={() => navigateSub('/assets')}
        >
          {$locale.dashboard.nav.assets}
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
    {#if isTenantsModule}
      <nav class="app-topbar-subnav" aria-label={moduleName}>
        <button
          class="subnav-item"
          class:is-active={leasesActive}
          aria-current={leasesActive ? 'page' : undefined}
          type="button"
          on:click={() => navigateSub('/leases')}
        >
          {$locale.dashboard.nav.leases}
        </button>
        {#if canViewGuarantors}
          <span class="subnav-separator" aria-hidden="true">|</span>
          <button
            class="subnav-item"
            class:is-active={guarantorsActive}
            aria-current={guarantorsActive ? 'page' : undefined}
            type="button"
            on:click={() => navigateSub('/guarantors')}
          >
            {$locale.dashboard.nav.guarantors}
          </button>
        {/if}
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
    <Notifications />

    {#if $user}
      <div class="app-topbar-user" bind:this={profileContainer}>
        <button
          class="profile-trigger"
          class:is-open={profileOpen}
          type="button"
          bind:this={profileButton}
          on:click={toggleProfile}
          aria-label={$locale.profile.menu}
          aria-expanded={profileOpen}
          aria-controls="topbar-profile"
        >
          <span class="app-avatar" aria-hidden="true">{initials()}</span>
        </button>
        {#if profileOpen}
          <section id="topbar-profile" class="profile-panel" aria-label={$locale.profile.account}>
            <div class="profile-identity">
              <strong class="profile-name">{displayName}</strong>
              <span class="profile-username" dir="auto">{$user.username}</span>
            </div>
            <nav class="profile-links" aria-label={$locale.profile.menu}>
              <a class="profile-menu-item" data-profile-link on:keydown={profileMenuKeydown} href="#/settings/profile" on:click={() => profileOpen = false}>{$locale.dashboard.nav.profile}</a>
              <a class="profile-menu-item" data-profile-link on:keydown={profileMenuKeydown} href="#/dashboard" on:click={() => profileOpen = false}>{$locale.dashboard.nav.dashboard}</a>
              <div class="profile-footer">
                <button class="profile-menu-item" data-profile-link on:keydown={profileMenuKeydown} type="button" disabled={loggingOut} on:click={handleProfileLogout}>{loggingOut ? $locale.common.loggingOut : $locale.common.logout}</button>
                <span class="profile-version" dir="ltr" title={$locale.profile.version}>v{__APP_VERSION__}</span>
              </div>
            </nav>
            {#if profileError}<p class="profile-error" role="alert">{profileError}</p>{/if}
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
    width: min(230px, calc(100vw - 2 * var(--space-3)));
    overflow: hidden;
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    background: var(--surface);
    color: var(--text-strong);
    box-shadow: var(--shadow-lg);
  }

  .profile-identity {
    display: grid;
    gap: 0.2rem;
    padding: var(--space-4) var(--space-5);
    border-block-end: 1px solid var(--border);
  }

  .profile-name, .profile-username { font-size: var(--text-sm); line-height: 1.5; overflow-wrap: anywhere; }
  .profile-name { font-weight: var(--weight-semibold); }
  .profile-username { color: var(--text-strong); text-align: start; }
  .profile-links { padding-block-start: var(--space-2); }
  .profile-menu-item {
    display: flex;
    align-items: center;
    width: 100%;
    min-height: 44px;
    padding: var(--space-2) var(--space-5);
    border: 0;
    background: transparent;
    color: var(--text-strong);
    font-size: var(--text-sm);
    line-height: 1.5;
    text-align: start;
    text-decoration: none;
    cursor: pointer;
    transition: background var(--transition);
  }
  .profile-menu-item:hover { background: var(--surface-hover); }
  .profile-menu-item:focus-visible { outline: 2px solid var(--accent-text); outline-offset: -3px; background: var(--surface-hover); }
  .profile-menu-item:disabled { cursor: wait; opacity: 0.65; }
  .profile-footer { display: flex; align-items: center; margin-block-start: var(--space-2); padding-block: var(--space-2); padding-inline-end: var(--space-5); border-block-start: 1px solid var(--border); }
  .profile-footer .profile-menu-item { flex: 1; min-width: 0; }
  .profile-version { flex-shrink: 0; color: var(--text-secondary); font-size: var(--text-xs); }
  .profile-error { margin: 0; padding: var(--space-3) var(--space-5); color: var(--danger); font-size: var(--text-sm); }

  /* The trailing cluster: theme, language, bell, identity. One gap and one
     control size for all of them, so the row reads as a single object rather
     than as four things that happen to be near each other. */
  .app-topbar-actions {
    display: flex;
    align-items: center;
    gap: var(--space-1);
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
