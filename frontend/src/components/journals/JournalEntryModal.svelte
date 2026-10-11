<script>
  /**
   * Writing a journal entry: the date, the currency it is written in, and at
   * least two lines that balance. Shared by the Journals register and the
   * journals tab on an account's file, so an entry written from either place is
   * validated and posted identically.
   *
   * `preset` tags a new entry to one tenant before the cursor lands: opened from
   * a tenant's account, the first line already names that tenant, which is the
   * sub-ledger equivalent of the reference preselecting the account.
   */
  import { createEventDispatcher, onMount } from 'svelte';
  import Modal from '../ui/Modal.svelte';
  import ShamsiDatePicker from '../ui/ShamsiDatePicker.svelte';
  import { createJournal, updateJournal } from '../../services/journals';
  import { listAccounts } from '../../services/accounts';
  import { listTenantAccounts } from '../../services/tenantAccounts';
  import { locale } from '../../i18n';
  import { activeCurrencies, baseCurrency, convertAmount } from '../../stores/currency';
  import { notifySuccess } from '../../stores/toasts';
  import { accountNameLabel } from '../../utils/accountLabels';
  import { formatMoney } from '../../utils/formatters';

  /* The receivable control account is what a tenant's account posts against:
     the GL side is the control account, the tenant identifies the sub-ledger. */
  const RECEIVABLE_ROLE = 'ACCOUNTS_RECEIVABLE';

  /* One control offering two kinds of choice: a general-ledger account, or a
     tenant's account. The select holds a key ('account:<id>' / 'tenant:<id>')
     and the payload resolves it, so adding tenant accounts did not need a
     second column in the entry table. */
  const ACCOUNT_PREFIX = 'account:';
  const TENANT_PREFIX = 'tenant:';

  const dispatch = createEventDispatcher();

  export let open = false;
  /** The entry being edited, or null to write a new one. */
  export let entry = null;
  /** { tenantId } or { accountId } preselects the first line of a new entry. */
  export let preset = null;

  const today = () => new Date().toISOString().slice(0, 10);
  const emptyLine = () => ({ accountKey: '', debit: '', credit: '', description: '' });
  const toAmount = (value) => Number(value) || 0;

  let accounts = [];
  /* Tenant accounts are the sub-ledger side of the same picker. They load
     separately from the GL: without them the form still posts general-ledger
     entries, so a failure here only drops that group. */
  let tenantAccounts = [];
  let receivableAccountId = null;
  let optionsError = '';

  let form = { id: null, transactionDate: today(), currency: '', description: '', lines: [emptyLine(), emptyLine()] };
  let formError = '';
  let saving = false;

  // A journal is written in one currency: every line is in `form.currency`, and
  // the server freezes the rate for the entry's date when it posts.
  $: entryCurrency = form.currency || $baseCurrency;

  onMount(async () => {
    try {
      accounts = (await listAccounts()).items || [];
      receivableAccountId = accounts.find((account) => account.systemKey === RECEIVABLE_ROLE)?.id || null;
    } catch (error) { optionsError = error.status === 401 ? '' : error.message; }

    try {
      tenantAccounts = (await listTenantAccounts({ page: 1, pageSize: 100 })).items || [];
    } catch { tenantAccounts = []; }
  });

  /* --- Opening ---------------------------------------------------------- */

  /** The key a saved line should show as selected when it is re-opened. */
  function accountKeyFor(line) {
    if (line.tenantId) return `${TENANT_PREFIX}${line.tenantId}`;
    return line.accountId ? `${ACCOUNT_PREFIX}${line.accountId}` : '';
  }

  function formFor(record) {
    return {
      id: record.id,
      transactionDate: String(record.transactionDate).slice(0, 10),
      currency: record.currency || $baseCurrency,
      description: record.description || '',
      lines: record.lines.length
        ? record.lines.map((line) => ({
          accountKey: accountKeyFor(line),
          debit: line.debit ? String(line.debit) : '',
          credit: line.credit ? String(line.credit) : '',
          description: line.description || '',
        }))
        : [emptyLine(), emptyLine()],
    };
  }

  function newForm() {
    const lines = [emptyLine(), emptyLine()];
    /* Tagged up front rather than once the chart has arrived: the picker fills
       in the receivable account as soon as it loads, and until then the entry
       is simply not postable yet. */
    if (preset?.tenantId) lines[0].accountKey = `${TENANT_PREFIX}${preset.tenantId}`;
    else if (preset?.accountId) lines[0].accountKey = `${ACCOUNT_PREFIX}${preset.accountId}`;
    return { id: null, transactionDate: today(), currency: $baseCurrency, description: '', lines };
  }

  let wasOpen = false;
  $: if (open !== wasOpen) {
    wasOpen = open;
    if (open) { form = entry ? formFor(entry) : newForm(); formError = ''; }
  }

  function close() {
    if (saving) return;
    open = false;
  }

  /* --- Lines ------------------------------------------------------------ */

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

  /* --- Account options --------------------------------------------------

     Every option the form offers is built here, so the picker, the payload and
     the labels always agree on what a choice means. */

  function resolveAccountKey(key) {
    if (key.startsWith(TENANT_PREFIX)) {
      return { accountId: receivableAccountId, tenantId: key.slice(TENANT_PREFIX.length) };
    }
    return {
      accountId: key.startsWith(ACCOUNT_PREFIX) ? key.slice(ACCOUNT_PREFIX.length) : '',
      tenantId: '',
    };
  }

  function tenantName(tenant) {
    return [tenant?.firstName].filter(Boolean).join(' ') || tenant?.phone || '—';
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
    ? `${$locale.journals.tenantAccounts} — ${accountNameLabel(receivableAccount, $locale)}`
    : $locale.journals.tenantAccounts;

  /* --- Totals and validity ---------------------------------------------- */

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

  /* --- Submit ----------------------------------------------------------- */

  // Field-level messages from the API are more useful than the generic banner.
  function describeValidation(error) {
    const fields = error?.data?.errors;
    if (fields && typeof fields === 'object') {
      const first = Object.values(fields).flat().filter(Boolean)[0];
      if (first) return String(first);
    }
    return error.message;
  }

  async function submit() {
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
      let saved;
      if (form.id) {
        saved = await updateJournal(form.id, payload);
        notifySuccess($locale.journals.updated);
      } else {
        saved = await createJournal(payload);
        notifySuccess($locale.journals.saved);
      }
      open = false;
      dispatch('saved', saved?.journal || null);
    } catch (error) {
      // A 401 is answered by the app's session-expired event, not by this form.
      if (error.status !== 401) formError = describeValidation(error);
    } finally { saving = false; }
  }
