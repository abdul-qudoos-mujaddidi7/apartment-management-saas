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
      <i class={collapsed ? 'bi bi-grid' : 'bi bi-list'} aria-hidden="true"></i>
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
    {#each navigationItems as item (item.key)}
      {@const label = $locale.dashboard.nav[item.key]}
      <a
        use:link
        href={item.href}
        class:is-active={activeModule === item.key}
        class="app-nav-item"
        aria-current={activeModule === item.key ? 'page' : undefined}
        title={collapsed ? label : undefined}
      >
        <i class={`bi ${item.icon}`} aria-hidden="true"></i>
        <span>{label}</span>
      </a>
    {/each}
  </nav>

  <div class="app-sidebar-foot">
    <button
      type="button"
      class="app-nav-item app-nav-item--action"
      on:click={handleLogout}
      disabled={loggingOut}
      title={collapsed ? logoutLabel : undefined}
    >
      <i class="bi bi-box-arrow-right" aria-hidden="true"></i>
      <span>{logoutLabel}</span>
    </button>
  </div>
</aside>
