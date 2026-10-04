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
    <button type="button" class="btn btn-light" aria-label={$locale.workflow.notifications} aria-expanded={open} on:click={() => { open = !open; if (open) refresh(); }}>
      <i class="bi bi-bell" aria-hidden="true"></i> {items.length || ''}
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
  .notification-panel { position: absolute; inset-inline-end: 0; top: 100%; z-index: 1040; padding: 1rem; width: min(24rem, 85vw); max-height: 70vh; overflow: auto; }
  a { display: grid; gap: .25rem; padding: .75rem 0; border-bottom: 1px solid var(--card-border); color: var(--text-strong); text-decoration: none; }
  span { font-size: .875rem; }
</style>
