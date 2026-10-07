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
  { key: 'leases', icon: 'bi-file-earmark-text', href: '/leases' },
  { key: 'securityDeposits', icon: 'bi-shield-check', href: '/security-deposits' },
  { key: 'meters', icon: 'bi-speedometer2', href: '/meters' },
  { key: 'invoices', icon: 'bi-receipt', href: '/invoices' },
  { key: 'accounts', icon: 'bi-bank', href: '/accounts' },
  { key: 'journals', icon: 'bi-journal-text', href: '/journals' },
  { key: 'currencies', icon: 'bi-cash-coin', href: '/settings/currencies' },
  { key: 'leaseContract', icon: 'bi-file-earmark-ruled', href: '/settings/lease-contract' }
];

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
  // A printed contract belongs to the lease it was raised on, so the chrome
  // keeps naming the Leases module while the document is open.
  { prefix: '/leases/', key: 'leases' }
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
