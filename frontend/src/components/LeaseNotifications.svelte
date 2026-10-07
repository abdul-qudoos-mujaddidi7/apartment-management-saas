<script>
  import { onMount } from 'svelte';
  import { api } from '../services/api';
  import { user } from '../stores/auth';
  import { locale } from '../i18n';
  import { formatDate } from '../utils/formatters';
  let items = [];
  let open = false;
  let container;
  let error = '';
  $: allowed = $user?.permissions?.includes('LEASE_VIEW');
  async function refresh() {
    if (!allowed) { items = []; return; }
    try { items = (await api.get('/leases/expiring-soon')).items || []; error = ''; }
    catch (e) { items = []; error = e.status === 403 ? '' : e.message; }
  }
  function outside(event) { if (open && !container?.contains(event.target)) open = false; }
  function keydown(event) { if (open && event.key === 'Escape') { event.preventDefault(); open = false; } }
  onMount(() => {
    refresh();
    const timer = setInterval(refresh, 60000);
    window.addEventListener('focus', refresh);
    window.addEventListener('apartmentpro:leases-changed', refresh);
    return () => { clearInterval(timer); window.removeEventListener('focus', refresh); window.removeEventListener('apartmentpro:leases-changed', refresh); };
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
      {#if items.length}
        <span class="notification-count">{items.length > 99 ? '99+' : items.length}</span>
      {/if}
    </button>
    {#if open}
      <section class="notification-panel card" aria-label={$locale.workflow.expiringSoon}>
        <strong>{$locale.workflow.expiringSoon}</strong>
        {#if error}<p role="alert">{error}</p>{/if}
        {#if !items.length && !error}<p>{$locale.dashboard.noExpiringLeases}</p>{/if}
        {#each items as lease (lease.notificationId)}
          <a href={`#/leases?detail=${encodeURIComponent(lease.id)}`} on:click={() => { open = false; window.dispatchEvent(new CustomEvent('apartmentpro:open-lease', { detail: lease.id })); }}>
            <strong>{lease.tenant.firstName} {lease.tenant.lastName}</strong>
            <span>{lease.apartment.apartmentNumber} · {lease.contractNumber}</span>
            <span>{formatDate(lease.endDate)} · {lease.daysLeft} {$locale.workflow.daysRemaining}</span>
          </a>
        {/each}
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
  .notification-panel { position: absolute; inset-inline-end: 0; top: 100%; z-index: 1040; padding: 1rem; width: min(230px, calc(100vw - 2 * var(--space-3))); max-height: 70vh; overflow: auto; }
  :global([data-theme='dark']) .notification-panel { background: var(--surface); }
  a { display: grid; gap: .25rem; padding: .75rem 0; border-bottom: 1px solid var(--card-border); color: var(--text-strong); text-decoration: none; }
  span { font-size: .875rem; }
</style>
