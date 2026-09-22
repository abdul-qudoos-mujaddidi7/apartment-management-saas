<script>
  import { onDestroy, onMount } from 'svelte';
  import { createJournal, listJournals, updateJournal, voidJournal } from '../services/journals';
  import { listAccounts } from '../services/accounts';
  import { listTenantAccounts } from '../services/tenantAccounts';
  import PageLayout from '../components/ui/PageLayout.svelte';
  import DataTable from '../components/ui/DataTable.svelte';
  import Checkbox from '../components/ui/Checkbox.svelte';
  import PageToolbar from '../components/ui/PageToolbar.svelte';
  import Pagination from '../components/ui/Pagination.svelte';
  import Modal from '../components/ui/Modal.svelte';
  import StatusBadge from '../components/ui/StatusBadge.svelte';
  import ShamsiDatePicker from '../components/ui/ShamsiDatePicker.svelte';
  import { formatShortDate } from '../utils/formatters';
  import { locale } from '../i18n';
  import { activeCurrencies, baseCurrency, convertAmount } from '../stores/currency';
  import { debounce } from '../utils/debounce';
  import { createSelection, isAllSelected, isSomeSelected, toggleAllSelected, toggleSelected } from '../utils/selection';
  import { formatMoney } from '../utils/formatters';

  /* Manual entries carry every line themselves; document postings are owned by
     the invoice or payment that generated them, so they are read-only here. */
  const SOURCE_LABELS = {
    MANUAL: 'manual',
    INVOICE: 'invoice',
    PAYMENT: 'payment',
    MANUAL_VOID: 'reversal',
  };

  /* The receivable control account is what a tenant's account posts against:
     the GL side is the control account, the tenant identifies the sub-ledger.
     Invoice and payment postings use the same pairing. */
  const RECEIVABLE_CODE = '1100';

  /* One control offering two kinds of choice: a general-ledger account, or a
     tenant's account. The select holds a key ('account:<id>' / 'tenant:<id>')
     and the payload resolves it, so adding tenant accounts did not need a
     second column in the entry table. */
  const ACCOUNT_PREFIX = 'account:';
  const TENANT_PREFIX = 'tenant:';

  const today = () => new Date().toISOString().slice(0, 10);
  const emptyLine = () => ({ accountKey: '', debit: '', credit: '', description: '' });
  const toAmount = (value) => Number(value) || 0;

  let entries = [];
  let accounts = [];
  /* Tenant accounts are the sub-ledger side of the same picker. They load
     separately from the GL: without them the form still posts general-ledger
     entries, so a failure here only drops that group. */
  let tenantAccounts = [];
  let receivableAccountId = null;
  let pagination = { page: 1, pageSize: 10, total: 0, totalPages: 0 };
  let filters = { search: '', status: '', referenceType: '', accountId: '', dateFrom: '', dateTo: '' };
  let loading = false;
  let errorMessage = '';
  let noticeMessage = '';

  let detailsEntry = null;
  let detailsOpen = false;

  let formOpen = false;
  let form = { id: null, transactionDate: today(), currency: '', description: '', lines: [] };
  // A journal is written in one currency: every line is in `form.currency`, and
  // the server freezes the rate for the entry's date when it posts.
  $: entryCurrency = form.currency || $baseCurrency;
  let formError = '';
  let saving = false;

  let voidOpen = false;
  let voidingEntry = null;
  let voidReason = '';
  let voidError = '';

  const debouncedSearch = debounce(() => loadJournals(1), 250);
  onDestroy(() => debouncedSearch.cancel());
  function queueSearch() { debouncedSearch(); }

  onMount(async () => {
    try {
      accounts = (await listAccounts()).items || [];
      receivableAccountId = accounts.find((account) => account.code === RECEIVABLE_CODE)?.id || null;
      await loadJournals(1);
    } catch (error) { await handleRequestError(error); }

    // Tenant accounts are an extra dimension of the picker, not a prerequisite
    // for the ledger: if they cannot be listed the form loses that group only.
    try {
      tenantAccounts = (await listTenantAccounts({ page: 1, pageSize: 100 })).items || [];
    } catch { tenantAccounts = []; }
  });

  async function handleRequestError(error) { if (error.status === 401) return true; errorMessage = error.message; return false; }

  // Field-level messages from the API are more useful than the generic banner.
  function describeValidation(error) {
    const fields = error?.data?.errors;
    if (fields && typeof fields === 'object') {
      const first = Object.values(fields).flat().filter(Boolean)[0];
      if (first) return String(first);
    }
    return error.message;
  }

  async function loadJournals(page = pagination.page) {
    loading = true; errorMessage = '';
    try {
      const response = await listJournals({ page, pageSize: pagination.pageSize, ...filters });
      entries = response.items || [];
      pagination = response.pagination;
    } catch (error) { await handleRequestError(error); }
    finally { loading = false; }
  }

  function openDetails(entry) { detailsEntry = entry; detailsOpen = true; }
  function closeDetails() { detailsOpen = false; detailsEntry = null; }

  /* --- Entry form ------------------------------------------------------ */

  function openCreate() {
    form = { id: null, transactionDate: today(), currency: $baseCurrency, description: '', lines: [emptyLine(), emptyLine()] };
    formError = '';
    formOpen = true;
  }

  function openEdit(entry) {
    form = {
      id: entry.id,
      transactionDate: String(entry.transactionDate).slice(0, 10),
      currency: entry.currency || $baseCurrency,
      description: entry.description || '',
      lines: entry.lines.length
        ? entry.lines.map((line) => ({
          accountKey: accountKeyFor(line),
          debit: line.debit ? String(line.debit) : '',
          credit: line.credit ? String(line.credit) : '',
          description: line.description || '',
        }))
        : [emptyLine(), emptyLine()],
    };
    formError = '';
    formOpen = true;
  }

  function closeForm() {
    if (saving) return;
    formOpen = false;
    formError = '';
  }

  function addLine() { form = { ...form, lines: [...form.lines, emptyLine()] }; }

  function removeLine(index) {
    if (form.lines.length <= 2) return;
    form = { ...form, lines: form.lines.filter((_, position) => position !== index) };
  }

  function sanitizeAmount(value) {
    const cleaned = String(value).replace(/[^0-9.]/g, '');
    const [whole, ...rest] = cleaned.split('.');
    return rest.length ? `${whole}.${rest.join('')}` : whole;
  }

  /* A line is a debit or a credit, never both — entering one clears the other
     on the same row so the totals can never count the same amount twice. */
  function setAmount(index, side, value) {
    const amount = sanitizeAmount(value);
    form = {
      ...form,
      lines: form.lines.map((line, position) => (
        position === index
          ? { ...line, [side]: amount, [side === 'debit' ? 'credit' : 'debit']: '' }
          : line
      )),
    };
  }

  function setField(index, field, value) {
    form = { ...form, lines: form.lines.map((line, position) => (position === index ? { ...line, [field]: value } : line)) };
  }

  $: debitTotal = form.lines.reduce((total, line) => total + toAmount(line.debit), 0);
  $: creditTotal = form.lines.reduce((total, line) => total + toAmount(line.credit), 0);
  $: difference = Math.round((debitTotal - creditTotal) * 100) / 100;
  $: balanced = debitTotal > 0 && difference === 0;
  // What the entry will add to the ledger, in the reporting currency, at the
  // rate in force today — the authoritative rate is frozen when it posts.
  $: entryBaseTotal = convertAmount(debitTotal, entryCurrency, $baseCurrency, $activeCurrencies, $baseCurrency);
  /* A tenant choice is only postable when the receivable account it resolves to
     is in the chart, so an unresolved key is not accepted either. */
  $: linesComplete = form.lines.length >= 2 && form.lines.every((line) => (
    line.accountKey
    && Boolean(resolveAccountKey(line.accountKey).accountId)
    && (toAmount(line.debit) > 0) !== (toAmount(line.credit) > 0)
  ));
  $: canSave = linesComplete && balanced && Boolean(form.transactionDate);

  async function submitForm() {
    if (saving) return;

    if (form.lines.length < 2) { formError = $locale.journals.minimumLines; return; }
    if (!linesComplete) { formError = $locale.journals.lineNeedsAmount; return; }
    if (!balanced) { formError = $locale.journals.mustBalance; return; }

    const payload = {
      transactionDate: form.transactionDate,
      currency: entryCurrency,
      description: form.description.trim() || null,
      lines: form.lines.map((line) => ({
        ...resolveAccountKey(line.accountKey),
        debit: toAmount(line.debit),
        credit: toAmount(line.credit),
        description: line.description.trim() || null,
      })),
    };

    saving = true; formError = '';
    try {
      if (form.id) {
        await updateJournal(form.id, payload);
        noticeMessage = $locale.journals.updated;
      } else {
        await createJournal(payload);
        noticeMessage = $locale.journals.saved;
      }
      formOpen = false;
      await loadJournals(form.id ? pagination.page : 1);
    } catch (error) {
      if (!(await handleRequestError(error))) formError = describeValidation(error);
    } finally { saving = false; }
  }

  /* --- Void ------------------------------------------------------------ */

  function requestVoid(entry) { voidingEntry = entry; voidReason = ''; voidError = ''; voidOpen = true; }
  function closeVoid() { if (saving) return; voidOpen = false; voidingEntry = null; voidError = ''; }

  async function submitVoid() {
    if (!voidReason.trim()) { voidError = $locale.journals.voidReasonRequired; return; }

    saving = true; voidError = '';
    try {
      await voidJournal(voidingEntry.id, voidReason.trim());
      noticeMessage = $locale.journals.voidedSuccess;
      voidOpen = false; voidingEntry = null;
      await loadJournals(pagination.page);
    } catch (error) {
      if (!(await handleRequestError(error))) voidError = describeValidation(error);
    } finally { saving = false; }
  }

  /* --- Account options --------------------------------------------------

     Every option the entry form offers is built here, so the picker, the
     payload and the labels always agree on what a choice means. */

  function resolveAccountKey(key) {
    if (key.startsWith(TENANT_PREFIX)) {
      return { accountId: receivableAccountId, tenantId: key.slice(TENANT_PREFIX.length) };
    }
    return {
      accountId: key.startsWith(ACCOUNT_PREFIX) ? key.slice(ACCOUNT_PREFIX.length) : '',
      tenantId: '',
    };
  }

  /** The key a saved line should show as selected when it is re-opened. */
  function accountKeyFor(line) {
    if (line.tenantId) return `${TENANT_PREFIX}${line.tenantId}`;
    return line.accountId ? `${ACCOUNT_PREFIX}${line.accountId}` : '';
  }

  function tenantName(tenant) {
    return [tenant?.firstName, tenant?.lastName].filter(Boolean).join(' ') || tenant?.phone || '—';
  }

  /** Tenant label for the picker: the name, plus the apartment when known, so
      two tenants with the same name stay apart. */
  function tenantOptionLabel(tenantAccount) {
    const apartment = tenantAccount.tenant?.leases?.[0]?.apartment?.apartmentNumber;
    const name = tenantName(tenantAccount.tenant);
    return apartment ? `${name} · ${apartment}` : name;
  }

  /** Label of the receivable control account, for the picker's group heading. */
  $: receivableAccount = accounts.find((account) => account.id === receivableAccountId) || null;
  $: tenantGroupLabel = receivableAccount
    ? `${$locale.journals.tenantAccounts} — ${receivableAccount.code} ${receivableAccount.name}`
    : $locale.journals.tenantAccounts;

  /* --- Table helpers --------------------------------------------------- */

  /** A line tagged to a tenant reads as "account · tenant" everywhere. */
  function accountLabel(line) {
    const account = line.account ? `${line.account.code} — ${line.account.name}` : '—';
    return line.tenant ? `${account} · ${tenantName(line.tenant)}` : account;
  }
  function sourceLabel(entry) { const key = SOURCE_LABELS[entry.referenceType]; return key ? $locale.journals[key] : entry.referenceType; }
  function sourceTone(entry) { return entry.isManual ? 'info' : 'neutral'; }
  function statusLabel(status) { return status === 'POSTED' ? $locale.journals.posted : $locale.journals.voided; }
  function statusTone(status) { return status === 'POSTED' ? 'success' : 'danger'; }
  const editable = (entry) => entry.isManual && entry.status === 'POSTED';

  let selectedIds = createSelection();
  $: rowIds = entries.map((entry) => entry.id);
  $: allRowsSelected = isAllSelected(selectedIds, rowIds);
  $: someRowsSelected = isSomeSelected(selectedIds, rowIds);

  function toggleRow(id) { selectedIds = toggleSelected(selectedIds, id); }
  function toggleAllRows() { selectedIds = toggleAllSelected(selectedIds, rowIds); }

  $: activeFilterCount = [filters.status, filters.referenceType, filters.accountId, filters.dateFrom, filters.dateTo].filter(Boolean).length;
  function clearFilters() {
    filters = { ...filters, status: '', referenceType: '', accountId: '', dateFrom: '', dateTo: '' };
    loadJournals(1);
  }

  $: resultSummary = `${$locale.journals.title}: ${pagination.total}`;
