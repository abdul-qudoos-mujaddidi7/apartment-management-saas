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
  import StatusBadge from '../components/ui/StatusBadge.svelte';
  import { push } from 'svelte-spa-router';

  import { getTenantProfile } from '../services/tenants';
  import { locale } from '../i18n';
  import { formatDate, formatMoney, formatNumber, formatShortDate } from '../utils/formatters';
  import { mediaUrl } from '../utils/media';

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
  const initials = (tenant) => tenant
    ? [tenant.firstName, tenant.lastName]
        .filter(Boolean)
        .map((part) => part.trim().charAt(0))
        .join('')
        .slice(0, 2)
        .toUpperCase()
    : '';

  /** The identity card's two sides, in reading order, with their stored paths. */
  $: documents = profile
    ? [
        { key: 'front', url: profile.tenant.idCardFrontUrl },
        { key: 'back', url: profile.tenant.idCardBackUrl },
      ]
    : [];
  $: filedDocuments = documents.filter((side) => side.url);

  // A row can outlive the file it points at — a restore from an older dump, or
  // an uploads folder that moved. The page says so instead of drawing a broken
  // image, and the photograph falls back to the icon in the header.
  let broken = new Set();
  const markBroken = (url) => { broken = new Set(broken).add(url); };
  $: photoAvailable = Boolean(profile?.tenant?.photoUrl) && !broken.has(profile.tenant.photoUrl);
</script>

<svelte:head>
  <title>{profile ? name(profile.tenant) : $locale.tenantProfile.title} | {$locale.common.apartmentPro}</title>
</svelte:head>

