<script>
  import Router from 'svelte-spa-router';
  import Journals from '../../src/pages/Journals.svelte';
  import Topbar from '../../src/components/layout/Topbar.svelte';
  import { setLanguage } from '../../src/i18n';
  import { user } from '../../src/stores/auth';
  user.set({ id: 'user', username: 'Tester', organizationId: 'org', permissions: [] });
  window.setTestLanguage = setLanguage;
  window.requests = [];
  window.writes = [];
  const journals = [
    { id: 'journal-1', journalNumber: 'JRN-000001', transactionDate: '2026-10-11', currency: 'AFN', exchangeRate: 1, referenceType: 'INVOICE', referenceId: 'invoice-1', description: 'Rent invoice', status: 'POSTED', voidReason: null, isManual: false, debitTotal: 100, creditTotal: 100, lines: [
      { id: 'line-1', accountId: 'receivable', account: { id: 'receivable', name: 'Accounts receivable' }, tenantId: 'tenant', tenant: { id: 'tenant', firstName: 'Sample tenant' }, description: null, debit: 100, credit: 0 },
      { id: 'line-2', accountId: 'income', account: { id: 'income', name: 'Rent income' }, tenantId: null, tenant: null, description: null, debit: 0, credit: 100 },
    ] },
    { id: 'journal-2', journalNumber: 'JRN-000002', transactionDate: '2026-10-12', currency: 'AFN', exchangeRate: 1, referenceType: 'MANUAL', referenceId: 'JRN-000002', description: 'Adjustment', status: 'POSTED', voidReason: null, isManual: true, debitTotal: 20, creditTotal: 20, lines: [
      { id: 'line-3', accountId: 'receivable', account: { id: 'receivable', name: 'Accounts receivable' }, tenantId: 'tenant', tenant: { id: 'tenant', firstName: 'Sample tenant' }, description: null, debit: 0, credit: 20 },
      { id: 'line-4', accountId: 'income', account: { id: 'income', name: 'Rent income' }, tenantId: null, tenant: null, description: null, debit: 20, credit: 0 },
    ] },
  ];
  window.fetch = async (input, options = {}) => {
    const url = new URL(input, location.origin); const method = options.method || 'GET';
    window.requests.push(url.pathname + url.search);
    if (method !== 'GET') window.writes.push(`${method} ${url.pathname}`);
    let result;
    if (url.pathname === '/api/journals') {
      /* The status filter is answered by the data, so a filtered read is visible
         in the list as well as in the request. */
      const status = url.searchParams.get('status');
      const items = journals.filter(entry => !status || entry.status === status);
      result = { items, pagination: { page: 1, pageSize: 10, total: items.length, totalPages: items.length ? 1 : 0 } };
    }
    else if (url.pathname.endsWith('/void')) result = { journal: null };
    else if (url.pathname.startsWith('/api/journals/')) result = { journal: journals.find(entry => entry.id === url.pathname.split('/').pop()) };
    else if (url.pathname === '/api/accounts') result = { items: [{ id: 'receivable', name: 'Accounts receivable', systemKey: 'ACCOUNTS_RECEIVABLE' }, { id: 'income', name: 'Rent income', systemKey: null }] };
    else if (url.pathname === '/api/tenant-accounts') result = { items: [{ id: 'account', tenant: { id: 'tenant', firstName: 'Sample tenant', leases: [] } }], pagination: { page: 1, pageSize: 100, total: 1, totalPages: 1 } };
    else throw new Error('Unexpected request: ' + url.pathname);
    return new Response(JSON.stringify({ success: true, ...result }), { headers: { 'Content-Type': 'application/json' } });
  };
  setLanguage('en'); window.location.hash = '#/journals';
  const routes = { '/journals': Journals };
</script>
<div class="test-shell"><Topbar /><div class="app-page"><Router {routes} /></div></div>
<style>.test-shell { display: flex; flex-direction: column; height: 100dvh; min-width: 0; } .app-page { overflow: auto; }</style>
