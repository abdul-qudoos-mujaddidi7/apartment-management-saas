/**
 * Single source of truth for the module navigation.
 *
 * The sidebar renders these items and the topbar reads the same list to name
 * the current module, so a route cannot be labelled one thing in the menu and
 * another in the chrome.
 */
export const navigationItems = [
  { key: 'dashboard', icon: 'bi-grid-1x2', href: '/dashboard' },
  { key: 'buildings', icon: 'bi-buildings', href: '/buildings' },
  { key: 'tenants', icon: 'bi-people', href: '/tenants' },
  { key: 'securityDeposits', icon: 'bi-shield-check', href: '/security-deposits' },
  { key: 'meters', icon: 'bi-speedometer2', href: '/meters' },
  { key: 'invoices', icon: 'bi-receipt', href: '/invoices' },
  { key: 'accounts', icon: 'bi-bank', href: '/accounts' },
  { key: 'journals', icon: 'bi-journal-text', href: '/journals' },
  // Settings is one module with its own pages, the way a workspace setting is
  // one place rather than four sidebar rows: the rail carries the entry and the
  // module itself lists Profile, Currencies and the contract settings.
  { key: 'settings', icon: 'bi-gear', href: '/settings' }
];

/**
 * The pages inside the Settings module, in the order its own menu shows them.
 *
 * The rail names the module and this list names the pages within it, so a page
 * cannot be reachable from the sidebar but missing from the module's menu (or
 * labelled differently in each). `key` matches a `dashboard.nav` label and
 * `segment` the URL the page is served at — the two differ wherever the label
 * is two words (`leaseContract` is `/settings/lease-contract`), so they are
 * stated side by side rather than derived from each other.
 */
const settingsPage = (key, segment, icon) => ({ key, segment, icon, href: `/settings/${segment}` });

export const settingsPages = [
  settingsPage('profile', 'profile', 'bi-person-vcard'),
  settingsPage('currencies', 'currencies', 'bi-cash-coin'),
  settingsPage('leaseContract', 'lease-contract', 'bi-file-earmark-ruled')
];

/** True for the Settings module itself and every page inside it. */
export function isSettingsLocation(location) {
  return location === '/settings' || location.startsWith('/settings/');
}

/**
 * Sidebar sections that cluster related modules under one header the reader
 * can collapse. A module may appear in at most one group; anything not named
 * here stays a plain top-level row. The group is emitted at the position of
 * its *last* member in `navigationItems`, so adding a module from further up
 * the list folds it into the group without shuffling the rows in between.
 *
 * `key` matches a `dashboard.sidebarGroups` label in the i18n files.
 */
export const navigationGroups = [
  { key: 'finance', items: ['securityDeposits', 'invoices', 'accounts', 'journals'] }
];

/**
 * Locations that render a module without being one of its item routes — a
 * apartment lists and a floor's apartments belong to the Buildings module.
 */
const moduleAliases = [
  { path: '/guarantors', key: 'tenants' },
  { prefix: '/guarantors/', key: 'tenants' },
  { path: '/payments', key: 'invoices' },
  { prefix: '/payments/', key: 'invoices' },
  { path: '/meter-readings', key: 'meters' },
  { prefix: '/meter-readings/', key: 'meters' },
  { path: '/floors', key: 'buildings' },
  { path: '/apartments', key: 'buildings' },
  { prefix: '/floors/', key: 'buildings' },
  // Assets are a tab in Buildings, including each apartment's asset sheet.
  { path: '/assets', key: 'buildings' },
  { prefix: '/apartments/', key: 'buildings' },
  // Tenant accounts live under the Accounts module.
  { path: '/tenant-accounts', key: 'accounts' },
  { prefix: '/tenant-accounts/', key: 'accounts' },
  // Leases are a tab in the Tenants module rather than a sidebar row, so the
  // chrome keeps naming Tenants while the lease list, a lease's details or a
  // printed contract is open.
  { path: '/leases', key: 'tenants' },
  { prefix: '/leases/', key: 'tenants' }
];

/**
 * Resolve a router location such as `/buildings/7` to the navigation key that
 * owns it. Returns null for locations with no module (e.g. the 404 page).
 */
export function moduleKeyForLocation(location) {
  if (!location) return null;

  const match = navigationItems
    .filter(item => location === item.href || location.startsWith(`${item.href}/`))
    .sort((a, b) => b.href.length - a.href.length)[0];
  if (match) return match.key;

  const alias = moduleAliases.find(entry =>
    entry.path ? location === entry.path : location.startsWith(entry.prefix)
  );
  return alias ? alias.key : null;
}
