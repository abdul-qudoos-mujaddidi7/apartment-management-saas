<script>
  import { locale } from '../i18n';
  import { resolvedTheme, toggleTheme } from '../stores/theme';

  // The button is a switch, not a menu: it shows the state it will move *to*,
  // so the icon is the destination — a moon while the page is light, a sun
  // while it is dark.
  $: isDark = $resolvedTheme === 'dark';
  $: label = isDark ? $locale.common.themeLight : $locale.common.themeDark;
</script>

<button
  type="button"
  class="theme-toggle"
  on:click={toggleTheme}
  aria-pressed={isDark}
  aria-label={label}
  title={label}
>
  <i class={`bi ${isDark ? 'bi-sun' : 'bi-moon'}`} aria-hidden="true"></i>
</button>

<style>
  .theme-toggle {
    display: inline-grid;
    place-items: center;
    width: var(--topbar-control);
    height: var(--topbar-control);
    padding: 0;
    border: 0;
    border-radius: var(--radius-pill);
    color: var(--topbar-icon);
    background: transparent;
    font-size: 1.15rem;
    cursor: pointer;
    transition: color var(--transition), background-color var(--transition);
  }

  .theme-toggle:hover {
    color: var(--topbar-icon-hover);
    background: var(--topbar-control-hover);
  }

  .theme-toggle:focus-visible {
    outline: 0;
    box-shadow: var(--ring);
  }
</style>