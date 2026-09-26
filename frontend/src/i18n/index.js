import { derived, get, writable } from 'svelte/store';
import rtlBootstrapUrl from 'bootstrap/dist/css/bootstrap.rtl.min.css?url';
import en from './en';
import fa from './fa';
import ps from './ps';

const dictionaries = { en, fa, ps };
const directionByLanguage = { en: 'ltr', fa: 'rtl', ps: 'rtl' };
const browserLanguage = typeof window !== 'undefined' ? localStorage.getItem('apartmentpro.language') : null;
const initialLanguage = dictionaries[browserLanguage] ? browserLanguage : 'fa';

export const language = writable(initialLanguage);
export const locale = derived(language, (currentLanguage) => dictionaries[currentLanguage]);

let rtlStylesheet;

function applyDocumentLanguage(currentLanguage) {
  if (typeof document === 'undefined') return;

  const direction = directionByLanguage[currentLanguage];
  document.documentElement.lang = currentLanguage;
  document.documentElement.dir = direction;

  if (direction === 'rtl') {
    if (!rtlStylesheet) {
      rtlStylesheet = document.createElement('link');
      rtlStylesheet.id = 'bootstrap-rtl-stylesheet';
      rtlStylesheet.rel = 'stylesheet';
      rtlStylesheet.href = rtlBootstrapUrl;
      /* First in <head>, not last. Bootstrap's RTL sheet is a *replacement*
         for the LTR one the app imports, not an addition to it, and both
         hard-code their palette rather than reading our tokens — so whenever
         the two meet at equal specificity, whichever came last wins. Appended,
         that was Bootstrap: an outline-primary button drew #0d6efd, its own
         blue, next to our #3586ff primary. Prepended, the app's stylesheet and
         its component styles keep the last word, which is what they assume. */
      document.head.insertBefore(rtlStylesheet, document.head.firstChild);
    }
  } else if (rtlStylesheet) {
    rtlStylesheet.remove();
    rtlStylesheet = undefined;
  }
}

export function setLanguage(nextLanguage) {
  if (!dictionaries[nextLanguage]) return;
  localStorage.setItem('apartmentpro.language', nextLanguage);
  language.set(nextLanguage);
  applyDocumentLanguage(nextLanguage);
}

/**
 * The dictionary for one specific language, whatever the interface is set to.
 *
 * A printed contract is written in the language it is printed in, while the
 * chrome around it stays in the reader's own language — so the document's own
 * headings and field labels are read from here rather than from `$locale`.
 */
export function dictionaryFor(currentLanguage) {
  return dictionaries[currentLanguage] || dictionaries.en;
}

language.subscribe(applyDocumentLanguage);

export function translate(key, values = {}) {
  const parts = key.split('.');
  let value = get(locale);
  for (const part of parts) value = value?.[part];
  if (typeof value !== 'string') return key;
  return value.replace(/\{(\w+)\}/g, (_, name) => values[name] ?? `{${name}}`);
}
