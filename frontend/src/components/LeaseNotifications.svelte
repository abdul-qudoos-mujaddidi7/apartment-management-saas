<script>
  import { onMount } from 'svelte';
  import { api } from '../services/api';
  import { user } from '../stores/auth';
  import { language, locale } from '../i18n';
  import notificationsCopy from '../i18n/notifications';
  import { formatDate } from '../utils/formatters';
  let items = [];
  let rentInvoices = [];
  let disposed = false;
  let refreshVersion = 0;
  let open = false;
  let container;
  let error = '';
  $: leaseAllowed = $user?.permissions?.includes('LEASE_VIEW');
  $: invoiceAllowed = $user?.permissions?.includes('INVOICE_VIEW');
  $: allowed = leaseAllowed || invoiceAllowed;
  $: copy = notificationsCopy[$language] || notificationsCopy.en;
  $: notificationCount = items.length + rentInvoices.length;
  async function refresh() {
    const version = ++refreshVersion;
    if (!allowed) { items = []; rentInvoices = []; return; }
    const responses = await Promise.allSettled([
      leaseAllowed ? api.get('/leases/expiring-soon') : Promise.resolve({ items: [] }),
      invoiceAllowed ? api.get('/invoices/notifications') : Promise.resolve({ items: [] }),
    ]);
    if (disposed || version !== refreshVersion) return;
    items = responses[0].status === 'fulfilled' ? responses[0].value.items || [] : [];
    rentInvoices = responses[1].status === 'fulfilled' ? responses[1].value.items || [] : [];
    error = responses.filter(response => response.status === 'rejected' && response.reason.status !== 403).map(response => response.reason.message).join(' ');
  }
  function outside(event) { if (open && !container?.contains(event.target)) open = false; }
  function keydown(event) { if (open && event.key === 'Escape') { event.preventDefault(); open = false; } }
  onMount(() => {
    refresh();
    const timer = setInterval(refresh, 60000);
    window.addEventListener('focus', refresh);
    window.addEventListener('apartmentpro:leases-changed', refresh);
    window.addEventListener('apartmentpro:invoices-changed', refresh);
    return () => { disposed = true; refreshVersion++; clearInterval(timer); window.removeEventListener('focus', refresh); window.removeEventListener('apartmentpro:leases-changed', refresh); window.removeEventListener('apartmentpro:invoices-changed', refresh); };
  });
