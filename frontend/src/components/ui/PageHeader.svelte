<script>
  export let title = '';
  export let description = '';
  export let icon = '';

  // Pages whose content is a message (e.g. 404) still pass a title; list pages
  // do not, and then this renders as a compact page-action bar instead.
  $: hasHeading = Boolean(title || description);
</script>

{#if hasHeading || $$slots.actions}
  <header class="app-page-header" class:is-actions-only={!hasHeading}>
    {#if hasHeading}
      <div class="app-page-heading">
        {#if icon}
          <span class="page-header-icon" aria-hidden="true">
            <i class="bi {icon}"></i>
          </span>
        {/if}

        <div>
          {#if title}
            <h1 class="app-page-title">{title}</h1>
          {/if}

          {#if description}
            <p class="app-page-description">{description}</p>
          {/if}
        </div>
      </div>
    {/if}

    {#if $$slots.actions}
      <div class="app-page-actions">
        <slot name="actions" />
      </div>
    {/if}
  </header>
{/if}
