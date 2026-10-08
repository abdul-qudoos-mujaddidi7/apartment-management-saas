<script>
  import Router from 'svelte-spa-router';
  import Meters from '../../src/pages/Meters.svelte';
  import MeterReport from '../../src/pages/MeterReport.svelte';
  import { setLanguage } from '../../src/i18n';
  import { user } from '../../src/stores/auth';
  import { currencies } from '../../src/stores/currency';
  const apartment = { id: 'a1', apartmentNumber: '005', name: 'Suite', floor: { id: 'f1', name: 'First floor', floorNumber: 1, building: { id: 'b1', name: 'Test building' } } };
  const meter = { id: 'm1', apartmentId: 'a1', meterNumber: '005', utilityType: 'ELECTRICITY', meterType: 'RESIDENTIAL',
    unit: 'kWh', defaultUnitPrice: 2.2515, initialReading: 100, installationDate: '2026-01-01', status: 'ACTIVE', notes: 'Meter notes', apartment };
  const row = { id: 'r1', meterId: 'm1', meter, periodStart: '2026-01-01', readingDate: '2026-02-01', readingKind: 'BILLING',
    previousReading: 100, currentReading: 150, consumption: 50, unitPrice: 2.2515, amount: 112.58, paidAmount: 12.58, outstanding: 100,
    billingStatus: 'PARTIALLY_PAID', currency: 'AFN', notes: 'Reading notes',
    lease: { id: 'l1', contractNumber: 'L-005', tenant: { firstName: 'Test Tenant' } },
    invoiceItem: { invoice: { id: 'i1', invoiceNumber: 'INV-005', status: 'PARTIALLY_PAID' } } };
  window.reportRequests = [];
  const originalFetch = window.fetch;
  window.fetch = async (input, options) => {
    const url = new URL(String(input), window.location.href);
    if (!url.pathname.startsWith('/api/')) return originalFetch(input, options);
    window.reportRequests.push(url.pathname + url.search);
    let result;
    if (url.pathname === '/api/meters/m1') result = { meter };
    else if (url.pathname === '/api/meters') result = { items: [meter], pagination: { page: 1, pageSize: 10, total: 1, totalPages: 1 } };
    else if (url.pathname === '/api/buildings') result = { items: [apartment.floor.building] };
    else if (url.pathname === '/api/meter-readings/report') {
      const utilityType = url.searchParams.get('utilityType') || 'ELECTRICITY';
      const nextMeter = { ...meter, utilityType, unit: utilityType === 'ELECTRICITY' ? 'kWh' : 'm³' };
      const items = url.searchParams.get('search') === 'missing' ? [] : [{ ...row, meter: nextMeter }];
      result = { items, pagination: { page: 1, pageSize: 25, total: items.length, totalPages: items.length ? 1 : 0 },
        summary: { readingCount: items.length, meterCount: items.length, consumption: [{ unit: nextMeter.unit, consumption: 50 }],
          currencies: [{ currency: 'AFN', charge: 112.58, paid: 12.58, outstanding: 100, unbilled: 0 }] } };
    } else return new Response(JSON.stringify({ message: 'Missing test fixture: ' + url.pathname }), { status: 404 });
    return new Response(JSON.stringify({ success: true, ...result }), { headers: { 'Content-Type': 'application/json' } });
  };
  setLanguage('en'); window.setTestLanguage = setLanguage;
  user.set({ permissions: ['UTILITY_VIEW', 'UTILITY_MANAGE'] });
  currencies.set([{ code: 'AFN', isActive: true }]);
  window.location.hash = '#/meters';
  const routes = { '/meters': Meters, '/meters/:id/report': MeterReport };
</script>
<Router {routes} />
