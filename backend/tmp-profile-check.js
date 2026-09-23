require('dotenv').config({ quiet: true });

const BASE = 'http://localhost:3001/api';
let cookie = '';

async function call(method, path, body) {
  const response = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const setCookie = response.headers.getSetCookie?.() || [];
  if (setCookie.length) cookie = setCookie.map((c) => c.split(';')[0]).join('; ');
  return { status: response.status, data: await response.json().catch(() => ({})) };
}

(async () => {
  await call('POST', '/auth/login', { email: 'admin@example.com', password: 'Admin@123456' });
  const listed = await call('GET', '/tenants?page=1&pageSize=1');
  let tenantId = listed.data.items?.[0]?.id;
  let created = false;

  if (!tenantId) {
    const tenant = await call('POST', '/tenants', { firstName: 'Profile', lastName: 'Probe', phone: '0700000000' });
    tenantId = tenant.data?.tenant?.id;
    created = true;
  }

  const profile = await call('GET', `/tenants/${tenantId}/profile`);
  console.log('status:', profile.status);
  if (profile.status === 200) {
    console.log('keys:', Object.keys(profile.data).join(', '));
    console.log('tenant:', profile.data.tenant.firstName, profile.data.tenant.lastName, '|', profile.data.tenant.phone);
    console.log('currentLease:', profile.data.currentLease ? `${profile.data.currentLease.contractNumber} (${profile.data.currentLease.status})` : 'none');
    console.log('summary:', JSON.stringify(profile.data.summary));
    console.log('baseCurrency:', profile.data.baseCurrency, '| thisMonth:', JSON.stringify(profile.data.thisMonth));
    console.log('counts:', JSON.stringify({ leases: profile.data.leases.length, invoices: profile.data.invoices.length, payments: profile.data.payments.length, ledger: profile.data.ledger.length, deposits: profile.data.deposits.length, meters: profile.data.meters.length }));
  } else {
    console.log(JSON.stringify(profile.data));
  }

  if (created) {
    await call('DELETE', `/tenants/${tenantId}`);
    console.log('(probe tenant removed)');
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
