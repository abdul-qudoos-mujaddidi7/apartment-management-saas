<script>
  import AccountProfile from '../../src/pages/AccountProfile.svelte';
  import { setLanguage } from '../../src/i18n';
  import { currencies } from '../../src/stores/currency';

  let params = { id: 'deposit-account' };
  window.showCashAccount = () => { params = { id: 'cash-account' }; };
  window.setTestLanguage = setLanguage;
  window.requests = [];
  let received = 0;
  const lease = { id: 'lease-1', contractNumber: 'LEASE-001', currency: 'AFN', status: 'ACTIVE',
    tenant: { id: 'tenant-1', firstName: 'Deposit tenant' },
    apartment: { apartmentNumber: '101', floor: { name: 'First', building: { name: 'Test building' } } } };
  const summary = () => ({ requiredDeposit: 500, received, deductions: 0, refunded: 0, balance: received, remainingToCollect: 500 - received, status: received ? 'PARTIAL' : 'NOT_PAID' });
  window.fetch = async (input, options = {}) => {
    const url = new URL(input, window.location.origin);
    window.requests.push(url.pathname + url.search);
    let result;
    if (url.pathname === '/api/accounts/deposit-account' || url.pathname === '/api/accounts/cash-account') {
      result = { account: { id: params.id, name: 'Security Deposit Liability', systemKey: params.id === 'deposit-account' ? 'SECURITY_DEPOSIT_LIABILITY' : 'CASH', type: 'LIABILITY', isActive: true, balance: received, debit: 0, credit: received, baseCurrency: 'AFN' } };
    } else if (url.pathname.endsWith('/summary')) result = { byYear: [], bySource: [] };
    else if (url.pathname.endsWith('/ledger')) result = { items: [], pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 } };
    else if (url.pathname === '/api/security-deposits') result = { items: url.searchParams.get('search') === 'missing' ? [] : [{ lease, summary: summary() }], pagination: { page: Number(url.searchParams.get('page')), pageSize: 10, total: 11, totalPages: 2 } };
    else if (url.pathname === '/api/security-deposits/lease-1/transactions') { received += JSON.parse(options.body).amount; result = {}; }
    else if (url.pathname === '/api/security-deposits/lease-1') result = { lease, summary: summary(), transactions: [] };
    else if (url.pathname === '/api/financial-accounts') result = { accounts: [] };
    else throw new Error('Unexpected request: ' + url.pathname);
    return new Response(JSON.stringify({ success: true, ...result }), { headers: { 'Content-Type': 'application/json' } });
  };
  currencies.set([{ id: 'afn', code: 'AFN', name: 'Afghani', isActive: true }]);
  setLanguage('en');
  window.location.hash = '#/accounts/deposit-account';
</script>

<div class="test-shell">
  <div class="app-page"><AccountProfile {params} /></div>
</div>

<style>
  .test-shell { display: flex; flex-direction: column; height: 100dvh; overflow: hidden; }
</style>
