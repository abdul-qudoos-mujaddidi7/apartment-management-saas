<script>
  /**
   * The stack of transient confirmations raised by `stores/toasts`.
   *
   * Mounted once, by the app shell, so an action taken inside a dialog and an
   * action taken on a list both land in the same corner of the screen and
   * neither is wiped out by navigating away.
   */
  import { toasts, dismissToast } from '../../stores/toasts';
  import { locale } from '../../i18n';

  const ICONS = {
    success: 'bi-check2-circle',
    info: 'bi-info-circle',
    error: 'bi-exclamation-octagon'
  };
</script>

<div class="toast-stack" aria-live="polite">
  {#each $toasts as toast (toast.id)}
    <div
      class="app-toast tone-{toast.tone}"
      role={toast.tone === 'error' ? 'alert' : 'status'}
    >
      <i class="bi {ICONS[toast.tone] || ICONS.info}" aria-hidden="true"></i>
      <p class="app-toast-message">{toast.message}</p>
      <button
        class="app-toast-close"
        type="button"
        aria-label={$locale.common.close}
        on:click={() => dismissToast(toast.id)}
      >
        <i class="bi bi-x-lg" aria-hidden="true"></i>
      </button>
    </div>
  {/each}
</div>

<style>
  .toast-stack {
    position: fixed;
    /* Over the modal shell, whose dialog is at 1055: a save inside a dialog
       still gets its confirmation, even in the moment before it closes. */
    z-index: 2100;
    inset-block-start: var(--space-5);
    /* Logical, like the rest of the shell: the top right corner in English, and
       the same reading edge — top left — in Persian and Pashto. */
    inset-inline-end: var(--space-5);
    display: flex;
    /* The stack hangs from the top, so the newest confirmation takes the corner
       and the ones before it slide down out of the way. */
    flex-direction: column-reverse;
    gap: var(--space-3);
    width: min(23rem, calc(100vw - 2 * var(--space-4)));
    /* The stack only reserves the corner, it must not swallow clicks meant for
       the page behind it — each toast takes its own back. */
    pointer-events: none;
  }

  .app-toast {
    display: flex;
    align-items: flex-start;
    gap: var(--space-3);
    /* Leading edge a touch roomier than the trailing one, which the close
       button already pads. */
    padding-block: 0.7rem;
    padding-inline: 0.9rem 0.75rem;
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    background: var(--surface);
    box-shadow: var(--shadow-lg);
    font-size: var(--text-md);
    pointer-events: auto;
    animation: toast-in 200ms ease-out;
  }

  /* The tones are the ones the inline banners used, so a confirmation reads the
     same wherever it appears. */
  .app-toast.tone-success {
    color: var(--success);
    background: var(--success-soft);
    border-color: var(--success-border);
  }

  .app-toast.tone-info {
    color: var(--text-strong);
    background: var(--surface);
    border-color: var(--border);
  }

  .app-toast.tone-error {
    color: var(--danger);
    background: var(--danger-soft);
    border-color: var(--danger-border);
  }

  .app-toast > .bi {
    margin-block-start: 2px;
    font-size: 1rem;
    line-height: 1;
  }

  .app-toast-message {
    flex: 1 1 auto;
    min-width: 0;
    margin: 0;
    /* Long wording wraps instead of stretching the toast off the screen, and a
       word with no spaces in it still breaks. */
    overflow-wrap: anywhere;
  }

  .app-toast-close {
    flex: 0 0 auto;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 1.5rem;
    height: 1.5rem;
    margin-block-start: -2px;
    padding: 0;
    border: 0;
    border-radius: var(--radius-sm);
    color: inherit;
    background: transparent;
    opacity: 0.65;
    font-size: 0.75rem;
    cursor: pointer;
  }

  .app-toast-close:hover,
  .app-toast-close:focus-visible {
    opacity: 1;
    background: rgba(0, 0, 0, 0.06);
  }

  @keyframes toast-in {
    from {
      opacity: 0;
      transform: translateY(-0.5rem);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .app-toast {
      animation: none;
    }
  }

  @media (max-width: 575.98px) {
    .toast-stack {
      inset-inline: var(--space-3);
      inset-block-start: var(--space-3);
      width: auto;
    }
  }
</style>
