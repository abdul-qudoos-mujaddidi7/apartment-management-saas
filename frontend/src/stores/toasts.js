import { writable } from 'svelte/store';

const MAX_VISIBLE = 3;

/* A confirmation can be read at a glance; an error deserves longer, because it
   is the only place its text appears. */
const DURATION = {
  success: 4000,
  info: 4000,
  error: 8000
};

const TONES = Object.keys(DURATION);

let nextId = 1;
let current = [];
const timers = new Map();

/** The toasts on screen, oldest first. Rendered by `ToastStack`. */
export const toasts = writable([]);

function commit() {
  toasts.set(current);
}

/* A toast that was pushed off the end of the stack still owns a timer, and
   firing it later would clear a toast that has since been re-raised under the
   same id. Only timers whose toast is still listed are kept. */
function dropStaleTimers() {
  const live = new Set(current.map((toast) => toast.id));
  for (const [id, timer] of timers) {
    if (!live.has(id)) {
      clearTimeout(timer);
      timers.delete(id);
    }
  }
}

export function dismissToast(id) {
  const timer = timers.get(id);
  if (timer) {
    clearTimeout(timer);
    timers.delete(id);
  }
  current = current.filter((toast) => toast.id !== id);
  commit();
}

/**
 * Show a message for a few seconds.
 *
 * @param {string} message Already-localized text. An empty string is ignored,
 *   so a page can call this with whatever the action produced.
 * @param {{ tone?: 'success'|'info'|'error', duration?: number }} [options]
 *   `duration: 0` pins the toast until it is dismissed.
 */
export function pushToast(message, options = {}) {
  const text = typeof message === 'string' ? message.trim() : '';
  if (!text) return null;

  const tone = TONES.includes(options.tone) ? options.tone : 'success';
  const id = nextId++;
  const duration = options.duration ?? DURATION[tone];

  current = [...current, { id, message: text, tone }].slice(-MAX_VISIBLE);
  commit();
  dropStaleTimers();

  if (duration > 0) {
    timers.set(id, setTimeout(() => dismissToast(id), duration));
  }
  return id;
}

export const notifySuccess = (message, options = {}) => pushToast(message, { ...options, tone: 'success' });
export const notifyInfo = (message, options = {}) => pushToast(message, { ...options, tone: 'info' });
export const notifyError = (message, options = {}) => pushToast(message, { ...options, tone: 'error' });

/** Drop everything — used when the session ends, so one user's confirmations
 *  never greet the next one. */
export function resetToasts() {
  for (const timer of timers.values()) clearTimeout(timer);
  timers.clear();
  current = [];
  commit();
}
