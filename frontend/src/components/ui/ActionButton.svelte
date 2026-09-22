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
  .add-button {
    border-color: var(--accent);
    background: linear-gradient(180deg, var(--brand-400), var(--accent));
    box-shadow: 0 0.3rem 0.7rem rgba(30, 108, 165, 0.16);
    font-weight: var(--weight-bold);
  }

  .add-button:hover:not(:disabled) {
    border-color: var(--accent-hover);
    background: linear-gradient(180deg, var(--accent), var(--accent-hover));
    box-shadow: 0 0.4rem 0.9rem rgba(23, 87, 127, 0.18);
  }
</style>
