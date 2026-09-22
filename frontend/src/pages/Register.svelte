<script>
  import { push } from 'svelte-spa-router';
  import { register } from '../services/auth';
  import { resetAuth } from '../stores/auth';
  import LanguageSwitcher from '../components/LanguageSwitcher.svelte';
  import { locale, translate } from '../i18n';

  const points = ['pointOne', 'pointTwo', 'pointThree'];

  let form = { organization: '', fullName: '', email: '', phone: '', password: '', confirmPassword: '' };
  let fieldErrors = {};
  let errorMessage = '';
  let submitting = false;
  let showPassword = false;
  let showConfirmPassword = false;
  /* Set once the account exists; the page then shows the confirmation instead
     of the form, because the API already signed this person in. */
  let created = null;

  function update(field, value) {
    form = { ...form, [field]: value };
    if (fieldErrors[field]) validate();
  }

  function validate() {
    const errors = {};
    const required = (field) => translate('register.required', { field: translate(`register.fields.${field}`) });

    if (!form.organization.trim()) errors.organization = required('organization');
    if (!form.fullName.trim()) errors.fullName = required('fullName');
    else if (form.fullName.trim().split(/\s+/).length < 2) errors.fullName = translate('register.fullNameRequired');
    if (!form.email.trim()) errors.email = required('email');
    else if (!/^\S+@\S+\.\S+$/.test(form.email)) errors.email = translate('register.invalidEmail');
    if (!form.phone.trim()) errors.phone = required('phone');
    else if (form.phone.trim().replace(/\D/g, '').length < 6) errors.phone = translate('register.invalidPhone');
    if (!form.password) errors.password = required('password');
    else if (form.password.length < 8) errors.password = translate('register.minPassword');
    if (!form.confirmPassword) errors.confirmPassword = required('confirmPassword');
    else if (form.password !== form.confirmPassword) errors.confirmPassword = translate('register.mismatch');

    fieldErrors = errors;
    return Object.keys(errors).length === 0;
  }

  function messageFor(error) {
    const keyByCode = {
      EMAIL_ALREADY_EXISTS: 'register.emailExists',
      SLUG_ALREADY_EXISTS: 'register.organizationExists',
      AUTH_RATE_LIMITED: 'register.rateLimited',
      ORIGIN_NOT_ALLOWED: 'register.requestBlocked',
    };
    return keyByCode[error.data?.code] ? translate(keyByCode[error.data.code]) : error.message;
  }

  async function handleSubmit() {
    errorMessage = '';
    if (!validate()) return;

    /* The API wants the two names separately; the form asks for one. */
    const [firstName, ...rest] = form.fullName.trim().replace(/\s+/g, ' ').split(' ');
    submitting = true;
    try {
      await register({
        organizationName: form.organization.trim(),
        firstName,
        lastName: rest.join(' '),
        email: form.email.trim(),
        phone: form.phone.trim(),
        password: form.password,
      });
      resetAuth();
      created = { firstName, organization: form.organization.trim(), email: form.email.trim() };
    } catch (error) {
      errorMessage = messageFor(error);
      if (error.data?.field) fieldErrors = { [error.data.field]: errorMessage };
      else if (error.data?.errors) {
        fieldErrors = Object.fromEntries(Object.entries(error.data.errors).map(([field, messages]) => [field, messages[0]]));
      }
    } finally {
      submitting = false;
    }
  }

  function goHome() {
    push('/');
  }


</script>

