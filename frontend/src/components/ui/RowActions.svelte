<script>
  /**
   * A row's actions behind a kebab — the `•••` the index tables are drawn with.
   *
   * The panel is positioned `fixed` from the trigger's own rectangle rather than
   * living inside the cell: a table body is a scroll container, so an absolutely
   * positioned menu would be clipped the moment the last rows scroll. Placing it
   * from a rect also lets it flip above the trigger when the row is near the
   * bottom of the window.
   *
   * The page supplies the items as children, styled by the global
   * `.row-menu-item` rule, so each page keeps its own conditions on what a row
   * can do:
   *
   *   <RowActions label={$locale.buildings.actions}>
   *     <button class="row-menu-item" on:click={...}><i class="bi bi-pencil" />Edit</button>
   *   </RowActions>
   */

  import { onMount, tick } from 'svelte';

  export let label = 'Row actions';
  /** Which edge of the trigger the panel hangs from: `end` matches a trailing column. */
  export let align = 'end';
  export let disabled = false;

  const MARGIN = 8;

  let open = false;
  let triggerEl = null;
  let menuEl = null;
  let menuPos = '';

  function place() {
    if (!triggerEl || !menuEl) return;
    const rect = triggerEl.getBoundingClientRect();
    const width = menuEl.offsetWidth;
    const height = menuEl.offsetHeight;
    let left = align === 'end' ? rect.right - width : rect.left;
    left = Math.min(Math.max(MARGIN, left), window.innerWidth - width - MARGIN);
    let top = rect.bottom + 6;
    if (top + height > window.innerHeight - MARGIN) top = Math.max(MARGIN, rect.top - height - 6);
    menuPos = `left:${Math.round(left)}px;top:${Math.round(top)}px;`;
  }

  function items() {
    if (!menuEl) return [];
    return [...menuEl.querySelectorAll('button:not([disabled]), a[href]')];
  }

  function focusItem(index) {
    const list = items();
    if (list.length === 0) return;
    list[(index + list.length) % list.length].focus();
  }

  function close(refocus = false) {
    if (!open) return;
    open = false;
    if (refocus) triggerEl?.focus();
  }

  async function openMenu() {
    if (disabled || open) return;
    open = true;
    await tick();
    place();
    focusItem(0);
  }

  function onTriggerClick() {
    if (open) close(true);
    else openMenu();
  }

  function onWindowPointerDown(event) {
    if (!open) return;
    if (menuEl?.contains(event.target) || triggerEl?.contains(event.target)) return;
    close();
  }

  function onWindowKeydown(event) {
    if (!open) return;
    if (event.key === 'Escape') {
      event.stopPropagation();
      close(true);
      return;
    }
    if (event.key === 'Tab') {
      close();
      return;
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      focusItem(items().indexOf(document.activeElement) + (event.key === 'ArrowDown' ? 1 : -1));
    }
  }

  // Any of these move the trigger out from under the panel, so it closes rather
  // than float at a stale spot.
  function onViewportChange() {
    if (open) close();
  }

  onMount(() => {
    window.addEventListener('mousedown', onWindowPointerDown, true);
    window.addEventListener('keydown', onWindowKeydown, true);
    window.addEventListener('resize', onViewportChange);
    window.addEventListener('scroll', onViewportChange, true);
    return () => {
      window.removeEventListener('mousedown', onWindowPointerDown, true);
      window.removeEventListener('keydown', onWindowKeydown, true);
      window.removeEventListener('resize', onViewportChange);
      window.removeEventListener('scroll', onViewportChange, true);
    };
  });
</script>

<div class="row-actions">
  <button
    type="button"
    class="row-actions-trigger"
    class:is-open={open}
    bind:this={triggerEl}
    aria-haspopup="menu"
    aria-expanded={open}
    aria-label={label}
    title={label}
    {disabled}
    on:click|stopPropagation={onTriggerClick}
  >
    <i class="bi bi-three-dots" aria-hidden="true"></i>
  </button>

  {#if open}
    <div
      class="row-actions-menu"
      role="menu"
      bind:this={menuEl}
      style={menuPos}
      on:click={() => close()}
    >
      <slot />
    </div>
  {/if}
</div>

<style>
  .row-actions {
    display: inline-flex;
    align-items: center;
    justify-content: flex-end;
  }

  /* No chrome until you reach for it: three dots in the muted cell colour, which
     is what keeps a column of them from out-shouting the data. */
  .row-actions-trigger {
    display: inline-grid;
    place-items: center;
    /* Deliberately smaller than a row: the control must not be what sets the row
       height, or every list grows to fit its kebab. */
    width: 1.6rem;
    height: 1.6rem;
    padding: 0;
    border: 0;
    border-radius: var(--radius-sm);
    color: var(--table-muted);
    background: transparent;
    font-size: 1.05rem;
    line-height: 1;
    cursor: pointer;
    transition: background 0.15s ease, color 0.15s ease;
  }

  .row-actions-trigger:hover,
  .row-actions-trigger.is-open {
    color: var(--text-strong);
    background: var(--surface-hover);
  }

  .row-actions-trigger:disabled {
    opacity: 0.45;
    cursor: default;
  }

  .row-actions-menu {
    position: fixed;
    z-index: 1030;
    display: grid;
    gap: 2px;
    min-width: 11rem;
    max-width: min(18rem, calc(100vw - 1rem));
    padding: 6px;
    border: 1px solid var(--card-border);
    border-radius: var(--radius-md);
    background: var(--surface);
    box-shadow: 0 12px 28px -10px rgba(16, 24, 40, 0.28), var(--card-shadow);
  }
</style>
