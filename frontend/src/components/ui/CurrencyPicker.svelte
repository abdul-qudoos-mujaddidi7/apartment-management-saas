<script>
  /*
   * A currency field that searches the currency API and fills the name and the
   * symbol in from whatever you pick.
   *
   * There is one of these because a currency is named in three places — Settings
   * › Currencies, the Register page and the landing page's signup form — and the
   * reporting currency chosen at signup cannot be changed once money has been
   * posted. Two lists that disagree about what a code means would be a trap, so
   * there is one list, fetched the first time the field is focused.
   *
   * The list is reference data from the currency API through our own endpoint.
   * When that cannot be reached the field stays typeable and the bundled list is
   * used instead, so a currency the API has never heard of can still be entered —
   * it simply arrives without a name to fill in.
   */
  import { createEventDispatcher } from 'svelte';

  import { listCatalogue } from '../../services/currencies';
  import { locale } from '../../i18n';

  export let id = 'currency-code';
  /* The three-letter code, the name and the symbol: bindable, so choosing a
     currency is what fills all three in. */
  export let code = '';
  export let name = '';
  export let symbol = '';
  export let placeholder = 'USD';
  export let disabled = false;
  export let invalid = false;
  export let inputClass = 'form-control';
  export let hint = '';
  export let ariaDescribedBy = undefined;
  /* The line about where the list came from, and its Refresh button. */
  export let showStatus = true;
  /* Overrides the offline message, which names the name and symbol fields that
     only the Currencies page has. */
  export let unavailableMessage = undefined;
  export let limit = 8;

  const dispatch = createEventDispatcher();

  let catalogue = [];
  let source = '';
  let total = 0;
  let loading = false;
  let error = '';
  let open = false;
  let highlight = 0;

  /* Kept for the session once loaded, so opening the field twice does not
     re-ask the server; a failed load retries on the next focus. */
  async function load(force = false) {
    if (catalogue.length && !force) return;

    loading = true;
    error = '';
    try {
      const result = await listCatalogue({ refresh: force });
      catalogue = result.items;
      source = result.source;
      total = result.total;
    } catch (failure) {
      error = failure.message;
    } finally {
      loading = false;
    }
  }

  /* Typing filters on both the code and the name, so "pound" finds GBP. */
  $: query = code.trim().toUpperCase();
  $: matches = (query
    ? catalogue.filter((item) => item.code.includes(query) || item.name.toUpperCase().includes(query))
    : catalogue
  ).slice(0, limit);

  /* Picking a currency is what fills the name and the symbol in. */
  function choose(item) {
    code = item.code;
    name = item.name;
    symbol = item.symbol || '';
    open = false;
    highlight = 0;
    dispatch('select', item);
  }

  function onInput(event) {
    code = event.currentTarget.value.toUpperCase();
    open = true;
    highlight = 0;
  }

  function onFocus() {
    open = true;
    load();
  }

  function onKeydown(event) {
    if (event.key === 'Escape') {
      open = false;
      return;
    }

    /* Enter takes the highlighted currency rather than submitting the form. */
    if (event.key === 'Enter' && open && matches.length) {
      event.preventDefault();
      choose(matches[highlight]);
      return;
    }

    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    event.preventDefault();
    if (!open) {
      open = true;
      return;
    }
    if (!matches.length) return;

    const step = event.key === 'ArrowDown' ? 1 : -1;
    highlight = (highlight + step + matches.length) % matches.length;
  }

  /*
   * mousedown on an option is prevented, so the input never blurs first.
   * Leaving the field with a name typed in — "euro", "pound" — adopts the one
   * currency it matches, so a half-typed search never becomes a bad code.
   */
  function onBlur() {
    open = false;

    const typed = code.trim().toUpperCase();
    if (!typed || /^[A-Z]{3}$/.test(typed)) return;

    const found = catalogue.filter(
      (item) => item.code.includes(typed) || item.name.toUpperCase().includes(typed),
    );
    if (found.length === 1) choose(found[0]);
  }
</script>

<div class="currency-picker">
  <input
    {id}
    class={inputClass}
    class:is-invalid={invalid}
    maxlength="24"
    {placeholder}
    {disabled}
    autocomplete="off"
    role="combobox"
    aria-expanded={open && matches.length > 0}
    aria-controls={`${id}-options`}
    aria-autocomplete="list"
    aria-invalid={invalid}
    aria-describedby={ariaDescribedBy}
    value={code}
    on:input={onInput}
    on:focus={onFocus}
    on:keydown={onKeydown}
    on:blur={onBlur}
  />
  {#if open && matches.length}
    <ul class="currency-options" id={`${id}-options`} role="listbox">
      {#each matches as item, index (item.code)}
        <li class:active={index === highlight} role="option" aria-selected={index === highlight}>
          <button type="button" on:mousedown|preventDefault on:click={() => choose(item)}>
            <span class="currency-option-code">{item.code}</span>
            <span class="currency-option-name">{item.name}</span>
            <span class="currency-option-symbol">{item.symbol || ''}</span>
          </button>
        </li>
      {/each}
    </ul>
  {/if}
</div>

{#if hint}
  <div class="form-text">{hint}</div>
{/if}

{#if showStatus}
  {#if loading}
    <div class="form-text">{$locale.currencies.catalogueLoading}</div>
  {:else if error}
    <div class="form-text">{unavailableMessage ?? $locale.currencies.catalogueUnavailable}</div>
  {:else if catalogue.length}
    <div class="form-text">
      {(source === 'api' ? $locale.currencies.catalogueHint : $locale.currencies.catalogueOffline).replace('{count}', total)}
      <button class="link-button" type="button" on:mousedown|preventDefault on:click={() => load(true)}>
        {$locale.currencies.catalogueRefresh}
      </button>
    </div>
  {/if}
{/if}

<style>
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
    color: var(--accent-text);
    font-size: inherit;
    text-decoration: underline;
  }
</style>
