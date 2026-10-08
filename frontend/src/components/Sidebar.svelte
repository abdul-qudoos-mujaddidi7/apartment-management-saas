<script>
  import { onMount } from 'svelte';
  import { link } from 'svelte-spa-router';
  import { locale } from '../i18n';
  import { navigationItems, navigationGroups, moduleKeyForLocation, isSettingsLocation } from '../navigation';

  export let user = null;
  export let open = false;

  const COLLAPSED_KEY = 'apartmentpro.sidebar-collapsed';
  let collapsed = false;
  // Settings is lifted out of the rail and pinned in the footer: it is a
  // destination you visit to configure the workspace, not one of the modules
  // you work in all day.
  const primaryItems = navigationItems.filter(item => !isSettingsLocation(item.href));
  const settingsItems = navigationItems.filter(item => isSettingsLocation(item.href));

  /* Sidebar order for the primary rail: a module named by navigationGroups is
     lifted out of the flat list and rendered under its group's header. The
     header lands where the group's *last* member sits, so folding a module in
     from further up the list never shuffles the rows in between — the route
     map and the rail keep the order they already had. */
  const groupByModule = new Map();
  navigationGroups.forEach(group => group.items.forEach(key => groupByModule.set(key, group)));

  const groupLastIndex = new Map();
  primaryItems.forEach((item, index) => {
    const group = groupByModule.get(item.key);
    if (group) groupLastIndex.set(group.key, index);
  });

  const primaryLayout = [];
  primaryItems.forEach((item, index) => {
    const group = groupByModule.get(item.key);
    if (item.permission && !user?.permissions?.includes(item.permission)) return;
    if (!group) {
      primaryLayout.push({ type: 'item', item });
      return;
    }
    if (groupLastIndex.get(group.key) !== index) return;
    primaryLayout.push({
      type: 'group',
      group,
      items: navigationItems.filter(candidate => group.items.includes(candidate.key))
    });
  });

  /* Which group headers are open. Unset means open: a first-time reader sees
     every module, and only an explicit collapse hides one (it is remembered). */
  const GROUPS_KEY = 'apartmentpro.sidebar-groups-open';
  let openGroups = readGroupState();

  function readGroupState() {
    try {
      return JSON.parse(localStorage.getItem(GROUPS_KEY)) || {};
    } catch {
      return {};
    }
  }

  function isGroupOpen(key) {
    return openGroups[key] !== false;
  }

  function toggleGroup(key) {
    openGroups = { ...openGroups, [key]: !isGroupOpen(key) };
    try {
      localStorage.setItem(GROUPS_KEY, JSON.stringify(openGroups));
    } catch { /* private mode */ }
  }

  let currentPath = window.location.hash.slice(1).split('?')[0] || '/';
  $: activeModule = moduleKeyForLocation(currentPath);
  // Landing inside a collapsed group opens it, so the active row is never
  // hidden behind a header the user collapsed earlier.
  $: openGroupFor(activeModule);

  function openGroupFor(moduleKey) {
    const group = moduleKey ? groupByModule.get(moduleKey) : null;
    if (group && openGroups[group.key] === false) toggleGroup(group.key);
  }

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
    {#each primaryLayout as entry (entry.type === 'group' ? `group:${entry.group.key}` : `item:${entry.item.key}`)}
      {#if entry.type === 'group'}
        {@const groupLabel = $locale.dashboard.sidebarGroups[entry.group.key] || entry.group.key}
        {@const groupOpen = openGroups[entry.group.key] !== false}
        <div class="sidebar-group" class:is-open={groupOpen}>
          <button
            type="button"
            class="sidebar-group-toggle"
            aria-expanded={groupOpen}
            aria-controls={`sidebar-group-${entry.group.key}`}
            on:click={() => toggleGroup(entry.group.key)}
          >
            <span>{groupLabel}</span>
            <i class="bi bi-chevron-down" aria-hidden="true"></i>
          </button>
          <div class="sidebar-group-items" id={`sidebar-group-${entry.group.key}`} role="group" aria-label={groupLabel}>
            {#each entry.items as item (item.key)}
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
        </div>
      {:else}
        {@const item = entry.item}
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
      {/if}
    {/each}

  </nav>

  <div class="app-sidebar-foot">
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
</aside>

<style>
  .app-sidebar {
    --sidebar-width: var(--sidebar-width-expanded);
    --sidebar-width-collapsed: 4.25rem;
    --sidebar-text-strong: var(--text-strong);
    --sidebar-border: var(--border);
    --sidebar-hover-text: var(--accent-text);
    --sidebar-active-text: var(--accent-text);
    --sidebar-accent: var(--accent-text);
    --sidebar-gutter: 1rem;
    --sidebar-item-radius: 0.7rem;
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
    min-height: 72px;
    justify-content: center;
    padding: 1rem;
    gap: 0.65rem;
  }
  .app-sidebar-mark {
    width: 24px; height: 28px; flex-basis: 24px;
    border-radius: 0;
    background: transparent; color: var(--accent);
    box-shadow: none; font-size: 20px;
  }
  .app-sidebar-name {
    font-size: 1rem; font-weight: var(--weight-heavy); letter-spacing: var(--tracking-tight);
    color: var(--sidebar-text-strong);
  }
  .app-sidebar-nav {
    padding-block: 4px 8px;
    gap: 2px;
    scrollbar-width: none;
  }
  .app-sidebar-nav::-webkit-scrollbar { display: none; width: 0; height: 0; }

  /* Collapsible module group: a quiet section header over its own rows. */
  .sidebar-group { display: flex; flex-direction: column; }
  .sidebar-group-toggle {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    width: 100%;
    min-height: 1.9rem;
    margin: 0;
    padding: 0.35rem 0.9rem;
    border: 0;
    background: transparent;
    color: var(--sidebar-text-muted);
    font-family: var(--font-ui);
    font-size: 0.68rem;
    font-weight: var(--weight-heavy);
    letter-spacing: var(--tracking-wide);
    text-align: start;
    cursor: pointer;
    transition: color 160ms ease, background-color 160ms ease;
  }
  .sidebar-group-toggle:hover { color: var(--sidebar-hover-text); background: var(--sidebar-hover-bg); }
  .sidebar-group-toggle > i {
    font-size: 0.7rem;
    transform: rotate(-90deg);
    transition: transform 160ms ease;
  }
  .sidebar-group.is-open .sidebar-group-toggle > i { transform: rotate(0deg); }
  :global([dir='rtl']) .sidebar-group-toggle > i { transform: rotate(90deg); }
  :global([dir='rtl']) .sidebar-group.is-open .sidebar-group-toggle > i { transform: rotate(0deg); }
  .sidebar-group-items { display: none; flex-direction: column; gap: 2px; }
  .sidebar-group.is-open .sidebar-group-items { display: flex; }
  /* The collapsed rail has no room for a header, so the group reads flat. */
  .app-sidebar.sidebar-collapsed .sidebar-group-toggle { display: none; }
  .app-sidebar.sidebar-collapsed .sidebar-group .sidebar-group-items { display: flex; }
  .app-nav-item {
    flex-shrink: 0;
    min-height: var(--sidebar-item-height);
    margin: 0;
    padding: 0.42rem 0.9rem;
    gap: 0.85rem;
    font-family: var(--font-ui);
    font-size: 0.75rem; line-height: 1.5; font-weight: var(--weight-heavy);
    transition: background-color 160ms ease, color 160ms ease, transform 160ms ease;
  }
  .app-nav-item > i {
    width: 1.75rem; height: 1.75rem; flex: 0 0 1.75rem;
    font-size: 0.9rem; line-height: 1;
  }
  .app-nav-item > span { white-space: normal; overflow: visible; }
  .app-nav-item:hover {
    transform: translateX(1px);
    background: var(--sidebar-hover-bg);
    color: var(--sidebar-hover-text);
  }
  :global([dir='rtl']) .app-nav-item:hover { transform: translateX(-1px); }
  .app-nav-item:hover > i { color: var(--sidebar-hover-text); }
  .app-nav-item.is-active {
    font-weight: var(--weight-heavy);
    background: var(--sidebar-active-bg);
    color: var(--sidebar-active-text);
    box-shadow: none;
  }
  .app-nav-item.is-active:hover { background: var(--sidebar-active-bg); color: var(--sidebar-active-text); }
  .app-nav-item.is-active > i,
  .app-nav-item.is-active:hover > i { color: var(--sidebar-active-text); }
  .app-sidebar-foot { flex-shrink: 0; padding: 0.65rem 1rem 1rem; margin: 0; border: 0; border-block-start: 1px solid var(--sidebar-border); }
  .sidebar-collapse, .sidebar-close {
    width: 24px; height: 24px;
    border: 1px solid var(--sidebar-border);
    border-radius: 0.45rem;
    color: var(--sidebar-icon);
    background: var(--white);
    box-shadow: 0 2px 6px rgb(38 35 35 / 9%);
  }
  .sidebar-collapse { top: 28px; inset-inline-end: -12px; }
  .sidebar-collapse i { font-size: 11px; }
  .sidebar-collapse:hover, .sidebar-close:hover { color: var(--accent-text); }
  .app-sidebar.sidebar-collapsed .app-sidebar-brand { padding: 1rem 8px; }
  .app-sidebar.sidebar-collapsed .app-sidebar-nav { padding-inline: 8px; }
  .app-sidebar.sidebar-collapsed .app-nav-item { padding-inline: 8px; }
  .app-sidebar.sidebar-collapsed .app-sidebar-foot { padding-inline: 8px; }
  @media (min-width: 992px) {
    .app-sidebar-foot {
      display: grid;
      align-items: center;
      height: calc(var(--index-footer-height) + var(--page-content-pad-block) + 1px);
      padding-block: var(--space-2) calc(var(--space-2) + var(--page-content-pad-block) + 1px);
    }
  }

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
    .app-sidebar.sidebar-collapsed .app-sidebar-brand { justify-content: center; padding-inline: 1rem; }
    .app-sidebar.sidebar-collapsed .app-sidebar-name,
    .app-sidebar.sidebar-collapsed .app-nav-item > span { display: block; }
    .app-sidebar.sidebar-collapsed .app-sidebar-nav { padding-inline: 1rem; }
    .app-sidebar.sidebar-collapsed .app-nav-item { justify-content: flex-start; padding-inline: 0.9rem; gap: 0.85rem; }
    .app-sidebar.sidebar-collapsed .app-sidebar-foot { padding-inline: 1rem; }
    .sidebar-collapse { display: none; }
    .sidebar-close { top: 8px; inset-inline-end: 8px; width: 44px; height: 44px; }
  }
  @media (max-width: 991.98px), (pointer: coarse) {
    .app-nav-item { min-height: 44px; }
    }
  @media (prefers-reduced-motion: reduce) {
    .app-sidebar, .app-nav-item, .sidebar-collapse, .sidebar-close { transition: none; }
    .app-nav-item:hover,
    :global([dir='rtl']) .app-nav-item:hover { transform: none; }
  }
</style>
