<script>
  import Invoices from '../../src/pages/Invoices.svelte';
  import LeaseNotifications from '../../src/components/LeaseNotifications.svelte';
  import { setLanguage } from '../../src/i18n';
  import { user } from '../../src/stores/auth';
  import { currencies } from '../../src/stores/currency';
  const apartment = { id: 'a1', apartmentNumber: '101', floor: { name: 'First', building: { id: 'b1', name: 'Test' } } };
  const lease = { id: 'l1', apartment, tenant: { firstName: 'Tenant' }, status: 'ACTIVE', currency: 'AFN', monthlyRent: 100, serviceFee: 0, contractNumber: 'L1' };
  const meter = { id: 'm1', apartmentId: 'a1', apartment, meterNumber: 'M1', utilityType: 'ELECTRICITY', unit: 'kWh', initialReading: 100, defaultUnitPrice: 2, installationDate: '2026-01-01' };
  const oldReading = { id: 'old', leaseId: lease.id, meter, readingDate: '2026-02-01', previousReading: 100, currentReading: 120, consumption: 20, unitPrice: 2, amount: 40, currency: 'AFN' };
  const invoice = { id: 'i1', lease, invoiceNumber: 'INV1', invoiceDate: '2026-03-01', total: 40, paidAmount: 0, currency: 'AFN', status: 'UNPAID', items: [{ type: 'ELECTRICITY', meterReadingId: 'old', description: 'Existing billed reading', quantity: 20, unitPrice: 2, amount: 40 }] };
  window.quickRequests = [];
  const originalFetch = window.fetch;
  window.fetch = async (input, options = {}) => {
    const url = new URL(String(input), location.href);
    if (!url.pathname.startsWith('/api/')) return originalFetch(input, options);
    window.quickRequests.push({ path: url.pathname, query: url.search, method: options.method || 'GET', body: options.body ? JSON.parse(options.body) : null });
    let result = {};
    if (url.pathname === '/api/invoices') result = { items: [invoice], pagination: { page: 1, pageSize: 10, total: 1, totalPages: 1 } };
    else if (url.pathname === '/api/invoices/notifications') result = { items: [{ ...invoice, notificationId: 'rent-invoice:i1', billingPeriodStart: '2026-02-01' }] };
    else if (url.pathname === '/api/leases/expiring-soon') result = { items: [] };
    else if (url.pathname === '/api/invoices/i1') result = { invoice: window.rentOnlyEdit ? { ...invoice, items: [{ type: 'RENT', description: 'Rent', quantity: 1, unitPrice: 100, amount: 100 }] } : invoice };
    else if (url.pathname === '/api/leases') result = { items: [lease] };
    else if (url.pathname === '/api/buildings') result = { items: [apartment.floor.building] };
    else if (url.pathname === '/api/meters') result = { items: [meter], pagination: { totalPages: 1 } };
    else if (url.pathname === '/api/meter-readings') {
      if (options.method === 'POST') {
        const body = JSON.parse(options.body);
        result = { meterReading: { ...body, id: 'new', meter, consumption: Number(body.currentReading) - 120, amount: (Number(body.currentReading) - 120) * Number(body.unitPrice) } };
      } else result = { items: url.searchParams.has('dateTo') ? [oldReading] : window.sameDateReadings ? [
        { ...oldReading, id: 'waterToday', readingDate: new Date().toISOString().slice(0, 10), meter: { ...meter, utilityType: 'WATER', unit: 'm3' } },
        { ...oldReading, id: 'gasToday', readingDate: new Date().toISOString().slice(0, 10), meter: { ...meter, utilityType: 'GAS', unit: 'm3' } },
        { ...oldReading, id: 'earlier', meter: { ...meter, utilityType: 'ELECTRICITY' } },
        { ...oldReading, id: 'earlier2', readingDate: '2026-03-01', meter: { ...meter, utilityType: 'ELECTRICITY' } },
        { ...oldReading, id: 'paidReading', billingStatus: 'PAID' },
        { ...oldReading, id: 'alreadyInInvoice', billingStatus: 'UNPAID', invoiceItem: { invoice: { id: 'anotherInvoice' } } },
        { ...oldReading, id: 'baseline', readingKind: 'MOVE_IN', readingDate: new Date().toISOString().slice(0, 10) },
        { ...oldReading, id: 'otherLease', leaseId: 'l2', readingDate: new Date().toISOString().slice(0, 10) },
      ] : [] };
    }
    return new Response(JSON.stringify({ success: true, ...result }), { headers: { 'Content-Type': 'application/json' } });
  };
  user.set({ permissions: ['INVOICE_VIEW', 'INVOICE_MANAGE', 'UTILITY_VIEW', 'UTILITY_MANAGE'] });
  currencies.set([{ code: 'AFN', isActive: true }]);
  setLanguage('en');
</script>
<LeaseNotifications />
<Invoices />
