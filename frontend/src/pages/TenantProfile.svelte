<script>
  /**
   * One tenant's file: who they are, where they live, what they owe, what is
   * held for them, and whether their meters have been read this month.
   *
   * Everything on this page is read from the module that owns it — the
   * receivable comes from the tenant's account, the deposit from the deposit
   * sub-ledger, the readings from the readings themselves — so no figure here
   * can disagree with the page it came from.
   */
  import PageHeader from '../components/ui/PageHeader.svelte';
  import StatusBadge from '../components/ui/StatusBadge.svelte';
  import { push } from 'svelte-spa-router';

  import { getTenantProfile } from '../services/tenants';
  import { locale } from '../i18n';
  import { formatDate, formatMoney, formatNumber, formatShortDate } from '../utils/formatters';

  export let params = {};

  let tenantId = null;
  let profile = null;
  let loading = false;
  let errorMessage = '';

  $: if (params.id && params.id !== tenantId) {
    tenantId = params.id;
    profile = null;
    errorMessage = '';
    void load();
  }

  async function load() {
    const requestedId = tenantId;
    loading = true;
    try {
      const response = await getTenantProfile(requestedId);
      if (requestedId !== tenantId) return;
      profile = response;
    } catch (error) {
      if (requestedId !== tenantId) return;
      errorMessage = error.message;
    } finally {
      loading = false;
    }
  }

  const TONES = {
    ACTIVE: 'success', PAID: 'success', POSTED: 'success', SETTLED: 'success',
    HELD: 'info', RESERVED: 'info', PARTIAL: 'warning', PARTIALLY_PAID: 'warning',
    PARTIALLY_USED: 'warning', UNPAID: 'warning', MAINTENANCE: 'warning',
    NOT_PAID: 'danger', OVERDUE: 'danger',
  };
  const toneFor = (status) => TONES[status] || 'neutral';

  /** A label from a status map, falling back to the raw value rather than a blank. */
  function statusLabel(group, status) {
    if (!status) return '—';
    return $locale.tenantProfile[group]?.[status] || status;
  }

  const name = (tenant) => (tenant ? `${tenant.firstName} ${tenant.lastName}` : '');
</script>

<PageHeader>
  <svelte:fragment slot="actions">
    <button class="back-button" type="button" on:click={() => push('/tenants')}>
      <i class="bi bi-arrow-left" aria-hidden="true"></i>
      {$locale.tenantProfile.back}
    </button>
  </svelte:fragment>
</PageHeader>

