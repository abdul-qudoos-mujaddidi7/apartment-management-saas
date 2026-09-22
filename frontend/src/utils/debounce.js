/**
 * Create a debounced function that delays invoking `fn` until after `delay`
 * milliseconds have elapsed since the last time the debounced function was
 * invoked. Returns a `cancel` function for cleanup.
 *
 * Usage:
 *   const search = debounce(() => loadData(1), 300);
 *   on:input={search}
 *   onDestroy(() => search.cancel());
 */
export function debounce(fn, delay = 300) {
  let timer = null;

  function debounced(...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  }

  debounced.cancel = () => {
    clearTimeout(timer);
    timer = null;
  };

  return debounced;
}
