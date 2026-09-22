<script>
  import { onMount } from 'svelte';
  import { push } from 'svelte-spa-router';
  import { login } from '../services/auth';
  import { resetAuth } from '../stores/auth';
  import LanguageSwitcher from '../components/LanguageSwitcher.svelte';
  import { locale, translate } from '../i18n';

  let email = '';
  let password = '';
  let rememberMe = false;
  let showPassword = false;
  let loading = false;
  let errorMessage = '';
  let fieldErrors = {};

  onMount(() => {
    const savedEmail = localStorage.getItem('apartmentpro.rememberedEmail');
    if (savedEmail) {
      email = savedEmail;
      rememberMe = true;
    }
  });

  function validate() {
    fieldErrors = {};
    if (!email.trim()) fieldErrors.email = [translate('login.requiredEmail')];
    else if (!/^\S+@\S+\.\S+$/.test(email)) fieldErrors.email = [translate('login.invalidEmail')];
    if (!password) fieldErrors.password = [translate('login.requiredPassword')];
    return Object.keys(fieldErrors).length === 0;
  }

  async function handleSubmit() {
    errorMessage = '';
    if (!validate()) return;

    loading = true;
    try {
      await login({ email: email.trim(), password });
      resetAuth();
      if (rememberMe) localStorage.setItem('apartmentpro.rememberedEmail', email.trim());
      else localStorage.removeItem('apartmentpro.rememberedEmail');
      await push('/dashboard');
    } catch (error) {
      fieldErrors = error.data?.errors || {};
      const messageByCode = {
        INVALID_CREDENTIALS: 'login.invalidCredentials',
        AUTH_RATE_LIMITED: 'login.rateLimited',
        ORIGIN_NOT_ALLOWED: 'login.requestBlocked',
      };
      errorMessage = messageByCode[error.data?.code] ? translate(messageByCode[error.data.code]) : error.message;
    } finally {
      loading = false;
    }
  }

  function goHome() {
    push('/');
  }


</script>

<svelte:head>
  <title>{$locale.common.signIn} | {$locale.common.apartmentPro}</title>
  <meta name="description" content={$locale.login.subtitle} />
</svelte:head>

<main class="au-page">
  <aside class="au-aside" aria-label={$locale.login.ariaLabel}>
    <img class="au-aside-media" src="/images/home/hero-tall.jpg" alt={$locale.home.hero.visualLabel} />
    <div class="au-aside-veil" aria-hidden="true"></div>

    <div class="au-aside-inner">
      <button class="au-brand" type="button" on:click={goHome}>
        <span class="au-mark" aria-hidden="true">A</span>
        <span>{$locale.common.apartmentPro}</span>
      </button>

      <div class="au-aside-copy">
        <p class="au-aside-eyebrow">{$locale.auth.brandEyebrow}</p>
        <h2 class="au-aside-title">{$locale.auth.brandTitle}</h2>
      </div>

      <p class="au-aside-foot">{$locale.auth.copyright}</p>
    </div>
  </aside>

  <section class="au-form-side">
    <div class="au-panel">
      <a class="au-brand au-brand-form" href="#/" on:click|preventDefault={goHome}>
        <span class="au-mark" aria-hidden="true">A</span>
        <span>{$locale.common.apartmentPro}</span>
      </a>

      <div class="au-panel-top">
        <a class="au-back" href="#/" on:click|preventDefault={goHome}>
          <i class="bi bi-arrow-left" aria-hidden="true"></i>{$locale.auth.backHome}
        </a>
        <LanguageSwitcher />
      </div>

      <h1 class="au-title">{$locale.login.title}</h1>
      <p class="au-lede">{$locale.login.subtitle}</p>

      {#if errorMessage}
        <div class="au-alert" role="alert">
          <i class="bi bi-exclamation-circle" aria-hidden="true"></i><span>{errorMessage}</span>
        </div>
      {/if}

      <form class="au-form" on:submit|preventDefault={handleSubmit} novalidate>
        <div class="au-field">
          <label class="au-label" for="email">{$locale.login.email}</label>
          <input
            class="au-input"
            id="email"
            type="email"
            autocomplete="email"
            bind:value={email}
            aria-invalid={Boolean(fieldErrors.email)}
            aria-describedby={fieldErrors.email ? 'email-error' : undefined}
          />
          {#if fieldErrors.email}
            <p class="au-error" id="email-error">
              <i class="bi bi-exclamation-circle" aria-hidden="true"></i>{fieldErrors.email[0]}
            </p>
          {/if}
        </div>

        <div class="au-field">
          <label class="au-label" for="password">{$locale.login.password}</label>
          <div class="au-input-wrap">
            <input
              class="au-input"
              id="password"
              type={showPassword ? 'text' : 'password'}
              autocomplete="current-password"
              bind:value={password}
              aria-invalid={Boolean(fieldErrors.password)}
              aria-describedby={fieldErrors.password ? 'password-error' : undefined}
            />
            <button
              class="au-toggle"
              type="button"
              on:click={() => (showPassword = !showPassword)}
              aria-label={showPassword ? $locale.login.hidePassword : $locale.login.showPassword}
              aria-pressed={showPassword}
            >
              <i class={showPassword ? 'bi bi-eye-slash' : 'bi bi-eye'} aria-hidden="true"></i>
            </button>
          </div>
          {#if fieldErrors.password}
            <p class="au-error" id="password-error">
              <i class="bi bi-exclamation-circle" aria-hidden="true"></i>{fieldErrors.password[0]}
            </p>
          {/if}
        </div>

        <div class="au-row">
          <label class="au-check" for="remember-me">
            <input id="remember-me" type="checkbox" bind:checked={rememberMe} />
            <span>{$locale.login.remember}</span>
          </label>
        </div>

        <button class="au-submit" type="submit" disabled={loading}>
          {#if loading}
            <span class="spinner-border spinner-border-sm" aria-hidden="true"></span>
            {$locale.login.signingIn}
          {:else}
            {$locale.login.submit}
            <i class="bi bi-arrow-right" aria-hidden="true"></i>
          {/if}
        </button>
      </form>

      <p class="au-switch">
        {$locale.login.noAccount}
        <a class="au-link" href="#/register">{$locale.login.createAccount}</a>
      </p>
    </div>
  </section>
</main>
