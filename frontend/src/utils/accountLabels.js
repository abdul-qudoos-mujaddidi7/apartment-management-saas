/**
 * Localized labels for the built-in ledger accounts.
 *
 * The reference ERP stores a name per language on every account row
 * (name / name_fa / name_ps) and picks one by the active language, falling back
 * to the untranslated `name`. ApartmentPro seeds its built-in accounts once with
 * English names, so the i18n layer carries the translations: the stable
 * `systemKey` selects the translated name, and anything custom or untranslated
 * keeps the name it was stored with. Account types are a fixed enum, so they are
 * looked up directly.
 */
export function accountNameLabel(account, locale) {
  if (!account) return '';
  const translated = account.systemKey ? locale?.accounts?.names?.[account.systemKey] : '';
  return translated || account.name || '';
}

export function accountTypeLabel(type, locale) {
  if (!type) return '';
  return locale?.accounts?.types?.[type] || type;
}
