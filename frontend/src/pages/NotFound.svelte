<script>
  import { link } from 'svelte-spa-router';
  import PageHeader from '../components/ui/PageHeader.svelte';
  import { locale } from '../i18n';
</script>

<svelte:head>
  <title>{$locale.common.notFound} | {$locale.common.apartmentPro}</title>
</svelte:head>

<PageHeader
  title={$locale.common.notFound}
  description={$locale.common.notFoundDescription}
/>
<a class="btn btn-primary" href="/dashboard" use:link>
  {$locale.common.backToDashboard}
</a>
