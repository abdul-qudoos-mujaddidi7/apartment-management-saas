<script>
  export let label = '';
  export let tone = 'neutral'; // success | warning | danger | neutral | info
</script>

<span class="status-badge status-{tone}">
  <span class="status-indicator" aria-hidden="true"></span>
  {label}
</span>
