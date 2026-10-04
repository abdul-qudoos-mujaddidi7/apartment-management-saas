<script>
  import { onMount } from 'svelte';
  import { link, replace } from 'svelte-spa-router';
  import { locale } from '../i18n';
  import { navigationItems, moduleKeyForLocation } from '../navigation';
  import { signOut } from '../stores/auth';

  export let user = null;
  export let open = false;

  const COLLAPSED_KEY = 'apartmentpro.sidebar-collapsed';
  let collapsed = false;
  let loggingOut = false;
  const primaryItems = navigationItems.filter(item => !item.href.startsWith('/settings/'));
  const settingsItems = navigationItems.filter(item => item.href.startsWith('/settings/'));
  let currentPath = window.location.hash.slice(1).split('?')[0] || '/';
  $: activeModule = moduleKeyForLocation(currentPath);
  $: logoutLabel = loggingOut ? $locale.common.loggingOut : $locale.common.logout;

  function readCollapsed() {
    try {
      return localStorage.getItem(COLLAPSED_KEY) === 'true';
    } catch {
      return false;
    }
  }

  function toggleCollapsed() {
    collapsed = !collapsed;
    try {
      localStorage.setItem(COLLAPSED_KEY, String(collapsed));
    } catch { /* private mode */ }
  }

  onMount(() => {
    collapsed = readCollapsed();
    window.addEventListener('hashchange', closeOnRouteChange);
    window.addEventListener('popstate', closeOnRouteChange);
    return () => {
      window.removeEventListener('hashchange', closeOnRouteChange);
      window.removeEventListener('popstate', closeOnRouteChange);
    };
  });

  function closeOnRouteChange() {
    currentPath = window.location.hash.slice(1).split('?')[0] || '/';
    open = false;
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

<svelte:window on:keydown={(event) => { if (event.key === 'Escape') open = false; }} />

{#if open}
  <button
    type="button"
    class="app-nav-scrim"
    aria-label={$locale.dashboard.toggleNavigation}
    on:click={() => (open = false)}
  ></button>
{/if}

<aside
  class:sidebar-open={open}
  class:sidebar-collapsed={collapsed}
  class="app-sidebar"
  aria-label={$locale.dashboard.mainNavigation}
>
  <div class="app-sidebar-brand">
    <span class="app-sidebar-mark">
      <i class="bi bi-buildings-fill" aria-hidden="true"></i>
    </span>
    <span class="app-sidebar-name">{$locale.common.apartmentPro}</span>
    <button
      type="button"
      class="sidebar-collapse"
      on:click={toggleCollapsed}
      aria-expanded={!collapsed}
      aria-label={collapsed ? $locale.dashboard.expandSidebar : $locale.dashboard.collapseSidebar}
      title={collapsed ? $locale.dashboard.expandSidebar : $locale.dashboard.collapseSidebar}
    >
      <i class="bi bi-grid" aria-hidden="true"></i>
    </button>
    <button
      type="button"
      class="sidebar-close"
      on:click={() => (open = false)}
      aria-label={$locale.common.close}
    >
      <i class="bi bi-x-lg" aria-hidden="true"></i>
    </button>
  </div>

  <nav class="app-sidebar-nav" aria-label={$locale.dashboard.mainNavigation}>
    {#each primaryItems as item (item.key)}
      {@const label = $locale.dashboard.nav[item.key]}
      <a
        use:link
        href={item.href}
        class:is-active={activeModule === item.key}
        class="app-nav-item"
        aria-current={activeModule === item.key ? 'page' : undefined}
        title={collapsed ? label : undefined}
        aria-label={label}
      >
        <i class={`bi ${item.key === 'dashboard' ? (activeModule === item.key ? 'bi-house-door-fill' : 'bi-house-door') : item.icon}`} aria-hidden="true"></i>
        <span>{label}</span>
      </a>
    {/each}
    <div class="sidebar-settings" role="group" aria-label={$locale.dashboard.sidebarGroups.settings}>
      {#each settingsItems as item (item.key)}
        {@const label = $locale.dashboard.nav[item.key]}
        <a
          use:link
          href={item.href}
          class:is-active={activeModule === item.key}
          class="app-nav-item"
          aria-current={activeModule === item.key ? 'page' : undefined}
          title={collapsed ? label : undefined}
          aria-label={label}
        >
          <i class={`bi ${item.icon}`} aria-hidden="true"></i>
          <span>{label}</span>
        </a>
      {/each}
    </div>
  </nav>

  <div class="app-sidebar-foot">
    <button
      type="button"
      class="app-nav-item app-nav-item--action"
      on:click={handleLogout}
      disabled={loggingOut}
      title={collapsed ? logoutLabel : undefined}
      aria-label={logoutLabel}
    >
      <i class="bi bi-box-arrow-right" aria-hidden="true"></i>
      <span>{logoutLabel}</span>
    </button>
  </div>
</aside>

<style>
  .app-sidebar {
    --sidebar-width: var(--sidebar-width-expanded);
    --sidebar-width-collapsed: 4.25rem;
    --sidebar-text: #514d49;
    --sidebar-icon: #827b75;
    --sidebar-text-strong: #262323;
    --sidebar-border: #e7e5e3;
    --sidebar-active-bg: #f0f6ff;
    --sidebar-active-text: #242323;
    --sidebar-active-icon: var(--brand-500);
    --sidebar-accent: var(--brand-700);
    --sidebar-gutter: 1rem;
    --sidebar-item-radius: 14px;
    align-self: stretch;
    min-height: 0;
    margin: 0;
    border: 0;
    border-radius: 0;
    background: transparent;
    box-shadow: none;
    transition: width 180ms ease;
  }
  .app-sidebar-brand {
    min-height: 80px;
    padding: 20px 1rem;
    gap: 8px;
  }
  .app-sidebar-mark {
    width: 24px; height: 30px; flex-basis: 24px;
    border-radius: 0;
    background: transparent; color: var(--sidebar-text-strong);
    box-shadow: none; font-size: 23px;
  }
  .app-sidebar-name {
    font-size: 1rem; font-weight: var(--weight-heavy); letter-spacing: var(--tracking-tight);
    color: var(--sidebar-text-strong);
  }
  .app-sidebar-nav {
    padding-block: 4px 8px;
    gap: 4px;
    scrollbar-width: none;
  }
  .app-sidebar-nav::-webkit-scrollbar { display: none; width: 0; height: 0; }
  .sidebar-settings { margin-block-start: auto; padding-block-start: 12px; }
  .sidebar-settings .app-nav-item + .app-nav-item { margin-block-start: 4px; }
  .app-nav-item {
    flex-shrink: 0;
    min-height: 44px;
    margin: 0;
    padding: 8px 12px;
    gap: 10px;
    font-family: var(--font-ui);
    font-size: 0.75rem; line-height: 1.5; font-weight: var(--weight-heavy);
    transition: background-color 160ms ease, color 160ms ease;
  }
  .app-nav-item > i {
    width: 22px; height: 24px; flex: 0 0 22px;
    font-size: 19px; line-height: 1;
  }
  .app-nav-item > span { white-space: normal; overflow: visible; }
  .app-nav-item:hover,
  :global([dir='rtl']) .app-nav-item:hover {
    transform: none;
    background: var(--brand-50);
    color: var(--sidebar-text-strong);
  }
  .app-nav-item:hover > i { color: var(--sidebar-icon); }
  .app-nav-item.is-active {
    font-weight: var(--weight-heavy);
    background: var(--sidebar-active-bg);
    color: var(--sidebar-active-text);
    box-shadow: none;
  }
  .app-nav-item.is-active:hover { background: var(--sidebar-active-bg); color: var(--sidebar-active-text); }
  .app-nav-item.is-active > i { color: var(--sidebar-active-icon); }
  .app-sidebar-foot { flex-shrink: 0; padding: 8px 1rem; margin: 0; border: 0; }
  .app-sidebar-foot .app-nav-item--action { color: var(--sidebar-text); font-weight: var(--weight-heavy); margin: 0; }
  .app-sidebar-foot .app-nav-item--action > i { color: var(--sidebar-icon); }
  .app-sidebar-foot .app-nav-item--action:hover { color: var(--danger); background: var(--danger-soft); }
  .app-sidebar-foot .app-nav-item--action:hover > i { color: var(--danger); }
  .sidebar-collapse, .sidebar-close {
    width: 28px; height: 28px;
    border: 1px solid var(--sidebar-border);
    border-radius: 10px;
    color: var(--sidebar-icon);
    background: var(--white);
    box-shadow: 0 2px 6px rgb(38 35 35 / 9%);
  }
  .sidebar-collapse { top: 32px; inset-inline-end: -14px; }
  .sidebar-collapse i { font-size: 13px; }
  .sidebar-collapse:hover, .sidebar-close:hover { color: var(--brand-800); }
  .app-sidebar.sidebar-collapsed .app-sidebar-brand { padding: 20px 8px; }
  .app-sidebar.sidebar-collapsed .app-sidebar-nav { padding-inline: 8px; }
  .app-sidebar.sidebar-collapsed .app-nav-item { padding: 8px; min-height: 44px; }
  .app-sidebar.sidebar-collapsed .app-sidebar-foot { padding-inline: 8px; }
  @media (max-width: 991.98px) {
    .app-sidebar, .app-sidebar.sidebar-collapsed {
      width: min(240px, 85vw);
      inset-block: 0;
      inset-inline-start: 0;
      margin: 0;
      border-radius: 0;
      background: var(--surface);
      transform: translateX(-100%);
      transition: transform 180ms ease;
    }
    :global([dir='rtl']) .app-sidebar { transform: translateX(100%); border-radius: 0; }
    .app-sidebar.sidebar-open { transform: translateX(0); }
    :global([dir='rtl']) .app-sidebar.sidebar-open { transform: translateX(0); }
    .app-sidebar.sidebar-collapsed .app-sidebar-brand { justify-content: flex-start; padding-inline: 1rem; }
    .app-sidebar.sidebar-collapsed .app-sidebar-name,
    .app-sidebar.sidebar-collapsed .app-nav-item > span { display: block; }
    .app-sidebar.sidebar-collapsed .app-sidebar-nav { padding-inline: 1rem; }
    .app-sidebar.sidebar-collapsed .app-nav-item { justify-content: flex-start; padding-inline: 12px; gap: 10px; }
    .app-sidebar.sidebar-collapsed .app-sidebar-foot { padding-inline: 1rem; }
    .sidebar-collapse { display: none; }
    .sidebar-close { top: 8px; inset-inline-end: 8px; width: 44px; height: 44px; }
  }
  @media (prefers-reduced-motion: reduce) {
    .app-sidebar, .app-nav-item, .sidebar-collapse, .sidebar-close { transition: none; }
  }
</style>
