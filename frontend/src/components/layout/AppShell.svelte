<script>
  import { user } from '../../stores/auth';
  import { locale } from '../../i18n';
  import Sidebar from '../Sidebar.svelte';
  import Topbar from './Topbar.svelte';
  import ToastStack from '../ui/ToastStack.svelte';

  let navigationOpen = false;
</script>

<a class="skip-link" href="#main-content">{$locale.common.skipToContent}</a>

<div class="dashboard-layout">
  <div class="dashboard-container">
    <Sidebar user={$user} bind:open={navigationOpen} />

    <main class="dashboard-main" id="main-content" tabindex="-1">
      <Topbar
        {navigationOpen}
        on:toggleNav={() => { navigationOpen = true; }}
      />

      <div class="app-page">
        <slot />
      </div>
    </main>
  </div>
</div>

<!-- One stack for the whole shell: a confirmation survives the navigation that
     follows the action that raised it. -->
<ToastStack />
