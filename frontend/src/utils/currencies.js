/*
 * The currencies a new workspace can pick as its reporting currency.
 *
 * This lives in one place because both signup forms — the marketing page's
 * inline form and the dedicated Register page — offer the same choice, and a
 * workspace's reporting currency cannot be changed once it has posted money.
 * Anything outside this list can still be typed in as its ISO code.
 */
export const currencyOptions = [
  { code: 'AFN', name: 'Afghan Afghani' },
  { code: 'USD', name: 'US Dollar' },
  { code: 'EUR', name: 'Euro' },
  { code: 'PKR', name: 'Pakistani Rupee' },
  { code: 'IRR', name: 'Iranian Rial' },
  { code: 'INR', name: 'Indian Rupee' },
  { code: 'AED', name: 'UAE Dirham' },
  { code: 'SAR', name: 'Saudi Riyal' },
  { code: 'TRY', name: 'Turkish Lira' },
  { code: 'CNY', name: 'Chinese Yuan' },
  { code: 'GBP', name: 'Pound Sterling' },
  { code: 'CAD', name: 'Canadian Dollar' },
];

/* Sentinel for the "Other currency…" option, which reveals a free-text code. */
export const CUSTOM_CURRENCY = 'OTHER';

/* ISO 4217 codes are three letters; the API uppercases whatever it receives. */
export function isCurrencyCode(value) {
  return /^[A-Za-z]{3}$/.test(String(value || '').trim());
}

/*
 * The code to submit for a given pair of form values: either the chosen option
 * or the typed-in code, uppercased so two spellings never become two
 * currencies in the catalogue.
 */
export function resolveCurrencyCode(selected, custom) {
  return selected === CUSTOM_CURRENCY ? String(custom || '').trim().toUpperCase() : selected;
}
