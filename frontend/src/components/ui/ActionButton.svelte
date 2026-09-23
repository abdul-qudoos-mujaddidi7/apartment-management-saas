<script>
  export let icon = '';
  export let label = '';
  export let disabled = false;
  export let type = 'button';
</script>

<button class="btn btn-primary add-button" {type} {disabled} on:click>
  {#if icon}<i class={`bi ${icon}`} aria-hidden="true"></i>{/if}
  <span>{label}</span>
</button>

<style>
  /* Flat accent fill with a soft glow under it, not a gradient: the button is
     the one saturated thing on the page, and a two-stop gradient on a 35px
     control reads as a bead rather than a button at this size. */
  .add-button {
    border-color: var(--accent);
    background: var(--accent);
    box-shadow: var(--shadow-accent);
    font-weight: var(--weight-semibold);
  }

  .add-button:hover:not(:disabled) {
    border-color: var(--accent-hover);
    background: var(--accent-hover);
    box-shadow: var(--shadow-accent);
  }
</style>
