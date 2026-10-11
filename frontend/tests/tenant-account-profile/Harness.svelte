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
  window.fetch = async input => {
    const url = new URL(input,location.origin); window.requests.push(url.pathname + url.search);
    let result;
    if (url.pathname === '/api/tenant-accounts') result = { items: [account], pagination: { page: 1, pageSize: 10, total: 1, totalPages: 1 } };
    else if (url.pathname === '/api/tenant-accounts/tenant') result = { account };
    else if (url.pathname.endsWith('/ledger')) result = { items: [{ id: 'payment', transactionDate: '2026-10-11', referenceType: 'PAYMENT', referenceNumber: 'PAY-001', description: 'Rent payment', debit: 0, credit: 20, balanceAfter: 80 }], totals: { debit: 0, credit: 20, openingBalance: 100, closingBalance: 80 }, pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 } };
    else throw new Error('Unexpected request: ' + url.pathname);
    return new Response(JSON.stringify({ success: true, ...result }),{ headers: { 'Content-Type': 'application/json' } });
  };
  setLanguage('en'); window.location.hash = '#/tenant-accounts';
  const routes = { '/tenant-accounts': TenantAccounts, '/tenant-accounts/:id': TenantAccountProfile };
</script>
<div class="test-shell"><Topbar /><div class="app-page"><Router {routes} /></div></div>
<style>.test-shell { display: flex; flex-direction: column; height: 100dvh; min-width: 0; } .app-page { overflow: auto; }</style>
