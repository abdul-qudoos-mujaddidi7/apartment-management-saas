import { get, writable } from 'svelte/store';

/**
 * Light / dark / follow-the-OS.
 *
 * The value lives in localStorage and is mirrored onto `<html data-theme>` —
 * the attribute `[data-theme='dark']` in tokens.css keys off. A `<script>` in
 * index.html applies the same rule before the first paint. Public pages always
 * use light mode; authenticated pages retain the saved preference.
 */
const STORAGE_KEY = 'apartmentpro.theme';

export const themes = ['light', 'dark', 'system'];

/** The stored preference, or 'system' for a first visit. */
function readStored() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return themes.includes(stored) ? stored : 'system';
  } catch {
    return 'system';
  }
}

const prefersDark = () =>
  typeof window !== 'undefined' && window.matchMedia
    ? window.matchMedia('(prefers-color-scheme: dark)').matches
    : false;

/** What a preference resolves to once the OS is taken into account. */
export function resolveTheme(preference) {
  return preference === 'system' ? (prefersDark() ? 'dark' : 'light') : preference;
}

export const themePreference = writable(readStored());

function pageTheme() {
  const path = typeof window !== 'undefined'
    ? window.location.hash.slice(1).split('?')[0] || '/'
    : '/';
  return ['/', '/login', '/register'].includes(path)
    ? 'light'
    : resolveTheme(get(themePreference));
}

/** The theme actually on screen: 'light' or 'dark', never 'system'. */
export const resolvedTheme = writable(pageTheme());

function paint(theme) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.dataset.theme = theme;
  // Tells the UA to draw form controls, scrollbars and the caret for the right
  // scheme; without it a dark page keeps light native widgets.
  root.style.colorScheme = theme;
}

export function setTheme(preference) {
  const next = themes.includes(preference) ? preference : 'system';
  themePreference.set(next);
  try {
    localStorage.setItem(STORAGE_KEY, next);
  } catch { /* private mode */ }
}

/** Flip to the other side of what is currently showing. */
export function toggleTheme() {
  setTheme(get(resolvedTheme) === 'dark' ? 'light' : 'dark');
}

if (typeof window !== 'undefined') {
  const apply = () => {
    const theme = pageTheme();
    resolvedTheme.set(theme);
    paint(theme);
  };

  apply();

  themePreference.subscribe(apply);
  window.addEventListener('hashchange', apply);

  // Only meaningful while the preference is 'system', but the listener is
  // harmless either way — `apply` re-resolves and the OS value is ignored
  // unless the preference actually defers to it.
  window.matchMedia?.('(prefers-color-scheme: dark)').addEventListener?.('change', () => {
    if (get(themePreference) === 'system') apply('system');
  });
}
