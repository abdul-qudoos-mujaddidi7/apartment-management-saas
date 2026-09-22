import { derived, get, writable } from 'svelte/store';
import { listCurrencies } from '../services/currencies';

/**
 * The organization's currencies, loaded once per session and shared by every
 * page that shows or enters money.
 *
 * Money documents store the rate they were priced at, so this store's rates are
 * only ever used to *preview* a conversion in a form. The authoritative rate is
 * resolved by the server for the document's own date and frozen onto it.
 */

export const currencies = writable([]);
export const baseCurrency = writable('AFN');
export const currenciesLoading = writable(false);

let loadPromise = null;
let sessionVersion = 0;

export const activeCurrencies = derived(currencies, ($currencies) =>
  $currencies.filter((currency) => currency.isActive));

/** Rate of `code` against the base currency; 1 for the base currency itself. */
export function rateFor(code, $currencies = get(currencies), $baseCurrency = get(baseCurrency)) {
  if (!code) return 1;
  if (String(code).toUpperCase() === String($baseCurrency).toUpperCase()) return 1;
  const match = $currencies.find(
    (currency) => currency.code.toUpperCase() === String(code).toUpperCase(),
  );
  if (!match) return 1;
  return Number(match.rate) || 1;
}

/**
 * Preview a conversion between two currencies at the current rates.
 * Mirrors the server's arithmetic: base units per unit of each currency.
 */
export function convertAmount(amount, from, to, $currencies = get(currencies), $baseCurrency = get(baseCurrency)) {
  const value = Number(amount) || 0;
  const fromRate = rateFor(from, $currencies, $baseCurrency);
  const toRate = rateFor(to, $currencies, $baseCurrency);
  if (!toRate) return 0;
  if (fromRate === toRate) return value;
  return Number(((value * fromRate) / toRate).toFixed(2));
}

/** Amount in the base currency, for the totals that span currencies. */
export function toBase(amount, code, $currencies = get(currencies), $baseCurrency = get(baseCurrency)) {
  return convertAmount(amount, code, $baseCurrency, $currencies, $baseCurrency);
}

export function loadCurrencies(force = false) {
  if (loadPromise) return loadPromise;
  if (!force && get(currencies).length) return Promise.resolve(get(currencies));

  const version = sessionVersion;
  currenciesLoading.set(true);
  loadPromise = (async () => {
    try {
      const response = await listCurrencies({ includeInactive: true });
      if (version !== sessionVersion) return [];
      currencies.set(response.items);
      baseCurrency.set(response.baseCurrency || 'AFN');
      return response.items;
    } catch (error) {
      // The currency list is supporting data: a page that cannot load it should
      // still render, falling back to base-currency display.
      if (version !== sessionVersion) return [];
      throw error;
    } finally {
      if (version === sessionVersion) {
        currenciesLoading.set(false);
        loadPromise = null;
      }
    }
  })();

  return loadPromise;
}

/** Called on sign-out so the next session fetches its own organization's list. */
export function resetCurrencies() {
  sessionVersion += 1;
  loadPromise = null;
  currencies.set([]);
  baseCurrency.set('AFN');
  currenciesLoading.set(false);
}