<svelte:head>
  <title>{$locale.register.title} | {$locale.common.apartmentPro}</title>
  <meta name="description" content={$locale.register.subtitle} />
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

      {#if created}
        <div class="au-success">
          <div class="au-success-mark"><i class="bi bi-check-lg" aria-hidden="true"></i></div>
          <p class="au-eyebrow">{$locale.register.confirmEyebrow}</p>
          <h1>{translate('register.confirmTitle', { name: created.firstName })}</h1>
          <p>{translate('register.confirmBody', { organization: created.organization, email: created.email })}</p>
          <button class="au-submit" type="button" on:click={() => push('/dashboard')}>
            {$locale.register.confirmContinue}
            <i class="bi bi-arrow-right" aria-hidden="true"></i>
          </button>
          <p class="au-success-note">{$locale.register.confirmNote}</p>
          <p class="au-switch">
            {$locale.register.haveAccount}
            <a class="au-link" href="#/login">{$locale.register.signIn}</a>
          </p>
        </div>
      {:else}
        <h1 class="au-title">{$locale.register.title}</h1>
        <p class="au-lede">{$locale.register.subtitle}</p>

        {#if errorMessage}
          <div class="au-alert" role="alert">
            <i class="bi bi-exclamation-circle" aria-hidden="true"></i><span>{errorMessage}</span>
          </div>
        {/if}        <form class="au-form" on:submit|preventDefault={handleSubmit} novalidate>
          <div class="au-field">
            <label class="au-label" for="organization">{$locale.register.fields.organization}</label>
            <input
              class="au-input"
              id="organization"
              type="text"
              autocomplete="organization"
              value={form.organization}
              on:input={(event) => update('organization', event.currentTarget.value)}
              aria-invalid={Boolean(fieldErrors.organization)}
              aria-describedby={fieldErrors.organization ? 'organization-error' : undefined}
            />
            {#if fieldErrors.organization}
              <p class="au-error" id="organization-error">
                <i class="bi bi-exclamation-circle" aria-hidden="true"></i>{fieldErrors.organization}
              </p>
            {/if}
          </div>

          <div class="au-field">
            <label class="au-label" for="full-name">
              {$locale.register.fields.fullName}
              <span class="au-hint">{$locale.register.fullNameHint}</span>
            </label>
            <input
              class="au-input"
              id="full-name"
              type="text"
              autocomplete="name"
              value={form.fullName}
              on:input={(event) => update('fullName', event.currentTarget.value)}
              aria-invalid={Boolean(fieldErrors.fullName)}
              aria-describedby={fieldErrors.fullName ? 'full-name-error' : undefined}
            />
            {#if fieldErrors.fullName}
              <p class="au-error" id="full-name-error">
                <i class="bi bi-exclamation-circle" aria-hidden="true"></i>{fieldErrors.fullName}
              </p>
            {/if}
          </div>

          <div class="au-field">
            <label class="au-label" for="register-email">{$locale.register.fields.email}</label>
            <input
              class="au-input"
              id="register-email"
              type="email"
              autocomplete="email"
              value={form.email}
              on:input={(event) => update('email', event.currentTarget.value)}
              aria-invalid={Boolean(fieldErrors.email)}
              aria-describedby={fieldErrors.email ? 'register-email-error' : undefined}
            />
            {#if fieldErrors.email}
              <p class="au-error" id="register-email-error">
                <i class="bi bi-exclamation-circle" aria-hidden="true"></i>{fieldErrors.email}
              </p>
            {/if}
          </div>

          <div class="au-field">
            <label class="au-label" for="phone">{$locale.register.fields.phone}</label>
            <input
              class="au-input"
              id="phone"
              type="tel"
              autocomplete="tel"
              value={form.phone}
              on:input={(event) => update('phone', event.currentTarget.value)}
              aria-invalid={Boolean(fieldErrors.phone)}
              aria-describedby={fieldErrors.phone ? 'phone-error' : undefined}
            />
            {#if fieldErrors.phone}
              <p class="au-error" id="phone-error">
                <i class="bi bi-exclamation-circle" aria-hidden="true"></i>{fieldErrors.phone}
              </p>
            {/if}
          </div>

          <div class="au-field">
            <label class="au-label" for="register-password">
              {$locale.register.fields.password}
              <span class="au-hint">{$locale.register.passwordHint}</span>
            </label>
            <div class="au-input-wrap">
              <input
                class="au-input"
                id="register-password"
                type={showPassword ? 'text' : 'password'}
                autocomplete="new-password"
                value={form.password}
                on:input={(event) => update('password', event.currentTarget.value)}
                aria-invalid={Boolean(fieldErrors.password)}
                aria-describedby={fieldErrors.password ? 'register-password-error' : undefined}
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
              <p class="au-error" id="register-password-error">
                <i class="bi bi-exclamation-circle" aria-hidden="true"></i>{fieldErrors.password}
              </p>
            {/if}
          </div>

          <div class="au-field">
            <label class="au-label" for="confirm-password">{$locale.register.fields.confirmPassword}</label>
            <div class="au-input-wrap">
              <input
                class="au-input"
                id="confirm-password"
                type={showConfirmPassword ? 'text' : 'password'}
                autocomplete="new-password"
                value={form.confirmPassword}
                on:input={(event) => update('confirmPassword', event.currentTarget.value)}
                aria-invalid={Boolean(fieldErrors.confirmPassword)}
                aria-describedby={fieldErrors.confirmPassword ? 'confirm-password-error' : undefined}
              />
              <button
                class="au-toggle"
                type="button"
                on:click={() => (showConfirmPassword = !showConfirmPassword)}
                aria-label={showConfirmPassword ? $locale.login.hidePassword : $locale.login.showPassword}
                aria-pressed={showConfirmPassword}
              >
                <i class={showConfirmPassword ? 'bi bi-eye-slash' : 'bi bi-eye'} aria-hidden="true"></i>
              </button>
            </div>
            {#if fieldErrors.confirmPassword}
              <p class="au-error" id="confirm-password-error">
                <i class="bi bi-exclamation-circle" aria-hidden="true"></i>{fieldErrors.confirmPassword}
              </p>
            {/if}
          </div>

          <button class="au-submit" type="submit" disabled={submitting}>
            {#if submitting}
              <span class="spinner-border spinner-border-sm" aria-hidden="true"></span>
              {$locale.register.creating}
            {:else}
              {$locale.register.create}
              <i class="bi bi-arrow-right" aria-hidden="true"></i>
            {/if}
          </button>
        </form>

        <p class="au-switch">
          {$locale.register.haveAccount}
          <a class="au-link" href="#/login">{$locale.register.signIn}</a>
        </p>
      {/if}
    </div>
  </section>
</main>