</script>

<svelte:head><title>{$locale.journals.title} | {$locale.common.apartmentPro}</title></svelte:head>

<PageLayout>
  <svelte:fragment slot="toolbar">
    <PageToolbar
      bind:search={filters.search}
      searchPlaceholder={$locale.journals.search}
      addLabel={$locale.journals.add}
      onAdd={openCreate}
      onSearch={queueSearch}
      filtersLabel={$locale.common.filters}
      filtersCount={activeFilterCount}
      filtersClearLabel={$locale.common.clearFilters}
      onClearFilters={clearFilters}
    >
      <svelte:fragment slot="filters">
        <div class="filters-field">
          <label class="filters-field-label" for="journal-filter-status">{$locale.journals.status}</label>
          <select class="form-select" id="journal-filter-status" bind:value={filters.status} on:change={() => loadJournals(1)}>
            <option value="">{$locale.journals.allStatuses}</option>
            <option value="POSTED">{$locale.journals.posted}</option>
            <option value="VOIDED">{$locale.journals.voided}</option>
          </select>
        </div>
        <div class="filters-field">
          <label class="filters-field-label" for="journal-filter-source">{$locale.journals.source}</label>
          <select class="form-select" id="journal-filter-source" bind:value={filters.referenceType} on:change={() => loadJournals(1)}>
            <option value="">{$locale.journals.allSources}</option>
            <option value="MANUAL">{$locale.journals.manual}</option>
            <option value="INVOICE">{$locale.journals.invoice}</option>
            <option value="PAYMENT">{$locale.journals.payment}</option>
          </select>
        </div>
        <div class="filters-field">
          <label class="filters-field-label" for="journal-filter-account">{$locale.journals.account}</label>
          <select class="form-select" id="journal-filter-account" bind:value={filters.accountId} on:change={() => loadJournals(1)}>
            <option value="">{$locale.journals.allAccounts}</option>
            {#each accounts as account (account.id)}
              <option value={account.id}>{account.code} — {account.name}</option>
            {/each}
          </select>
        </div>
        <div class="filters-field">
          <label class="filters-field-label" for="journal-filter-from">{$locale.journals.dateFrom}</label>
          <ShamsiDatePicker id="journal-filter-from" bind:value={filters.dateFrom} on:change={() => loadJournals(1)} />
        </div>
        <div class="filters-field">
          <label class="filters-field-label" for="journal-filter-to">{$locale.journals.dateTo}</label>
          <ShamsiDatePicker id="journal-filter-to" bind:value={filters.dateTo} on:change={() => loadJournals(1)} />
        </div>
      </svelte:fragment>
    </PageToolbar>
  </svelte:fragment>

  <svelte:fragment slot="alerts">
    {#if noticeMessage}<div class="alert alert-success" role="status">{noticeMessage}</div>{/if}
    {#if errorMessage}<div class="alert alert-danger" role="alert">{errorMessage}</div>{/if}
  </svelte:fragment>

  <svelte:fragment slot="content">
    <DataTable loading={loading} isEmpty={entries.length === 0} loadingLabel={$locale.journals.loading} emptyLabel={$locale.journals.empty} emptyIcon="bi-journal-text" minTableWidth="68rem" showFooter={!loading && entries.length > 0}>
      <thead>
        <tr>
          <th class="select-column"><Checkbox checked={allRowsSelected} indeterminate={someRowsSelected} label={$locale.common.selectAll} on:change={toggleAllRows} /></th>
          <th>{$locale.journals.journalNumber}</th>
          <th>{$locale.journals.date}</th>
          <th>{$locale.journals.source}</th>
          <th>{$locale.journals.description}</th>
          <th>{$locale.journals.debit}</th>
          <th>{$locale.journals.credit}</th>
          <th>{$locale.journals.status}</th>
          <th><span class="visually-hidden">{$locale.journals.actions}</span></th>
        </tr>
      </thead>
      <tbody>
        {#each entries as entry (entry.id)}
          <tr class:is-selected={selectedIds.has(entry.id)}>
            <td class="select-column"><Checkbox checked={selectedIds.has(entry.id)} label={$locale.common.selectRow} on:change={() => toggleRow(entry.id)} /></td>
            <td><strong>{entry.journalNumber}</strong></td>
            <td class="date-cell">{formatShortDate(entry.transactionDate)}</td>
            <td><StatusBadge label={sourceLabel(entry)} tone={sourceTone(entry)} /></td>
            <td class="description-cell">{entry.description || '—'}</td>
            <td class="amount-cell">{formatMoney(entry.debitTotal, entry.currency)}</td>
            <td class="amount-cell">{formatMoney(entry.creditTotal, entry.currency)}</td>
            <td><StatusBadge label={statusLabel(entry.status)} tone={statusTone(entry.status)} /></td>
            <td class="actions-cell">
              <button class="icon-button" type="button" on:click={() => openDetails(entry)} aria-label={$locale.journals.view}><i class="bi bi-eye" aria-hidden="true"></i></button>
              {#if editable(entry)}
                <button class="icon-button" type="button" on:click={() => openEdit(entry)} aria-label={$locale.journals.edit}><i class="bi bi-pencil" aria-hidden="true"></i></button>
                <button class="icon-button warning" type="button" on:click={() => requestVoid(entry)} aria-label={$locale.journals.void}><i class="bi bi-x-circle" aria-hidden="true"></i></button>
              {/if}
            </td>
          </tr>
        {/each}
      </tbody>
    </DataTable>
  </svelte:fragment>

  <svelte:fragment slot="footer">
    <Pagination page={pagination.page} totalPages={pagination.totalPages} label={$locale.journals.page.replace('{page}', pagination.page).replace('{totalPages}', pagination.totalPages)} previousLabel={$locale.journals.previous} nextLabel={$locale.journals.next} summary={resultSummary} onPage={loadJournals} />
  </svelte:fragment>
</PageLayout>

<!-- Entry details -->
<Modal bind:open={detailsOpen} title={detailsEntry ? detailsEntry.journalNumber : ''} size="modal-lg" closeLabel={$locale.common.close} on:close={closeDetails}>
  {#if detailsEntry}
    <dl class="journal-details">
      <div><dt>{$locale.journals.date}</dt><dd>{formatShortDate(detailsEntry.transactionDate)}</dd></div>
      <div><dt>{$locale.journals.source}</dt><dd><StatusBadge label={sourceLabel(detailsEntry)} tone={sourceTone(detailsEntry)} /></dd></div>
      <div><dt>{$locale.journals.status}</dt><dd><StatusBadge label={statusLabel(detailsEntry.status)} tone={statusTone(detailsEntry.status)} /></dd></div>
      <div><dt>{$locale.journals.description}</dt><dd>{detailsEntry.description || '—'}</dd></div>
    </dl>

    {#if detailsEntry.status === 'VOIDED' && detailsEntry.voidReason}
      <p class="journal-void-reason"><strong>{$locale.journals.voidReasonLabel}:</strong> {detailsEntry.voidReason}</p>
    {/if}

    <div class="table-responsive">
      <table class="table journal-lines-table">
        <thead>
          <tr>
            <th>{$locale.journals.account}</th>
            <th>{$locale.journals.memo}</th>
            <th class="text-end">{$locale.journals.debit}</th>
            <th class="text-end">{$locale.journals.credit}</th>
          </tr>
        </thead>
        <tbody>
          {#each detailsEntry.lines as line (line.id)}
            <tr>
              <td>{accountLabel(line)}</td>
              <td>{line.description || '—'}</td>
              <td class="amount-cell text-end">{line.debit ? formatMoney(line.debit, detailsEntry.currency) : '—'}</td>
              <td class="amount-cell text-end">{line.credit ? formatMoney(line.credit, detailsEntry.currency) : '—'}</td>
            </tr>
          {/each}
        </tbody>
        <tfoot>
          <tr>
            <th colspan="2">{$locale.journals.totals}</th>
            <td class="amount-cell text-end">{formatMoney(detailsEntry.debitTotal, detailsEntry.currency)}</td>
            <td class="amount-cell text-end">{formatMoney(detailsEntry.creditTotal, detailsEntry.currency)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  {/if}
  <div slot="footer">
    <button class="btn btn-light" type="button" on:click={closeDetails}>{$locale.common.close}</button>
  </div>
</Modal>

<!-- Create / edit entry -->
<Modal bind:open={formOpen} title={form.id ? $locale.journals.editEntry : $locale.journals.newEntry} size="modal-xl" busy={saving} closeLabel={$locale.common.close} on:close={closeForm}>
  <form id="journal-entry-form" on:submit|preventDefault={submitForm} novalidate>
    {#if formError}<div class="alert alert-danger" role="alert">{formError}</div>{/if}

    <div class="journal-meta">
      <div class="journal-meta-field">
        <label class="form-label" for="journal-entry-date">{$locale.journals.date}</label>
        <ShamsiDatePicker id="journal-entry-date" bind:value={form.transactionDate} required />
      </div>
      <div class="journal-meta-field">
        <label class="form-label" for="journal-entry-currency">{$locale.currencies.currency}</label>
        <select id="journal-entry-currency" class="form-select" bind:value={form.currency}>
          {#each $activeCurrencies as currency (currency.id)}
            <option value={currency.code}>{currency.code} — {currency.name}</option>
          {/each}
        </select>
      </div>
      <div class="journal-meta-field">
        <label class="form-label" for="journal-entry-description">{$locale.journals.description}</label>
        <input id="journal-entry-description" class="form-control" bind:value={form.description} placeholder={$locale.journals.description} autocomplete="off" />
      </div>
    </div>

    <div class="table-responsive">
      <table class="table journal-lines-table">
        <thead>
          <tr>
            <th>{$locale.journals.account}</th>
            <th>{$locale.journals.memo}</th>
            <th class="text-end">{$locale.journals.debit}</th>
            <th class="text-end">{$locale.journals.credit}</th>
            <th><span class="visually-hidden">{$locale.journals.removeLine}</span></th>
          </tr>
        </thead>
        <tbody>
          {#each form.lines as line, index (index)}
            <tr>
              <td>
                <select class="form-select" bind:value={line.accountKey} aria-label={$locale.journals.account}>
                  <option value="">{$locale.journals.selectAccount}</option>
                  <optgroup label={$locale.journals.generalAccounts}>
                    {#each accounts as account (account.id)}
                      <option value={`${ACCOUNT_PREFIX}${account.id}`}>{account.code} — {account.name}</option>
                    {/each}
                  </optgroup>
                  {#if receivableAccountId && tenantAccounts.length}
                    <optgroup label={tenantGroupLabel}>
                      {#each tenantAccounts as tenantAccount (tenantAccount.id)}
                        <option value={`${TENANT_PREFIX}${tenantAccount.tenant.id}`}>{tenantOptionLabel(tenantAccount)}</option>
                      {/each}
                    </optgroup>
                  {/if}
                </select>
              </td>
              <td>
                <input class="form-control" value={line.description} on:input={(event) => setField(index, 'description', event.currentTarget.value)} aria-label={$locale.journals.memo} autocomplete="off" />
              </td>
              <td>
                <input class="form-control journal-amount journal-amount--debit" inputmode="decimal" value={line.debit} on:input={(event) => setAmount(index, 'debit', event.currentTarget.value)} aria-label={$locale.journals.debit} autocomplete="off" />
              </td>
              <td>
                <input class="form-control journal-amount journal-amount--credit" inputmode="decimal" value={line.credit} on:input={(event) => setAmount(index, 'credit', event.currentTarget.value)} aria-label={$locale.journals.credit} autocomplete="off" />
              </td>
              <td class="actions-cell">
                <button class="icon-button danger" type="button" on:click={() => removeLine(index)} disabled={form.lines.length <= 2} aria-label={$locale.journals.removeLine}><i class="bi bi-trash3" aria-hidden="true"></i></button>
              </td>
            </tr>
          {/each}
        </tbody>
        <tfoot>
          <tr>
            <th colspan="2">{$locale.journals.totals}</th>
            <td class="amount-cell text-end">{formatMoney(debitTotal, entryCurrency)}</td>
            <td class="amount-cell text-end">{formatMoney(creditTotal, entryCurrency)}</td>
            <td></td>
          </tr>
        </tfoot>
      </table>
    </div>

    <div class="journal-form-footer">
      <button class="btn btn-light btn-sm" type="button" on:click={addLine}>
        <i class="bi bi-plus-lg" aria-hidden="true"></i>
        {$locale.journals.addLine}
      </button>
      <span class="journal-balance" class:is-balanced={balanced}>
        <i class="bi {balanced ? 'bi-check-circle' : 'bi-exclamation-circle'}" aria-hidden="true"></i>
        {balanced ? $locale.journals.balanced : $locale.journals.outOfBalance.replace('{amount}', formatMoney(Math.abs(difference), entryCurrency))}
        {#if entryCurrency !== $baseCurrency}
          · {$locale.currencies.baseRate}: {formatMoney(entryBaseTotal, $baseCurrency)}
        {/if}
      </span>
    </div>
  </form>

  <div slot="footer">
    <button class="btn btn-light" type="button" on:click={closeForm} disabled={saving}>{$locale.journals.cancel}</button>
    <button class="btn btn-primary" type="submit" form="journal-entry-form" disabled={saving || !canSave}>
      {saving ? $locale.journals.saving : $locale.journals.save}
    </button>
  </div>
</Modal>

<!-- Void -->
<Modal bind:open={voidOpen} title={$locale.journals.void} busy={saving} closeLabel={$locale.journals.cancel} on:close={closeVoid}>
  <form id="void-journal-form" on:submit|preventDefault={submitVoid} novalidate>
    {#if voidError}<div class="alert alert-danger" role="alert">{voidError}</div>{/if}
    <p>{$locale.journals.confirmVoid}</p>
    <label class="form-label" for="void-journal-reason">{$locale.journals.voidReason}</label>
    <textarea id="void-journal-reason" class="form-control" rows="3" bind:value={voidReason}></textarea>
  </form>
  <div slot="footer">
    <button class="btn btn-light" type="button" on:click={closeVoid} disabled={saving}>{$locale.journals.cancel}</button>
    <button class="btn btn-danger" type="submit" form="void-journal-form" disabled={saving}>{saving ? $locale.journals.voiding : $locale.journals.void}</button>
  </div>
</Modal>

<style>
  .icon-button.warning { color: var(--warning); }
  .icon-button.warning:hover { border-color: var(--warning-border); background: var(--warning-soft); }
  .description-cell { max-width: 22rem; overflow: hidden; text-overflow: ellipsis; }
  .journal-details { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 1rem; margin: 0; }
  .journal-details dt { color: var(--text-muted); font-size: 0.8rem; }
  .journal-details dd { margin: 0.25rem 0 0; font-weight: 600; }
  .journal-void-reason { margin: 1rem 0; padding: 0.625rem 0.75rem; border: 1px solid var(--danger-border, var(--border)); border-radius: var(--radius-sm); background: var(--danger-soft, var(--surface-muted)); font-size: var(--text-sm); }

  /* Entry form: the two amount columns read as a pair of ledgers, so debit and
     credit keep the same red/green language the reference uses. */
  .journal-meta { display: grid; grid-template-columns: minmax(10rem, 14rem) minmax(0, 1fr); gap: 1rem; }
  .journal-meta-field { min-width: 0; }
  .journal-lines-table { margin-block-end: 0; }
  .journal-lines-table :global(th) { white-space: nowrap; }
  .journal-lines-table :global(tfoot th) { color: var(--text-muted); font-size: var(--text-xs); letter-spacing: var(--tracking-wide); text-transform: uppercase; }
  .journal-amount { text-align: end; font-variant-numeric: tabular-nums; }
  .journal-amount--debit { color: #b91c1c; background: #feecec; }
  .journal-amount--credit { color: #047857; background: #e9f9ef; }
  .journal-form-footer { display: flex; align-items: center; justify-content: space-between; gap: 1rem; flex-wrap: wrap; }
  .journal-balance { display: inline-flex; align-items: center; gap: 0.375rem; color: var(--danger); font-size: var(--text-sm); font-weight: var(--weight-semibold); }
  .journal-balance.is-balanced { color: var(--success); }

  @media (max-width: 767px) {
    .journal-meta { grid-template-columns: 1fr; }
    .journal-details { grid-template-columns: 1fr; }
  }
</style>
