const routes = [
  { matches: (path) => path === '/dashboard', title: ['dashboard', 'nav', 'dashboard'], icon: 'bi-grid-1x2-fill' },
  { matches: (path) => /^\/buildings\/[^/]+$/.test(path), title: ['buildings', 'details'], icon: 'bi-building' },
  { matches: (path) => path === '/buildings', title: ['buildings', 'title'], icon: 'bi-buildings' },
  { matches: (path) => /^\/apartments\/[^/]+\/assets$/.test(path), title: ['assets', 'apartmentTitle'], icon: 'bi-box-seam' },
  { matches: (path) => path === '/assets', title: ['assets', 'title'], icon: 'bi-box-seam' },
  { matches: (path) => path === '/apartments' || /^\/floors\/[^/]+$/.test(path), title: ['apartments', 'title'], icon: 'bi-door-open' },
  { matches: (path) => path === '/tenants', title: ['tenants', 'title'], icon: 'bi-people' },
  { matches: (path) => path === '/leases', title: ['leases', 'title'], icon: 'bi-file-earmark-text' },
  { matches: (path) => path === '/security-deposits', title: ['securityDeposits', 'title'], icon: 'bi-shield-check' },
  { matches: (path) => path === '/meters', title: ['meters', 'title'], icon: 'bi-speedometer2' },
  { matches: (path) => path === '/meter-readings', title: ['meterReadings', 'title'], icon: 'bi-clipboard-data' },
  { matches: (path) => path === '/invoices', title: ['invoices', 'title'], icon: 'bi-receipt' },
  { matches: (path) => path === '/payments', title: ['payments', 'title'], icon: 'bi-credit-card-2-front' },
  { matches: (path) => path === '/accounts', title: ['accounts', 'title'], icon: 'bi-bank' },
  { matches: (path) => path === '/tenant-accounts', title: ['accounts', 'title'], icon: 'bi-bank' },
];

function read(dictionary, path) {
  return path.reduce((value, key) => value?.[key], dictionary);
}

export function getRouteMetadata(path, dictionary) {
  const route = routes.find((item) => item.matches(path));

  if (!route) {
    return {
      title: dictionary?.common?.notFound || '',
      icon: 'bi-exclamation-circle',
    };
  }

  return {
    title: read(dictionary, route.title) || '',
    icon: route.icon,
  };
}
