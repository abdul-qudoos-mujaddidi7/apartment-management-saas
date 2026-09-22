<script>
  export let icon = '';
  export let title = '';
  export let description = '';
</script>

<div class="app-empty-state">
  {#if icon}
    <i class="bi {icon}" aria-hidden="true"></i>
  {/if}

  {#if title}
    <h3>{title}</h3>
  {/if}

  {#if description}
    <p>{description}</p>
  {/if}

  {#if $$slots.action}
    <slot name="action" />
  {/if}
</div>
