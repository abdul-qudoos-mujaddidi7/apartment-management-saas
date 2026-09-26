<script>
  import { onMount } from 'svelte';
  import Router, { replace } from 'svelte-spa-router';
  import { user, authReady, loadSession, resetAuth } from '../stores/auth';
  import { loadCurrencies, resetCurrencies } from '../stores/currency';
  import { locale } from '../i18n';
  import AppShell from '../components/layout/AppShell.svelte';
  import Dashboard from '../pages/Dashboard.svelte';
  import Buildings from '../pages/Buildings.svelte';
  import Floors from '../pages/Floors.svelte';
  import BuildingDetails from '../pages/BuildingDetails.svelte';
  import Apartments from '../pages/Apartments.svelte';
  import ApartmentAssets from '../pages/ApartmentAssets.svelte';
  import Assets from '../pages/Assets.svelte';
  import Tenants from '../pages/Tenants.svelte';
  import TenantProfile from '../pages/TenantProfile.svelte';
  import Leases from '../pages/Leases.svelte';
  import LeaseContract from '../pages/LeaseContract.svelte';
  import LeaseContractSettings from '../pages/LeaseContractSettings.svelte';
  import SecurityDeposits from '../pages/SecurityDeposits.svelte';
  import Meters from '../pages/Meters.svelte';
  import MeterReadings from '../pages/MeterReadings.svelte';
  import Invoices from '../pages/Invoices.svelte';
  import Payments from '../pages/Payments.svelte';
  import Accounts from '../pages/Accounts.svelte';
  import Journals from '../pages/Journals.svelte';
  import TenantAccounts from '../pages/TenantAccounts.svelte';
  import Currencies from '../pages/Currencies.svelte';
  import NotFound from '../pages/NotFound.svelte';

  // Both routers observe the same hash. This router matches full application
  // paths and passes its own params prop; it does not use shared router.params.
  const routes = {
    '/dashboard': Dashboard,
    '/buildings': Buildings,
    '/buildings/:id': BuildingDetails,
    '/apartments': Apartments,
    '/apartments/:apartmentId/assets': ApartmentAssets,
    '/assets': Assets,
    '/floors': Floors,
    '/floors/:id': Apartments,
    '/tenants': Tenants,
    '/tenants/:id': TenantProfile,
    '/leases': Leases,
    '/leases/:leaseId/contract': LeaseContract,
    '/security-deposits': SecurityDeposits,
    '/meters': Meters,
    '/meter-readings': MeterReadings,
    '/invoices': Invoices,
    '/payments': Payments,
    '/accounts': Accounts,
    '/journals': Journals,
    '/tenant-accounts': TenantAccounts,
    '/settings/currencies': Currencies,
    '/settings/lease-contract': LeaseContractSettings,
    '*': NotFound,
  };

  let mounted = false;
  let sessionError = '';

  async function checkSession() {
    sessionError = '';
    try {
      await loadSession();
      // The currency catalogue belongs to the session's organization, so it is
      // fetched once the session is known and shared by every money page.
      await loadCurrencies();
    } catch (error) {
      if (mounted) sessionError = error.message;
    }
  }

  function handleSessionExpired() {
    resetAuth();
    resetCurrencies();
    void replace('/login');
  }

  onMount(() => {
    mounted = true;
    window.addEventListener('apartmentpro:session-expired', handleSessionExpired);
    void checkSession();
    return () => {
      mounted = false;
      window.removeEventListener('apartmentpro:session-expired', handleSessionExpired);
    };
  });

  $: if (mounted && $authReady && !$user) void replace('/login');
</script>

{#if sessionError}
  <main class="session-loader">
    <div class="session-error">
      <div class="alert alert-danger" role="alert">{sessionError}</div>
      <button class="btn btn-primary" type="button" on:click={checkSession}>
        {$locale.common.retry}
      </button>
    </div>
  </main>
{:else if !$authReady || !$user}
  <main class="session-loader" aria-live="polite" aria-busy="true">
    <div class="spinner-border text-primary" role="status">
      <span class="visually-hidden">{$locale.common.checkingSession}</span>
    </div>
  </main>
{:else}
  <AppShell>
    <Router {routes} />
  </AppShell>
{/if}
