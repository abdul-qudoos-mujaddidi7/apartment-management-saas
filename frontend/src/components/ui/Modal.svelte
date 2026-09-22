<script>
  import { createEventDispatcher, onDestroy, tick } from 'svelte';

  import { isTopDialog, nextDialogId, registerDialog, unregisterDialog } from '../../utils/dialogStack';

  export let open = false;
  export let title = '';
  export let description = ''; // one-line subtitle shown under the title
  export let busy = false;
  export let size = ''; // '' | 'modal-lg' | 'modal-xl'
  export let bodyClass = ''; // extra classes for .modal-body (e.g. a sunken backdrop)
  export let closeLabel = 'Close';

  const dispatch = createEventDispatcher();

  /* Unique per instance: a dialog opened from inside another dialog would
     otherwise share one id and steal the outer dialog's accessible name. */
  const dialogId = nextDialogId();

  let dialogElement;
  let lastOpen = false;
  let previousFocus = null;
  // 0 for the outermost dialog; each nesting level gets its own layer pair.
  let dialogDepth = 0;

  function close() {
    if (!busy) dispatch('close');
  }

  /* Dialogs live at the end of <body>, so a dialog opened from inside another
     dialog is not nested in the parent's aria-modal subtree. */
  function portalToBody(node) {
    document.body.appendChild(node);
    return {
      destroy() {
        node.parentNode?.removeChild(node);
      }
    };
  }

  function handleKeydown(event) {
    if (!open) return;

    /* Only the innermost open dialog owns the keyboard. */
    if (!isTopDialog(dialogId)) return;

    if (event.key === 'Escape' && !busy) {
      close();
      return;
    }

    if (event.key !== 'Tab') return;

    const focusable = Array.from(dialogElement?.querySelectorAll(
      'a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])'
    ) || []).filter((element) => !element.hasAttribute('hidden'));

    if (focusable.length === 0) {
      event.preventDefault();
      return;
    }

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  $: if (open && !lastOpen) {
    lastOpen = true;
    dialogDepth = registerDialog(dialogId);
    previousFocus = typeof document !== 'undefined' ? document.activeElement : null;
    tick().then(() => {
      /* Land on the first field, not the header's close button — the dialog
         should open with the cursor where the work happens. */
      const firstField = dialogElement?.querySelector(
        'input:not([type="hidden"]):not([disabled]), select:not([disabled]), textarea:not([disabled])'
      );
      const fallback = dialogElement?.querySelector(
        'button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'
      );
      (firstField || fallback)?.focus();
    });
  } else if (!open && lastOpen) {
    lastOpen = false;
    unregisterDialog(dialogId);
    previousFocus?.focus?.();
    previousFocus = null;
  }

  // Unmounting while open must not leave a stale entry on the stack.
  onDestroy(() => unregisterDialog(dialogId));
</script>

<svelte:window on:keydown={handleKeydown} />

{#if open}

  <div class="modal-layer" style={`--modal-depth: ${dialogDepth}`} use:portalToBody>

    <button
      class="modal-backdrop fade show"
      type="button"
      on:click={close}
      aria-label={closeLabel}
    ></button>

    <div
      class="modal fade show d-block"
      role="dialog"
      aria-modal="true"
      aria-labelledby={title ? `${dialogId}-title` : undefined}
      aria-describedby={description ? `${dialogId}-description` : undefined}
      bind:this={dialogElement}
    >
      <div class="modal-dialog modal-dialog-centered" class:modal-lg={size === 'modal-lg'} class:modal-xl={size === 'modal-xl'}>
        <div class="modal-content">

          <div class="modal-header">
            {#if title || description}
              <div class="modal-heading">
                {#if title}
                  <h2 class="modal-title" id={`${dialogId}-title`}>{title}</h2>
                {/if}
                {#if description}
                  <p class="modal-description" id={`${dialogId}-description`}>{description}</p>
                {/if}
              </div>
            {/if}

            <slot name="header" />

            <button
              type="button"
              class="btn-close"
              on:click={close}
              aria-label={closeLabel}
              disabled={busy}
            ></button>
          </div>

          <div class="modal-body {bodyClass}">
            <slot />
          </div>

          <div class="modal-footer">
            <slot name="footer" />
          </div>

        </div>
      </div>
    </div>

  </div>

{/if}
