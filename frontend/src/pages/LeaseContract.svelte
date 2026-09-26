<script>
  /**
   * One lease's contract, on an A4 sheet, drawn as the ruled form the office
   * already works with.
   *
   * Everything the document says about the tenancy is read from the lease's own
   * records — the tenant, the apartment, the floor, the building and the terms —
   * so the only way to change what a contract shows is to change the record it
   * came from. The wording around it (letterhead, lessor, title, clauses) comes
   * from Settings › Lease Contract, which is why the address printed as the
   * *office* address is a different field from the building's own address.
   *
   * The figures arrive already written by the server — the same formatter the
   * clause text was resolved with — and are then set in the digits of the
   * language the contract is written in, so a Dari contract prints ۱٫۲۰۰٫۰۰ not
   * 1,200.00.
   *
   * Nothing is rendered as HTML: every value, clause and note is drawn as text,
   * so a placeholder can never become markup.
   *
   * The stylesheet is not in this file. `contract-document.css` is owned by the
   * API's contract module and is also what the PDF is rendered with, so the
   * preview and the download are one design rather than two that agree today.
   */
  import { onMount } from 'svelte';
  import { push } from 'svelte-spa-router';

  import { dictionaryFor, locale } from '../i18n';
  import StatusBadge from '../components/ui/StatusBadge.svelte';
  import { toDocumentDigits } from '../utils/formatters';
  import { mediaUrl } from '../utils/media';
  import { getLeaseContract, renderContractPdf } from '../services/leaseContracts';

  export let params = {};

  const RTL_LANGUAGES = ['fa', 'ps'];

  let loading = true;
  let errorMessage = '';
  let contract = null;
  let language = 'fa';
  let preparingPdf = false;
  let downloadingPdf = false;
  let pdfError = '';

  /* The pane the paper is shown in, and how much of it the paper takes. */
  let stageElement = null;
  let sheetZoom = 1;

  $: direction = RTL_LANGUAGES.includes(language) ? 'rtl' : 'ltr';

  /*
   * The document speaks for itself: its headings, rows and field labels are read
   * from the dictionary of the language the *contract* is printed in, not from
   * the interface's — a Dari contract is a Dari document even when the person
   * who opened it reads the console in English. The chrome above the sheet keeps
   * using `$locale`.
   */
  $: doc = dictionaryFor(language);
  $: digits = (value) => toDocumentDigits(value, language);

  $: title = contract?.title?.[language] || contract?.title?.en || '';
  $: contractNumber = contract?.lease?.contractNumberLabel || '';
  $: leaseStatusLabel = contract
    ? digits(doc.tenantProfile.leaseStatuses[contract.lease.status] || contract.lease.status)
    : '';
  $: leaseStatusTone = ({
    ACTIVE: 'success',
    DRAFT: 'neutral',
    EXPIRED: 'warning',
    TERMINATED: 'danger',
    CANCELLED: 'danger',
  })[contract?.lease?.status] || 'neutral';
  $: propertyLabel = contract
    ? [contract.building?.name, contract.apartment?.apartmentNumber || contract.apartment?.name]
        .filter(has)
        .join(' · ')
    : '';

  /** A field is only ever drawn when the record actually holds a value. */
  const has = (value) => value !== null && value !== undefined && String(value).trim() !== '';

  /*
   * A4 in CSS pixels. The sheet is laid out at exactly this width, because a
   * sheet *squeezed* to the console's width stops being the page the office
   * signs: it loses width, keeps its 297mm of height, and every line then breaks
   * somewhere other than on paper. The preview instead scales the finished sheet
   * to the pane, so the layout is always the printed page's and there is no room
   * left over beside it.
   *
   * The pane's width is not a value the browser announces: the shell's own
   * sidebar can change it without a window resize, and a `ResizeObserver` on the
   * pane did not fire in every environment this page is opened in. So the fit
   * measures — every 100ms while the pane is settling, then once a second for as
   * long as the page is open — and writes only when the measurement changed.
   */
  const A4_WIDTH = 210 * (96 / 25.4);

  function fitSheetToPane() {
    if (!stageElement) return;

    const style = getComputedStyle(stageElement);
    const available = stageElement.clientWidth
      - parseFloat(style.paddingLeft || '0')
      - parseFloat(style.paddingRight || '0');

    if (!(available > 0)) return;

    /* Never a zero scale and never absurd: a pane mid-layout can measure a few
       pixels, and a preview magnified past 3× stops reading as paper. */
    const next = Math.min(3, Math.max(0.2, available / A4_WIDTH));
    if (Math.abs(next - sheetZoom) > 0.001) sheetZoom = next;
  }

  onMount(() => {
    load();

    let settled = 0;
    let timer = 0;

    const watch = () => {
      const before = sheetZoom;
      fitSheetToPane();
      settled = sheetZoom === before ? settled + 1 : 0;
      timer = setTimeout(watch, settled > 6 ? 1000 : 100);
    };

    watch();
    window.addEventListener('resize', fitSheetToPane);

    return () => {
      clearTimeout(timer);
      window.removeEventListener('resize', fitSheetToPane);
    };
  });

  async function load() {
    loading = true;
    errorMessage = '';
    pdfError = '';
    try {
      const response = await getLeaseContract(params.leaseId);
      contract = response.contract;
      language = contract?.language || 'fa';
    } catch (error) {
      if (error.status === 401) return;
      errorMessage = error?.message || $locale.leaseContract.contractLoadError;
    } finally {
      loading = false;
    }
  }

  function printContract() {
    window.print();
  }

  /**
   * The wording the PDF prints around the data, in the contract's language.
   *
   * The API owns no translation table: the document is drawn from the same
   * dictionaries the interface uses, and the browser — which already has them —
   * sends the words along with the request. They name fields; they never decide
   * what a field holds, and the server escapes every one of them.
   */
  function documentLabels() {
    const words = doc;
    return {
      lessor: words.leaseContract.lessor,
      tenant: words.leaseContract.tenant,
      lessorPhoto: words.leaseContract.lessorPhoto,
      tenantPhoto: words.leaseContract.tenantPhoto,
      logo: words.leaseContract.logo,
      officeAddress: words.leaseContract.officeAddress,
      contractNumber: words.leases.contractNumber,
      issuedOn: words.leaseContract.issuedOn,
      notes: words.leases.notes,
      signatureName: words.leaseContract.signatureName,
      lessorSignature: words.leaseContract.lessor,
      tenantSignature: words.leaseContract.tenant,
      witnessSignature: words.leaseContract.witnessSignatureLabel,
      stamp: words.leaseContract.stamp,

      /* The document is a form of sections, and each section is captioned in
         the language the contract is printed in. */
      premisesTitle: words.leaseContract.premisesTitle,
      premisesHint: words.leaseContract.premisesHint,
      addressSeparator: words.leaseContract.addressSeparator,
      statementTitle: words.leaseContract.statementTitle,
      rentScheduleTitle: words.leaseContract.rentScheduleTitle,
      utilitiesTitle: words.leaseContract.utilitiesTitle,
      termTitle: words.leaseContract.termTitle,
      maintenanceTitle: words.leaseContract.maintenanceTitle,
      signaturesTitle: words.leaseContract.signaturesTitle,

      leaseStartDate: words.leaseContract.leaseStartDate,
      startDate: words.leases.startDate,
      endDate: words.leases.endDate,
      period: words.leases.period,
      months: words.leaseContract.months,
      securityDeposit: words.leases.securityDeposit,

      building: words.leaseContract.building,
      buildingAddress: words.leaseContract.buildingAddress,
      floor: words.leaseContract.floor,
      apartmentNumber: words.leaseContract.apartmentNumber,
      area: words.leaseContract.area,
      bedrooms: words.leaseContract.bedrooms,
      bathrooms: words.leaseContract.bathrooms,

      month: words.leaseContract.month,
      rentAmount: words.leaseContract.rentAmount,
      dueDate: words.leaseContract.dueDate,
      paymentStatus: words.leaseContract.paymentStatus,
      service: words.leaseContract.service,
      paidBy: words.leaseContract.paidBy,
      serviceFee: words.leases.serviceFee,
      utilities: words.tenantProfile.utilities,
      invoiceStatuses: words.tenantProfile.invoiceStatuses,
    };
  }

  /**
   * Preview opens the rendered file in a tab — the browser's own PDF viewer,
   * which is the only honest preview of a printed page. The download saves the
   * same bytes, through a blob URL so a failure is a message here rather than a
   * blank browser error page.
   */
  async function openPdf() {
    preparingPdf = true;
    pdfError = '';
    try {
      const { blob } = await renderContractPdf(params.leaseId, {
        language,
        labels: documentLabels(),
        disposition: 'inline',
      });

      const url = URL.createObjectURL(blob);
      window.open(url, '_blank', 'noopener');
      setTimeout(() => URL.revokeObjectURL(url), 120_000);
    } catch (error) {
      if (error.status !== 401) pdfError = error?.message || $locale.leaseContract.pdfError;
    } finally {
      preparingPdf = false;
    }
  }

  async function downloadPdf() {
    downloadingPdf = true;
    pdfError = '';
    try {
      const { blob, filename } = await renderContractPdf(params.leaseId, {
        language,
        labels: documentLabels(),
        disposition: 'attachment',
      });

      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename || 'contract.pdf';
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (error) {
      if (error.status !== 401) pdfError = error?.message || $locale.leaseContract.pdfError;
    } finally {
      downloadingPdf = false;
    }
  }

  /** Stored template sections arrive already resolved against this lease. */
  $: sectionText = (section) => contract
    ? digits(contract.body?.[section]?.[language] || contract.body?.[section]?.en || '')
    : '';
  $: sectionTitle = (section) => contract
    ? contract.body?.[section]?.[language] || contract.body?.[section]?.en || ''
    : '';

  /*
   * The document, as the sheet the PDF is rendered from: the office that issues
   * the contract (or the workspace's own name when the settings page has not
   * been given one), who the parties are, and the terms — all of it drawn by
   * `contract-document.css`, which the PDF renderer reads too.
   */
  $: heroName = contract?.office?.name || contract?.organization?.name || '';

  /* The contract's number and issue date, in the hero band's own corner. The
     date is written by the server, so the sheet and the PDF cannot disagree. */
  $: heroMeta = contract
    ? [
        { label: doc.leases.contractNumber, value: digits(contractNumber) },
        { label: doc.leaseContract.issuedOn, value: digits(contract.generatedAtLabel) },
      ].filter((item) => has(item.value))
    : [];

  /* Who lets, who rents, and the day the tenancy begins. */
  $: parties = contract
    ? [
        { label: doc.leaseContract.lessor, value: contract.lessor.name || heroName },
        { label: doc.leaseContract.tenant, value: contract.tenant.fullName },
        { label: doc.leaseContract.leaseStartDate, value: digits(contract.lease.startDateLabel), pill: true },
      ].filter((party) => has(party.value))
    : [];

  /*
   * The unit's address as the office's form writes one: the unit and the floor
   * it is on, then the building and the street that building stands on, joined
   * the way the contract's own language joins a list. It is one value rather
   * than four, because a reader is being told one thing — where to go.
   */
  $: unitAddress = contract
    ? [
        has(contract.apartment.apartmentNumber)
          ? `${doc.leaseContract.apartmentNumber} ${digits(contract.apartment.apartmentNumber)}`.trim()
          : '',
        has(contract.floor.floorNumber)
          ? `${doc.leaseContract.floor} ${digits(contract.floor.floorNumber)}`.trim()
          : '',
        digits(contract.building.name),
        digits(contract.building.address),
      ]
        .filter(has)
        .join(`${doc.leaseContract.addressSeparator ?? ''} `)
    : '';

  /* What the unit is: the facts the office's own form states about it. */
  $: premisesFacts = contract
    ? [
        [doc.leaseContract.buildingAddress, unitAddress],
        [doc.leaseContract.area, digits(contract.apartment.areaLabel)],
        [doc.leaseContract.bedrooms, digits(contract.apartment.bedrooms)],
        [doc.leaseContract.bathrooms, digits(contract.apartment.bathrooms)],
      ].filter(([, value]) => has(value))
    : [];

  /* How long the term runs, and what is held against it. */
  $: termLines = contract
    ? [
        [doc.leases.startDate, digits(contract.lease.startDateLabel)],
        [doc.leases.endDate, digits(contract.lease.endDateLabel)],
        [
          doc.leases.period,
          has(contract.lease.durationMonths)
            ? `${digits(contract.lease.durationMonths)} ${doc.leaseContract.months}`
            : '',
        ],
        [doc.leases.securityDeposit, digits(contract.lease.securityDepositLabel)],
      ].filter(([, value]) => has(value))
    : [];

  /* The months of the term, and the charges the unit carries. Both are built by
     the server from this lease's own records. */
  $: scheduleRows = contract?.schedule || [];
  $: chargeRows = contract?.utilities || [];

  /*
   * How a billed month stands. The tones are the statuses' own, and match the
   * ones the PDF renderer draws for the same row.
   */
  const STATUS_TONES = {
    PAID: 'contract-status--paid',
    UNPAID: 'contract-status--due',
    PARTIALLY_PAID: 'contract-status--due',
    OVERDUE: 'contract-status--late',
    CANCELLED: 'contract-status--muted',
  };

  /* A month's status column is drawn only when this lease has been billed in at
     least one month; the months with no invoice show an em dash. */
  $: billedMonths = scheduleRows.some((row) => has(row.status));

  $: statusWord = (status) => doc.tenantProfile.invoiceStatuses[status] || '';
  $: statusTone = (status) => STATUS_TONES[status] || 'contract-status--muted';

  /* The words a charge is billed under, in the contract's own language. */
  $: chargeName = (key) => (key === 'SERVICE_FEE'
    ? doc.leases.serviceFee
    : doc.tenantProfile.utilities[key] || '');

  /* The foot of the document: how to reach the office, in the office's order. */
  $: officeContact = contract
    ? [contract.office?.phone, contract.office?.email, contract.office?.address].filter(has)
    : [];

  /** Notes are one line each. Lease-specific notes continue the same list. */
  $: documentNotes = contract
    ? [sectionText('notes'), digits(contract.lease.notes)]
        .flatMap((text) => String(text || '').split('\n'))
        .map((note) => note.trim())
        .filter(Boolean)
    : [];
</script>

<svelte:head><title>{title || $locale.leaseContract.contractTitle} | {$locale.common.apartmentPro}</title></svelte:head>

<div class="contract-page">
  <!-- The application chrome is intentionally separate from the legal document
       below: it disappears completely when the contract is printed. -->
  <button class="contract-back no-print" type="button" on:click={() => push('/leases')}>
    <i class="bi bi-arrow-left" aria-hidden="true"></i>
    {$locale.leaseContract.backToLeases}
  </button>

  <header class="contract-page-header no-print">
    <div class="contract-identity">
      <span class="contract-identity-icon" aria-hidden="true">
        <i class="bi bi-file-earmark-text"></i>
      </span>

      <div class="contract-heading">
        <div class="contract-title-row">
          <h1>{$locale.leaseContract.contractTitle}</h1>
          {#if contract}<StatusBadge label={leaseStatusLabel} tone={leaseStatusTone} />{/if}
        </div>

        {#if contract}
          <p class="contract-summary">
            <strong>{digits(contractNumber)}</strong>
            <span aria-hidden="true">·</span>
            <span>{contract.tenant.fullName}</span>
            {#if propertyLabel}
              <span aria-hidden="true">·</span>
              <span>{propertyLabel}</span>
            {/if}
          </p>
        {:else}
          <p class="contract-summary">{$locale.leaseContract.loadingContract}</p>
        {/if}
      </div>
    </div>

    <div class="contract-primary-actions">
      <button class="btn btn-outline-secondary" type="button" on:click={openPdf} disabled={!contract || preparingPdf}>
        {#if preparingPdf}
          <span class="spinner-border spinner-border-sm" aria-hidden="true"></span>
        {:else}
          <i class="bi bi-eye" aria-hidden="true"></i>
        {/if}
        {preparingPdf ? $locale.leaseContract.preparingPdf : $locale.leaseContract.previewPdf}
      </button>
      <button class="btn btn-primary" type="button" on:click={downloadPdf} disabled={!contract || downloadingPdf}>
        {#if downloadingPdf}
          <span class="spinner-border spinner-border-sm" aria-hidden="true"></span>
        {:else}
          <i class="bi bi-download" aria-hidden="true"></i>
        {/if}
        {downloadingPdf ? $locale.leaseContract.preparingPdf : $locale.leaseContract.downloadPdf}
      </button>
    </div>
  </header>

  {#if pdfError}
    <div class="contract-alert contract-alert--danger no-print" role="alert">
      <i class="bi bi-exclamation-circle" aria-hidden="true"></i>
      <span>{pdfError}</span>
    </div>
  {/if}

  {#if errorMessage}
    <div class="contract-state no-print" role="alert">
      <span class="contract-state-icon contract-state-icon--danger" aria-hidden="true">
        <i class="bi bi-exclamation-triangle"></i>
      </span>
      <h2>{$locale.leaseContract.contractLoadError}</h2>
      <p>{errorMessage}</p>
      <div class="contract-state-actions">
        <button class="btn btn-light" type="button" on:click={() => push('/leases')}>
          {$locale.leaseContract.backToLeases}
        </button>
        <button class="btn btn-primary" type="button" on:click={load}>{$locale.common.retry}</button>
      </div>
    </div>
  {:else if loading}
    <div class="contract-state no-print" role="status" aria-live="polite">
      <div class="spinner-border text-primary" aria-hidden="true"></div>
      <p>{$locale.leaseContract.loadingContract}</p>
    </div>
  {:else if contract}
    <div class="contract-workspace">
      <aside class="contract-controls no-print" aria-label={$locale.leaseContract.contractTitle}>
        <section class="control-section">
          <div class="control-section-heading">
            <i class="bi bi-translate" aria-hidden="true"></i>
            <h2>{$locale.leaseContract.contractLanguage}</h2>
          </div>

          <div class="contract-language" role="group" aria-label={$locale.leaseContract.contractLanguage}>
            {#each contract.languages || ['en', 'fa', 'ps'] as code (code)}
              <button
                class="language-chip"
                class:is-active={language === code}
                type="button"
                aria-pressed={language === code}
                on:click={() => { language = code; pdfError = ''; }}
              >
                {$locale.languageNames[code] || code}
              </button>
            {/each}
          </div>
        </section>

        <div class="control-divider"></div>

        <div class="contract-secondary-actions">
          <button class="secondary-action" type="button" on:click={printContract}>
            <i class="bi bi-printer" aria-hidden="true"></i>
            <span>{$locale.leaseContract.print}</span>
            <i class="bi bi-chevron-right action-chevron" aria-hidden="true"></i>
          </button>
          <button class="secondary-action" type="button" on:click={() => push('/settings/lease-contract')}>
            <i class="bi bi-sliders" aria-hidden="true"></i>
            <span>{$locale.leaseContract.editSettings}</span>
            <i class="bi bi-chevron-right action-chevron" aria-hidden="true"></i>
          </button>
        </div>
      </aside>

      <section class="contract-preview">
        <!-- A placeholder that could not be filled in is shown before printing:
             what is left in the text is a token the reader would otherwise only
             notice once it was on paper. -->
        {#if contract.unknownPlaceholders.length > 0 || contract.missingPlaceholders.length > 0}
          <div class="contract-alert contract-alert--warning no-print" role="alert">
            <i class="bi bi-exclamation-triangle" aria-hidden="true"></i>
            <div>
              {#if contract.unknownPlaceholders.length > 0}
                <p>
                  {$locale.leaseContract.unknownPlaceholdersHint}
                  <strong>{contract.unknownPlaceholders.join(', ')}</strong>
                </p>
              {/if}
              {#if contract.missingPlaceholders.length > 0}
                <p>
                  {$locale.leaseContract.missingPlaceholdersHint}
                  <strong>{contract.missingPlaceholders.join(', ')}</strong>
                </p>
              {/if}
            </div>
          </div>
        {/if}

        <div class="contract-paper-stage" bind:this={stageElement}>
          <!-- `zoom` rather than `transform`: the sheet has to take room in the
               pane as the size it is drawn at, so the card ends where the paper
               ends and nothing is left beside it. Printing resets it to 1. -->
          <article class="contract-sheet contract-document" dir={direction} lang={language} style:zoom={sheetZoom}>
            <div class="contract-frame">
              <header class="contract-hero">
                <div class="contract-hero-copy">
                  <p class="contract-brand">
                    {#if contract.office?.logoUrl}
                      <img class="contract-brand-logo" src={mediaUrl(contract.office.logoUrl)} alt="" />
                    {:else}
                      <span class="contract-brand-mark" aria-hidden="true"></span>
                    {/if}
                    {#if heroName}
                      <span class="contract-brand-name">{heroName}</span>
                    {/if}
                  </p>
                  <h1 class="contract-title">{title}</h1>

                  {#if heroMeta.length > 0}
                    <div class="contract-hero-meta">
                      {#each heroMeta as item (item.label)}
                        <p class="contract-hero-item">
                          <span class="contract-hero-label">{item.label}</span>
                          <span class="contract-hero-value">{item.value}</span>
                        </p>
                      {/each}
                    </div>
                  {/if}
                </div>

                <div class="contract-hero-photo" aria-hidden="true">
                  <img src="/images/home/hero-tall.jpg" alt="" />
                </div>
              </header>

              {#if parties.length > 0}
                <section class="contract-parties">
                  {#each parties as party (party.label)}
                    <div class="contract-party">
                      <p class="contract-party-label">{party.label}</p>
                      <p class="contract-party-value" class:contract-pill={party.pill}>{party.value}</p>
                    </div>
                  {/each}
                </section>
              {/if}

              {#if premisesFacts.length > 0}
                <section class="contract-section">
                  <h2 class="contract-section-title">{doc.leaseContract.premisesTitle}</h2>
                  {#if doc.leaseContract.premisesHint}
                    <p class="contract-section-hint">{doc.leaseContract.premisesHint}</p>
                  {/if}

                  <div class="contract-premises">
                    <div class="contract-panel">
                      <dl class="contract-facts">
                        {#each premisesFacts as [label, value] (label)}
                          <div class="contract-fact">
                            <dt class="contract-fact-label">{label}:</dt>
                            <dd class="contract-fact-value">{value}</dd>
                          </div>
                        {/each}
                      </dl>
                    </div>

                    <div class="contract-premises-photo" aria-hidden="true">
                      <img src="/images/home/hero-tall.jpg" alt="" />
                    </div>
                  </div>
                </section>
              {/if}

              {#if has(sectionText('preamble'))}
                <section class="contract-section">
                  <h2 class="contract-section-title">{doc.leaseContract.statementTitle}</h2>
                  <p class="contract-prose">{sectionText('preamble')}</p>
                </section>
              {/if}

              {#if scheduleRows.length > 0}
                <section class="contract-section">
                  <h2 class="contract-section-title">{doc.leaseContract.rentScheduleTitle}</h2>
                  <table class="contract-table">
                    <thead>
                      <tr>
                        <th scope="col">{doc.leaseContract.month}</th>
                        <th scope="col">{doc.leaseContract.rentAmount}</th>
                        <th scope="col">{doc.leaseContract.dueDate}</th>
                        {#if billedMonths}
                          <th scope="col">{doc.leaseContract.paymentStatus}</th>
                        {/if}
                      </tr>
                    </thead>
                    <tbody>
                      {#each scheduleRows as row (row.key)}
                        <tr>
                          <td>{digits(row.month[language] || row.month.en)}</td>
                          <td class="contract-table-value">{digits(row.amountLabel)}</td>
                          <td class="contract-table-value">{digits(row.dueDateLabel)}</td>
                          {#if billedMonths}
                            <td>
                              {#if statusWord(row.status)}
                                <span class="contract-status {statusTone(row.status)}">{statusWord(row.status)}</span>
                              {:else}
                                <span class="contract-status contract-status--muted">—</span>
                              {/if}
                            </td>
                          {/if}
                        </tr>
                      {/each}
                    </tbody>
                  </table>
                </section>
              {/if}

              {#if chargeRows.length > 0}
                <section class="contract-section">
                  <h2 class="contract-section-title">{doc.leaseContract.utilitiesTitle}</h2>
                  <table class="contract-table">
                    <thead>
                      <tr>
                        <th scope="col">{doc.leaseContract.service}</th>
                        <th scope="col">{doc.leaseContract.paidBy}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {#each chargeRows as row (row.key)}
                        <tr>
                          <td>
                            {digits(chargeName(row.key))}
                            {#if has(row.detail)}<span class="contract-table-note">{digits(row.detail)}</span>{/if}
                          </td>
                          <td>{doc.leaseContract.tenant}</td>
                        </tr>
                      {/each}
                    </tbody>
                  </table>
                </section>
              {/if}

              {#if termLines.length > 0}
                <section class="contract-section">
                  <h2 class="contract-section-title">{doc.leaseContract.termTitle}</h2>
                  <div class="contract-panel">
                    {#each termLines as [label, value] (label)}
                      <p class="contract-line">
                        <span class="contract-line-label">{label}</span>
                        <span class="contract-line-value">{value}</span>
                      </p>
                    {/each}
                  </div>
                </section>
              {/if}

              {#if has(sectionText('inventory'))}
                <section class="contract-section">
                  <h2 class="contract-section-title">{doc.leaseContract.maintenanceTitle}</h2>
                  <p class="contract-prose">{sectionText('inventory')}</p>
                </section>
              {/if}

              {#if contract.clauses.length > 0}
                <section class="contract-section">
                  {#if has(sectionTitle('termsTitle'))}
                    <h2 class="contract-section-title">{sectionTitle('termsTitle')}</h2>
                  {/if}

                  <div class="contract-panel">
                    <ol class="contract-terms-list">
                      {#each contract.clauses as clause (clause.id)}
                        {@const clauseBody = digits(clause.body[language] || clause.body.en)}
                        {@const clauseHeading = clause.title[language] || clause.title.en}
                        <li class="contract-clause">
                          <span class="contract-clause-num" aria-hidden="true">{digits(clause.number)}</span>
                          <div class="contract-clause-text">
                            {#if clauseHeading}<h3 class="contract-clause-title">{clauseHeading}</h3>{/if}
                            <p class="contract-clause-body">{clauseBody}</p>
                          </div>
                        </li>
                      {/each}
                    </ol>
                  </div>
                </section>
              {/if}

              <section class="contract-section">
                <h2 class="contract-section-title">{doc.leaseContract.signaturesTitle}</h2>
                <div class="contract-signatures">
                  <div class="contract-signature">
                    <span class="contract-signature-rule" aria-hidden="true"></span>
                    <p class="contract-signature-role">{contract.signatureLabels.tenant || doc.leaseContract.tenant}</p>
                    <p class="contract-signature-name">{contract.tenant.fullName}</p>
                    <p class="contract-signature-date">{digits(contract.generatedAtLabel)}</p>
                  </div>

                  <div class="contract-signature">
                    <span class="contract-signature-rule" aria-hidden="true"></span>
                    <p class="contract-signature-role">{contract.signatureLabels.lessor || doc.leaseContract.lessor}</p>
                    <p class="contract-signature-name">{contract.lessor.name || contract.office.name || contract.organization.name}</p>
                    <p class="contract-signature-date">{digits(contract.generatedAtLabel)}</p>
                  </div>

                  <div class="contract-signature">
                    <span class="contract-signature-rule" aria-hidden="true"></span>
                    <p class="contract-signature-role">{contract.signatureLabels.witness || doc.leaseContract.witnessSignatureLabel}</p>
                    <p class="contract-signature-name">&nbsp;</p>
                    <p class="contract-signature-date">{digits(contract.generatedAtLabel)}</p>
                  </div>
                </div>
              </section>

              {#if documentNotes.length > 0}
                <section class="contract-section">
                  {#if has(sectionTitle('notesTitle'))}
                    <h2 class="contract-section-title">{sectionTitle('notesTitle')}</h2>
                  {/if}

                  <ol class="contract-notes-list">
                    {#each documentNotes as note, index (`${index}-${note}`)}
                      <li class="contract-note">
                        <span class="contract-note-num" aria-hidden="true">{digits(index + 1)}</span>
                        <p class="contract-note-body">{note}</p>
                      </li>
                    {/each}
                  </ol>
                </section>
              {/if}

              {#if officeContact.length > 0 || contract.footerText}
                <footer class="contract-foot">
                  {#each officeContact as item (item)}
                    <p class="contract-foot-item">{item}</p>
                  {/each}

                  {#if contract.footerText}
                    <p class="contract-foot-note">{contract.footerText}</p>
                  {/if}
                </footer>
              {/if}
            </div>
          </article>
        </div>
      </section>
    </div>
  {/if}
</div>

<style>
  /* Only the page around the sheet is styled here. The document itself is drawn
     by `contract-document.css`, shared with the PDF renderer. */
  /* The page takes the working area's whole width: this is a document preview,
     not a column of prose, and a paper narrower than the space around it reads
     as a page that failed to load rather than as a page. */
  .contract-page {
    display: flex;
    flex-direction: column;
    gap: var(--space-5);
    width: 100%;
    padding-block-end: var(--space-7);
  }

  .contract-back {
    display: inline-flex;
    align-items: center;
    align-self: flex-start;
    gap: var(--space-2);
    min-height: 2.75rem;
    margin-block-end: calc(-1 * var(--space-3));
    padding: 0 var(--space-2);
    border: 0;
    border-radius: var(--radius-md);
    color: var(--text-secondary);
    background: transparent;
    font-size: var(--text-sm);
    font-weight: var(--weight-semibold);
    cursor: pointer;
    transition: color var(--transition), background var(--transition);
  }

  .contract-back:hover {
    color: var(--accent-text);
    background: var(--accent-soft);
  }

  .contract-page-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: var(--space-5);
    padding-block-end: var(--space-5);
    border-block-end: 1px solid var(--border);
  }

  .contract-identity {
    display: flex;
    align-items: flex-start;
    gap: var(--space-3);
    min-width: 0;
  }

  .contract-identity-icon {
    display: grid;
    flex: 0 0 2.75rem;
    place-items: center;
    width: 2.75rem;
    height: 2.75rem;
    border: 1px solid var(--accent-soft-border);
    border-radius: var(--radius-lg);
    color: var(--accent-text);
    background: var(--accent-soft);
    font-size: 1.2rem;
  }

  .contract-heading { min-width: 0; }

  .contract-title-row {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    flex-wrap: wrap;
  }

  .contract-title-row h1 {
    margin: 0;
    color: var(--text-strong);
    font-size: var(--text-2xl);
    font-weight: var(--weight-heavy);
    letter-spacing: var(--tracking-tight);
    line-height: var(--leading-tight);
  }

  .contract-summary {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    flex-wrap: wrap;
    margin: var(--space-2) 0 0;
    color: var(--text-muted);
    font-size: var(--text-sm);
    line-height: var(--leading-base);
  }

  .contract-summary strong {
    color: var(--text-secondary);
    font-family: var(--font-data);
    font-weight: var(--weight-semibold);
  }

  .contract-primary-actions {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    flex: 0 0 auto;
  }

  .contract-primary-actions .btn { min-height: 2.75rem; }

  .contract-workspace {
    display: grid;
    grid-template-columns: minmax(13.5rem, 15rem) minmax(0, 1fr);
    align-items: start;
    gap: var(--space-6);
  }

  .contract-controls {
    position: sticky;
    inset-block-start: var(--space-3);
    overflow: hidden;
    border: 1px solid var(--card-border);
    border-radius: var(--radius-xl);
    background: var(--surface);
    box-shadow: var(--card-shadow);
  }

  .control-section { padding: var(--space-4); }

  .control-section-heading {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    margin-block-end: var(--space-3);
    color: var(--text-secondary);
  }

  .control-section-heading i { color: var(--accent-text); }

  .control-section-heading h2 {
    margin: 0;
    font-size: var(--text-sm);
    font-weight: var(--weight-bold);
    line-height: var(--leading-tight);
  }

  .contract-language {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    width: 100%;
    padding: 3px;
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    background: var(--canvas);
  }

  .language-chip {
    min-width: 0;
    min-height: 2.5rem;
    padding: 0.35rem 0.45rem;
    border: 0;
    border-radius: calc(var(--radius-md) - 2px);
    background: transparent;
    color: var(--text-secondary);
    font-size: var(--text-sm);
    font-weight: var(--weight-semibold);
    cursor: pointer;
    transition: color var(--transition), background var(--transition), box-shadow var(--transition);
  }

  .language-chip:hover:not(.is-active) { color: var(--text-strong); background: var(--surface); }

  .language-chip.is-active {
    color: var(--accent-text);
    background: var(--surface);
    box-shadow: var(--control-shadow);
  }

  .control-divider { border-block-start: 1px solid var(--border); }

  .contract-secondary-actions { padding: var(--space-2); }

  .secondary-action {
    display: grid;
    grid-template-columns: 1.25rem minmax(0, 1fr) 1rem;
    align-items: center;
    gap: var(--space-2);
    width: 100%;
    min-height: 2.75rem;
    padding: 0 var(--space-2);
    border: 0;
    border-radius: var(--radius-md);
    color: var(--text-secondary);
    background: transparent;
    font-size: var(--text-sm);
    font-weight: var(--weight-semibold);
    text-align: start;
    cursor: pointer;
    transition: color var(--transition), background var(--transition);
  }

  .secondary-action:hover {
    color: var(--text-strong);
    background: var(--surface-hover);
  }

  .secondary-action > i:first-child { color: var(--text-muted); }
  .secondary-action:hover > i:first-child { color: var(--accent-text); }
  .action-chevron { color: var(--text-placeholder); font-size: 0.75rem; }

  .contract-preview { min-width: 0; }

  /*
   * The card is the paper's frame and nothing more: the sheet is scaled to this
   * box, so any inset here would be white space between the contract and its
   * frame — and the letterhead, which the document prints to the paper's edge,
   * would stop short of the pane's. The paper's own margins are the document's
   * (16mm inside the sheet), so the body is inset and the bands are not, exactly
   * as on the printed page.
   */
  .contract-paper-stage {
    min-width: 0;
    padding: 0;
    overflow: hidden;
    border: 1px solid var(--card-border);
    border-radius: var(--radius-xl);
    background:
      linear-gradient(rgba(255, 255, 255, 0.35), rgba(255, 255, 255, 0)),
      var(--canvas);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.85);
  }

  .contract-alert {
    display: flex;
    align-items: flex-start;
    gap: var(--space-3);
    padding: var(--space-3) var(--space-4);
    border: 1px solid;
    border-radius: var(--radius-lg);
    font-size: var(--text-sm);
    line-height: var(--leading-base);
  }

  .contract-alert--danger {
    color: var(--danger);
    border-color: var(--danger-border);
    background: var(--danger-soft);
  }

  .contract-alert--warning {
    margin-block-end: var(--space-4);
    color: var(--warning);
    border-color: var(--warning-border);
    background: var(--warning-soft);
  }

  .contract-alert i { flex: 0 0 auto; margin-block-start: 0.15rem; }
  .contract-alert p { margin: 0; }
  .contract-alert p + p { margin-block-start: var(--space-2); }

  .contract-state {
    display: grid;
    place-items: center;
    gap: var(--space-3);
    min-height: 22rem;
    padding: var(--space-7);
    border: 1px solid var(--card-border);
    border-radius: var(--radius-xl);
    background: var(--surface);
    box-shadow: var(--card-shadow);
    color: var(--text-muted);
    text-align: center;
  }

  .contract-state-icon {
    display: grid;
    place-items: center;
    width: 3rem;
    height: 3rem;
    border-radius: var(--radius-pill);
    font-size: 1.25rem;
  }

  .contract-state-icon--danger { color: var(--danger); background: var(--danger-soft); }

  .contract-state h2 {
    margin: 0;
    color: var(--text-strong);
    font-size: var(--text-lg);
  }

  .contract-state p { max-width: 34rem; margin: 0; }

  .contract-state-actions {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-2);
    flex-wrap: wrap;
  }

  .contract-back:focus-visible,
  .language-chip:focus-visible,
  .secondary-action:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }

  :global([dir='rtl']) .contract-back i,
  :global([dir='rtl']) .action-chevron { transform: rotate(180deg); }

  @media (max-width: 1100px) {
    .contract-workspace { grid-template-columns: minmax(0, 1fr); }

    .contract-controls {
      position: static;
      display: grid;
      grid-template-columns: minmax(17rem, 1fr) auto;
      align-items: center;
    }

    .control-section { display: flex; align-items: center; gap: var(--space-4); }
    .control-section-heading { flex: 0 0 auto; margin: 0; }
    .contract-language { max-width: 20rem; }
    .control-divider { display: none; }
    .contract-secondary-actions { display: flex; align-items: center; border-inline-start: 1px solid var(--border); }
    .secondary-action { grid-template-columns: 1.25rem auto; width: auto; padding-inline: var(--space-3); }
    .action-chevron { display: none; }
  }

  @media (max-width: 767.98px) {
    .contract-page { gap: var(--space-4); }
    .contract-page-header { align-items: stretch; flex-direction: column; gap: var(--space-4); }
    .contract-primary-actions { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .contract-primary-actions .btn { min-width: 0; white-space: normal; }
    .contract-controls { display: block; }
    .control-section { display: block; }
    .control-section-heading { margin-block-end: var(--space-3); }
    .contract-language { max-width: none; }
    .contract-secondary-actions { display: block; border-inline-start: 0; border-block-start: 1px solid var(--border); }
    .secondary-action { grid-template-columns: 1.25rem minmax(0, 1fr) 1rem; width: 100%; }
    .action-chevron { display: inline-block; }
    .contract-paper-stage { border-radius: var(--radius-lg); }
  }

  @media (max-width: 420px) {
    .contract-identity-icon { display: none; }
    .contract-title-row { gap: var(--space-2); }
    .contract-primary-actions { grid-template-columns: minmax(0, 1fr); }
    .contract-paper-stage { margin-inline: calc(-1 * var(--space-2)); border-radius: 0; }
  }

  @media (prefers-reduced-motion: reduce) {
    .contract-back,
    .language-chip,
    .secondary-action { transition: none; }
  }

  @media print {
    .contract-workspace,
    .contract-preview,
    .contract-paper-stage {
      display: block;
      padding: 0;
      margin: 0;
      border: 0;
      border-radius: 0;
      background: #fff;
      box-shadow: none;
      overflow: visible;
    }
  }
</style>
