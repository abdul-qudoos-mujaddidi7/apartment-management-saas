/*
 * Whether a value is a three-letter code, the shape the API stores.
 *
 * The list of currencies is no longer here: both signup forms use
 * components/ui/CurrencyPicker.svelte, which searches the currency API so the
 * name and the symbol come from the same source Settings › Currencies uses. This
 * is the check that what was typed — or left empty, meaning the default, AFN — is
 * a code at all, so a half-typed search never reaches the API as a currency.
 */
export function isCurrencyCode(value) {
  return /^[A-Za-z]{3}$/.test(String(value || '').trim());
}