</script>
<svelte:window on:pointerdown={outside} on:keydown={keydown} />
{#if allowed}
  <div class="lease-notifications" bind:this={container}>
    <button
      type="button"
      class="notification-bell"
      aria-label={$locale.workflow.notifications}
      aria-expanded={open}
      on:click={() => { open = !open; if (open) refresh(); }}
    >
      <i class="bi bi-bell" aria-hidden="true"></i>
      {#if notificationCount}
        <span class="notification-count">{notificationCount > 99 ? '99+' : notificationCount}</span>
      {/if}
    </button>
    {#if open}
      <section class="notification-panel" aria-label={$locale.workflow.notifications}>
        <header class="notification-header"><strong>{$locale.workflow.notifications}</strong>{#if notificationCount}<span>{notificationCount}</span>{/if}</header>
        <div class="notification-list">
        {#if error}<p role="alert">{error}</p>{/if}
        {#if !notificationCount && !error}<p class="notification-empty">{copy.emptyNotifications}</p>{/if}
        {#if rentInvoices.length}
          {#each rentInvoices as invoice (invoice.notificationId)}
            <a class="notification-item" href={`#/invoices?detail=${encodeURIComponent(invoice.id)}`} on:click={() => { open = false; window.dispatchEvent(new CustomEvent('apartmentpro:open-invoice', { detail: invoice.id })); }}>
              <span class="notification-content">
                <span class="notification-title"><strong>{invoice.lease.tenant.firstName}</strong><span class="notification-reference" dir="ltr">{invoice.invoiceNumber}</span></span>
                <span class="notification-description">{copy.invoiceCreated} · {invoice.lease.apartment.apartmentNumber}</span>
                <span class="notification-date">{formatDate(invoice.invoiceDate)}</span>
              </span>
            </a>
          {/each}
        {/if}
        {#if items.length}
        {#each items as lease (lease.notificationId)}
          <a class="notification-item" href={`#/leases?detail=${encodeURIComponent(lease.id)}`} on:click={() => { open = false; window.dispatchEvent(new CustomEvent('apartmentpro:open-lease', { detail: lease.id })); }}>
            <span class="notification-content">
              <span class="notification-title"><strong>{lease.tenant.firstName}</strong><span class="notification-reference">{lease.apartment.apartmentNumber}</span></span>
              <span class="notification-description">{lease.daysLeft} {$locale.workflow.daysRemaining}</span>
              <span class="notification-date">{formatDate(lease.endDate)}</span>
            </span>
          </a>
        {/each}
        {/if}
        </div>
      </section>
    {/if}
  </div>
{/if}
<style>
  .lease-notifications { position: relative; }
  /* The same 36px square as the theme and language controls beside it, so the
     trailing cluster is one rhythm; the count rides the top-right corner as a
     pip rather than sitting inline as text. */
  .notification-bell {
    position: relative;
    display: inline-grid;
    place-items: center;
    width: var(--topbar-control);
    height: var(--topbar-control);
    padding: 0;
    border: 0;
    border-radius: var(--radius-pill);
    color: var(--topbar-icon);
    background: transparent;
    font-size: 1.15rem;
    cursor: pointer;
    transition: color var(--transition), background-color var(--transition);
  }
  .notification-bell:hover { color: var(--topbar-icon-hover); background: var(--topbar-control-hover); }
  .notification-bell:focus-visible { outline: 0; box-shadow: var(--ring); }
  .notification-count {
    position: absolute;
    top: -2px;
    inset-inline-end: -2px;
    min-width: 1.1rem;
    padding-inline: 0.22rem;
    border-radius: var(--radius-pill);
    background: var(--topbar-badge-bg);
    color: var(--topbar-badge-text);
    font-family: var(--font-data);
    font-size: 0.68rem;
    font-weight: var(--weight-bold);
    line-height: 1.1rem;
    text-align: center;
    /* The pip sits half outside the square, over the bar's own surface. */
    box-shadow: 0 0 0 2px var(--canvas);
  }
  .notification-panel { position: absolute; inset-inline-end: 0; inset-block-start: calc(100% + var(--space-2)); z-index: 1040; width: min(230px, calc(100vw - 2 * var(--space-3))); overflow: hidden; border: 1px solid var(--border); border-radius: var(--radius-lg); background: var(--surface); color: var(--text-strong); box-shadow: var(--shadow-lg); text-align: start; }
  .notification-header { display: flex; align-items: center; justify-content: space-between; padding: var(--space-4) var(--space-5); border-block-end: 1px solid var(--border); }
  .notification-header strong { font-size: var(--text-sm); font-weight: var(--weight-semibold); line-height: 1.5; }
  .notification-header > span { color: var(--text-secondary); font-size: var(--text-xs); }
  .notification-list { max-height: min(360px, 65vh); overflow-y: auto; padding-block: var(--space-2); }
  .notification-item { display: flex; align-items: center; min-height: 44px; padding: var(--space-2) var(--space-5); color: var(--text-strong); font-size: var(--text-sm); line-height: 1.5; text-decoration: none; cursor: pointer; transition: background var(--transition); }
  .notification-item + .notification-item { border-block-start: 1px solid var(--border); }
  .notification-item:hover { background: var(--surface-hover); }
  .notification-item:focus-visible { outline: 2px solid var(--accent-text); outline-offset: -3px; background: var(--surface-hover); }
  .notification-content { display: grid; gap: 3px; flex: 1; min-width: 0; }
  .notification-title { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; }
  .notification-title strong { font-size: var(--text-sm); font-weight: var(--weight-semibold); overflow-wrap: anywhere; }
  .notification-reference { flex-shrink: 0; font-size: var(--text-xs); color: var(--text-secondary); }
  .notification-description { font-size: var(--text-xs); color: var(--text-strong); line-height: 1.5; }
  .notification-date { font-size: var(--text-xs); color: var(--text-secondary); }
  .notification-empty { margin: 0; padding: var(--space-4) var(--space-5); color: var(--text-secondary); font-size: var(--text-sm); line-height: 1.5; }
</style>
