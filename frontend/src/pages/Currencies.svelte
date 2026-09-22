<script>
  import { onMount } from 'svelte';

  import {
    addExchangeRate,
    createCurrency,
    deleteCurrency,
    listCatalogue,
    setBaseCurrency,
    updateCurrency,
  } from '../services/currencies';
  import { currencies as currencyStore, baseCurrency, currenciesLoading, loadCurrencies } from '../stores/currency';
  import PageLayout from '../components/ui/PageLayout.svelte';
  import DataTable from '../components/ui/DataTable.svelte';
  import PageToolbar from '../components/ui/PageToolbar.svelte';
  import Modal from '../components/ui/Modal.svelte';
  import StatusBadge from '../components/ui/StatusBadge.svelte';
  import ShamsiDatePicker from '../components/ui/ShamsiDatePicker.svelte';
  import { formatShortDate } from '../utils/formatters';
  import { locale, translate } from '../i18n';
  import { debounce } from '../utils/debounce';
  import { formatMoney } from '../utils/formatters';

  const today = () => new Date().toISOString().slice(0, 10);

  let loading = false;
  let saving = false;
  let errorMessage = '';
  let noticeMessage = '';
  let modalError = '';
  let search = '';

  // Add / edit currency
  let currencyOpen = false;
  let editing = null;
  let form = emptyForm();

  /*
   * The picker's reference list, from the currency API via our own endpoint.
   * It is fetched when the form opens and kept for the session, so opening the
   * form twice does not re-ask the server. A failure is not fatal: the three
   * fields stay typeable, which is how a currency the API has never heard of
   * gets added.
   */
  let catalogue = [];
  let catalogueSource = '';
  let catalogueTotal = 0;
  let catalogueLoading = false;
  let catalogueError = '';
  let codeOpen = false;
  let codeHighlight = 0;
  const MAX_CODE_MATCHES = 8;

  // Rate book for one currency
  let rateOpen = false;
  let rateTarget = null;
  let rateForm = { rate: '', effectiveDate: today() };

  // Reporting currency
  let baseOpen = false;
  let baseChoice = '';

  const debouncedSearch = debounce(() => loadCurrencies(true), 250);
  onMount(() => debouncedSearch.cancel());

  function emptyForm() {
    return { code: '', name: '', symbol: '', rate: '', effectiveDate: today() };
  }

  $: allCurrencies = $currencyStore;
  $: visibleCurrencies = search.trim()
    ? allCurrencies.filter((currency) => `${currency.code} ${currency.name}`.toLowerCase().includes(search.trim().toLowerCase()))
    : allCurrencies;
  $: otherCurrencies = allCurrencies.filter((currency) => currency.isActive && !currency.isBase);
  $: canChangeBase = otherCurrencies.length > 0;
  // A base currency is the denominator, so it never carries a rate of its own.
  $: isBaseCode = Boolean(editing?.isBase) || form.code.trim().toUpperCase() === $baseCurrency;

  async function handleRequestError(error) {
    if (error.status === 401) return true;
    errorMessage = error.message;
    return false;
  }

  async function refresh() {
    loading = true;
    errorMessage = '';
    try {
      await loadCurrencies(true);
    } catch (error) {
      await handleRequestError(error);
    } finally {
      loading = false;
    }
  }

  function openCreate() {
    editing = null;
    form = emptyForm();
    modalError = '';
    codeOpen = false;
    currencyOpen = true;
    loadCatalogue();
  }

  async function loadCatalogue(force = false) {
    if (catalogue.length && !force) return;

    catalogueLoading = true;
    catalogueError = '';
    try {
      const result = await listCatalogue({ refresh: force });
      catalogue = result.items;
      catalogueSource = result.source;
      catalogueTotal = result.total;
    } catch (error) {
      if (!(await handleRequestError(error))) catalogueError = error.message;
    } finally {
      catalogueLoading = false;
    }
  }

  /* Typing filters on both the code and the name, so "pound" finds GBP. */
  $: codeQuery = form.code.trim().toUpperCase();
  $: codeMatches = (codeQuery
    ? catalogue.filter((item) => item.code.includes(codeQuery) || item.name.toUpperCase().includes(codeQuery))
    : catalogue
  ).slice(0, MAX_CODE_MATCHES);

  /* Picking a currency is what fills the name and symbol in. */
  function chooseCurrency(item) {
    form = { ...form, code: item.code, name: item.name, symbol: item.symbol || '' };
    codeOpen = false;
    codeHighlight = 0;
  }

  function onCodeInput(event) {
    form = { ...form, code: event.currentTarget.value.toUpperCase() };
    codeOpen = true;
    codeHighlight = 0;
  }

  function onCodeKeydown(event) {
    if (event.key === 'Escape') {
      codeOpen = false;
      return;
    }

    /* Enter takes the highlighted currency rather than submitting the form. */
    if (event.key === 'Enter' && codeOpen && codeMatches.length) {
      event.preventDefault();
      chooseCurrency(codeMatches[codeHighlight]);
      return;
    }

    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    event.preventDefault();
    if (!codeOpen) {
      codeOpen = true;
      return;
    }
    if (!codeMatches.length) return;

    const step = event.key === 'ArrowDown' ? 1 : -1;
    codeHighlight = (codeHighlight + step + codeMatches.length) % codeMatches.length;
  }

  /*
   * mousedown on an option is prevented, so the input never blurs first.
   * Leaving the field with a name typed in — "euro", "pound" — adopts the one
   * currency it matches, so a half-typed search never becomes a bad code.
   */
  function onCodeBlur() {
    codeOpen = false;

    const typed = form.code.trim().toUpperCase();
    if (!typed || /^[A-Z]{3}$/.test(typed)) return;

    const matches = catalogue.filter(
      (item) => item.code.includes(typed) || item.name.toUpperCase().includes(typed),
    );
    if (matches.length === 1) chooseCurrency(matches[0]);
  }

  function openEdit(currency) {
    editing = currency;
    form = {
      code: currency.code,
      name: currency.name,
      symbol: currency.symbol || '',
      rate: currency.isBase ? '' : String(currency.rate ?? ''),
      effectiveDate: currency.rateEffectiveDate?.slice(0, 10) || today(),
    };
    modalError = '';
    currencyOpen = true;
  }

  function closeCurrency() {
    if (saving) return;
    currencyOpen = false;
    codeOpen = false;
    editing = null;
  }

  async function submitCurrency() {
    modalError = '';
    const code = form.code.trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(code)) {
      modalError = $locale.currencies.codeHint;
      return;
    }
    if (!editing && form.rate !== '' && Number(form.rate) <= 0) {
      modalError = $locale.currencies.ratePositive;
      return;
    }

    saving = true;
    try {
      if (editing) {
        await updateCurrency(editing.id, {
          name: form.name.trim() || code,
          symbol: form.symbol.trim() || null,
          ...(editing.isBase || form.rate === '' ? {} : { rate: Number(form.rate), effectiveDate: form.effectiveDate }),
        });
        noticeMessage = $locale.currencies.updated;
      } else {
        await createCurrency({
          code,
          name: form.name.trim() || code,
          symbol: form.symbol.trim() || null,
          ...(form.rate === '' ? {} : { rate: Number(form.rate), effectiveDate: form.effectiveDate }),
        });
        noticeMessage = $locale.currencies.saved;
      }
      closeCurrency();
      await refresh();
    } catch (error) {
      if (!(await handleRequestError(error))) modalError = error.message;
    } finally {
      saving = false;
    }
  }

  function openRate(currency) {
    rateTarget = currency;
    rateForm = { rate: String(currency.rate ?? ''), effectiveDate: today() };
    modalError = '';
    rateOpen = true;
  }

  function closeRate() {
    if (saving) return;
    rateOpen = false;
    rateTarget = null;
  }

  async function submitRate() {
    modalError = '';
    if (Number(rateForm.rate) <= 0) {
      modalError = $locale.currencies.ratePositive;
      return;
    }

    saving = true;
    try {
      await addExchangeRate(rateTarget.id, {
        rate: Number(rateForm.rate),
        effectiveDate: rateForm.effectiveDate,
      });
      noticeMessage = $locale.currencies.rateSaved;
      closeRate();
      await refresh();
    } catch (error) {
      if (!(await handleRequestError(error))) modalError = error.message;
    } finally {
      saving = false;
    }
  }

  function openBase() {
    baseChoice = '';
    modalError = '';
    baseOpen = true;
  }

  function closeBase() {
    if (saving) return;
    baseOpen = false;
  }

  async function submitBase() {
    modalError = '';
    if (!baseChoice) {
      modalError = $locale.currencies.chooseBase;
      return;
    }

    saving = true;
    try {
      await setBaseCurrency(baseChoice);
      noticeMessage = $locale.currencies.baseSaved;
      closeBase();
      await refresh();
    } catch (error) {
      if (!(await handleRequestError(error))) modalError = error.message;
    } finally {
      saving = false;
    }
  }

  async function toggleActive(currency) {
    errorMessage = '';
    try {
      await updateCurrency(currency.id, { isActive: !currency.isActive });
      await refresh();
    } catch (error) {
      await handleRequestError(error);
    }
  }

  async function removeCurrency(currency) {
    errorMessage = '';
    if (!window.confirm($locale.currencies.confirmDelete)) return;
    try {
      await deleteCurrency(currency.id);
      noticeMessage = $locale.currencies.deleted;
      await refresh();
    } catch (error) {
      await handleRequestError(error);
    }
  }

  const rateLabel = (currency) => (currency.isBase
    ? $locale.currencies.baseRate
    : `1 ${currency.code} = ${formatMoney(currency.rate ?? 0, $baseCurrency)}`);
