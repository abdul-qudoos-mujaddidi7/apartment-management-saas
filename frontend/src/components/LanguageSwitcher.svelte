<script>
  import { language, locale, setLanguage } from '../i18n';

  const options = [
    { value: 'fa', label: 'دری' },
    { value: 'ps', label: 'پښتو' },
    { value: 'en', label: 'English' },
  ];
</script>

<label class="language-switcher">
  <i class="bi bi-globe2" aria-hidden="true"></i>
  <span class="visually-hidden">{$locale.common.language}</span>
  <select value={$language} on:change={(event) => setLanguage(event.currentTarget.value)} aria-label={$locale.common.language}>
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
    font-size: var(--text-sm);
    font-weight: var(--weight-semibold);
    cursor: pointer;
    outline: 0;
  }
</style>
