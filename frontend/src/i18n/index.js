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
      document.head.appendChild(rtlStylesheet);
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

language.subscribe(applyDocumentLanguage);

export function translate(key, values = {}) {
  const parts = key.split('.');
  let value = get(locale);
  for (const part of parts) value = value?.[part];
  if (typeof value !== 'string') return key;
  return value.replace(/\{(\w+)\}/g, (_, name) => values[name] ?? `{${name}}`);
}