</script>

<svelte:head><title>{$locale.currencies.title} | {$locale.common.apartmentPro}</title></svelte:head>

<PageLayout>
  <svelte:fragment slot="toolbar">
    <PageToolbar
      bind:search
      searchPlaceholder={$locale.currencies.search}
      addLabel={$locale.currencies.add}
      onSearch={() => debouncedSearch()}
      onAdd={openCreate}
    />
  </svelte:fragment>

  <svelte:fragment slot="alerts">
    {#if noticeMessage}<div class="alert alert-success" role="status">{noticeMessage}</div>{/if}
    {#if errorMessage}<div class="alert alert-danger" role="alert">{errorMessage}</div>{/if}
  </svelte:fragment>

  <svelte:fragment slot="content">
    <div class="base-panel">
      <div>
        <p class="base-panel-label">{$locale.currencies.baseCurrency}</p>
        <p class="base-panel-value">{$baseCurrency}</p>
        <p class="base-panel-hint">{$locale.currencies.baseHint}</p>
      </div>
      <button class="btn btn-outline-primary btn-sm" type="button" on:click={openBase}>
        <i class="bi bi-arrow-repeat" aria-hidden="true"></i>
        {$locale.currencies.changeBase}
      </button>
    </div>

    <DataTable
      loading={loading || $currenciesLoading}
      isEmpty={visibleCurrencies.length === 0}
      loadingLabel={$locale.currencies.loading}
      emptyLabel={$locale.currencies.empty}
      emptyIcon="bi-cash-coin"
      minTableWidth="52rem"
    >
      <thead>
        <tr>
          <th>{$locale.currencies.currency}</th>
          <th>{$locale.currencies.symbol}</th>
          <th>{$locale.currencies.rate}</th>
          <th>{$locale.currencies.rateDate}</th>
          <th>{$locale.currencies.status}</th>
          <th><span class="visually-hidden">{$locale.currencies.actions}</span></th>
        </tr>
      </thead>
      <tbody>
        {#each visibleCurrencies as currency (currency.id)}
          <tr>
            <td>
              <strong>{currency.code}</strong>
              <span class="currency-name">{currency.name}</span>
              {#if currency.isBase}<span class="base-tag">{$locale.currencies.baseTag}</span>{/if}
            </td>
            <td class="symbol-cell">{currency.symbol || '—'}</td>
            <td class="amount-cell">{rateLabel(currency)}</td>
            <td class="date-cell">{formatShortDate(currency.rateEffectiveDate)}</td>
            <td>
              <StatusBadge
                label={currency.isActive ? $locale.currencies.active : $locale.currencies.inactive}
                tone={currency.isActive ? 'success' : 'neutral'}
              />
            </td>
            <td class="actions-cell">
              <button
                class="icon-button"
                type="button"
                on:click={() => openEdit(currency)}
                aria-label={$locale.currencies.edit}
                title={$locale.currencies.edit}
              >
                <i class="bi bi-pencil" aria-hidden="true"></i>
              </button>
              {#if !currency.isBase}
                <button
                  class="icon-button"
                  type="button"
                  on:click={() => openRate(currency)}
                  aria-label={$locale.currencies.rateHistory}
                  title={$locale.currencies.rateHistory}
                >
                  <i class="bi bi-graph-up-arrow" aria-hidden="true"></i>
                </button>
                <button
                  class="icon-button"
                  type="button"
                  on:click={() => toggleActive(currency)}
                  aria-label={currency.isActive ? $locale.currencies.deactivate : $locale.currencies.activate}
                  title={currency.isActive ? $locale.currencies.deactivate : $locale.currencies.activate}
                >
                  <i class={currency.isActive ? 'bi bi-pause-circle' : 'bi bi-play-circle'} aria-hidden="true"></i>
                </button>
                <button
                  class="icon-button danger"
                  type="button"
                  on:click={() => removeCurrency(currency)}
                  aria-label={$locale.currencies.delete}
                  title={$locale.currencies.delete}
                >
                  <i class="bi bi-trash" aria-hidden="true"></i>
                </button>
              {/if}
            </td>
          </tr>
        {/each}
      </tbody>
    </DataTable>
  </svelte:fragment>
</PageLayout>

<!-- Add / edit currency -->
<Modal
  bind:open={currencyOpen}
  title={editing ? $locale.currencies.editTitle : $locale.currencies.addTitle}
  description={editing ? editing.code : $locale.currencies.addHint}
  busy={saving}
  closeLabel={$locale.common.close}
  on:close={closeCurrency}
>
  <form id="currency-form" on:submit|preventDefault={submitCurrency} novalidate>
    {#if modalError}<div class="alert alert-danger" role="alert">{modalError}</div>{/if}
    <div class="row g-3">
      <div class="col-md-4">
        <label class="form-label" for="currency-code">{$locale.currencies.code}</label>
        {#if editing}
          <input id="currency-code" class="form-control" value={editing.code} disabled />
        {:else}
          <div class="currency-picker">
            <input
              id="currency-code"
              class="form-control"
              maxlength="24"
              placeholder="USD"
              autocomplete="off"
              role="combobox"
              aria-expanded={codeOpen && codeMatches.length > 0}
              aria-controls="currency-code-options"
              aria-autocomplete="list"
              value={form.code}
              on:input={onCodeInput}
              on:focus={() => { codeOpen = true; loadCatalogue(); }}
              on:keydown={onCodeKeydown}
              on:blur={onCodeBlur}
            />
            {#if codeOpen && codeMatches.length}
              <ul class="currency-options" id="currency-code-options" role="listbox">
                {#each codeMatches as item, index (item.code)}
                  <li class:active={index === codeHighlight} role="option" aria-selected={index === codeHighlight}>
                    <button type="button" on:mousedown|preventDefault on:click={() => chooseCurrency(item)}>
                      <span class="currency-option-code">{item.code}</span>
                      <span class="currency-option-name">{item.name}</span>
                      <span class="currency-option-symbol">{item.symbol || ''}</span>
                    </button>
                  </li>
                {/each}
              </ul>
            {/if}
          </div>
          <div class="form-text">{$locale.currencies.codeHint}</div>
          {#if catalogueLoading}
            <div class="form-text">{$locale.currencies.catalogueLoading}</div>
          {:else if catalogueError}
            <div class="form-text">{$locale.currencies.catalogueUnavailable}</div>
          {:else if catalogue.length}
            <div class="form-text">
              {(catalogueSource === 'api' ? $locale.currencies.catalogueHint : $locale.currencies.catalogueOffline).replace('{count}', catalogueTotal)}
              <button class="link-button" type="button" on:mousedown|preventDefault on:click={() => loadCatalogue(true)}>
                {$locale.currencies.catalogueRefresh}
              </button>
            </div>
          {/if}
        {/if}
      </div>
      <div class="col-md-4">
        <label class="form-label" for="currency-name">{$locale.currencies.name}</label>
        <input id="currency-name" class="form-control" bind:value={form.name} />
      </div>
      <div class="col-md-4">
        <label class="form-label" for="currency-symbol">{$locale.currencies.symbol}</label>
        <input id="currency-symbol" class="form-control" maxlength="8" bind:value={form.symbol} />
      </div>
      {#if !isBaseCode}
        <div class="col-md-6">
          <label class="form-label" for="currency-rate">
            {$locale.currencies.rateLabel.replace('{base}', $baseCurrency)}
          </label>
          <input
            id="currency-rate"
            class="form-control"
            type="number"
            min="0.00000001"
            step="0.00000001"
            bind:value={form.rate}
          />
          <div class="form-text">{$locale.currencies.rateHint.replace('{base}', $baseCurrency)}</div>
        </div>
        <div class="col-md-6">
          <label class="form-label" for="currency-rate-date">{$locale.currencies.rateDate}</label>
          <ShamsiDatePicker id="currency-rate-date" bind:value={form.effectiveDate} />
          <div class="form-text">{$locale.currencies.rateDateHint}</div>
        </div>
      {/if}
    </div>
  </form>
  <div slot="footer">
    <button class="btn btn-light" type="button" on:click={closeCurrency} disabled={saving}>{$locale.invoices.cancel}</button>
    <button class="btn btn-primary" type="submit" form="currency-form" disabled={saving}>
      {saving ? $locale.currencies.saving : $locale.currencies.save}
    </button>
  </div>
</Modal>

<!-- Rate book -->
<Modal
  bind:open={rateOpen}
  title={rateTarget ? $locale.currencies.rateHistoryTitle.replace('{code}', rateTarget.code) : ''}
  description={rateTarget ? $locale.currencies.rateHistoryHint.replace('{base}', $baseCurrency) : ''}
  size="modal-lg"
  busy={saving}
  closeLabel={$locale.common.close}
  on:close={closeRate}
>
  {#if rateTarget}
    <form id="rate-form" on:submit|preventDefault={submitRate} novalidate>
      {#if modalError}<div class="alert alert-danger" role="alert">{modalError}</div>{/if}
      <div class="row g-3">
        <div class="col-md-6">
          <label class="form-label" for="rate-value">
            {$locale.currencies.rateLabel.replace('{base}', $baseCurrency)}
          </label>
          <input id="rate-value" class="form-control" type="number" min="0.00000001" step="0.00000001" bind:value={rateForm.rate} />
        </div>
        <div class="col-md-6">
          <label class="form-label" for="rate-date">{$locale.currencies.rateDate}</label>
          <ShamsiDatePicker id="rate-date" bind:value={rateForm.effectiveDate} />
          <div class="form-text">{$locale.currencies.rateDateHint}</div>
        </div>
      </div>
    </form>

    <h3 class="h6 mt-4">{$locale.currencies.rateHistory}</h3>
    {#if rateTarget.rates.length === 0}
      <p class="text-muted mb-0">{$locale.currencies.noRates}</p>
    {:else}
      <div class="table-responsive">
        <table class="table">
          <thead>
            <tr>
              <th>{$locale.currencies.rateDate}</th>
              <th class="text-end">{$locale.currencies.rate}</th>
              <th>{$locale.currencies.source}</th>
            </tr>
          </thead>
          <tbody>
            {#each rateTarget.rates as entry (entry.id)}
              <tr>
                <td class="date-cell">{formatShortDate(entry.effectiveDate)}</td>
                <td class="amount-cell text-end">1 {rateTarget.code} = {formatMoney(entry.rate, $baseCurrency)}</td>
                <td>{entry.source === 'MANUAL' ? $locale.currencies.manual : entry.source}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {/if}
  {/if}
  <div slot="footer">
    <button class="btn btn-light" type="button" on:click={closeRate} disabled={saving}>{$locale.invoices.cancel}</button>
    <button class="btn btn-primary" type="submit" form="rate-form" disabled={saving}>
      {saving ? $locale.currencies.saving : $locale.currencies.saveRate}
    </button>
  </div>
</Modal>

<!-- Reporting currency -->
<Modal
  bind:open={baseOpen}
  title={$locale.currencies.changeBase}
  description={$locale.currencies.changeBaseHint}
  busy={saving}
  closeLabel={$locale.common.close}
  on:close={closeBase}
>
  <form id="base-form" on:submit|preventDefault={submitBase} novalidate>
    {#if modalError}<div class="alert alert-danger" role="alert">{modalError}</div>{/if}
    {#if canChangeBase}
      <label class="form-label" for="base-currency">{$locale.currencies.baseCurrency}</label>
      <select id="base-currency" class="form-select" bind:value={baseChoice}>
        <option value="">{$locale.currencies.chooseBase}</option>
        {#each otherCurrencies as currency (currency.id)}
          <option value={currency.code}>{currency.code} — {currency.name}</option>
        {/each}
      </select>
      <div class="form-text">{$locale.currencies.baseLockHint}</div>
    {:else}
      <p class="text-muted mb-0">{$locale.currencies.baseLocked}</p>
    {/if}
  </form>
  <div slot="footer">
    <button class="btn btn-light" type="button" on:click={closeBase} disabled={saving}>{$locale.invoices.cancel}</button>
    <button class="btn btn-primary" type="submit" form="base-form" disabled={saving || !canChangeBase}>
      {saving ? $locale.currencies.saving : $locale.currencies.saveBase}
    </button>
  </div>
</Modal>

<style>
  .base-panel {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    padding: 0.9rem 1rem;
    border-block-end: 1px solid var(--border);
    background: var(--surface-muted);
  }
  .base-panel-label { margin: 0; color: var(--text-muted); font-size: 0.75rem; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; }
  .base-panel-value { margin: 0.15rem 0 0; font-size: 1.25rem; font-weight: var(--weight-bold); }
  .base-panel-hint { margin: 0.15rem 0 0; color: var(--text-secondary); font-size: 0.8rem; max-inline-size: 42rem; }
  .currency-name { display: block; color: var(--text-secondary); font-size: 0.8rem; }
  .base-tag { display: inline-block; margin-inline-start: 0.4rem; padding: 0.05rem 0.4rem; border-radius: 999px; background: var(--accent-soft, var(--surface-muted)); color: var(--accent); font-size: 0.68rem; font-weight: 700; text-transform: uppercase; }
  .symbol-cell { font-size: 1.05rem; }
  /* The code field is a searchable list of currencies: type "po" or "GBP" and
     pick a row to fill the name and symbol in from the API's reference data. */
  .currency-picker { position: relative; }
  .currency-options {
    position: absolute;
    z-index: 20;
    inset-inline: 0;
    inset-block-start: calc(100% + 4px);
    max-block-size: 16rem;
    overflow-y: auto;
    margin: 0;
    padding: 0.25rem;
    border: 1px solid var(--border);
    border-radius: 0.6rem;
    background: var(--surface);
    box-shadow: var(--shadow-lg, 0 10px 30px rgba(0, 0, 0, 0.12));
    list-style: none;
  }
  .currency-options button {
    display: grid;
    grid-template-columns: 3.2rem 1fr auto;
    align-items: center;
    gap: 0.5rem;
    inline-size: 100%;
    padding: 0.4rem 0.5rem;
    border: 0;
    border-radius: 0.45rem;
    background: transparent;
    color: inherit;
    text-align: start;
  }
  .currency-options li.active button,
  .currency-options button:hover { background: var(--surface-muted); }
  .currency-option-code { font-weight: var(--weight-bold); font-size: 0.82rem; }
  .currency-option-name { color: var(--text-secondary); font-size: 0.82rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .currency-option-symbol { color: var(--text-muted); font-size: 0.9rem; }
  .link-button {
    margin-inline-start: 0.4rem;
    padding: 0;
    border: 0;
    background: none;
    color: var(--accent);
    font-size: inherit;
    text-decoration: underline;
  }
  .icon-button.danger { color: var(--danger); }
  .icon-button.danger:hover { border-color: var(--danger-border, var(--danger)); }
  @media (max-width: 767px) { .base-panel { flex-direction: column; align-items: stretch; } }
</style>
