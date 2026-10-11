/**
 * The tab strip on an account's file.
 *
 * There are two account pages and they are not the same ledger: `/accounts/:id`
 * is a general-ledger account with its overview, ledger and statement,
 * while `/tenant-accounts/:id` is one tenant's receivable sub-ledger,
 * whose journals are the documents that moved that tenant's balance. Sharing one
 * tab list forced the shorter of the two onto the longer page, so each page now
 * names its own and `accountTabsFor` picks the right one from the route.
 */

/** Tabs for a general-ledger account (`/accounts/:id`). */
export const accountTabs = ['overview', 'financial-report', 'statement', 'journals'];

/** Tabs for a tenant's sub-ledger account (`/tenant-accounts/:id`). */
export const tenantAccountTabs = ['overview', 'financial-report', 'statement', 'journals'];

export const accountTabIcons = {
  overview: 'bi-info-circle',
  ledger: 'bi-journal-text',
  statement: 'bi-file-earmark-spreadsheet',
  journals: 'bi-journal-bookmark',
  'financial-report': 'bi-graph-up',
};

/** The tabs a path belongs to — the tenant profile is the only exception. */
export function accountTabsFor(path = '') {
  return /^\/tenant-accounts\/[^/]+$/.test(path) ? tenantAccountTabs : accountTabs;
}

export function accountTabFromSearch(search, tabs = accountTabs) {
  const tab = new URLSearchParams(search).get('tab');
  if (tab === 'ledger' && tabs.includes('financial-report')) return 'financial-report';
  return tabs.includes(tab) ? tab : 'overview';
}
