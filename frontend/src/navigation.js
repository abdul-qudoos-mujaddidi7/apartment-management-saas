/**
 * Single source of truth for the module navigation.
 *
 * The sidebar renders these items and the topbar reads the same list to name
 * the current module, so a route cannot be labelled one thing in the menu and
 * another in the chrome.
 */
export const navigationItems = [
  { key: 'dashboard', icon: 'bi-grid-1x2-fill', href: '/dashboard' },
  { key: 'buildings', icon: 'bi-buildings', href: '/buildings' },
  { key: 'assets', icon: 'bi-box-seam', href: '/assets' },
  { key: 'tenants', icon: 'bi-people', href: '/tenants' },
  { key: 'leases', icon: 'bi-file-earmark-text', href: '/leases' },
  { key: 'securityDeposits', icon: 'bi-shield-check', href: '/security-deposits' },
  { key: 'meters', icon: 'bi-speedometer2', href: '/meters' },
  { key: 'invoices', icon: 'bi-receipt', href: '/invoices' },
  { key: 'accounts', icon: 'bi-bank', href: '/accounts' },
  { key: 'journals', icon: 'bi-journal-text', href: '/journals' },
  { key: 'currencies', icon: 'bi-cash-coin', href: '/settings/currencies' }
];

/**
 * Locations that render a module without being one of its item routes — a
 * apartment lists and a floor's apartments belong to the Buildings module.
 */
const moduleAliases = [
  { path: '/payments', key: 'invoices' },
  { prefix: '/payments/', key: 'invoices' },
  { path: '/meter-readings', key: 'meters' },
  { prefix: '/meter-readings/', key: 'meters' },
  { path: '/floors', key: 'buildings' },
  { path: '/apartments', key: 'buildings' },
  { prefix: '/floors/', key: 'buildings' },
  // An apartment's asset sheet is part of the Assets & Furniture module.
  { prefix: '/apartments/', key: 'assets' },
  // Tenant accounts live under the Accounts module.
  { path: '/tenant-accounts', key: 'accounts' },
  { prefix: '/tenant-accounts/', key: 'accounts' }
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
