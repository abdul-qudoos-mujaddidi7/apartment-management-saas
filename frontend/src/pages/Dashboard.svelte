<script>
  /**
   * Dashboard — a live workspace, not a chart wall.
   *
   * Every figure on this page comes from `GET /api/dashboard` (see the dashboard
   * module in the API): counts and occupancy from the property tables, money from
   * invoices, payments and the ledger, and the three action lists at the bottom
   * from the rows that actually need follow-up today.
   *
   * The one signature element is the collections figure: six months drawn as
   * ledger columns, where each pale column is what was billed and the solid cap
   * on it is what was collected — so the pale sliver above every cap is money
   * still owed. The columns are DOM, not SVG, so they mirror correctly in the
   * RTL locales the app ships with.
   */
  import { onMount } from 'svelte';
  import { link } from 'svelte-spa-router';

  import { getDashboard } from '../services/dashboard';
  import { listLeases } from '../services/leases';
  import { listMeterReadings } from '../services/meterReadings';
  import { createInvoice } from '../services/invoices';
  import ReceivePaymentModal from '../components/payments/ReceivePaymentModal.svelte';
  import DataTable from '../components/ui/DataTable.svelte';
  import Modal from '../components/ui/Modal.svelte';
  import StatusBadge from '../components/ui/StatusBadge.svelte';
  import ShamsiDatePicker from '../components/ui/ShamsiDatePicker.svelte';

  import { locale, translate } from '../i18n';
  import { formatMoney, formatNumber, formatDate } from '../utils/formatters';

  const INVOICE_ITEM_TYPES = [
    'RENT',
    'ELECTRICITY',
    'WATER',
    'GAS',
    'OTHER'
  ];

  /** Legend order for the apartment mix, most-let first. */
  const STATUS_ORDER = ['OCCUPIED', 'AVAILABLE', 'RESERVED', 'MAINTENANCE', 'INACTIVE'];
  const STATUS_TONE = {
    OCCUPIED: 'occupied',
    AVAILABLE: 'available',
    RESERVED: 'reserved',
    MAINTENANCE: 'maintenance',
    INACTIVE: 'inactive'
  };

  const DAY = 86_400_000;

  const emptySummary = {
    portfolio: { buildings: 0, floors: 0, apartments: 0, tenants: 0, activeLeases: 0 },
    occupancy: { total: 0, leasable: 0, occupied: 0, vacant: 0, reserved: 0, maintenance: 0, inactive: 0, rate: 0 },
    money: {
      billedThisMonth: 0,
      collectedThisMonth: 0,
      collectedLastMonth: 0,
      outstanding: 0,
      overdueAmount: 0,
      overdueCount: 0,
      collectionRate: 0,
      currency: 'AFN'
    },
    // Replaced by the server's reporting currency as soon as the summary loads.
    trend: [],
    apartmentStatus: {},
    recentPayments: [],
    overdueInvoices: [],
    expiringLeases: []
  };

  /* Empty invoice draft — declared before the state that seeds from it, because
     a `const` arrow used in a top-level initialiser must already be bound. */
  const localDate = () => {
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');

    return `${year}-${month}-${day}`;
  };

  const newInvoiceItem = () => ({
    type: 'RENT',
    description: '',
    quantity: 1,
    unitPrice: ''
  });

  const emptyInvoiceForm = () => ({
    invoiceDate: localDate(),
    dueDate: '',
    notes: '',
    items: [newInvoiceItem()]
  });

  let summary = null;
  let summaryLoading = true;
  let summaryError = '';
  let today = new Date();
  let dashboardNotice = '';

  let activeLeases = [];
  let activeLeasesLoading = false;
  let activeLeasesError = '';
  let selectedLease = null;
  let invoiceModalOpen = false;
  let paymentModalOpen = false;
  let paymentLease = null;
  let invoiceSaving = false;
  let invoiceError = '';
  let invoiceFormErrors = {};
  let invoiceForm = emptyInvoiceForm();
  let utilityReadingsLoading = false;

  $: data = summary || emptySummary;
  $: portfolio = data.portfolio;
  $: occupancy = data.occupancy;
  $: money = data.money;
  $: occupancyPercent = Math.round((occupancy.rate || 0) * 100);

  $: kpis = [
    {
      key: 'units',
      icon: 'bi-buildings',
      label: $locale.dashboard.unitsManaged,
      value: formatNumber(portfolio.apartments),
      hint: translate('dashboard.unitsManagedHint', {
        buildings: formatNumber(portfolio.buildings),
        floors: formatNumber(portfolio.floors)
      })
    },
    {
      key: 'occupancy',
      icon: 'bi-house-check',
      label: $locale.dashboard.occupancy,
      value: `${occupancyPercent}%`,
      hint: occupancy.leasable > 0
        ? translate('dashboard.occupancyHint', {
            occupied: formatNumber(occupancy.occupied),
            leasable: formatNumber(occupancy.leasable)
          })
        : $locale.dashboard.noLeasableUnits
    },
    {
      key: 'leases',
      icon: 'bi-file-earmark-text',
      label: $locale.dashboard.activeLeasesMetric,
      value: formatNumber(portfolio.activeLeases),
      hint: translate('dashboard.activeLeasesHint', { tenants: formatNumber(portfolio.tenants) })
    },
    {
      key: 'collected',
      icon: 'bi-graph-up-arrow',
      label: $locale.dashboard.collectedThisMonth,
      value: formatMoney(money.collectedThisMonth, money.currency),
      hint: collectedHint().text,
      tone: collectedHint().tone
    },
    {
      key: 'outstanding',
      icon: 'bi-exclamation-circle',
      label: $locale.dashboard.outstandingMetric,
      value: formatMoney(money.outstanding, money.currency),
      hint: translate('dashboard.outstandingHint', {
        count: formatNumber(money.overdueCount),
        amount: formatMoney(money.overdueAmount, money.currency)
      })
    }
  ];

  /** The tallest billed month sets the column scale; never divide by zero. */
  $: chartMax = Math.max(...data.trend.map((point) => point.billed), 1);
  $: chartColumns = data.trend.map((point, index) => ({
    key: point.month,
    index,
    isCurrent: index === data.trend.length - 1,
    billed: point.billed,
    collected: point.collected,
    billedRatio: point.billed / chartMax,
    collectedShare: point.billed > 0 ? Math.min((point.collected / point.billed) * 100, 100) : 0,
    shortLabel: monthLabel(point.month, 'short'),
    fullLabel: monthLabel(point.month, 'long')
  }));

  $: trendTotals = data.trend.reduce(
    (totals, point) => ({
      billed: totals.billed + point.billed,
      collected: totals.collected + point.collected
    }),
    { billed: 0, collected: 0 }
  );
  $: hasTrendActivity = trendTotals.billed > 0 || trendTotals.collected > 0;
  $: uncollected = Math.max(trendTotals.billed - trendTotals.collected, 0);

  $: collectionPercent = Math.round((money.collectionRate || 0) * 100);

  $: statusMix = STATUS_ORDER.map((status) => {
    const count = data.apartmentStatus?.[status] || 0;
    return {
      status,
      count,
      tone: STATUS_TONE[status],
      share: occupancy.total > 0 ? Math.round((count / occupancy.total) * 100) : 0
    };
  });
  $: mixLabel = statusMix
    .map((entry) => `${$locale.apartments.statuses[entry.status]}: ${entry.count}`)
    .join(', ');

  onMount(() => {
    void loadDashboard();
    void loadActiveLeases();
  });

  function collectedHint() {
    const { collectedThisMonth, collectedLastMonth } = money;

    if (collectedLastMonth > 0) {
      const change = Math.round(((collectedThisMonth - collectedLastMonth) / collectedLastMonth) * 100);

      if (change > 0) {
        return { text: translate('dashboard.collectedHintUp', { percent: change }), tone: 'up' };
      }
      if (change < 0) {
        return { text: translate('dashboard.collectedHintDown', { percent: Math.abs(change) }), tone: 'down' };
      }

      return { text: $locale.dashboard.collectedHintFlat, tone: 'flat' };
    }

    return { text: $locale.dashboard.collectedHintNone, tone: 'flat' };
  }

  function monthLabel(month, style) {
    const [year, index] = String(month).split('-').map(Number);
    const date = new Date(year, (index || 1) - 1, 1);

    return style === 'long'
      ? date.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
      : date.toLocaleDateString(undefined, { month: 'short' });
  }

  async function loadDashboard() {
    summaryLoading = true;
    summaryError = '';
    today = new Date();

    try {
      summary = await getDashboard();
    } catch (error) {
      if (error.status === 401) {
        return;
      }

      summaryError = error.message || $locale.dashboard.loadError;
    } finally {
      summaryLoading = false;
    }
  }

  async function loadActiveLeases() {
    activeLeasesLoading = true;
    activeLeasesError = '';

    try {
      const response = await listLeases({
        page: 1,
        pageSize: 8,
        status: 'ACTIVE'
      });

      activeLeases = response.items || [];
    } catch (error) {
      if (error.status === 401) {
        return;
      }

      activeLeasesError = error.message;
    } finally {
      activeLeasesLoading = false;
    }
  }

  const money$ = formatMoney;
  const tenantName = (tenant) => (`${tenant?.firstName || ''} ${tenant?.lastName || ''}`).trim() || '—';
  const location = (apartment) => [
    apartment?.apartmentNumber,
    apartment?.floor?.building?.name
  ].filter(Boolean).join(' · ');

  function overdueLabel(dueDate) {
    if (!dueDate) return $locale.dashboard.overdueInvoices;

    const days = Math.floor((today - new Date(dueDate)) / DAY);

    if (days <= 0) return $locale.dashboard.dueToday;
    if (days === 1) return $locale.dashboard.oneDayOverdue;

    return translate('dashboard.daysOverdue', { days });
  }

  function leaseEndLabel(daysLeft) {
    if (!daysLeft || daysLeft <= 0) return $locale.dashboard.lastDay;

    return translate('dashboard.daysLeft', { days: daysLeft });
  }

  /* ------------------------------------------------------------------ quick invoice
     The invoice and payment dialogs are opened from the active-tenancy rows below;
     they reuse the same endpoints the Invoices and Payments pages use. */

  function utilityInvoiceItem(reading) {
    const utility = $locale.invoices[reading.meter.utilityType.toLowerCase()];
    return {
      type: reading.meter.utilityType,
      meterReadingId: reading.id,
      description: `${utility} - Meter ${reading.meter.meterNumber} - ${Number(reading.consumption).toLocaleString(undefined, { minimumFractionDigits: 3, maximumFractionDigits: 3 })} ${reading.meter.unit}`,
      quantity: Number(reading.consumption),
      unitPrice: Number(reading.unitPrice),
      amount: Number(reading.amount)
    };
  }

  async function openInvoiceModal(lease) {
    selectedLease = lease;
    invoiceForm = {
      invoiceDate: localDate(),
      dueDate: '',
      notes: '',
      items: [
        {
          type: 'RENT',
          description: $locale.invoices.monthlyRent,
          quantity: 1,
          unitPrice: Number(lease.monthlyRent)
        }
      ]
    };
    invoiceError = '';
    invoiceFormErrors = {};
    invoiceModalOpen = true;
    utilityReadingsLoading = true;

    try {
      const response = await listMeterReadings({
        apartmentId: lease.apartment.id,
        unbilled: true,
        page: 1,
        pageSize: 100
      });

      if (selectedLease?.id !== lease.id) return;
      invoiceForm = {
        ...invoiceForm,
        items: [...invoiceForm.items, ...(response.items || []).map(utilityInvoiceItem)]
      };
    } catch (error) {
      if (error.status === 401) {
        return;
      }
      invoiceError = error.message;
    } finally {
      utilityReadingsLoading = false;
    }
  }

  function openPaymentModal(lease) {
    paymentLease = lease;
    paymentModalOpen = true;
  }

  function closePaymentModal() {
    paymentModalOpen = false;
    paymentLease = null;
  }

  function closeInvoiceModal(force = false) {
    if (invoiceSaving && !force) return;

    invoiceModalOpen = false;
    selectedLease = null;
    invoiceError = '';
    invoiceFormErrors = {};
    invoiceForm = emptyInvoiceForm();
    utilityReadingsLoading = false;
  }

  function addInvoiceItem() {
    invoiceForm = {
      ...invoiceForm,
      items: [...invoiceForm.items, newInvoiceItem()]
    };
  }

  function removeInvoiceItem(index) {
    if (invoiceForm.items.length === 1) return;

    invoiceForm = {
      ...invoiceForm,
      items: invoiceForm.items.filter((_, itemIndex) => itemIndex !== index)
    };
  }

  function validateInvoiceForm() {
    const errors = {};

    if (!selectedLease) {
      invoiceError = $locale.invoices.leaseNotSelected;
    }

    if (!invoiceForm.invoiceDate) {
      errors.invoiceDate = translate(
        'invoices.required',
        { field: $locale.invoices.invoiceDate }
      );
    }

    if (
      invoiceForm.dueDate
      && invoiceForm.invoiceDate
      && invoiceForm.dueDate < invoiceForm.invoiceDate
    ) {
      errors.dueDate = $locale.invoices.invalidDates;
    }

    invoiceForm.items.forEach((item, index) => {
      if (item.meterReadingId) return;
      if (!item.description.trim()) {
        errors[`item-${index}-description`] = translate(
          'invoices.required',
          { field: $locale.invoices.itemDescription }
        );
      }

      if (Number(item.quantity) <= 0) {
        errors[`item-${index}-quantity`] = $locale.invoices.positiveQuantity;
      }

      if (item.unitPrice === '' || Number(item.unitPrice) < 0) {
        errors[`item-${index}-unitPrice`] = $locale.invoices.notNegative;
      }
    });

    invoiceFormErrors = errors;
    return Boolean(selectedLease) && Object.keys(errors).length === 0;
  }

  function invoiceItemAmount(item) {
    if (item.meterReadingId) return Number(item.amount) || 0;
    return (Number(item.quantity) || 0) * (Number(item.unitPrice) || 0);
  }

  $: invoicePreviewTotal = invoiceForm.items.reduce(
    (total, item) => total + invoiceItemAmount(item),
    0
  );

  async function saveQuickInvoice() {
    if (!validateInvoiceForm()) return;

    invoiceSaving = true;
    invoiceError = '';
    dashboardNotice = '';

    try {
      await createInvoice({
        leaseId: selectedLease.id,
        invoiceDate: invoiceForm.invoiceDate,
        dueDate: invoiceForm.dueDate || null,
        notes: invoiceForm.notes.trim() || null,
        items: invoiceForm.items.map((item) => item.meterReadingId
          ? { type: item.type, meterReadingId: item.meterReadingId }
          : {
              type: item.type,
              description: item.description.trim(),
              quantity: Number(item.quantity),
              unitPrice: Number(item.unitPrice)
            })
      });

      dashboardNotice = $locale.invoices.invoiceCreated;
      closeInvoiceModal(true);
      await loadDashboard();
    } catch (error) {
      if (error.status === 401) {
        return;
      }

      if (error.data?.errors) {
        invoiceFormErrors = Object.fromEntries(
          Object.entries(error.data.errors).map(([field, messages]) => [field, messages[0]])
        );
      } else {
        invoiceError = error.message;
      }
    } finally {
      invoiceSaving = false;
    }
  }

  const invoiceTypeLabel = (type) => $locale.invoices[type.toLowerCase()];
