<script>
  import { language, locale, setLanguage } from '../i18n';

  const options = [
    { value: 'fa', label: 'دری' },
    { value: 'ps', label: 'پښتو' },
    { value: 'en', label: 'English' },
  ];

  /**
   * `compact` is the console's topbar variant: the globe alone, no visible
   * label or box. The public pages (landing, sign-in, register) keep the
   * labelled select — there the language is part of the page's own chrome,
   * while the console's bar is a row of icons.
   *
   * The native <select> is still what opens: it is stretched invisibly over
   * the globe, so the platform's own picker (and its keyboard and screen-reader
   * behaviour) is untouched rather than reimplemented as a popover.
   */
  export let compact = false;
</script>

<label class="language-switcher" class:is-compact={compact}>
  <i class="bi bi-globe2" aria-hidden="true"></i>
  <span class="visually-hidden">{$locale.common.language}</span>
  <select
    value={$language}
    on:change={(event) => setLanguage(event.currentTarget.value)}
    aria-label={$locale.common.language}
  >
    {#each options as option}
      <option value={option.value}>{option.label}</option>
    {/each}
  </select>
</label>

<style>
  .language-switcher {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    min-block-size: var(--control-height);
    padding-inline-start: 0.7rem;
    border: 1px solid var(--border);
    border-radius: var(--control-radius);
    color: var(--text-secondary);
    background: var(--surface);
    font-size: var(--text-sm);
  }

  .language-switcher:focus-within {
    border-color: var(--accent-border);
    box-shadow: var(--ring);
  }

  .language-switcher select {
    min-block-size: calc(var(--control-height) - 2px);
    padding-block: 0;
    padding-inline: 0.15rem 1.8rem;
    border: 0;
    border-radius: inherit;
    color: var(--text-strong);
    background-color: transparent;
    font-size: var(--control-font);
    font-weight: var(--weight-semibold);
    cursor: pointer;
    outline: 0;
  }

  /* --- Compact: the globe is the whole control --------------------------- */
  .language-switcher.is-compact {
    position: relative;
    display: inline-grid;
    place-items: center;
    gap: 0;
    width: var(--topbar-control);
    height: var(--topbar-control);
    min-block-size: 0;
    padding: 0;
    border: 0;
    border-radius: var(--radius-pill);
    color: var(--topbar-icon);
    background: transparent;
    font-size: 1.15rem;
    transition: color var(--transition), background-color var(--transition);
  }

  .language-switcher.is-compact:hover {
    color: var(--topbar-icon-hover);
    background: var(--topbar-control-hover);
  }

  .language-switcher.is-compact:focus-within {
    border-color: transparent;
    box-shadow: var(--ring);
  }

  .language-switcher.is-compact select {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    min-block-size: 0;
    padding: 0;
    /* Invisible but still the real control: it keeps the native picker, the
       keyboard path and the accessible name, and only the glyph is seen. */
    opacity: 0;
    cursor: pointer;
    appearance: none;
  }
</style>