<script>
  import Router from 'svelte-spa-router';
  import TenantAccounts from '../../src/pages/TenantAccounts.svelte';
  import TenantAccountProfile from '../../src/pages/TenantAccountProfile.svelte';
  import Topbar from '../../src/components/layout/Topbar.svelte';
  import { setLanguage } from '../../src/i18n';
  import { user } from '../../src/stores/auth';
  user.set({ id: 'user', username: 'Tester', organizationId: 'org', permissions: [] });
  window.setTestLanguage = setLanguage;
  window.requests = [];
  const account = { id: 'account', tenantId: 'tenant', balance: 80, debit: 100, credit: 20, entries: 2, baseCurrency: 'AFN', tenant: { id: 'tenant', firstName: 'Sample tenant', phone: '0700000000', status: 'ACTIVE', address: 'Kabul', nationalId: '12345', leases: [{ id: 'lease', contractNumber: 'LEASE-001', apartment: { apartmentNumber: '101', floor: { name: 'First', floorNumber: 1, building: { name: 'Test building' } } } }] }, recentEntries: [{ id: 'payment', referenceType: 'PAYMENT', debit: 0, credit: 20, transactionDate: '2026-10-11', description: 'Payment' }] };
  /* Two entries, one from a document and one written by hand, so the row actions
     of both kinds can be exercised. */
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
  window.fetch = async input => {
    const url = new URL(input,location.origin); window.requests.push(url.pathname + url.search);
    let result;
    if (url.pathname === '/api/tenant-accounts') result = { items: [account], pagination: { page: 1, pageSize: 10, total: 1, totalPages: 1 } };
    else if (url.pathname === '/api/tenant-accounts/tenant') result = { account };
    else if (url.pathname.endsWith('/ledger')) result = { items: [{ id: 'payment', transactionDate: '2026-10-11', referenceType: 'PAYMENT', referenceNumber: 'PAY-001', description: 'Rent payment', debit: 0, credit: 20, balanceAfter: 80 }], totals: { debit: 0, credit: 20, openingBalance: 100, closingBalance: 80 }, pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 } };
    else if (url.pathname === '/api/accounts') result = { items: [{ id: 'receivable', name: 'Accounts receivable', systemKey: 'ACCOUNTS_RECEIVABLE' }, { id: 'income', name: 'Rent income', systemKey: null }] };
    else if (url.pathname === '/api/journals') {
      /* Voided entries only answer the status filter, so the filter's effect is
         visible in the request as well as in the list. */
      const items = url.searchParams.get('status') === 'VOIDED' ? [] : journals;
      result = { items, pagination: { page: 1, pageSize: 10, total: items.length, totalPages: items.length ? 1 : 0 } };
    }
    else throw new Error('Unexpected request: ' + url.pathname);
    return new Response(JSON.stringify({ success: true, ...result }),{ headers: { 'Content-Type': 'application/json' } });
  };
  setLanguage('en'); window.location.hash = '#/tenant-accounts';
  const routes = { '/tenant-accounts': TenantAccounts, '/tenant-accounts/:id': TenantAccountProfile };
</script>
<div class="test-shell"><Topbar /><div class="app-page"><Router {routes} /></div></div>
<style>.test-shell { display: flex; flex-direction: column; height: 100dvh; min-width: 0; } .app-page { overflow: auto; }</style>