{#if errorMessage}
  <div class="alert alert-danger" role="alert">{errorMessage}</div>
{/if}

{#if loading && !profile}
  <p class="profile-loading">{$locale.tenantProfile.loading}</p>
{/if}

{#if profile}
  <section class="profile-head card" aria-label={$locale.tenantProfile.identity}>
    <div class="profile-head-main">
      <span class="profile-avatar" aria-hidden="true"><i class="bi bi-person-badge"></i></span>
      <div>
        <h2 class="profile-name">{name(profile.tenant)}</h2>
        <p class="profile-meta">
          <span>{profile.tenant.phone}</span>
          {#if profile.tenant.email}<span>· {profile.tenant.email}</span>{/if}
          <span>· {$locale.tenantProfile.tenantSince} {formatShortDate(profile.tenant.createdAt)}</span>
        </p>
      </div>
    </div>
    <StatusBadge label={statusLabel('statuses', profile.tenant.status)} tone={toneFor(profile.tenant.status)} />
  </section>

  <section class="profile-grid" aria-label={$locale.tenantProfile.moneyTitle}>
    {#each [
      ['outstanding', profile.summary.outstandingBase, true],
      ['billed', profile.summary.billedBase, false],
      ['collected', profile.summary.collectedBase, false],
      ['depositHeld', profile.summary.depositHeldBase, false],
      ['openInvoices', profile.summary.openInvoices, false],
    ] as [key, value, emphasis]}
      <article class="stat-card" class:is-emphasis={emphasis}>
        <span>{$locale.tenantProfile[key]}</span>
        <strong>
          {#if key === 'openInvoices'}
            {value}
          {:else}
            {formatMoney(value, profile.baseCurrency)}
          {/if}
        </strong>
      </article>
    {/each}
  </section>

  <div class="profile-columns">
    <section class="card" aria-labelledby="profile-contact">
      <h3 id="profile-contact">{$locale.tenantProfile.identity}</h3>
      <dl class="facts">
        <div><dt>{$locale.tenantProfile.fullName}</dt><dd>{name(profile.tenant)}</dd></div>
        <div><dt>{$locale.tenantProfile.phone}</dt><dd>{profile.tenant.phone}</dd></div>
        <div><dt>{$locale.tenantProfile.alternatePhone}</dt><dd>{profile.tenant.alternatePhone || '—'}</dd></div>
        <div><dt>{$locale.tenantProfile.email}</dt><dd>{profile.tenant.email || '—'}</dd></div>
        <div><dt>{$locale.tenantProfile.nationalId}</dt><dd>{profile.tenant.nationalId || '—'}</dd></div>
        <div><dt>{$locale.tenantProfile.address}</dt><dd>{profile.tenant.address || '—'}</dd></div>
        <div><dt>{$locale.tenantProfile.emergencyContact}</dt><dd>{profile.tenant.emergencyContactName || '—'}</dd></div>
        <div><dt>{$locale.tenantProfile.emergencyPhone}</dt><dd>{profile.tenant.emergencyContactPhone || '—'}</dd></div>
      </dl>
      {#if profile.tenant.notes}
        <p class="notes"><strong>{$locale.tenantProfile.notes}</strong> {profile.tenant.notes}</p>
      {/if}
    </section>

    <section class="card" aria-labelledby="profile-tenancy">
      <h3 id="profile-tenancy">{$locale.tenantProfile.currentTenancy}</h3>
      {#if profile.currentLease}
        <dl class="facts">
          <div><dt>{$locale.tenantProfile.building}</dt><dd>{profile.currentLease.apartment.floor.building.name}</dd></div>
          <div><dt>{$locale.tenantProfile.floor}</dt><dd>{profile.currentLease.apartment.floor.name || profile.currentLease.apartment.floor.floorNumber}</dd></div>
          <div><dt>{$locale.tenantProfile.apartment}</dt><dd>{profile.currentLease.apartment.apartmentNumber}{profile.currentLease.apartment.name ? ` — ${profile.currentLease.apartment.name}` : ''}</dd></div>
          <div><dt>{$locale.tenantProfile.contractNumber}</dt><dd>{profile.currentLease.contractNumber}</dd></div>
          <div>
            <dt>{$locale.tenantProfile.leaseStatus}</dt>
            <dd><StatusBadge label={statusLabel('leaseStatuses', profile.currentLease.status)} tone={toneFor(profile.currentLease.status)} /></dd>
          </div>
          <div><dt>{$locale.tenantProfile.period}</dt><dd>{formatShortDate(profile.currentLease.startDate)} → {formatShortDate(profile.currentLease.endDate)}</dd></div>
          <div><dt>{$locale.tenantProfile.monthlyRent}</dt><dd>{formatMoney(profile.currentLease.monthlyRent, profile.currentLease.currency)}</dd></div>
          <div><dt>{$locale.tenantProfile.requiredDeposit}</dt><dd>{formatMoney(profile.currentLease.securityDeposit, profile.currentLease.currency)}</dd></div>
          <div><dt>{$locale.tenantProfile.paymentDueDay}</dt><dd>{profile.currentLease.paymentDueDay}</dd></div>
        </dl>
      {:else}
        <p class="empty">{$locale.tenantProfile.noLease}</p>
      {/if}
    </section>
  </div>

  <section class="card" aria-labelledby="profile-meters">
    <h3 id="profile-meters">
      {$locale.tenantProfile.metersTitle}
      <span class="month-chip">{profile.thisMonth.label}</span>
    </h3>
    {#if profile.meters.length === 0}
      <p class="empty">{$locale.tenantProfile.metersEmpty}</p>
    {:else}
      <div class="table-responsive">
        <table class="table align-middle mb-0">
          <thead>
            <tr>
              <th>{$locale.tenantProfile.meter}</th>
              <th>{$locale.tenantProfile.unit}</th>
              <th>{$locale.tenantProfile.lastReading}</th>
              <th>{$locale.tenantProfile.consumption}</th>
              <th>{$locale.tenantProfile.amount}</th>
              <th>{$locale.tenantProfile.thisMonth}</th>
            </tr>
          </thead>
          <tbody>
            {#each profile.meters as meter (meter.id)}
              <tr>
                <td>{meter.meterNumber} · {statusLabel('utilities', meter.utilityType)}</td>
                <td>{meter.unit}</td>
                <td>
                  {#if meter.lastReading}
                    {formatNumber(meter.lastReading.currentReading, 3)} <small>{formatShortDate(meter.lastReading.readingDate)}</small>
                  {:else}
                    —
                  {/if}
                </td>
                <td>{meter.lastReading ? formatNumber(meter.lastReading.consumption, 3) : '—'}</td>
                <td>{meter.lastReading ? formatMoney(meter.lastReading.amount, profile.baseCurrency) : '—'}</td>
                <td>
                  {#if meter.readThisMonth}
                    <StatusBadge label={meter.lastReading.monthLabel} tone="success" />
                  {:else}
                    <StatusBadge label={$locale.tenantProfile.notReadThisMonth} tone="warning" />
                  {/if}
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {/if}
  </section>

  <section class="card" aria-labelledby="profile-deposits">
    <h3 id="profile-deposits">{$locale.tenantProfile.depositsTitle}</h3>
    {#if profile.deposits.length === 0}
      <p class="empty">{$locale.tenantProfile.depositsEmpty}</p>
    {:else}
      {#each profile.deposits as deposit (deposit.leaseId)}
        <article class="deposit-card">
          <header>
            <strong>{deposit.contractNumber}</strong>
            <span>{deposit.apartmentNumber}{deposit.apartmentName ? ` — ${deposit.apartmentName}` : ''}</span>
            <StatusBadge label={statusLabel('depositStatuses', deposit.summary.status)} tone={toneFor(deposit.summary.status)} />
          </header>
          <div class="deposit-figures">
            {#each [['required', deposit.summary.requiredDeposit], ['received', deposit.summary.received], ['deductions', deposit.summary.deductions], ['refunded', deposit.summary.refunded], ['balance', deposit.summary.balance]] as [key, value]}
              <div><span>{$locale.tenantProfile[key]}</span><strong>{formatMoney(value, profile.baseCurrency)}</strong></div>
            {/each}
          </div>
        </article>
      {/each}
    {/if}
  </section>

  <section class="card" aria-labelledby="profile-invoices">
    <h3 id="profile-invoices">{$locale.tenantProfile.invoicesTitle}</h3>
    {#if profile.invoices.length === 0}
      <p class="empty">{$locale.tenantProfile.invoicesEmpty}</p>
    {:else}
      <div class="table-responsive">
        <table class="table align-middle mb-0">
          <thead>
            <tr>
              <th>{$locale.tenantProfile.number}</th>
              <th>{$locale.tenantProfile.date}</th>
              <th>{$locale.tenantProfile.dueDate}</th>
              <th>{$locale.tenantProfile.total}</th>
              <th>{$locale.tenantProfile.paid}</th>
              <th>{$locale.tenantProfile.balance}</th>
              <th>{$locale.tenantProfile.status}</th>
            </tr>
          </thead>
          <tbody>
            {#each profile.invoices as invoice (invoice.id)}
              <tr>
                <td>{invoice.invoiceNumber}</td>
                <td>{formatShortDate(invoice.invoiceDate)}</td>
                <td>{formatShortDate(invoice.dueDate)}</td>
                <td>{formatMoney(invoice.total, invoice.currency)}</td>
                <td>{formatMoney(invoice.paidAmount, invoice.currency)}</td>
                <td>{formatMoney(invoice.balance, invoice.currency)}</td>
                <td><StatusBadge label={statusLabel('invoiceStatuses', invoice.status)} tone={toneFor(invoice.status)} /></td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {/if}
  </section>

  <section class="card" aria-labelledby="profile-payments">
    <h3 id="profile-payments">{$locale.tenantProfile.paymentsTitle}</h3>
    {#if profile.payments.length === 0}
      <p class="empty">{$locale.tenantProfile.paymentsEmpty}</p>
    {:else}
      <div class="table-responsive">
        <table class="table align-middle mb-0">
          <thead>
            <tr>
              <th>{$locale.tenantProfile.number}</th>
              <th>{$locale.tenantProfile.date}</th>
              <th>{$locale.tenantProfile.amount}</th>
              <th>{$locale.tenantProfile.method}</th>
              <th>{$locale.tenantProfile.account}</th>
              <th>{$locale.tenantProfile.status}</th>
            </tr>
          </thead>
          <tbody>
            {#each profile.payments as payment (payment.id)}
              <tr>
                <td>{payment.paymentNumber}</td>
                <td>{formatShortDate(payment.paymentDate)}</td>
                <td>
                  {formatMoney(payment.amount, payment.currency)}
                  {#if payment.currency !== profile.baseCurrency}
                    <small class="cell-sub">{formatMoney(payment.baseAmount, profile.baseCurrency)}</small>
                  {/if}
                </td>
                <td>{statusLabel('methods', payment.paymentMethod)}</td>
                <td>{payment.receiveAccount ? `${payment.receiveAccount.code} — ${payment.receiveAccount.name}` : '—'}</td>
                <td><StatusBadge label={statusLabel('paymentStatuses', payment.status)} tone={toneFor(payment.status)} /></td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {/if}
  </section>

  <section class="card" aria-labelledby="profile-ledger">
    <h3 id="profile-ledger">{$locale.tenantProfile.ledgerTitle}</h3>
    {#if profile.ledger.length === 0}
      <p class="empty">{$locale.tenantProfile.ledgerEmpty}</p>
    {:else}
      <div class="table-responsive">
        <table class="table align-middle mb-0">
          <thead>
            <tr>
              <th>{$locale.tenantProfile.date}</th>
              <th>{$locale.tenantProfile.entryType}</th>
              <th>{$locale.tenantProfile.description}</th>
              <th>{$locale.tenantProfile.debit}</th>
              <th>{$locale.tenantProfile.credit}</th>
              <th>{$locale.tenantProfile.balanceAfter}</th>
            </tr>
          </thead>
          <tbody>
            {#each profile.ledger as entry (entry.id)}
              <tr>
                <td>{formatDate(entry.transactionDate)}</td>
                <td>{statusLabel('ledgerTypes', entry.type)}</td>
                <td>{entry.description || '—'}</td>
                <td>{entry.debit ? formatMoney(entry.debit, profile.baseCurrency) : '—'}</td>
                <td>{entry.credit ? formatMoney(entry.credit, profile.baseCurrency) : '—'}</td>
                <td>{formatMoney(entry.balanceAfter, profile.baseCurrency)}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {/if}
  </section>
{/if}

<style>
  .back-button {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0;
    border: 0;
    color: var(--accent);
    background: none;
    font-size: 0.8rem;
    font-weight: 650;
  }
  .back-button:hover { color: var(--accent-hover); }
  :global([dir='rtl']) .back-button i { transform: rotate(180deg); }

  .profile-loading { padding: 2rem; color: var(--bs-secondary-color, #6c757d); }

  .profile-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    padding: 1.25rem 1.5rem;
    margin-bottom: 1rem;
  }
  .profile-head-main { display: flex; align-items: center; gap: 1rem; }
  .profile-avatar {
    display: grid;
    place-items: center;
    width: 3rem;
    height: 3rem;
    border-radius: 50%;
    background: rgba(13, 110, 253, 0.12);
    color: #0d6efd;
    font-size: 1.4rem;
  }
  .profile-name { margin: 0; font-size: 1.25rem; font-weight: 700; }
  .profile-meta { margin: 0.15rem 0 0; color: var(--bs-secondary-color, #6c757d); font-size: 0.9rem; }
  .profile-meta span { margin-inline-end: 0.35rem; }

  .profile-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(9rem, 1fr));
    gap: 0.75rem;
    margin-bottom: 1rem;
  }
  .stat-card {
    padding: 0.85rem 1rem;
    border: 1px solid var(--bs-border-color, #dee2e6);
    border-radius: 0.75rem;
    background: #fff;
  }
  .stat-card span { display: block; font-size: 0.78rem; text-transform: uppercase; letter-spacing: 0.03em; color: var(--bs-secondary-color, #6c757d); }
  .stat-card strong { font-size: 1.1rem; }
  .stat-card.is-emphasis { border-color: rgba(13, 110, 253, 0.4); background: rgba(13, 110, 253, 0.05); }

  .profile-columns { display: grid; grid-template-columns: repeat(auto-fit, minmax(20rem, 1fr)); gap: 1rem; }
  .card { padding: 1.1rem 1.25rem; margin-bottom: 1rem; }
  h3 { display: flex; align-items: center; gap: 0.5rem; margin: 0 0 0.85rem; font-size: 1rem; font-weight: 700; }
  .month-chip {
    padding: 0.1rem 0.5rem;
    border-radius: 999px;
    background: rgba(13, 110, 253, 0.1);
    color: #0d6efd;
    font-size: 0.75rem;
    font-weight: 600;
  }

  .facts { display: grid; grid-template-columns: repeat(auto-fit, minmax(11rem, 1fr)); gap: 0.65rem 1.25rem; margin: 0; }
  .facts div { min-width: 0; }
  .facts dt { font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.03em; color: var(--bs-secondary-color, #6c757d); font-weight: 600; }
  .facts dd { margin: 0.1rem 0 0; font-size: 0.95rem; overflow-wrap: anywhere; }
  .notes { margin: 0.85rem 0 0; font-size: 0.9rem; }
  .empty { margin: 0; color: var(--bs-secondary-color, #6c757d); }
  .cell-sub { display: block; color: var(--bs-secondary-color, #6c757d); font-size: 0.78rem; }

  .deposit-card { border: 1px solid var(--bs-border-color, #dee2e6); border-radius: 0.65rem; padding: 0.85rem 1rem; }
  .deposit-card + .deposit-card { margin-top: 0.75rem; }
  .deposit-card header { display: flex; align-items: center; gap: 0.6rem; margin-bottom: 0.6rem; flex-wrap: wrap; }
  .deposit-figures { display: grid; grid-template-columns: repeat(auto-fit, minmax(8rem, 1fr)); gap: 0.5rem 1rem; }
  .deposit-figures span { display: block; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.03em; color: var(--bs-secondary-color, #6c757d); }
</style>