<div class="tenant-profile-page">
  <nav class="breadcrumb-row" aria-label="Breadcrumb">
    <button type="button" on:click={() => push('/tenants')}>
      <i class="bi bi-people" aria-hidden="true"></i>
      <span>{$locale.tenants.title}</span>
    </button>
    <i class="bi bi-chevron-right" aria-hidden="true"></i>
    <span aria-current="page">{profile ? name(profile.tenant) : $locale.tenantProfile.title}</span>
  </nav>

  <h1 class="visually-hidden">{$locale.tenantProfile.title}</h1>

  {#if errorMessage}
    <div class="alert alert-danger" role="alert">{errorMessage}</div>
  {/if}

  {#if loading && !profile}
    <div class="page-loader" role="status">
      <div class="spinner-border text-primary" aria-hidden="true"></div>
      <span>{$locale.tenantProfile.loading}</span>
    </div>
  {/if}

  {#if profile}
    <section class="identity-hero" aria-labelledby="tenant-name">
      <div class="portrait-wrap">
        {#if photoAvailable}
          <img
            class="profile-portrait"
            src={mediaUrl(profile.tenant.photoUrl)}
            alt={name(profile.tenant)}
            on:error={() => markBroken(profile.tenant.photoUrl)}
          />
        {:else}
          <span class="profile-portrait portrait-fallback" aria-hidden="true">{initials(profile.tenant)}</span>
        {/if}
        <span class:active={profile.tenant.status === 'ACTIVE'} class="presence-dot" aria-hidden="true"></span>
      </div>

      <div class="identity-copy">
        <p class="profile-kicker">{$locale.tenantProfile.title}</p>
        <div class="name-row">
          <h2 id="tenant-name">{name(profile.tenant)}</h2>
          <StatusBadge label={statusLabel('statuses', profile.tenant.status)} tone={toneFor(profile.tenant.status)} />
        </div>
        <div class="contact-row">
          <a href={`tel:${profile.tenant.phone}`}>
            <i class="bi bi-telephone" aria-hidden="true"></i>
            {profile.tenant.phone}
          </a>
          {#if profile.tenant.email}
            <a href={`mailto:${profile.tenant.email}`}>
              <i class="bi bi-envelope" aria-hidden="true"></i>
              {profile.tenant.email}
            </a>
          {/if}
          <span>
            <i class="bi bi-calendar3" aria-hidden="true"></i>
            {$locale.tenantProfile.tenantSince} {formatShortDate(profile.tenant.createdAt)}
          </span>
        </div>
      </div>

      {#if profile.currentLease}
        <aside class="home-summary" aria-label={$locale.tenantProfile.currentTenancy}>
          <span class="home-icon" aria-hidden="true"><i class="bi bi-buildings"></i></span>
          <div>
            <span class="summary-label">{$locale.tenantProfile.currentTenancy}</span>
            <strong>{profile.currentLease.apartment.floor.building.name}</strong>
            <span>
              {$locale.tenantProfile.floor} {profile.currentLease.apartment.floor.name || profile.currentLease.apartment.floor.floorNumber}
              <span class="summary-divider"></span>
              {$locale.tenantProfile.apartment} {profile.currentLease.apartment.apartmentNumber}
            </span>
          </div>
        </aside>
      {/if}
    </section>

    <section class="account-strip" aria-label={$locale.tenantProfile.moneyTitle}>
      {#each [
        { key: 'outstanding', value: profile.summary.outstandingBase, icon: 'bi-wallet2', emphasis: true },
        { key: 'billed', value: profile.summary.billedBase, icon: 'bi-receipt', emphasis: false },
        { key: 'collected', value: profile.summary.collectedBase, icon: 'bi-check2-circle', emphasis: false },
        { key: 'depositHeld', value: profile.summary.depositHeldBase, icon: 'bi-shield-check', emphasis: false },
        { key: 'openInvoices', value: profile.summary.openInvoices, icon: 'bi-file-earmark-text', emphasis: false },
      ] as metric}
        <article class:is-emphasis={metric.emphasis} class="metric">
          <span class="metric-icon" aria-hidden="true"><i class={`bi ${metric.icon}`}></i></span>
          <div>
            <span class="metric-label">{$locale.tenantProfile[metric.key]}</span>
            <strong>
              {metric.key === 'openInvoices'
                ? metric.value
                : formatMoney(metric.value, profile.baseCurrency)}
            </strong>
          </div>
        </article>
      {/each}
    </section>

    <div class="overview-grid">
      <section class="section-card" aria-labelledby="profile-contact">
        <header class="section-heading">
          <span class="section-icon" aria-hidden="true"><i class="bi bi-person-vcard"></i></span>
          <h3 id="profile-contact">{$locale.tenantProfile.identity}</h3>
        </header>
        <dl class="facts">
          <div><dt>{$locale.tenantProfile.fullName}</dt><dd>{name(profile.tenant)}</dd></div>
          <div><dt>{$locale.tenantProfile.fatherName}</dt><dd>{profile.tenant.fatherName || '—'}</dd></div>
          <div><dt>{$locale.tenantProfile.phone}</dt><dd><a href={`tel:${profile.tenant.phone}`}>{profile.tenant.phone}</a></dd></div>
          <div><dt>{$locale.tenantProfile.alternatePhone}</dt><dd>{profile.tenant.alternatePhone || '—'}</dd></div>
          <div><dt>{$locale.tenantProfile.email}</dt><dd>{#if profile.tenant.email}<a href={`mailto:${profile.tenant.email}`}>{profile.tenant.email}</a>{:else}—{/if}</dd></div>
          <div><dt>{$locale.tenantProfile.nationalId}</dt><dd>{profile.tenant.nationalId || '—'}</dd></div>
          <div class="fact-wide"><dt>{$locale.tenantProfile.address}</dt><dd>{profile.tenant.address || '—'}</dd></div>
          <div><dt>{$locale.tenantProfile.emergencyContact}</dt><dd>{profile.tenant.emergencyContactName || '—'}</dd></div>
          <div><dt>{$locale.tenantProfile.emergencyPhone}</dt><dd>{profile.tenant.emergencyContactPhone || '—'}</dd></div>
        </dl>
        {#if profile.tenant.notes}
          <div class="notes">
            <i class="bi bi-sticky" aria-hidden="true"></i>
            <p><strong>{$locale.tenantProfile.notes}</strong><span>{profile.tenant.notes}</span></p>
          </div>
        {/if}
      </section>

      <section class="section-card" aria-labelledby="profile-tenancy">
        <header class="section-heading">
          <span class="section-icon" aria-hidden="true"><i class="bi bi-house-door"></i></span>
          <h3 id="profile-tenancy">{$locale.tenantProfile.currentTenancy}</h3>
          {#if profile.currentLease}
            <StatusBadge label={statusLabel('leaseStatuses', profile.currentLease.status)} tone={toneFor(profile.currentLease.status)} />
          {/if}
        </header>
        {#if profile.currentLease}
          <dl class="facts">
            <div><dt>{$locale.tenantProfile.building}</dt><dd>{profile.currentLease.apartment.floor.building.name}</dd></div>
            <div><dt>{$locale.tenantProfile.floor}</dt><dd>{profile.currentLease.apartment.floor.name || profile.currentLease.apartment.floor.floorNumber}</dd></div>
            <div><dt>{$locale.tenantProfile.apartment}</dt><dd>{profile.currentLease.apartment.apartmentNumber}{profile.currentLease.apartment.name ? ` — ${profile.currentLease.apartment.name}` : ''}</dd></div>
            <div><dt>{$locale.tenantProfile.contractNumber}</dt><dd class="data-value">{profile.currentLease.contractNumber}</dd></div>
            <div class="fact-wide"><dt>{$locale.tenantProfile.period}</dt><dd>{formatShortDate(profile.currentLease.startDate)} → {formatShortDate(profile.currentLease.endDate)}</dd></div>
            <div><dt>{$locale.tenantProfile.monthlyRent}</dt><dd class="money-value">{formatMoney(profile.currentLease.monthlyRent, profile.currentLease.currency)}</dd></div>
            <div><dt>{$locale.tenantProfile.requiredDeposit}</dt><dd class="money-value">{formatMoney(profile.currentLease.securityDeposit, profile.currentLease.currency)}</dd></div>
            <div><dt>{$locale.tenantProfile.paymentDueDay}</dt><dd>{profile.currentLease.paymentDueDay}</dd></div>
          </dl>
        {:else}
          <div class="empty-state compact">
            <i class="bi bi-house-dash" aria-hidden="true"></i>
            <p>{$locale.tenantProfile.noLease}</p>
          </div>
        {/if}
      </section>
    </div>

    <section class="section-card" aria-labelledby="profile-documents">
      <header class="section-heading">
        <span class="section-icon" aria-hidden="true"><i class="bi bi-card-image"></i></span>
        <h3 id="profile-documents">{$locale.tenantProfile.documents}</h3>
      </header>
      {#if filedDocuments.length === 0}
        <div class="empty-state compact">
          <i class="bi bi-file-earmark-x" aria-hidden="true"></i>
          <p>{$locale.tenantProfile.documentsEmpty}</p>
        </div>
      {:else}
        <div class="documents">
          {#each filedDocuments as side (side.key)}
            <figure class="document">
              <figcaption>
                {side.key === 'front' ? $locale.tenantProfile.idCardFront : $locale.tenantProfile.idCardBack}
              </figcaption>
              {#if broken.has(side.url)}
                <p class="document-missing">
                  <i class="bi bi-exclamation-triangle" aria-hidden="true"></i>
                  {$locale.tenantProfile.documentMissing}
                </p>
              {:else}
                <a href={mediaUrl(side.url)} target="_blank" rel="noopener" title={$locale.tenantProfile.openDocument}>
                  <img
                    src={mediaUrl(side.url)}
                    alt={side.key === 'front' ? $locale.tenantProfile.idCardFront : $locale.tenantProfile.idCardBack}
                    loading="lazy"
                    on:error={() => markBroken(side.url)}
                  />
                  <span class="document-open" aria-hidden="true"><i class="bi bi-box-arrow-up-right"></i></span>
                </a>
              {/if}
            </figure>
          {/each}
        </div>
      {/if}
    </section>

    <section class="section-card record-card" aria-labelledby="profile-meters">
      <header class="section-heading record-heading">
        <span class="section-icon" aria-hidden="true"><i class="bi bi-speedometer2"></i></span>
        <h3 id="profile-meters">{$locale.tenantProfile.metersTitle}</h3>
        <span class="month-chip">{profile.thisMonth.label}</span>
      </header>
      {#if profile.meters.length === 0}
        <p class="empty record-empty">{$locale.tenantProfile.metersEmpty}</p>
      {:else}
        <div class="table-responsive">
          <table class="table align-middle mb-0">
            <thead><tr><th>{$locale.tenantProfile.meter}</th><th>{$locale.tenantProfile.unit}</th><th>{$locale.tenantProfile.lastReading}</th><th>{$locale.tenantProfile.consumption}</th><th>{$locale.tenantProfile.amount}</th><th>{$locale.tenantProfile.thisMonth}</th></tr></thead>
            <tbody>
              {#each profile.meters as meter (meter.id)}
                <tr>
                  <td class="primary-cell">{meter.meterNumber} <span>· {statusLabel('utilities', meter.utilityType)}</span></td>
                  <td>{meter.unit}</td>
                  <td>{#if meter.lastReading}{formatNumber(meter.lastReading.currentReading, 3)} <small>{formatShortDate(meter.lastReading.readingDate)}</small>{:else}—{/if}</td>
                  <td>{meter.lastReading ? formatNumber(meter.lastReading.consumption, 3) : '—'}</td>
                  <td>{meter.lastReading ? formatMoney(meter.lastReading.amount, profile.baseCurrency) : '—'}</td>
                  <td>{#if meter.readThisMonth}<StatusBadge label={meter.lastReading.monthLabel} tone="success" />{:else}<StatusBadge label={$locale.tenantProfile.notReadThisMonth} tone="warning" />{/if}</td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      {/if}
    </section>

    <section class="section-card" aria-labelledby="profile-deposits">
      <header class="section-heading">
        <span class="section-icon" aria-hidden="true"><i class="bi bi-shield-check"></i></span>
        <h3 id="profile-deposits">{$locale.tenantProfile.depositsTitle}</h3>
      </header>
      {#if profile.deposits.length === 0}
        <p class="empty">{$locale.tenantProfile.depositsEmpty}</p>
      {:else}
        <div class="deposit-list">
          {#each profile.deposits as deposit (deposit.leaseId)}
            <article class="deposit-card">
              <header>
                <div><strong>{deposit.contractNumber}</strong><span>{deposit.apartmentNumber}{deposit.apartmentName ? ` — ${deposit.apartmentName}` : ''}</span></div>
                <StatusBadge label={statusLabel('depositStatuses', deposit.summary.status)} tone={toneFor(deposit.summary.status)} />
              </header>
              <div class="deposit-figures">
                {#each [['required', deposit.summary.requiredDeposit], ['received', deposit.summary.received], ['deductions', deposit.summary.deductions], ['refunded', deposit.summary.refunded], ['balance', deposit.summary.balance]] as [key, value]}
                  <div><span>{$locale.tenantProfile[key]}</span><strong>{formatMoney(value, profile.baseCurrency)}</strong></div>
                {/each}
              </div>
            </article>
          {/each}
        </div>
      {/if}
    </section>

    <section class="section-card record-card" aria-labelledby="profile-invoices">
      <header class="section-heading record-heading"><span class="section-icon" aria-hidden="true"><i class="bi bi-receipt"></i></span><h3 id="profile-invoices">{$locale.tenantProfile.invoicesTitle}</h3></header>
      {#if profile.invoices.length === 0}<p class="empty record-empty">{$locale.tenantProfile.invoicesEmpty}</p>{:else}
        <div class="table-responsive"><table class="table align-middle mb-0"><thead><tr><th>{$locale.tenantProfile.number}</th><th>{$locale.tenantProfile.date}</th><th>{$locale.tenantProfile.dueDate}</th><th>{$locale.tenantProfile.total}</th><th>{$locale.tenantProfile.paid}</th><th>{$locale.tenantProfile.balance}</th><th>{$locale.tenantProfile.status}</th></tr></thead><tbody>
          {#each profile.invoices as invoice (invoice.id)}<tr><td class="primary-cell">{invoice.invoiceNumber}</td><td>{formatShortDate(invoice.invoiceDate)}</td><td>{formatShortDate(invoice.dueDate)}</td><td>{formatMoney(invoice.total, invoice.currency)}</td><td>{formatMoney(invoice.paidAmount, invoice.currency)}</td><td class="money-value">{formatMoney(invoice.balance, invoice.currency)}</td><td><StatusBadge label={statusLabel('invoiceStatuses', invoice.status)} tone={toneFor(invoice.status)} /></td></tr>{/each}
        </tbody></table></div>
      {/if}
    </section>

    <section class="section-card record-card" aria-labelledby="profile-payments">
      <header class="section-heading record-heading"><span class="section-icon" aria-hidden="true"><i class="bi bi-credit-card"></i></span><h3 id="profile-payments">{$locale.tenantProfile.paymentsTitle}</h3></header>
      {#if profile.payments.length === 0}<p class="empty record-empty">{$locale.tenantProfile.paymentsEmpty}</p>{:else}
        <div class="table-responsive"><table class="table align-middle mb-0"><thead><tr><th>{$locale.tenantProfile.number}</th><th>{$locale.tenantProfile.date}</th><th>{$locale.tenantProfile.amount}</th><th>{$locale.tenantProfile.method}</th><th>{$locale.tenantProfile.account}</th><th>{$locale.tenantProfile.status}</th></tr></thead><tbody>
          {#each profile.payments as payment (payment.id)}<tr><td class="primary-cell">{payment.paymentNumber}</td><td>{formatShortDate(payment.paymentDate)}</td><td class="money-value">{formatMoney(payment.amount, payment.currency)}{#if payment.currency !== profile.baseCurrency}<small class="cell-sub">{formatMoney(payment.baseAmount, profile.baseCurrency)}</small>{/if}</td><td>{statusLabel('methods', payment.paymentMethod)}</td><td>{payment.receiveAccount ? `${payment.receiveAccount.code} — ${payment.receiveAccount.name}` : '—'}</td><td><StatusBadge label={statusLabel('paymentStatuses', payment.status)} tone={toneFor(payment.status)} /></td></tr>{/each}
        </tbody></table></div>
      {/if}
    </section>

    <section class="section-card record-card" aria-labelledby="profile-ledger">
      <header class="section-heading record-heading"><span class="section-icon" aria-hidden="true"><i class="bi bi-journal-text"></i></span><h3 id="profile-ledger">{$locale.tenantProfile.ledgerTitle}</h3></header>
      {#if profile.ledger.length === 0}<p class="empty record-empty">{$locale.tenantProfile.ledgerEmpty}</p>{:else}
        <div class="table-responsive"><table class="table align-middle mb-0"><thead><tr><th>{$locale.tenantProfile.date}</th><th>{$locale.tenantProfile.entryType}</th><th>{$locale.tenantProfile.description}</th><th>{$locale.tenantProfile.debit}</th><th>{$locale.tenantProfile.credit}</th><th>{$locale.tenantProfile.balanceAfter}</th></tr></thead><tbody>
          {#each profile.ledger as entry (entry.id)}<tr><td>{formatDate(entry.transactionDate)}</td><td>{statusLabel('ledgerTypes', entry.type)}</td><td>{entry.description || '—'}</td><td>{entry.debit ? formatMoney(entry.debit, profile.baseCurrency) : '—'}</td><td>{entry.credit ? formatMoney(entry.credit, profile.baseCurrency) : '—'}</td><td class="money-value">{formatMoney(entry.balanceAfter, profile.baseCurrency)}</td></tr>{/each}
        </tbody></table></div>
      {/if}
    </section>
  {/if}
</div>

<style>
  .tenant-profile-page { display: flex; flex: 1 1 auto; flex-direction: column; min-width: 0; gap: var(--space-4); padding-block-end: var(--space-4); }
  .breadcrumb-row { display: flex; align-items: center; gap: .55rem; color: var(--text-muted); font-size: var(--text-xs); }
  .breadcrumb-row button { display: inline-flex; align-items: center; gap: .4rem; min-height: 1.5rem; padding: 0; border: 0; color: var(--accent-text); background: none; font: inherit; font-weight: var(--weight-semibold); }
  .breadcrumb-row button:hover { color: var(--accent-hover); }
  .breadcrumb-row button:focus-visible,.contact-row a:focus-visible,.facts a:focus-visible { outline: 0; border-radius: var(--radius-sm); box-shadow: var(--ring); }
  .breadcrumb-row > i { font-size: .58rem; }
  :global([dir='rtl']) .breadcrumb-row > i { transform: rotate(180deg); }

  .page-loader { display: grid; place-items: center; align-content: center; gap: var(--space-3); min-height: 24rem; color: var(--text-muted); font-size: var(--text-sm); }

  .identity-hero { display: grid; grid-template-columns: auto minmax(18rem, 1fr) minmax(19rem, auto); align-items: center; gap: var(--space-5); padding: var(--space-5); border: 1px solid #dbe9f7; border-radius: var(--radius-lg); background: radial-gradient(120% 170% at 8% 0%, rgba(30,108,165,.14), rgba(30,108,165,0) 54%), linear-gradient(155deg,#fcfdff 0%,#f2f7fc 57%,#e9f2fa 100%); box-shadow: var(--shadow-sm), inset 0 1px 0 rgba(255,255,255,.8); }
  .portrait-wrap { position: relative; width: 7rem; height: 7rem; }
  .profile-portrait { display: grid; place-items: center; width: 100%; height: 100%; border: 4px solid rgba(255,255,255,.92); border-radius: 1.35rem; object-fit: cover; background: var(--surface); box-shadow: 0 8px 24px rgba(31,65,96,.16); }
  .portrait-fallback { color: var(--accent-text); background: linear-gradient(145deg,#e8f3fc,#d6e9f8); font-family: var(--font-data); font-size: 2rem; font-weight: var(--weight-bold); letter-spacing: .04em; }
  .presence-dot { position: absolute; inset-inline-end: -.1rem; inset-block-end: .45rem; width: 1.05rem; height: 1.05rem; border: 3px solid #eef5fb; border-radius: 50%; background: var(--text-muted); }
  .presence-dot.active { background: var(--success); }
  .identity-copy { min-width: 0; }
  .profile-kicker { margin: 0 0 .3rem; color: var(--accent-text); font-size: var(--text-xs); font-weight: var(--weight-bold); letter-spacing: .08em; text-transform: uppercase; }
  .name-row { display: flex; align-items: center; gap: .75rem; flex-wrap: wrap; }
  .name-row h2 { margin: 0; color: var(--text-strong); font-size: clamp(1.45rem,2.3vw,2rem); font-weight: var(--weight-bold); line-height: 1.18; }
  .contact-row { display: flex; align-items: center; gap: .65rem 1.1rem; flex-wrap: wrap; margin-block-start: .85rem; color: var(--text-muted); font-size: var(--text-sm); }
  .contact-row a,.contact-row span { display: inline-flex; align-items: center; gap: .42rem; min-width: 0; color: inherit; text-decoration: none; }
  .contact-row a:hover { color: var(--accent-text); }
  .contact-row i { color: var(--text-secondary); }
  .home-summary { display: flex; align-items: center; gap: .8rem; min-width: 19rem; padding: .9rem 1rem; border: 1px solid rgba(30,108,165,.13); border-radius: var(--radius-md); background: rgba(255,255,255,.7); }
  .home-icon,.section-icon,.metric-icon { display: grid; flex: 0 0 auto; place-items: center; color: var(--accent-text); background: var(--accent-soft); }
  .home-icon { width: 2.6rem; height: 2.6rem; border-radius: .75rem; font-size: 1.15rem; }
  .home-summary > div { display: flex; min-width: 0; flex-direction: column; }
  .home-summary strong { overflow: hidden; color: var(--text-strong); font-size: var(--text-sm); text-overflow: ellipsis; white-space: nowrap; }
  .home-summary span:not(.home-icon) { color: var(--text-muted); font-size: var(--text-xs); }
  .home-summary .summary-label { margin-block-end: .1rem; color: var(--text-secondary); font-weight: var(--weight-semibold); }
  .summary-divider { display: inline-block; width: 1px; height: .7rem; margin-inline: .45rem; background: var(--border-strong); vertical-align: middle; }

  .account-strip { display: grid; grid-template-columns: repeat(5,minmax(0,1fr)); overflow: hidden; border: 1px solid var(--border); border-radius: var(--radius-lg); background: var(--surface); box-shadow: var(--shadow-sm); }
  .metric { display: flex; align-items: center; gap: .7rem; min-width: 0; padding: .9rem 1rem; border-inline-start: 1px solid var(--border); }
  .metric:first-child { border-inline-start: 0; }
  .metric.is-emphasis { background: var(--accent-soft); }
  .metric-icon { width: 2rem; height: 2rem; border-radius: .6rem; font-size: .9rem; }
  .metric > div { min-width: 0; }
  .metric-label { display: block; overflow: hidden; color: var(--text-muted); font-size: .7rem; font-weight: var(--weight-semibold); letter-spacing: .035em; text-overflow: ellipsis; text-transform: uppercase; white-space: nowrap; }
  .metric strong { display: block; margin-block-start: .1rem; overflow: hidden; color: var(--text-strong); font-family: var(--font-data); font-size: .98rem; font-variant-numeric: tabular-nums; text-overflow: ellipsis; white-space: nowrap; }

  .overview-grid { display: grid; grid-template-columns: minmax(0,1.08fr) minmax(0,.92fr); gap: var(--space-4); align-items: stretch; }
  .section-card { min-width: 0; padding: var(--space-4); border: 1px solid var(--border); border-radius: var(--radius-lg); background: var(--surface); box-shadow: var(--shadow-sm); }
  .section-heading { display: flex; align-items: center; gap: .65rem; min-height: 2rem; margin-block-end: var(--space-4); }
  .section-heading h3 { margin: 0 auto 0 0; color: var(--text-strong); font-size: var(--text-base); font-weight: var(--weight-bold); }
  :global([dir='rtl']) .section-heading h3 { margin: 0 0 0 auto; }
  .section-icon { width: 2rem; height: 2rem; border-radius: .6rem; font-size: .9rem; }
  .facts { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: .95rem 1.5rem; margin: 0; }
  .facts div { min-width: 0; }
  .facts .fact-wide { grid-column: 1/-1; }
  .facts dt { margin-block-end: .2rem; color: var(--text-muted); font-size: .69rem; font-weight: var(--weight-bold); letter-spacing: .045em; text-transform: uppercase; }
  .facts dd { margin: 0; color: var(--text-strong); font-size: var(--text-sm); overflow-wrap: anywhere; }
  .facts a { color: var(--accent-text); text-decoration: none; }
  .facts a:hover { text-decoration: underline; }
  .data-value,.money-value,.primary-cell { color: var(--text-strong); font-family: var(--font-data); font-weight: var(--weight-semibold); font-variant-numeric: tabular-nums; }
  .notes { display: flex; align-items: flex-start; gap: .7rem; margin-block-start: var(--space-4); padding: .75rem .85rem; border: 1px solid var(--border); border-radius: var(--radius-md); background: var(--surface-hover); color: var(--text-muted); }
  .notes > i { color: var(--accent-text); }
  .notes p { display: flex; flex-direction: column; gap: .12rem; margin: 0; font-size: var(--text-xs); line-height: 1.5; }
  .notes strong { color: var(--text-secondary); }

  .documents { display: grid; grid-template-columns: repeat(auto-fit,minmax(15rem,22rem)); gap: var(--space-4); }
  .document { overflow: hidden; margin: 0; border: 1px solid var(--border); border-radius: var(--radius-md); background: var(--surface); }
  .document figcaption { padding: .55rem .75rem; border-block-end: 1px solid var(--border); color: var(--text-secondary); font-size: var(--text-xs); font-weight: var(--weight-semibold); }
  .document a { position: relative; display: block; }
  .document a:focus-visible { outline: 0; box-shadow: var(--ring); }
  .document img { display: block; width: 100%; aspect-ratio: 16/9; object-fit: cover; background: var(--surface-hover); transition: transform var(--transition); }
  .document a:hover img { transform: scale(1.02); }
  .document-open { position: absolute; inset-inline-end: .65rem; inset-block-end: .65rem; display: grid; place-items: center; width: 2rem; height: 2rem; border-radius: .55rem; color: var(--accent-text); background: rgba(255,255,255,.92); box-shadow: var(--shadow-sm); }
  .document-missing { display: flex; align-items: center; gap: .5rem; min-height: 8rem; margin: 0; padding: 1rem; color: var(--warning); background: var(--warning-soft); font-size: var(--text-xs); font-weight: var(--weight-semibold); }

  .record-card { overflow: hidden; padding: 0; }
  .record-heading { margin: 0; padding: var(--space-4); }
  .record-card :global(.table) { --bs-table-bg: transparent; }
  .record-card :global(.table > :not(caption) > * > *) { padding-inline: var(--space-4); }
  .record-card :global(.table thead th) { background: var(--surface-hover); }
  .record-card :global(.table tbody tr:last-child > *) { border-block-end: 0; }
  .record-card small { margin-inline-start: .3rem; color: var(--text-muted); font-family: var(--font-ui); font-size: var(--text-xs); font-weight: var(--weight-regular); }
  .primary-cell span { color: var(--text-muted); font-family: var(--font-ui); font-weight: var(--weight-regular); }
  .record-empty { padding: 0 var(--space-4) var(--space-4); }
  .month-chip { padding: .2rem .55rem; border-radius: var(--radius-pill); color: var(--accent-text); background: var(--accent-soft); font-size: var(--text-xs); font-weight: var(--weight-semibold); }
  .empty { margin: 0; color: var(--text-muted); font-size: var(--text-sm); }
  .empty-state { display: flex; align-items: center; gap: .65rem; color: var(--text-muted); }
  .empty-state i { color: var(--text-disabled); font-size: 1.1rem; }
  .empty-state p { margin: 0; font-size: var(--text-sm); }

  .deposit-list { display: grid; gap: var(--space-3); }
  .deposit-card { overflow: hidden; border: 1px solid var(--border); border-radius: var(--radius-md); }
  .deposit-card > header { display: flex; align-items: center; justify-content: space-between; gap: .75rem; padding: .7rem .85rem; border-block-end: 1px solid var(--border); background: var(--surface-hover); }
  .deposit-card > header > div { display: flex; align-items: center; gap: .75rem; min-width: 0; }
  .deposit-card header strong { color: var(--text-strong); font-family: var(--font-data); font-size: var(--text-sm); }
  .deposit-card header span { color: var(--text-muted); font-size: var(--text-xs); }
  .deposit-figures { display: grid; grid-template-columns: repeat(5,minmax(0,1fr)); }
  .deposit-figures div { min-width: 0; padding: .75rem .85rem; border-inline-start: 1px solid var(--border); }
  .deposit-figures div:first-child { border-inline-start: 0; }
  .deposit-figures span { display: block; color: var(--text-muted); font-size: .67rem; font-weight: var(--weight-semibold); letter-spacing: .035em; text-transform: uppercase; }
  .deposit-figures strong { display: block; margin-block-start: .12rem; overflow: hidden; color: var(--text-strong); font-family: var(--font-data); font-size: var(--text-sm); font-variant-numeric: tabular-nums; text-overflow: ellipsis; white-space: nowrap; }
  .cell-sub { display: block; color: var(--text-muted); font-family: var(--font-ui); font-size: var(--text-xs); font-weight: var(--weight-regular); }

  @media (max-width: 1120px) {
    .identity-hero { grid-template-columns: auto 1fr; }
    .home-summary { grid-column: 1/-1; width: 100%; }
    .account-strip { grid-template-columns: repeat(3,minmax(0,1fr)); }
    .metric:nth-child(4) { border-inline-start: 0; border-block-start: 1px solid var(--border); }
    .metric:nth-child(5) { border-block-start: 1px solid var(--border); }
  }
  @media (max-width: 820px) {
    .overview-grid { grid-template-columns: 1fr; }
    .account-strip { grid-template-columns: repeat(2,minmax(0,1fr)); }
    .metric:nth-child(3),.metric:nth-child(5) { border-inline-start: 0; }
    .metric:nth-child(4) { border-inline-start: 1px solid var(--border); }
    .metric:nth-child(3) { border-block-start: 1px solid var(--border); }
    .deposit-figures { grid-template-columns: repeat(2,minmax(0,1fr)); }
    .deposit-figures div:nth-child(odd) { border-inline-start: 0; }
    .deposit-figures div:nth-child(n+3) { border-block-start: 1px solid var(--border); }
  }
  @media (max-width: 600px) {
    .identity-hero { grid-template-columns: 1fr; justify-items: center; padding: var(--space-4); text-align: center; }
    .portrait-wrap { width: 6rem; height: 6rem; }
    .name-row,.contact-row { justify-content: center; }
    .contact-row { flex-direction: column; gap: .45rem; }
    .home-summary { min-width: 0; text-align: start; }
    .account-strip { grid-template-columns: 1fr; }
    .metric,.metric:nth-child(3),.metric:nth-child(4),.metric:nth-child(5) { border-inline-start: 0; border-block-start: 1px solid var(--border); }
    .metric:first-child { border-block-start: 0; }
    .facts { grid-template-columns: 1fr; }
    .facts .fact-wide { grid-column: auto; }
    .section-card { padding: var(--space-3); }
    .record-card { padding: 0; }
    .record-heading { padding: var(--space-3); }
    .record-card :global(.table > :not(caption) > * > *) { padding-inline: var(--space-3); }
    .deposit-card > header,.deposit-card > header > div { align-items: flex-start; flex-direction: column; }
    .deposit-figures { grid-template-columns: 1fr; }
    .deposit-figures div,.deposit-figures div:nth-child(odd) { border-inline-start: 0; border-block-start: 1px solid var(--border); }
    .deposit-figures div:first-child { border-block-start: 0; }
  }
  @media (prefers-reduced-motion: reduce) { .document img { transition: none; } }
</style>