</script>

<svelte:head><title>{$locale.dashboard.title} | {$locale.common.apartmentPro}</title></svelte:head>

<div class="dash">
  {#if summaryError}
    <div class="alert alert-danger dash-alert" role="alert">
      <i class="bi bi-exclamation-triangle" aria-hidden="true"></i>
      <span>{summaryError}</span>
      <button class="btn btn-light btn-sm" type="button" on:click={loadDashboard}>
        {$locale.common.retry}
      </button>
    </div>
  {/if}

  {#if dashboardNotice}
    <div class="alert alert-success dash-alert" role="status">
      <i class="bi bi-check-circle" aria-hidden="true"></i>
      <span>{dashboardNotice}</span>
    </div>
  {/if}

  <section class="band-kpi" aria-label={$locale.dashboard.summary}>
    {#each kpis as kpi (kpi.key)}
      <article class="kpi">
        <p class="kpi-label">
          <i class="bi {kpi.icon}" aria-hidden="true"></i>
          {kpi.label}
        </p>

        <p class="kpi-value">
          {#if summaryLoading && !summary}
            <span class="skeleton-value skeleton-value--sm" aria-hidden="true"></span>
          {:else}
            {kpi.value}
          {/if}
        </p>

        <p class="kpi-hint tone-{kpi.tone || 'muted'}">{kpi.hint}</p>
      </article>
    {/each}
  </section>

  <div class="band-grid">
    <section class="card card-chart" aria-labelledby="dash-collections">
      <header class="card-head">
        <div class="card-head-copy">
          <h3 id="dash-collections">{$locale.dashboard.collections}</h3>
          <p>{$locale.dashboard.collectionsDescription}</p>
        </div>

        <div class="share">
          <p class="share-value">{collectionPercent}%</p>
          <p class="share-label">{$locale.dashboard.collectionShare}</p>
          <div class="share-track">
            <span style={`width: ${Math.min(collectionPercent, 100)}%`}></span>
          </div>
        </div>
      </header>

      {#if summaryLoading && !summary}
        <p class="card-empty">{$locale.dashboard.loadingDashboard}</p>
      {:else if !hasTrendActivity}
        <p class="card-empty">{$locale.dashboard.noCollectionActivity}</p>
      {:else}
        <p class="axis-max">{money$(chartMax, money.currency)}</p>

        <ol class="chart" style={`--cols: ${chartColumns.length}`}>
          {#each chartColumns as column (column.key)}
            <li
              class="chart-col"
              class:is-current={column.isCurrent}
              style={`--i: ${column.index}`}
              aria-label={`${column.fullLabel}: ${$locale.dashboard.billed} ${money$(column.billed, money.currency)}, ${$locale.dashboard.collected} ${money$(column.collected, money.currency)}`}
            >
              <span
                class="chart-track"
                class:is-empty={column.billed <= 0}
                style={`--h: ${column.billedRatio}`}
                aria-hidden="true"
              >
                <span class="chart-cap" style={`height: ${column.collectedShare}%`}></span>
              </span>

              <span class="chart-month" aria-hidden="true">{column.shortLabel}</span>
            </li>
          {/each}
        </ol>

        <ul class="chart-legend">
          <li>
            <span class="swatch swatch-billed" aria-hidden="true"></span>
            {$locale.dashboard.billed}
            <b>{money$(trendTotals.billed, money.currency)}</b>
          </li>
          <li>
            <span class="swatch swatch-collected" aria-hidden="true"></span>
            {$locale.dashboard.collected}
            <b>{money$(trendTotals.collected, money.currency)}</b>
          </li>
          <li>
            <span class="swatch swatch-gap" aria-hidden="true"></span>
            {$locale.dashboard.uncollected}
            <b>{money$(uncollected, money.currency)}</b>
          </li>
        </ul>
      {/if}
    </section>

    <section class="card card-mix" aria-labelledby="dash-mix">
      <header class="card-head">
        <div class="card-head-copy">
          <h3 id="dash-mix">{$locale.dashboard.apartmentMix}</h3>
          <p>{$locale.dashboard.apartmentMixDescription}</p>
        </div>

        <p class="mix-total">
          {translate('dashboard.statusTotal', { count: formatNumber(occupancy.total) })}
        </p>
      </header>

      {#if summaryLoading && !summary}
        <p class="card-empty">{$locale.dashboard.loadingDashboard}</p>
      {:else if occupancy.total <= 0}
        <div class="card-empty">
          <p>{$locale.dashboard.noLeasableUnits}</p>

          <!-- An empty portfolio should offer the first move, not bare zeros. -->
          {#if portfolio.buildings === 0}
            <a class="btn btn-primary btn-sm card-cta" use:link href="/buildings">
              <i class="bi bi-plus-lg" aria-hidden="true"></i>
              {$locale.buildings.add}
            </a>
          {/if}
        </div>
      {:else}
        <div class="mix-bar" role="img" aria-label={mixLabel}>
          {#each statusMix as entry (entry.status)}
            {#if entry.count > 0}
              <span class="seg tone-{entry.tone}" style={`width: ${entry.share}%`}></span>
            {/if}
          {/each}
        </div>

        <ul class="mix-legend">
          {#each statusMix as entry (entry.status)}
            <li class:is-empty={entry.count === 0}>
              <span class="swatch tone-{entry.tone}" aria-hidden="true"></span>
              <span class="mix-name">{$locale.apartments.statuses[entry.status]}</span>
              <span class="mix-count">{formatNumber(entry.count)}</span>
              <span class="mix-share">{entry.share}%</span>
            </li>
          {/each}
        </ul>
      {/if}
    </section>
  </div>

  <p class="band-title">{$locale.dashboard.needsAttention}</p>

  <div class="band-grid band-grid-three">
    <section class="card" aria-labelledby="dash-overdue">
      <header class="card-head">
        <div class="card-head-copy">
          <h3 id="dash-overdue">
            <i class="bi bi-exclamation-triangle card-icon card-icon-danger" aria-hidden="true"></i>
            {$locale.dashboard.overdueInvoices}
          </h3>
          <p>{$locale.dashboard.overdueInvoicesDescription}</p>
        </div>

        <a class="card-link" use:link href="/invoices">
          {$locale.dashboard.viewAll}
          <i class="bi bi-arrow-right" aria-hidden="true"></i>
        </a>
      </header>

      {#if data.overdueInvoices.length > 0}
        <ul class="rows">
          {#each data.overdueInvoices as invoice (invoice.id)}
            <li class="row">
              <div class="row-main">
                <a class="row-title" use:link href="/invoices">{tenantName(invoice.tenant)}</a>
                <p class="row-meta">{location(invoice.apartment)} · {invoice.contractNumber}</p>
              </div>

              <div class="row-side">
                <p class="row-amount">{money$(invoice.baseBalance ?? invoice.balance, money.currency)}</p>
                <StatusBadge label={overdueLabel(invoice.dueDate)} tone="danger" />
              </div>
            </li>
          {/each}
        </ul>
      {:else}
        <p class="card-empty">{$locale.dashboard.noOverdueInvoices}</p>
      {/if}
    </section>

    <section class="card" aria-labelledby="dash-expiring">
      <header class="card-head">
        <div class="card-head-copy">
          <h3 id="dash-expiring">
            <i class="bi bi-hourglass-split card-icon card-icon-warning" aria-hidden="true"></i>
            {$locale.dashboard.expiringLeases}
          </h3>
          <p>{$locale.dashboard.expiringLeasesDescription}</p>
        </div>

        <a class="card-link" use:link href="/leases">
          {$locale.dashboard.viewAll}
          <i class="bi bi-arrow-right" aria-hidden="true"></i>
        </a>
      </header>

      {#if data.expiringLeases.length > 0}
        <ul class="rows">
          {#each data.expiringLeases as lease (lease.id)}
            <li class="row">
              <div class="row-main">
                <a class="row-title" use:link href="/leases">{tenantName(lease.tenant)}</a>
                <p class="row-meta">{location(lease.apartment)} · {lease.contractNumber}</p>
              </div>

              <div class="row-side">
                <p class="row-amount">{formatDate(lease.endDate)}</p>
                <StatusBadge label={leaseEndLabel(lease.daysLeft)} tone="warning" />
              </div>
            </li>
          {/each}
        </ul>
      {:else}
        <p class="card-empty">{$locale.dashboard.noExpiringLeases}</p>
      {/if}
    </section>

    <section class="card" aria-labelledby="dash-payments">
      <header class="card-head">
        <div class="card-head-copy">
          <h3 id="dash-payments">
            <i class="bi bi-cash-coin card-icon card-icon-success" aria-hidden="true"></i>
            {$locale.dashboard.recentPayments}
          </h3>
          <p>{$locale.dashboard.recentPaymentsDescription}</p>
        </div>

        <a class="card-link" use:link href="/payments">
          {$locale.dashboard.viewAll}
          <i class="bi bi-arrow-right" aria-hidden="true"></i>
        </a>
      </header>

      {#if data.recentPayments.length > 0}
        <ul class="rows">
          {#each data.recentPayments as payment (payment.id)}
            <li class="row">
              <div class="row-main">
                <a class="row-title" use:link href="/payments">{tenantName(payment.tenant)}</a>
                <p class="row-meta">
                  {payment.paymentNumber} · {$locale.paymentMethods[payment.paymentMethod]}
                </p>
              </div>

              <div class="row-side">
                <p class="row-amount tone-in">{money$(payment.baseAmount ?? payment.amount, money.currency)}</p>
                <p class="row-when">{formatDate(payment.paymentDate)}</p>
              </div>
            </li>
          {/each}
        </ul>
      {:else}
        <p class="card-empty">{$locale.dashboard.noRecentPayments}</p>
      {/if}
    </section>
  </div>

  <section class="card card-table" aria-labelledby="dash-tenancies">
    <header class="card-head">
      <div class="card-head-copy">
        <h3 id="dash-tenancies">{$locale.dashboard.activeTenancies}</h3>
        <p>{$locale.dashboard.activeTenanciesDescription}</p>
      </div>

      <a class="card-link" use:link href="/leases">
        {$locale.dashboard.viewAll}
        <i class="bi bi-arrow-right" aria-hidden="true"></i>
      </a>
    </header>

    {#if activeLeasesError}
      <div class="alert alert-danger dash-alert" role="alert">
        <i class="bi bi-exclamation-triangle" aria-hidden="true"></i>
        <span>{activeLeasesError}</span>
      </div>
    {/if}

    <DataTable
      loading={activeLeasesLoading}
      isEmpty={activeLeases.length === 0}
      loadingLabel={$locale.dashboard.loading}
      emptyLabel={$locale.dashboard.noActiveTenancies}
      emptyIcon="bi-house-check"
      className="dashboard-tenancies"
    >
      <thead>
        <tr>
          <th>{$locale.invoices.tenant}</th>
          <th>{$locale.invoices.building}</th>
          <th>{$locale.invoices.floor}</th>
          <th>{$locale.invoices.apartment}</th>
          <th>{$locale.invoices.contractNumber}</th>
          <th class="amount-cell">{$locale.invoices.monthlyRent}</th>
          <th>{$locale.invoices.status}</th>
          <th class="actions-heading">
            <span class="visually-hidden">{$locale.dashboard.createInvoice}</span>
          </th>
        </tr>
      </thead>

      <tbody>
        {#each activeLeases as lease (lease.id)}
          <tr>
            <td class="tenant-name">{tenantName(lease.tenant)}</td>
            <td>{lease.apartment.floor.building.name}</td>
            <td>{lease.apartment.floor.name || lease.apartment.floor.floorNumber}</td>
            <td>
              <strong>{lease.apartment.apartmentNumber}</strong>
              {#if lease.apartment.name}
                <small class="cell-sub">{lease.apartment.name}</small>
              {/if}
            </td>
            <td class="contract-number">{lease.contractNumber}</td>
            <td class="amount-cell">{money$(lease.monthlyRent, lease.currency)}</td>
            <td>
              <StatusBadge
                label={$locale.leases.active}
                tone="success"
              />
            </td>
            <td class="actions-cell">
              <button
                class="btn btn-outline-primary invoice-action"
                type="button"
                on:click={() => openPaymentModal(lease)}
              >
                <i class="bi bi-credit-card-2-front" aria-hidden="true"></i>
                {$locale.payments.receivePayment}
              </button>
              <button
                class="btn btn-primary invoice-action"
                type="button"
                on:click={() => openInvoiceModal(lease)}
              >
                <i class="bi bi-receipt" aria-hidden="true"></i>
                {$locale.dashboard.createInvoice}
              </button>
            </td>
          </tr>
        {/each}
      </tbody>
    </DataTable>
  </section>
</div>

<ReceivePaymentModal
  open={paymentModalOpen}
  lease={paymentLease}
  on:close={closePaymentModal}
  on:saved={() => {
    dashboardNotice = $locale.payments.saved;
    closePaymentModal();
    void loadDashboard();
  }}
/>

<Modal
  bind:open={invoiceModalOpen}
  title={$locale.invoices.quickCreate}
  busy={invoiceSaving}
  size="modal-xl"
  closeLabel={$locale.invoices.cancel}
  on:close={() => closeInvoiceModal()}
>
  {#if selectedLease}
    <form id="quick-invoice-form" on:submit|preventDefault={saveQuickInvoice} novalidate>
      {#if invoiceError}
        <div class="alert alert-danger" role="alert">
          <i class="bi bi-exclamation-triangle" aria-hidden="true"></i>
          <span>{invoiceError}</span>
        </div>
      {/if}

      <fieldset>
        <legend class="section-label">{$locale.invoices.tenancyDetails}</legend>

        <dl class="tenancy-context">
          <div>
            <dt>{$locale.invoices.tenant}</dt>
            <dd>{tenantName(selectedLease.tenant)}</dd>
          </div>
          <div>
            <dt>{$locale.invoices.building}</dt>
            <dd>{selectedLease.apartment.floor.building.name}</dd>
          </div>
          <div>
            <dt>{$locale.invoices.floor}</dt>
            <dd>{selectedLease.apartment.floor.name || selectedLease.apartment.floor.floorNumber}</dd>
          </div>
          <div>
            <dt>{$locale.invoices.apartment}</dt>
            <dd>{selectedLease.apartment.apartmentNumber}</dd>
          </div>
          <div>
            <dt>{$locale.invoices.contractNumber}</dt>
            <dd>{selectedLease.contractNumber}</dd>
          </div>
          <div>
            <dt>{$locale.leases.currency}</dt>
            <dd>{selectedLease.currency}</dd>
          </div>
          <div>
            <dt>{$locale.invoices.monthlyRent}</dt>
            <dd class="amount-cell">{money$(selectedLease.monthlyRent, selectedLease.currency)}</dd>
          </div>
        </dl>
      </fieldset>

      <fieldset>
        <legend class="section-label">{$locale.invoices.details}</legend>

        <div class="row g-3">
          <div class="col-sm-6">
            <label class="form-label" for="quick-invoice-date">
              {$locale.invoices.invoiceDate}
            </label>
            <ShamsiDatePicker
              invalid={Boolean(invoiceFormErrors.invoiceDate)}
              id="quick-invoice-date"
              bind:value={invoiceForm.invoiceDate}
            />
            {#if invoiceFormErrors.invoiceDate}
              <div class="invalid-feedback">{invoiceFormErrors.invoiceDate}</div>
            {/if}
          </div>

          <div class="col-sm-6">
            <label class="form-label" for="quick-invoice-due-date">
              {$locale.invoices.dueDate}
            </label>
            <ShamsiDatePicker
              invalid={Boolean(invoiceFormErrors.dueDate)}
              id="quick-invoice-due-date"
              bind:value={invoiceForm.dueDate}
            />
            {#if invoiceFormErrors.dueDate}
              <div class="invalid-feedback">{invoiceFormErrors.dueDate}</div>
            {/if}
          </div>

          <div class="col-12">
            <label class="form-label" for="quick-invoice-notes">
              {$locale.invoices.notes}
            </label>
            <textarea
              class="form-control"
              id="quick-invoice-notes"
              rows="2"
              bind:value={invoiceForm.notes}
            ></textarea>
          </div>
        </div>
      </fieldset>

      <fieldset>
        <div class="items-heading">
          <legend class="section-label">{$locale.invoices.items}</legend>
          <div class="d-flex align-items-center gap-2">
            {#if utilityReadingsLoading}<span class="small text-secondary">{$locale.invoices.loadingUtilities}</span>{/if}
            <button class="btn btn-outline-primary btn-sm" type="button" on:click={addInvoiceItem}>
              <i class="bi bi-plus-lg" aria-hidden="true"></i>
              {$locale.invoices.addItem}
            </button>
          </div>
        </div>
        <div class="table-responsive">
          <table class="table quick-invoice-items-table">
            <thead>
              <tr>
                <th>{$locale.invoices.type}</th>
                <th>{$locale.invoices.itemDescription}</th>
                <th>{$locale.invoices.quantity}</th>
                <th>{$locale.invoices.unitPrice}</th>
                <th class="amount-cell">{$locale.invoices.amount}</th>
                <th><span class="visually-hidden">{$locale.invoices.removeItem}</span></th>
              </tr>
            </thead>

            <tbody>
              {#each invoiceForm.items as item, index (index)}
                <tr class:utility-item={Boolean(item.meterReadingId)}>
                  <td>
                    <select class="form-select" bind:value={item.type} disabled={Boolean(item.meterReadingId)}>
                      {#each INVOICE_ITEM_TYPES as type (type)}
                        <option value={type}>{invoiceTypeLabel(type)}</option>
                      {/each}
                    </select>
                  </td>
                  <td>
                    <input
                      class:is-invalid={invoiceFormErrors[`item-${index}-description`]}
                      class="form-control"
                      bind:value={item.description}
                      disabled={Boolean(item.meterReadingId)}
                    />
                    {#if invoiceFormErrors[`item-${index}-description`]}
                      <div class="invalid-feedback">{invoiceFormErrors[`item-${index}-description`]}</div>
                    {/if}
                  </td>
                  <td>
                    <input
                      class:is-invalid={invoiceFormErrors[`item-${index}-quantity`]}
                      class="form-control"
                      type="number"
                      min="0.001"
                      step="0.001"
                      bind:value={item.quantity}
                      disabled={Boolean(item.meterReadingId)}
                    />
                    {#if invoiceFormErrors[`item-${index}-quantity`]}
                      <div class="invalid-feedback">{invoiceFormErrors[`item-${index}-quantity`]}</div>
                    {/if}
                  </td>
                  <td>
                    <input
                      class:is-invalid={invoiceFormErrors[`item-${index}-unitPrice`]}
                      class="form-control"
                      type="number"
                      min="0"
                      step="0.01"
                      bind:value={item.unitPrice}
                      disabled={Boolean(item.meterReadingId)}
                    />
                    {#if invoiceFormErrors[`item-${index}-unitPrice`]}
                      <div class="invalid-feedback">{invoiceFormErrors[`item-${index}-unitPrice`]}</div>
                    {/if}
                  </td>
                  <td class="amount-cell">{money$(invoiceItemAmount(item))}</td>
                  <td>
                    <button
                      class="quick-remove-item"
                      type="button"
                      on:click={() => removeInvoiceItem(index)}
                      disabled={invoiceForm.items.length === 1}
                      aria-label={$locale.invoices.removeItem}
                    >
                      <i class="bi bi-trash3" aria-hidden="true"></i>
                    </button>
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>

        <div class="invoice-total-preview">
          <span>{$locale.invoices.subtotal}</span>
          <strong>{money$(invoicePreviewTotal)}</strong>
          <span>{$locale.invoices.total}</span>
          <strong>{money$(invoicePreviewTotal)}</strong>
        </div>
      </fieldset>
    </form>
  {/if}

  <div slot="footer">
    <button class="btn btn-light" type="button" on:click={() => closeInvoiceModal()} disabled={invoiceSaving}>
      {$locale.invoices.cancel}
    </button>
    <button class="btn btn-primary" type="submit" form="quick-invoice-form" disabled={invoiceSaving}>
      {invoiceSaving ? $locale.invoices.loading : $locale.invoices.saveInvoice}
    </button>
  </div>
</Modal>

<style>
  /* ==========================================================================
     Dashboard
     White cards on the sunken page, one accent for money, semantic tokens for
     status. Every figure is set in the data face with tabular numerals, so the
     numbers line up column to column the way they do in the tables.
     ========================================================================== */

  .dash {
    display: flex;
    flex-direction: column;

    gap: var(--space-4, 1rem);
  }

  .dash-alert {
    display: flex;
    align-items: center;

    gap: 0.5rem;

    margin: 0;
  }

  /* --- KPI strip ----------------------------------------------------------
     One band divided by hairlines rather than a row of floating cards: the
     figures are a single reading, so they should not look like five widgets. */

  .band-kpi {
    display: grid;
    grid-template-columns: repeat(5, minmax(0, 1fr));

    overflow: hidden;

    border: 1px solid var(--border);
    border-radius: 0.75rem;

    background: var(--surface);
  }

  .kpi {
    min-inline-size: 0;

    padding: 0.85rem var(--space-4, 1rem);

    border-inline-start: 1px solid var(--border);
  }

  .kpi:first-child {
    border-inline-start: 0;
  }

  .kpi-label {
    display: flex;
    align-items: center;

    gap: 0.4rem;

    margin: 0;

    color: var(--text-muted);

    font-size: var(--text-xs);
    font-weight: var(--weight-bold);
  }

  .kpi-label i {
    color: var(--accent-text);
  }

  .kpi-value {
    margin: 0.4rem 0 0;

    color: var(--text-strong);

    font-family: var(--font-data);
    font-size: 1.3rem;
    font-weight: var(--weight-heavy);
    letter-spacing: -0.03em;
    font-variant-numeric: tabular-nums;
  }

  .kpi-hint {
    margin: 0.25rem 0 0;

    overflow: hidden;

    font-size: var(--text-xs);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .kpi-hint.tone-muted,
  .kpi-hint.tone-flat {
    color: var(--text-muted);
  }

  .kpi-hint.tone-up {
    color: var(--success);
  }

  .kpi-hint.tone-down {
    color: var(--danger);
  }

  /* --- Shared card -------------------------------------------------------- */

  .band-grid {
    display: grid;
    grid-template-columns: minmax(0, 1.85fr) minmax(0, 1fr);

    gap: var(--space-4, 1rem);
  }

  .band-grid-three {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .card {
    min-inline-size: 0;

    display: flex;
    flex-direction: column;

    padding: var(--space-4, 1rem);

    border: 1px solid var(--border);
    border-radius: 0.75rem;

    background: var(--surface);
  }

  .card-head {
    display: flex;
    align-items: start;
    justify-content: space-between;

    gap: var(--space-3, 0.75rem);

    margin-bottom: 0.9rem;
  }

  .card-head-copy {
    min-inline-size: 0;
  }

  .card-head h3 {
    display: flex;
    align-items: center;

    gap: 0.4rem;

    margin: 0;

    color: var(--text-strong);

    font-size: var(--text-lg);
    font-weight: var(--weight-heavy);
  }

  .card-head p {
    margin: 0.2rem 0 0;

    color: var(--text-muted);

    font-size: var(--text-xs);
  }

  .card-icon {
    font-size: 0.95em;
  }

  .card-icon-danger {
    color: var(--danger);
  }

  .card-icon-warning {
    color: var(--warning);
  }

  .card-icon-success {
    color: var(--success);
  }

  .card-link {
    flex: 0 0 auto;

    display: inline-flex;
    align-items: center;

    gap: 0.3rem;

    color: var(--accent-text);

    font-size: var(--text-xs);
    font-weight: var(--weight-bold);
    text-decoration: none;
  }

  .card-link:hover {
    text-decoration: underline;
  }

  .card-empty {
    margin: 0;

    padding: 1.1rem 0;

    color: var(--text-muted);

    font-size: var(--text-sm);
    text-align: center;
  }

  .card-empty p {
    margin: 0;
  }

  .card-cta {
    margin-top: 0.75rem;
  }

  .band-title {
    margin: 0.35rem 0 -0.35rem;

    color: var(--text-muted);

    font-size: var(--text-xs);
    font-weight: var(--weight-heavy);
    letter-spacing: var(--tracking-wide);
  }

  /* --- Collections figure -------------------------------------------------
     Pale column = billed for the month; solid cap = collected; the pale sliver
     left at the top is money still owed. */

  .card-chart {
    --chart-plot: 10.5rem;
  }

  .share {
    flex: 0 0 9.5rem;

    text-align: end;
  }

  .share-value {
    margin: 0 !important;

    color: var(--text-strong) !important;

    font-family: var(--font-data);
    font-size: 1.5rem !important;
    font-weight: var(--weight-heavy);
    letter-spacing: -0.04em;
    line-height: 1.1;
  }

  .share-label {
    margin: 0.15rem 0 0.4rem !important;
  }

  .share-track {
    block-size: 0.28rem;

    overflow: hidden;

    border-radius: 999px;

    background: var(--grey-200);
  }

  .share-track span {
    display: block;

    block-size: 100%;

    background: var(--accent);
  }

  .axis-max {
    margin: 0 0 -0.35rem;

    color: var(--text-muted);

    font-family: var(--font-data);
    font-size: var(--text-xs);
  }

  .chart {
    display: grid;
    grid-template-columns: repeat(var(--cols, 6), minmax(0, 1fr));

    gap: 0.5rem;

    margin: 0.6rem 0 0;
    padding: 0;

    list-style: none;
  }

  .chart-col {
    display: flex;
    flex-direction: column;
    justify-content: flex-end;

    gap: 0.35rem;

    block-size: calc(var(--chart-plot) + 1.2rem);
  }

  .chart-track {
    display: flex;
    align-items: flex-end;

    block-size: calc(var(--chart-plot) * var(--h, 0));

    min-block-size: 0.12rem;

    border-radius: 0.16rem;

    background: var(--accent-tint);

    transform-origin: bottom;

    animation: column-grow 520ms cubic-bezier(0.22, 0.7, 0.2, 1) backwards;
    animation-delay: calc(var(--i, 0) * 55ms);
  }

  .chart-track.is-empty {
    background: var(--grey-200);
  }

  .chart-cap {
    inline-size: 100%;

    border-radius: 0.16rem;

    background: var(--accent);
  }

  .chart-month {
    color: var(--text-muted);

    font-family: var(--font-data);
    font-size: var(--text-xs);
  }

  .chart-col.is-current .chart-month {
    color: var(--text-strong);

    font-weight: var(--weight-heavy);
  }

  @keyframes column-grow {
    from {
      transform: scaleY(0);
      opacity: 0.4;
    }

    to {
      transform: scaleY(1);
      opacity: 1;
    }
  }

  .chart-legend {
    display: flex;
    flex-wrap: wrap;

    gap: 0.35rem 1.25rem;

    margin: 1rem 0 0;
    padding: 0.7rem 0 0;

    border-top: 1px solid var(--border);

    list-style: none;
  }

  .chart-legend li {
    display: inline-flex;
    align-items: center;

    gap: 0.35rem;

    color: var(--text-muted);

    font-size: var(--text-xs);
  }

  .chart-legend b {
    color: var(--text-strong);

    font-family: var(--font-data);
    font-variant-numeric: tabular-nums;
  }

  .swatch {
    inline-size: 0.6rem;
    block-size: 0.6rem;

    flex: 0 0 0.6rem;

    border-radius: 0.16rem;
  }

  .swatch-billed {
    background: var(--accent-tint);
  }

  .swatch-collected {
    background: var(--accent);
  }

  .swatch-gap {
    background: var(--grey-200);

    border: 1px solid var(--border-strong);
  }

  /* --- Apartment mix ------------------------------------------------------ */

  .mix-total {
    flex: 0 0 auto;

    margin: 0 !important;

    color: var(--text-strong) !important;

    font-family: var(--font-data);
    font-size: var(--text-sm) !important;
    font-weight: var(--weight-bold);
  }

  .mix-bar {
    display: flex;

    gap: 2px;

    block-size: 0.55rem;

    overflow: hidden;

    border-radius: 999px;

    background: var(--grey-200);
  }

  .mix-bar .seg {
    block-size: 100%;
  }

  /* Fills whatever height the row ends up at, so the five statuses sit level
     with the taller chart card instead of bunching at the top. */
  .mix-legend {
    flex: 1;

    display: flex;
    flex-direction: column;
    justify-content: space-between;

    gap: 0.5rem;

    margin: 1rem 0 0;
    padding: 0;

    list-style: none;
  }

  .mix-legend li {
    display: grid;
    grid-template-columns: 0.6rem minmax(0, 1fr) auto auto;

    align-items: center;

    gap: 0.5rem;

    color: var(--text-secondary);

    font-size: var(--text-sm);
  }

  .mix-legend li.is-empty {
    color: var(--text-disabled);
  }

  .mix-count,
  .mix-share {
    font-family: var(--font-data);
    font-variant-numeric: tabular-nums;
  }

  .mix-count {
    color: var(--text-strong);

    font-weight: var(--weight-bold);
  }

  .mix-legend li.is-empty .mix-count {
    color: inherit;
  }

  .mix-share {
    min-inline-size: 2.4rem;

    color: var(--text-muted);
    text-align: end;
  }

  /* Status colours: the same semantic tokens the badges and checkboxes use. */
  .tone-occupied {
    background: var(--accent);
  }

  .tone-available {
    background: var(--success);
  }

  .tone-reserved {
    background: var(--warning);
  }

  .tone-maintenance {
    background: var(--info);
  }

  .tone-inactive {
    background: var(--neutral-border);
  }

  /* --- Action rows -------------------------------------------------------- */

  .rows {
    display: flex;
    flex-direction: column;

    gap: 0.15rem;

    margin: 0;
    padding: 0;

    list-style: none;
  }

  .row {
    display: flex;
    align-items: center;
    justify-content: space-between;

    gap: var(--space-3, 0.75rem);

    padding: 0.55rem 0;

    border-top: 1px solid var(--grey-200);
  }

  .row:first-child {
    border-top: 0;
  }

  .row-main {
    min-inline-size: 0;
  }

  .row-title {
    display: block;

    overflow: hidden;

    color: var(--text-strong);

    font-size: var(--text-sm);
    font-weight: var(--weight-bold);
    text-decoration: none;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .row-title:hover {
    color: var(--accent-text);
    text-decoration: underline;
  }

  .row-meta {
    margin: 0.1rem 0 0;

    overflow: hidden;

    color: var(--text-muted);

    font-size: var(--text-xs);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .row-side {
    flex: 0 0 auto;

    text-align: end;
  }

  .row-amount {
    margin: 0 0 0.2rem;

    color: var(--text-strong);

    font-family: var(--font-data);
    font-size: var(--text-sm);
    font-weight: var(--weight-bold);
    font-variant-numeric: tabular-nums;
  }

  .row-amount.tone-in {
    color: var(--success);
  }

  .row-when {
    margin: 0;

    color: var(--text-muted);

    font-family: var(--font-data);
    font-size: var(--text-xs);
  }

  /* --- Active tenancies --------------------------------------------------- */

  .card-table {
    padding-bottom: 0;
  }

  .tenant-name,
  .contract-number {
    color: var(--text-strong);

    font-weight: var(--weight-bold);
  }

  .contract-number,
  .amount-cell {
    font-family: var(--font-data);
    font-variant-numeric: tabular-nums;
  }

  .cell-sub {
    display: block;

    color: var(--text-muted);

    font-size: var(--text-xs);
  }

  .actions-cell {
    text-align: end;
  }

  .invoice-action {
    min-block-size: var(--button-height-sm);

    font-size: var(--text-sm);
  }

  /* --- Dialog internals --------------------------------------------------- */

  .section-label {
    margin: 0 0 0.55rem;

    color: var(--text-muted);

    font-size: var(--text-xs);
    font-weight: var(--weight-heavy);
    letter-spacing: var(--tracking-wide);
  }

  .tenancy-context {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 0.75rem 1rem;

    margin: 0;
    padding: 0.85rem;

    border: 1px solid var(--border);
    border-radius: var(--control-radius);

    background: var(--surface-muted);
  }

  .tenancy-context div {
    min-inline-size: 0;
  }

  .tenancy-context dt {
    color: var(--text-muted);

    font-size: var(--text-xs);
    font-weight: var(--weight-heavy);
  }

  .tenancy-context dd {
    margin: 0.18rem 0 0;

    overflow: hidden;

    color: var(--text-strong);

    font-size: var(--text-sm);
    font-weight: var(--weight-bold);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .items-heading {
    display: flex;
    align-items: center;
    justify-content: space-between;

    gap: 1rem;

    margin-bottom: 0.5rem;
  }

  .items-heading .section-label {
    margin: 0;
  }

  .quick-invoice-items-table {
    min-inline-size: 50rem;
  }

  .quick-invoice-items-table .form-control,
  .quick-invoice-items-table .form-select {
    min-inline-size: 7rem;
  }

  .quick-remove-item {
    width: var(--control-height-sm);
    height: var(--control-height-sm);

    padding: 0;

    border: 1px solid var(--danger-border);
    border-radius: var(--control-radius);

    color: var(--danger);
    background: var(--surface);
  }

  .quick-remove-item:hover:not(:disabled) {
    background: var(--danger-soft);
  }

  .quick-remove-item:disabled {
    cursor: not-allowed;
    opacity: 0.45;
  }

  .invoice-total-preview {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    flex-wrap: wrap;

    gap: 0.5rem 1rem;

    margin-top: 1rem;

    color: var(--text-muted);

    font-size: var(--text-sm);
  }

  .invoice-total-preview strong {
    color: var(--text-strong);

    font-family: var(--font-data);
    font-variant-numeric: tabular-nums;
  }

  /* --- Placeholders ------------------------------------------------------- */

  .skeleton-value {
    display: inline-block;

    inline-size: 4.5rem;
    block-size: 1.9rem;

    border-radius: 0.35rem;

    background: var(--grey-200);
  }

  .skeleton-value--sm {
    inline-size: 3.5rem;
    block-size: 1.05rem;
  }

  /* --- Responsive --------------------------------------------------------- */

  @media (max-width: 1200px) {
    .band-grid-three {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  /* Five figures stop fitting once the content column drops under ~1080px, so
     the strip steps down to three and then two, moving the hairlines with it. */
  @media (max-width: 1319px) {
    .band-kpi {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }

    .kpi {
      border-block-start: 0;
    }

    .kpi:nth-child(3n + 1) {
      border-inline-start: 0;
    }

    .kpi:nth-child(n + 4) {
      border-block-start: 1px solid var(--border);
    }
  }

  @media (max-width: 991px) {
    .band-kpi {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .kpi {
      border-block-start: 0;
    }

    .kpi:nth-child(n) {
      border-inline-start: 1px solid var(--border);
    }

    .kpi:nth-child(odd) {
      border-inline-start: 0;
    }

    .kpi:nth-child(n + 3) {
      border-block-start: 1px solid var(--border);
    }

    .band-grid {
      grid-template-columns: minmax(0, 1fr);
    }
  }

  @media (max-width: 700px) {
    .band-grid-three {
      grid-template-columns: minmax(0, 1fr);
    }

    .card-chart {
      --chart-plot: 6.5rem;
    }

    .share {
      flex: 0 0 auto;
    }

    .tenancy-context {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  @media (max-width: 560px) {
    .band-kpi {
      grid-template-columns: minmax(0, 1fr);
    }

    .kpi,
    .kpi:nth-child(n) {
      border-inline-start: 0;
    }

    .kpi:nth-child(n + 2) {
      border-block-start: 1px solid var(--border);
    }

    .tenancy-context {
      grid-template-columns: minmax(0, 1fr);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .chart-track {
      animation: none;
    }
  }
</style>