</script>

<Modal
  bind:open
  title={form.id ? $locale.journals.editEntry : $locale.journals.newEntry}
  description={$locale.journals.formHint}
  size="modal-xl"
  busy={saving}
  icon="bi-journal-text"
  closeLabel={$locale.common.close}
  on:close={close}
>
  <form id="journal-entry-form" on:submit|preventDefault={submit} novalidate>
    {#if formError}<div class="alert alert-danger" role="alert">{formError}</div>{/if}
    {#if optionsError}<div class="alert alert-warning" role="alert">{optionsError}</div>{/if}

    <div class="journal-meta">
      <div class="journal-meta-field">
        <label class="form-label" for="journal-entry-date">{$locale.journals.date}</label>
        <ShamsiDatePicker id="journal-entry-date" bind:value={form.transactionDate} required />
      </div>
      <div class="journal-meta-field">
        <label class="form-label" for="journal-entry-currency">{$locale.currencies.currency}</label>
        <div class="field-control">
          <i class="bi bi-currency-exchange" aria-hidden="true"></i>
          <select id="journal-entry-currency" class="form-select" bind:value={form.currency}>
            {#each $activeCurrencies as currency (currency.id)}
              <option value={currency.code}>{currency.code} — {currency.name}</option>
            {/each}
          </select>
        </div>
      </div>
      <div class="journal-meta-field">
        <label class="form-label" for="journal-entry-description">{$locale.journals.description}</label>
        <div class="field-control">
          <i class="bi bi-card-text" aria-hidden="true"></i>
          <input id="journal-entry-description" class="form-control" bind:value={form.description} placeholder={$locale.journals.description} autocomplete="off" />
        </div>
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
                      <option value={`${ACCOUNT_PREFIX}${account.id}`}>{accountNameLabel(account, $locale)}</option>
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
    <button class="btn btn-light" type="button" on:click={close} disabled={saving}>{$locale.journals.cancel}</button>
    <button class="btn btn-primary" type="submit" form="journal-entry-form" disabled={saving || !canSave}>
      {saving ? $locale.journals.saving : $locale.journals.save}
    </button>
  </div>
</Modal>

<style>
  /* The two amount columns read as a pair of ledgers, so debit and credit keep
     the same red/green language the register uses. */
  .journal-meta { display: grid; grid-template-columns: minmax(10rem, 14rem) minmax(0, 1fr); gap: 1rem; }
  .journal-meta-field { min-width: 0; }
  .journal-lines-table { margin-block-end: 0; }
  .journal-lines-table th { white-space: nowrap; }
  .journal-lines-table tfoot th { color: var(--text-muted); font-size: var(--text-xs); letter-spacing: var(--tracking-wide); text-transform: uppercase; }
  .journal-amount { text-align: end; font-variant-numeric: tabular-nums; }
  .journal-amount--debit { color: #b91c1c; background: #feecec; }
  .journal-amount--credit { color: #047857; background: #e9f9ef; }
  .amount-cell { font-variant-numeric: tabular-nums; }
  .journal-form-footer { display: flex; align-items: center; justify-content: space-between; gap: 1rem; flex-wrap: wrap; }
  .journal-balance { display: inline-flex; align-items: center; gap: 0.375rem; color: var(--danger); font-size: var(--text-sm); font-weight: var(--weight-semibold); }
  .journal-balance.is-balanced { color: var(--success); }

  @media (max-width: 767px) {
    .journal-meta { grid-template-columns: 1fr; }
  }
</style>
