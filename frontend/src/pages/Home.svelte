<script>
  import { onMount } from 'svelte';
  import { push } from 'svelte-spa-router';
  import { register } from '../services/auth';
  import { resetAuth } from '../stores/auth';
  import CurrencyPicker from '../components/ui/CurrencyPicker.svelte';
  import LanguageSwitcher from '../components/LanguageSwitcher.svelte';
  import { locale, translate } from '../i18n';
  import { isCurrencyCode } from '../utils/currencies';

  onMount(() => {
    const onScroll = () => { scrolled = window.scrollY > 48; };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  });

  const features = [
    { key: 'tenant', icon: 'bi-people' },
    { key: 'collection', icon: 'bi-cash-coin' },
    { key: 'maintenance', icon: 'bi-tools' },
    { key: 'lease', icon: 'bi-file-earmark-text' },
    { key: 'property', icon: 'bi-buildings' },
    { key: 'meter', icon: 'bi-speedometer2' },
    { key: 'invoices', icon: 'bi-receipt' },
    { key: 'expense', icon: 'bi-wallet2' },
  ];

  const steps = ['add', 'manage', 'track', 'reports'];

  const reviews = [
    { key: 'first', avatar: '/images/home/avatar-2.jpg' },
    { key: 'second', avatar: '/images/home/avatar-1.jpg' },
    { key: 'third', avatar: '/images/home/avatar-3.jpg' },
  ];

  const stats = ['units', 'onTime', 'adminTime'];

  const starRating = [1, 2, 3, 4, 5];

  /* The hero chip is a miniature rent roll: p = collected, d = due today, _ = vacant. */
  const rentRoll = 'pppppppppdpppp_pppp_pp__';

  let navigationOpen = false;
  /* The nav starts transparent over the hero photograph and turns into the frosted pill
     once the page scrolls past it, so the hero reads as a full-bleed image. */
  let scrolled = false;
  let registration = {
    organization: '',
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    password: '',
    confirmPassword: '',
    /* The workspace's reporting currency. Asked here as well as on the Register
       page because this page's form is the one people actually submit, and the
       answer cannot be changed once the organization has posted money. Empty
       means the default, AFN. */
    currency: '',
    currencyName: '',
    currencySymbol: '',
  };
  let registrationErrors = {};
  let registrationMessage = '';
  let registrationSubmitting = false;

  // The three-letter code the API receives, picked or typed or left empty.
  $: selectedRegistrationCurrency = registration.currency.trim().toUpperCase();

  /* Clear the complaint as soon as the field holds a code again, rather than
     making the next submit do it. */
  $: if (registrationErrors.currency && (!registration.currency.trim() || isCurrencyCode(registration.currency))) {
    const { currency, ...rest } = registrationErrors;
    registrationErrors = rest;
  }

  function validateRegistration() {
    const errors = {};
    const requiredFields = [
      ['organization', 'organization'],
      ['firstName', 'firstName'],
      ['lastName', 'lastName'],
      ['email', 'email'],
      ['phone', 'phone'],
      ['password', 'password'],
      ['confirmPassword', 'confirmPassword'],
    ];

    requiredFields.forEach(([field, label]) => {
      if (!registration[field].trim()) errors[field] = translate('home.registration.required', { field: translate(`home.registration.fields.${label}`) });
    });

    if (registration.email.trim() && !/^\S+@\S+\.\S+$/.test(registration.email)) {
      errors.email = translate('home.registration.invalidEmail');
    }
    if (registration.password && registration.password.length < 8) {
      errors.password = translate('home.registration.minPassword');
    }
    if (registration.confirmPassword && registration.password !== registration.confirmPassword) {
      errors.confirmPassword = translate('home.registration.mismatch');
    }
    /* Empty is the default, AFN; anything else has to be a three-letter code. */
    if (registration.currency.trim() && !isCurrencyCode(registration.currency)) {
      errors.currency = translate('home.registration.invalidCurrency');
    }

    registrationErrors = errors;
    return Object.keys(errors).length === 0;
  }

  function getRegistrationError(error) {
    const keyByCode = {
      EMAIL_ALREADY_EXISTS: 'home.registration.emailExists',
      SLUG_ALREADY_EXISTS: 'home.registration.organizationExists',
      AUTH_RATE_LIMITED: 'home.registration.rateLimited',
      ORIGIN_NOT_ALLOWED: 'home.registration.requestBlocked',
    };
    return keyByCode[error.data?.code] ? translate(keyByCode[error.data.code]) : error.message;
  }

  async function submitRegistration() {
    registrationMessage = '';
    if (!validateRegistration()) return;

    registrationSubmitting = true;
    try {
      await register({
        organizationName: registration.organization.trim(),
        firstName: registration.firstName.trim(),
        lastName: registration.lastName.trim(),
        email: registration.email.trim(),
        phone: registration.phone.trim(),
        password: registration.password,
        currency: selectedRegistrationCurrency,
      });
      resetAuth();
      await push('/dashboard');
    } catch (error) {
      registrationMessage = getRegistrationError(error);
      if (error.data?.field) {
        registrationErrors = { [error.data.field]: registrationMessage };
      } else if (error.data?.errors) {
        registrationErrors = Object.fromEntries(
          Object.entries(error.data.errors).map(([field, messages]) => [field, messages[0]]),
        );
      }
    } finally {
      registrationSubmitting = false;
    }
  }

  function updateRegistration(field, value) {
    registration = { ...registration, [field]: value };
    if (registrationErrors[field]) validateRegistration();
  }

  function scrollToSection(id) {
    navigationOpen = false;
    const target = document.getElementById(id);
    if (!target) return;
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    target.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
  }
</script>

<svelte:head>
  <title>{$locale.home.title}</title>
  <meta name="description" content={$locale.home.description} />
</svelte:head>

<div class="lp-page">
  <header class="lp-nav-shell">
    <nav class="lp-nav" class:lp-nav-over={!scrolled} aria-label="Primary navigation">
      <button class="lp-brand" type="button" on:click={() => scrollToSection('home')} aria-label={$locale.home.nav.homeLabel}>
        <span class="lp-mark" aria-hidden="true">A</span>
        <span>ApartmentPro</span>
      </button>

      <ul class="lp-links">
        <li><button type="button" on:click={() => scrollToSection('home')}>{$locale.home.nav.home}</button></li>
        <li><button type="button" on:click={() => scrollToSection('features')}>{$locale.home.nav.features}</button></li>
        <li><button type="button" on:click={() => scrollToSection('pricing')}>{$locale.home.nav.pricing}</button></li>
        <li><button type="button" on:click={() => scrollToSection('about')}>{$locale.home.nav.about}</button></li>
      </ul>

      <div class="lp-actions">
        <LanguageSwitcher />
        <button class="lp-signin" type="button" on:click={() => push('/login')}>{$locale.common.signIn}</button>
        <button class={`lp-btn ${scrolled ? 'lp-btn-primary' : 'lp-btn-outline'}`} type="button" on:click={() => push('/register')}>
          {$locale.common.getStarted}
          <i class="bi bi-arrow-right lp-arrow" aria-hidden="true"></i>
        </button>
        <button
          class="lp-toggle"
          type="button"
          aria-expanded={navigationOpen}
          aria-controls="lp-menu"
          aria-label={$locale.home.nav.toggle}
          on:click={() => (navigationOpen = !navigationOpen)}
        >
          <i class={`bi ${navigationOpen ? 'bi-x-lg' : 'bi-list'}`} aria-hidden="true"></i>
        </button>
      </div>
    </nav>

    <div class="lp-menu" class:lp-menu-open={navigationOpen} id="lp-menu" hidden={!navigationOpen}>
      <button type="button" on:click={() => scrollToSection('home')}>{$locale.home.nav.home}</button>
      <button type="button" on:click={() => scrollToSection('features')}>{$locale.home.nav.features}</button>
      <button type="button" on:click={() => scrollToSection('pricing')}>{$locale.home.nav.pricing}</button>
      <button type="button" on:click={() => scrollToSection('about')}>{$locale.home.nav.about}</button>
      <button type="button" on:click={() => push('/login')}>{$locale.common.signIn}</button>
      <button class="lp-btn lp-btn-primary" type="button" on:click={() => push('/register')}>{$locale.common.getStarted}</button>
      <LanguageSwitcher />
    </div>
  </header>

  <main>
    <!-- Hero -->
    <section class="lp-hero" id="home">
      <picture class="lp-hero-media">
        <source media="(max-width: 767px)" srcset="/images/home/hero-tall.jpg" />
        <img src="/images/home/hero-wide.jpg" alt={$locale.home.hero.visualLabel} />
      </picture>
      <div class="lp-hero-veil" aria-hidden="true"></div>

      <div class="lp-wrap lp-hero-inner">
        <div class="lp-hero-content">
          <p class="lp-hero-eyebrow">{$locale.home.hero.kicker}</p>
          <h1 class="lp-hero-title">{$locale.home.hero.title}<br />{$locale.home.hero.titleAccent}</h1>
          <p class="lp-hero-lede">{$locale.home.hero.description}</p>

          <div class="lp-hero-actions">
            <button class="lp-btn lp-btn-light" type="button" on:click={() => push('/register')}>
              {$locale.common.getStarted}
              <i class="bi bi-arrow-right lp-arrow" aria-hidden="true"></i>
            </button>
            <button class="lp-btn lp-btn-outline" type="button" on:click={() => scrollToSection('about')}>
              {$locale.home.hero.seeHow}
              <i class="bi bi-arrow-right lp-arrow" aria-hidden="true"></i>
            </button>
          </div>
        </div>

        <div class="lp-roll">
          <p class="lp-roll-title">{$locale.home.hero.chip.title}</p>
          <p class="lp-roll-detail">{$locale.home.hero.chip.detail}</p>
          <div class="lp-roll-grid" aria-hidden="true">
            {#each rentRoll.split('') as tile}
              <i class:lp-paid={tile === 'p'} class:lp-due={tile === 'd'}></i>
            {/each}
          </div>
          <p class="lp-sr">{$locale.home.hero.chip.summary}</p>
        </div>

        <ul class="lp-hero-facts">
          {#each stats as stat}
            <li><strong>{$locale.home.hero.stats[stat][0]}</strong> {$locale.home.hero.stats[stat][1]}</li>
          {/each}
        </ul>
      </div>
    </section>

    <!-- Features -->
    <section class="lp-section" id="features">
      <div class="lp-wrap">
        <div class="lp-section-head">
          <p class="lp-kicker">{$locale.home.features.kicker}</p>
          <h2>{$locale.home.features.title} {$locale.home.features.titleBreak}</h2>
          <p>{$locale.home.features.description}</p>
        </div>

        <div class="lp-feature-grid">
          {#each features as feature, index}
            <article class="lp-card">
              <span class={`lp-icon ${index % 2 === 0 ? 'lp-icon-teal' : 'lp-icon-terra'}`} aria-hidden="true">
                <i class={`bi ${feature.icon}`}></i>
              </span>
              <h3>{$locale.home.features.items[feature.key][0]}</h3>
              <p>{$locale.home.features.items[feature.key][1]}</p>
            </article>
          {/each}
        </div>
      </div>
    </section>

    <!-- How it works -->
    <section class="lp-section" id="about">
      <div class="lp-wrap">
        <div class="lp-section-head">
          <p class="lp-kicker">{$locale.home.process.kicker}</p>
          <h2>{$locale.home.process.title} {$locale.home.process.titleBreak}</h2>
          <p>{$locale.home.process.description}</p>
        </div>

        <ol class="lp-steps">
          {#each steps as step, index}
            <li class="lp-step">
              <span class="lp-step-num" aria-hidden="true">{index + 1}</span>
              <h3>{$locale.home.process.items[step][0]}</h3>
              <p>{$locale.home.process.items[step][1]}</p>
            </li>
          {/each}
        </ol>
      </div>
    </section>

    <!-- Reviews -->
    <section class="lp-section" id="reviews">
      <div class="lp-wrap">
        <div class="lp-section-head">
          <p class="lp-kicker">{$locale.home.reviews.kicker}</p>
          <h2>{$locale.home.reviews.title}</h2>
          <p>{$locale.home.reviews.description}</p>
        </div>

        <div class="lp-quote-grid">
          {#each reviews as item}
            <article class="lp-card lp-quote">
              <div class="lp-stars" role="img" aria-label={$locale.home.reviews.rating}>
                {#each starRating as star (star)}
                  <i class="bi bi-star-fill" aria-hidden="true"></i>
                {/each}
              </div>
              <blockquote>{$locale.home.reviews.items[item.key].quote}</blockquote>
              <div class="lp-who">
                <img src={item.avatar} width="128" height="128" alt="" loading="lazy" />
                <div>
                  <div class="lp-who-name">{$locale.home.reviews.items[item.key].name}</div>
                  <div class="lp-who-role">{$locale.home.reviews.items[item.key].role}</div>
                </div>
              </div>
            </article>
          {/each}
        </div>
      </div>
    </section>

    <!-- Pricing -->
    <section class="lp-section" id="pricing">
      <div class="lp-wrap">
        <div class="lp-band">
          <div>
            <p class="lp-kicker">{$locale.home.pricing.kicker}</p>
            <h2>{$locale.home.pricing.title}</h2>
          </div>
          <p>{$locale.home.pricing.description}</p>
        </div>
      </div>
    </section>

    <!-- Closing call to action -->
    <section class="lp-section" id="cta">
      <div class="lp-wrap">
        <div class="lp-cta">
          <p class="lp-cta-kicker">{$locale.home.cta.kicker}</p>
          <h2>{$locale.home.cta.title} {$locale.home.cta.titleBreak}</h2>
          <p>{$locale.home.cta.description}</p>
          <button class="lp-btn lp-btn-light" type="button" on:click={() => push('/register')}>
            {$locale.common.getStarted}
            <i class="bi bi-arrow-right lp-arrow" aria-hidden="true"></i>
          </button>
        </div>
      </div>
    </section>

    <!-- Registration -->
    <section class="lp-section lp-registration" id="get-started">
      <div class="lp-wrap lp-registration-grid">
        <div class="lp-registration-intro">
          <p class="lp-kicker">{$locale.home.registration.kicker}</p>
          <h2>{$locale.home.registration.title} {$locale.home.registration.titleAccent}</h2>
          <p>{$locale.home.registration.description}</p>
          <p class="lp-secure"><i class="bi bi-shield-check" aria-hidden="true"></i>{$locale.home.registration.secure}</p>
        </div>

        <form class="lp-form" on:submit|preventDefault={submitRegistration} novalidate>
          <div class="lp-form-head">
            <p class="lp-kicker">{$locale.home.registration.eyebrow}</p>
            <h2>{$locale.home.registration.heading}</h2>
            <p>{$locale.home.registration.subtitle}</p>
          </div>

          {#if registrationMessage}
            <div class="alert alert-danger lp-alert" role="alert">{registrationMessage}</div>
          {/if}

          <div class="lp-fields">
            <div class="lp-field-wide">
              <label class="form-label" for="organization">{$locale.home.registration.fields.organization}</label>
              <input class:lp-invalid={registrationErrors.organization} class="form-control" id="organization" type="text" value={registration.organization} on:input={(event) => updateRegistration('organization', event.currentTarget.value)} aria-invalid={Boolean(registrationErrors.organization)} />
              {#if registrationErrors.organization}<div class="lp-error">{registrationErrors.organization}</div>{/if}
            </div>
            <div class="lp-field-wide">
              <label class="form-label" for="registration-currency">{$locale.home.registration.fields.currency}</label>
              <CurrencyPicker
                id="registration-currency"
                bind:code={registration.currency}
                bind:name={registration.currencyName}
                bind:symbol={registration.currencySymbol}
                invalid={Boolean(registrationErrors.currency)}
                unavailableMessage={$locale.home.registration.currencyUnavailable}
              />
              <p class="form-text lp-hint" id="registration-currency-hint">
                {#if registration.currencyName}
                  {registration.currency} — {registration.currencyName} {registration.currencySymbol}
                {:else}
                  {$locale.home.registration.currencyDefault}
                {/if}
              </p>
              {#if registrationErrors.currency}<div class="lp-error">{registrationErrors.currency}</div>{/if}
            </div>
            <div>
              <label class="form-label" for="first-name">{$locale.home.registration.fields.firstName}</label>
              <input class:lp-invalid={registrationErrors.firstName} class="form-control" id="first-name" type="text" value={registration.firstName} on:input={(event) => updateRegistration('firstName', event.currentTarget.value)} aria-invalid={Boolean(registrationErrors.firstName)} />
              {#if registrationErrors.firstName}<div class="lp-error">{registrationErrors.firstName}</div>{/if}
            </div>
            <div>
              <label class="form-label" for="last-name">{$locale.home.registration.fields.lastName}</label>
              <input class:lp-invalid={registrationErrors.lastName} class="form-control" id="last-name" type="text" value={registration.lastName} on:input={(event) => updateRegistration('lastName', event.currentTarget.value)} aria-invalid={Boolean(registrationErrors.lastName)} />
              {#if registrationErrors.lastName}<div class="lp-error">{registrationErrors.lastName}</div>{/if}
            </div>
            <div>
              <label class="form-label" for="registration-email">{$locale.home.registration.fields.email}</label>
              <input class:lp-invalid={registrationErrors.email} class="form-control" id="registration-email" type="email" value={registration.email} on:input={(event) => updateRegistration('email', event.currentTarget.value)} aria-invalid={Boolean(registrationErrors.email)} />
              {#if registrationErrors.email}<div class="lp-error">{registrationErrors.email}</div>{/if}
            </div>
            <div>
              <label class="form-label" for="phone">{$locale.home.registration.fields.phone}</label>
              <input class:lp-invalid={registrationErrors.phone} class="form-control" id="phone" type="tel" value={registration.phone} on:input={(event) => updateRegistration('phone', event.currentTarget.value)} aria-invalid={Boolean(registrationErrors.phone)} />
              {#if registrationErrors.phone}<div class="lp-error">{registrationErrors.phone}</div>{/if}
            </div>
            <div>
              <label class="form-label" for="registration-password">{$locale.home.registration.fields.password}</label>
              <input class:lp-invalid={registrationErrors.password} class="form-control" id="registration-password" type="password" value={registration.password} on:input={(event) => updateRegistration('password', event.currentTarget.value)} aria-invalid={Boolean(registrationErrors.password)} />
              {#if registrationErrors.password}<div class="lp-error">{registrationErrors.password}</div>{/if}
            </div>
            <div>
              <label class="form-label" for="confirm-password">{$locale.home.registration.fields.confirmPassword}</label>
              <input class:lp-invalid={registrationErrors.confirmPassword} class="form-control" id="confirm-password" type="password" value={registration.confirmPassword} on:input={(event) => updateRegistration('confirmPassword', event.currentTarget.value)} aria-invalid={Boolean(registrationErrors.confirmPassword)} />
              {#if registrationErrors.confirmPassword}<div class="lp-error">{registrationErrors.confirmPassword}</div>{/if}
            </div>
          </div>

          <button class="lp-btn lp-btn-primary lp-submit" type="submit" disabled={registrationSubmitting}>
            {#if registrationSubmitting}
              <span class="spinner-border spinner-border-sm" aria-hidden="true"></span>{$locale.home.registration.creating}
            {:else}
              {$locale.home.registration.create}
              <i class="bi bi-arrow-right lp-arrow" aria-hidden="true"></i>
            {/if}
          </button>

          <p class="lp-signin-note">
            {$locale.home.registration.existing}
            <button type="button" on:click={() => push('/login')}>{$locale.common.signIn}</button>
          </p>
        </form>
      </div>
    </section>
  </main>

  <footer class="lp-footer">
    <div class="lp-wrap lp-footer-row">
      <button class="lp-brand lp-footer-brand" type="button" on:click={() => scrollToSection('home')}>
        <span class="lp-mark" aria-hidden="true">A</span>
        <span>{$locale.common.apartmentPro}</span>
      </button>
      <span class="lp-copy">{$locale.home.footer.copyright}</span>
      <ul class="lp-footer-links">
        <li><button type="button" on:click={() => scrollToSection('features')}>{$locale.home.footer.features}</button></li>
        <li><button type="button" on:click={() => scrollToSection('pricing')}>{$locale.home.nav.pricing}</button></li>
        <li><a href="mailto:hello@apartmentpro.com">hello@apartmentpro.com</a></li>
        <li><button type="button" on:click={() => push('/login')}>{$locale.common.signIn}</button></li>
      </ul>
    </div>
  </footer>
</div>

<style>
  /* The documented marketing surface for the product. Kept in its own visual language —
     teal + terracotta, Space Grotesk display — and scoped to this page so the console's
     design tokens are untouched. Sizes are scaled for the app's 14px root. */

  :global(body) { background: #f4f2ee; }

  .lp-page {
    --lp-ink: #1b2733;
    --lp-ink-soft: #51606d;
    --lp-ink-faint: #55636f;
    --lp-teal: #2f5b6b;
    --lp-teal-deep: #244a58;
    --lp-teal-wash: #e6eef1;
    --lp-terra: #d98a4b;
    --lp-terra-ink: #a75f27;
    --lp-terra-wash: #fbeee2;
    --lp-paper: #f4f2ee;
    --lp-glass: rgba(255, 255, 255, .66);
    --lp-glass-strong: rgba(255, 255, 255, .82);
    --lp-ring: rgba(27, 39, 51, .07);
    --lp-ring-strong: rgba(27, 39, 51, .12);
    --lp-shadow-soft: 0 1px 2px rgba(27, 39, 51, .04), 0 14px 34px -20px rgba(47, 91, 107, .3);
    --lp-shadow-lift: 0 2px 4px rgba(27, 39, 51, .05), 0 30px 64px -30px rgba(47, 91, 107, .45);
    --lp-shadow-nav: 0 1px 2px rgba(27, 39, 51, .04), 0 18px 40px -24px rgba(47, 91, 107, .35);
    --lp-display: 'Space Grotesk', var(--font-ui);
    --lp-body: 'Inter', var(--font-ui);
    --lp-gutter: clamp(20px, 4vw, 40px);
    --lp-section-y: clamp(64px, 8vw, 116px);

    /* Deliberately no `overflow-x: hidden` here: it would turn this element into the
       scroll container and stop the sticky nav from sticking. */
    font-family: var(--lp-body);
    color: var(--lp-ink);
    background-color: var(--lp-paper);
    background-image:
      radial-gradient(1100px 720px at 14% -8%, rgba(47, 91, 107, .13), transparent 62%),
      radial-gradient(940px 640px at 92% 4%, rgba(217, 138, 75, .11), transparent 60%),
      radial-gradient(1200px 800px at 50% 100%, rgba(255, 255, 255, .75), transparent 70%);
    background-repeat: no-repeat;
    -webkit-font-smoothing: antialiased;
  }

  .lp-page :is(h1, h2, h3) {
    font-family: var(--lp-display);
    font-weight: 700;
    letter-spacing: -.022em;
    line-height: 1.08;
    color: var(--lp-ink);
    text-wrap: balance;
  }

  .lp-page :is(button, input) { font-family: inherit; }

  .lp-page :focus-visible { outline: 2px solid var(--lp-teal); outline-offset: 3px; border-radius: 6px; }

  .lp-wrap { width: 100%; max-width: 1180px; margin-inline: auto; padding-inline: var(--lp-gutter); }

  .lp-sr {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }

  .lp-kicker {
    margin: 0 0 10px;
    font-size: .78rem;
    font-weight: 600;
    letter-spacing: .1em;
    text-transform: uppercase;
    color: var(--lp-teal);
  }

  /* ── Buttons ─────────────────────────────────────────────────────────── */
  .lp-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 9px;
    min-height: 46px;
    padding: 12px 22px;
    border: 1px solid transparent;
    border-radius: 999px;
    font-size: 1.09rem;
    font-weight: 600;
    cursor: pointer;
    white-space: nowrap;
    transition: transform .18s ease, background-color .18s ease, box-shadow .18s ease;
  }
  .lp-btn:hover { transform: translateY(-1px); }
  .lp-btn:active { transform: translateY(0); }
  .lp-btn-primary { background: var(--lp-teal); color: #fff; box-shadow: 0 1px 2px rgba(27, 39, 51, .08), 0 16px 30px -18px rgba(47, 91, 107, .7); }
  .lp-btn-primary:hover { background: var(--lp-teal-deep); }
  .lp-btn-light { background: #fff; color: var(--lp-teal); box-shadow: 0 18px 34px -20px rgba(0, 0, 0, .55); }
  .lp-btn-light:hover { background: #fdfbf8; }
  /* over the hero photograph the secondary has to read on the image itself */
  .lp-btn-outline { border-color: rgba(255, 255, 255, .55); background: rgba(10, 24, 30, .3); color: #fff; backdrop-filter: blur(8px); }
  .lp-btn-outline:hover { background: rgba(255, 255, 255, .16); border-color: #fff; }
  .lp-arrow { transition: transform .18s ease; }
  .lp-btn:hover .lp-arrow { transform: translateX(3px); }
  /* the icon points forward, so mirror it in RTL */
  :global([dir='rtl']) .lp-arrow { transform: scaleX(-1); }
  :global([dir='rtl']) .lp-btn:hover .lp-arrow { transform: scaleX(-1) translateX(3px); }

  /* ── Nav ─────────────────────────────────────────────────────────────── */
  .lp-nav-shell { position: fixed; z-index: 20; inset: 14px 0 auto; padding-inline: var(--lp-gutter); }
  .lp-nav {
    width: 100%;
    max-width: 1080px;
    margin-inline: auto;
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 8px 10px 8px 16px;
    border-radius: 999px;
    border: 1px solid rgba(255, 255, 255, .78);
    background: rgba(255, 255, 255, .72);
    backdrop-filter: blur(16px) saturate(150%);
    box-shadow: var(--lp-shadow-nav);
  }
  .lp-brand {
    display: inline-flex;
    align-items: center;
    gap: 10px;
    min-height: 44px;
    margin-inline-end: auto;
    padding: 0;
    border: 0;
    background: transparent;
    font-family: var(--lp-display);
    font-size: 1.15rem;
    font-weight: 700;
    letter-spacing: -.02em;
    color: var(--lp-ink);
    cursor: pointer;
  }
  .lp-mark {
    display: grid;
    place-items: center;
    width: 34px;
    height: 34px;
    border-radius: 11px;
    background: linear-gradient(150deg, var(--lp-teal), #3d7182);
    color: #fff;
    font-size: 1.05rem;
    font-weight: 700;
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, .3), 0 6px 14px -8px rgba(47, 91, 107, .9);
  }
  .lp-links { display: flex; align-items: center; gap: 2px; margin: 0; padding: 0; list-style: none; }
  .lp-links button {
    display: inline-flex;
    align-items: center;
    min-height: 44px;
    padding: 8px 15px;
    border: 0;
    border-radius: 999px;
    background: transparent;
    font-size: 1.06rem;
    font-weight: 500;
    color: var(--lp-ink-soft);
    cursor: pointer;
    transition: color .16s ease, background-color .16s ease;
  }
  .lp-links button:hover { color: var(--lp-ink); background: rgba(255, 255, 255, .8); }
  .lp-actions { display: flex; align-items: center; gap: 6px; }
  .lp-signin {
    display: inline-flex;
    align-items: center;
    min-height: 44px;
    padding: 10px 16px;
    border: 0;
    border-radius: 999px;
    background: transparent;
    font-size: 1.06rem;
    font-weight: 600;
    color: var(--lp-ink);
    cursor: pointer;
  }
  .lp-signin:hover { background: rgba(255, 255, 255, .8); }
  .lp-actions .lp-btn { min-height: 42px; padding: 10px 20px; }
  .lp-nav :global(.language-switcher) {
    min-block-size: 40px;
    padding-inline-start: 10px;
    border-color: rgba(255, 255, 255, .9);
    border-radius: 999px;
    background: rgba(255, 255, 255, .7);
  }
  .lp-nav :global(.language-switcher select) { font-size: .94rem; color: var(--lp-ink); }
  .lp-toggle {
    display: none;
    width: 44px;
    height: 44px;
    align-items: center;
    justify-content: center;
    border: 1px solid var(--lp-ring);
    border-radius: 999px;
    background: rgba(255, 255, 255, .7);
    color: var(--lp-ink);
    font-size: 1.1rem;
    cursor: pointer;
  }
  .lp-menu {
    width: 100%;
    max-width: 1080px;
    margin: 10px auto 0;
    padding: 12px;
    border-radius: 24px;
    border: 1px solid rgba(255, 255, 255, .78);
    background: rgba(255, 255, 255, .96);
    backdrop-filter: blur(18px) saturate(150%);
    box-shadow: var(--lp-shadow-nav);
  }
  .lp-menu[hidden] { display: none; }
  /* `:not(.lp-btn)` matters: Svelte appends its scope class to the type selector, which
     makes `.lp-menu button` outrank `.lp-btn-primary` and would flatten the menu CTA. */
  .lp-menu button:not(.lp-btn) {
    display: flex;
    align-items: center;
    width: 100%;
    min-height: 48px;
    padding: 12px 14px;
    border: 0;
    border-radius: 14px;
    background: transparent;
    font-size: 1.05rem;
    font-weight: 500;
    color: var(--lp-ink);
    text-align: start;
    cursor: pointer;
  }
  .lp-menu button:not(.lp-btn):hover { background: rgba(47, 91, 107, .07); }
  .lp-menu .lp-btn { justify-content: center; margin-top: 6px; }
  /* the switcher moves out of the pill and into this panel below 620px — hidden here
     above that, so an open menu on a tablet does not show the control twice */
  .lp-menu :global(.language-switcher) {
    display: none;
    min-block-size: 48px;
    margin-top: 6px;
    padding-inline-start: 14px;
    border-color: transparent;
    border-radius: 14px;
    background: rgba(47, 91, 107, .05);
  }
  .lp-menu :global(.language-switcher select) { flex: 1; font-size: 1.01rem; color: var(--lp-ink); }

  /* Over the hero photograph the pill dissolves: white type, an outlined CTA, and dark
     glass for the controls. Once the page scrolls the frosted pill above takes over. */
  .lp-nav-over { border-color: transparent; background: transparent; backdrop-filter: none; box-shadow: none; }
  .lp-nav-over .lp-brand { color: #fff; }
  .lp-nav-over .lp-links button { color: rgba(255, 255, 255, .88); }
  .lp-nav-over .lp-links button:hover { color: #fff; background: rgba(255, 255, 255, .14); }
  .lp-nav-over .lp-signin { color: #fff; }
  .lp-nav-over .lp-signin:hover { background: rgba(255, 255, 255, .14); }
  .lp-nav-over :global(.language-switcher) { border-color: rgba(255, 255, 255, .32); background: rgba(10, 24, 30, .34); color: #fff; }
  .lp-nav-over :global(.language-switcher select) { color: #fff; }
  .lp-nav-over .lp-toggle { border-color: rgba(255, 255, 255, .32); background: rgba(10, 24, 30, .34); color: #fff; }

  /* ── Hero ─────────────────────────────────────────────────────────────── */
  .lp-hero {
    position: relative;
    display: flex;
    min-height: clamp(560px, 88vh, 880px);
    overflow: hidden;
    background: #16262e;
  }
  .lp-hero-media { position: absolute; inset: 0; display: block; }
  .lp-hero-media img { width: 100%; height: 100%; object-fit: cover; object-position: 50% 45%; }
  .lp-hero-veil {
    position: absolute;
    inset: 0;
    background:
      linear-gradient(100deg, rgba(9, 20, 26, .92) 0%, rgba(9, 20, 26, .7) 36%, rgba(9, 20, 26, .26) 68%, rgba(9, 20, 26, .45) 100%),
      linear-gradient(to top, rgba(9, 20, 26, .6), rgba(9, 20, 26, 0) 45%);
  }
  /* the copy moves to the other side in RTL, so the scrim mirrors with it */
  :global([dir='rtl']) .lp-hero-veil { transform: scaleX(-1); }
  .lp-hero-inner {
    position: relative;
    display: flex;
    flex-direction: column;
    min-height: inherit;
    padding-block: clamp(120px, 16vh, 168px) clamp(32px, 5vh, 52px);
  }
  /* wide enough for the headline's own line ("The calm way to run") to hold
     before the authored break — the paragraph keeps its narrower measure */
  .lp-hero-content { margin-block: auto; max-width: min(54rem, 100%); }
  .lp-hero-eyebrow {
    margin: 0 0 16px;
    font-size: .8rem;
    font-weight: 600;
    letter-spacing: .16em;
    text-transform: uppercase;
    color: rgba(255, 255, 255, .82);
  }
  .lp-hero .lp-hero-title {
    margin: 0;
    font-size: clamp(2.8rem, 5.6vw, 5.2rem);
    line-height: 1.03;
    letter-spacing: -.032em;
    color: #fff;
    text-shadow: 0 2px 24px rgba(6, 16, 22, .5);
  }
  .lp-hero-lede { margin: 22px 0 0; max-width: 32rem; font-size: 1.21rem; line-height: 1.68; color: rgba(255, 255, 255, .88); }
  .lp-hero-actions { display: flex; flex-wrap: wrap; gap: 12px; margin-top: 30px; }
  .lp-hero-facts {
    display: flex;
    flex-wrap: wrap;
    margin: 0;
    padding: 0;
    list-style: none;
    font-size: .96rem;
    color: rgba(255, 255, 255, .76);
  }
  .lp-hero-facts li { display: flex; align-items: center; }
  .lp-hero-facts li:not(:first-child)::before { content: '·'; margin-inline: 12px; color: rgba(255, 255, 255, .45); }
  .lp-hero-facts strong { margin-inline-end: 6px; font-weight: 600; color: #fff; font-variant-numeric: tabular-nums; }

  /* the rent-roll chip rides on the photograph, so it is dark glass with light tiles */
  .lp-roll {
    position: absolute;
    inset-inline-end: var(--lp-gutter);
    bottom: clamp(96px, 14vh, 132px);
    width: 214px;
    padding: 14px 15px;
    border-radius: 18px;
    border: 1px solid rgba(255, 255, 255, .22);
    background: rgba(10, 24, 30, .5);
    backdrop-filter: blur(16px) saturate(140%);
    box-shadow: 0 24px 50px -28px rgba(0, 0, 0, .85);
    animation: lp-float 8s ease-in-out infinite alternate;
  }
  .lp-roll-title { margin: 0; font-family: var(--lp-display); font-size: .96rem; font-weight: 600; color: #fff; }
  .lp-roll-detail { margin: 2px 0 0; font-size: .87rem; color: rgba(255, 255, 255, .78); font-variant-numeric: tabular-nums; }
  .lp-roll-grid { display: grid; grid-template-columns: repeat(12, 1fr); gap: 3px; margin-top: 11px; }
  .lp-roll-grid i { height: 9px; border-radius: 3px; background: rgba(255, 255, 255, .24); }
  .lp-roll-grid i.lp-paid { background: #7fb3c4; }
  .lp-roll-grid i.lp-due { background: #e2a26a; }
  @keyframes lp-float {
    from { transform: translateY(-7px); }
    to { transform: translateY(7px); }
  }

  /* ── Sections ─────────────────────────────────────────────────────────── */
  .lp-section { padding-bottom: var(--lp-section-y); scroll-margin-top: 96px; }
  .lp-section-head { max-width: 660px; }
  .lp-section-head h2 { margin: 0; font-size: clamp(2.11rem, 3.4vw, 2.97rem); letter-spacing: -.028em; }
  .lp-section-head p { margin: 15px 0 0; font-size: 1.17rem; color: var(--lp-ink-soft); max-width: 34rem; }

  /* feature + review cards */
  .lp-card {
    padding: 26px 24px 28px;
    border-radius: 22px;
    border: 1px solid rgba(255, 255, 255, .85);
    background: var(--lp-glass);
    backdrop-filter: blur(12px) saturate(140%);
    box-shadow: var(--lp-shadow-soft);
    transition: transform .2s ease, box-shadow .2s ease, background-color .2s ease;
  }
  .lp-card:hover { transform: translateY(-3px); background: rgba(255, 255, 255, .82); box-shadow: var(--lp-shadow-lift); }

  .lp-feature-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-top: 44px; }
  .lp-icon { display: grid; place-items: center; width: 42px; height: 42px; margin-bottom: 18px; border-radius: 13px; font-size: 1.15rem; }
  .lp-icon-teal { background: var(--lp-teal-wash); color: var(--lp-teal); }
  .lp-icon-terra { background: var(--lp-terra-wash); color: var(--lp-terra-ink); }
  .lp-card h3 { margin: 0; font-size: 1.21rem; letter-spacing: -.015em; }
  .lp-card p { margin: 9px 0 0; font-size: 1.05rem; line-height: 1.6; color: var(--lp-ink-soft); }

  /* steps */
  .lp-steps { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin: 44px 0 0; padding: 0; list-style: none; }
  .lp-step { padding-block: 26px 28px; padding-inline: 0 24px; border-top: 1px solid var(--lp-ring-strong); }
  .lp-step-num {
    display: grid;
    place-items: center;
    width: 38px;
    height: 38px;
    border-radius: 12px;
    background: var(--lp-teal);
    color: #fff;
    font-family: var(--lp-display);
    font-size: 1.09rem;
    font-weight: 600;
    box-shadow: 0 12px 22px -14px rgba(47, 91, 107, .95);
  }
  .lp-step h3 { margin: 20px 0 0; font-size: 1.26rem; letter-spacing: -.018em; }
  .lp-step p { margin: 9px 0 0; font-size: 1.06rem; line-height: 1.6; color: var(--lp-ink-soft); }

  /* reviews */
  .lp-quote-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin-top: 44px; }
  .lp-quote { display: flex; flex-direction: column; }
  .lp-stars { display: flex; gap: 3px; color: var(--lp-terra); font-size: .95rem; }
  .lp-quote blockquote { margin: 16px 0 0; font-size: 1.11rem; line-height: 1.68; color: var(--lp-ink); }
  .lp-who { display: flex; align-items: center; gap: 12px; margin-top: auto; padding-top: 22px; }
  .lp-who img { width: 44px; height: 44px; border-radius: 50%; object-fit: cover; border: 2px solid #fff; box-shadow: var(--lp-shadow-soft); }
  .lp-who-name { font-size: 1.05rem; font-weight: 600; }
  .lp-who-role { font-size: .94rem; color: var(--lp-ink-faint); }

  /* pricing band */
  .lp-band {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 28px;
    padding: 28px 32px;
    border-radius: 22px;
    border: 1px solid rgba(255, 255, 255, .85);
    background: var(--lp-glass);
    backdrop-filter: blur(12px) saturate(140%);
    box-shadow: var(--lp-shadow-soft);
  }
  .lp-band h2 { max-width: 30rem; margin: 0; font-size: 1.54rem; letter-spacing: -.03em; }
  .lp-band > p { max-width: 25rem; margin: 0; font-size: .97rem; line-height: 1.65; color: var(--lp-ink-soft); }

  /* closing cta */
  .lp-cta {
    position: relative;
    overflow: hidden;
    padding: clamp(44px, 6vw, 72px) clamp(28px, 5vw, 64px);
    border-radius: 30px;
    background: linear-gradient(155deg, #35657a 0%, var(--lp-teal-deep) 58%, #1e3d4a 100%);
    box-shadow: 0 40px 80px -40px rgba(36, 74, 88, .8);
    color: #fff;
    text-align: center;
  }
  .lp-cta::after {
    content: '';
    position: absolute;
    inset: -40% -10% auto;
    height: 120%;
    background: radial-gradient(560px 300px at 50% 0%, rgba(217, 138, 75, .3), transparent 70%);
    pointer-events: none;
  }
  .lp-cta > * { position: relative; }
  .lp-cta-kicker { margin: 0 0 12px; font-size: .78rem; font-weight: 600; letter-spacing: .1em; text-transform: uppercase; color: rgba(255, 255, 255, .74); }
  .lp-cta h2 { color: #fff; font-size: clamp(2.17rem, 3.8vw, 3.26rem); letter-spacing: -.03em; }
  .lp-cta p { margin: 18px auto 24px; max-width: 34rem; font-size: 1.19rem; color: rgba(255, 255, 255, .86); }

  /* ── Registration ─────────────────────────────────────────────────────── */
  .lp-registration-grid { display: grid; grid-template-columns: minmax(15rem, .78fr) minmax(28rem, 1.22fr); gap: clamp(32px, 6vw, 72px); align-items: start; }
  .lp-registration-intro h2 { margin: 0; font-size: clamp(2.11rem, 3.4vw, 2.86rem); letter-spacing: -.03em; }
  .lp-registration-intro > p { margin: 16px 0 0; max-width: 23rem; font-size: 1.17rem; line-height: 1.7; color: var(--lp-ink-soft); }
  .lp-secure { display: flex; align-items: center; gap: 9px; margin-top: 26px !important; font-size: .94rem !important; color: var(--lp-ink-soft); }
  .lp-secure i { color: #1f7a5a; font-size: 1.1rem; }

  .lp-form {
    padding: clamp(24px, 4vw, 36px);
    border-radius: 22px;
    border: 1px solid rgba(255, 255, 255, .85);
    background: rgba(255, 255, 255, .86);
    backdrop-filter: blur(12px) saturate(140%);
    box-shadow: var(--lp-shadow-soft);
  }
  .lp-form-head h2 { margin: 0; font-size: 1.9rem; letter-spacing: -.03em; }
  .lp-form-head > p:last-child { margin: 8px 0 0; font-size: 1.01rem; color: var(--lp-ink-soft); }
  .lp-form-head .lp-kicker { margin-bottom: 8px; }
  .lp-alert { margin: 20px 0 0; border-radius: 14px; font-size: .97rem; }
  .lp-fields { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; margin-top: 26px; }
  .lp-field-wide { grid-column: 1 / -1; }
  .lp-form :global(.form-label) { margin-bottom: 6px; font-size: .94rem; font-weight: 600; color: var(--lp-ink); }
  .lp-form :global(.form-control) {
    min-height: 46px;
    border: 1px solid #d9dee1;
    border-radius: 12px;
    background: #fff;
    font-size: 1.01rem;
    color: var(--lp-ink);
  }
  .lp-form :global(.form-control:focus) { border-color: var(--lp-teal); box-shadow: 0 0 0 3px rgba(47, 91, 107, .16); }
  .lp-invalid { border-color: #c85b5b !important; }
  .lp-error { margin-top: 6px; font-size: .87rem; line-height: 1.45; color: #b34e4e; }
  /* The reporting-currency hint and the typed-in code sit inside their own field,
     so they need their own spacing rather than the grid's gap. */
  .lp-hint { margin: 6px 0 0; }
  .lp-submit { width: 100%; margin-top: 26px; }
  .lp-signin-note { margin: 18px 0 0; font-size: .94rem; color: var(--lp-ink-soft); text-align: center; }
  .lp-signin-note button { padding: 0; border: 0; background: transparent; color: var(--lp-teal); font-size: inherit; font-weight: 700; cursor: pointer; }
  .lp-signin-note button:hover { text-decoration: underline; }

  /* ── Footer ───────────────────────────────────────────────────────────── */
  .lp-footer { background: var(--lp-ink); color: rgba(255, 255, 255, .72); }
  .lp-footer-row { display: flex; align-items: center; flex-wrap: wrap; gap: 14px 26px; padding-block: 22px; }
  .lp-footer-brand { color: #fff; font-size: 1.12rem; margin-inline-end: 0; }
  .lp-copy { font-size: .94rem; color: rgba(255, 255, 255, .6); }
  .lp-footer-links { display: flex; flex-wrap: wrap; gap: 4px; margin: 0 0 0 auto; padding: 0; list-style: none; }
  .lp-footer-links button, .lp-footer-links a {
    display: inline-flex;
    align-items: center;
    min-height: 44px;
    padding: 8px 12px;
    border: 0;
    border-radius: 999px;
    background: transparent;
    color: inherit;
    font-size: .94rem;
    text-decoration: none;
    cursor: pointer;
    transition: color .16s ease, background-color .16s ease;
  }
  .lp-footer-links button:hover, .lp-footer-links a:hover { color: #fff; background: rgba(255, 255, 255, .09); }

  /* ── Responsive ───────────────────────────────────────────────────────── */
  @media (max-width: 1000px) {
    .lp-feature-grid { grid-template-columns: repeat(2, 1fr); }
    .lp-steps { grid-template-columns: repeat(2, 1fr); }
    .lp-roll { display: none; }
    .lp-hero-inner { padding-block: clamp(112px, 15vh, 144px) 36px; }
    .lp-registration-grid { grid-template-columns: 1fr; gap: 32px; }
  }

  @media (max-width: 900px) {
    .lp-links, .lp-actions .lp-signin { display: none; }
    .lp-toggle { display: inline-flex; }
    .lp-nav { padding: 8px 10px 8px 14px; }
    .lp-quote-grid { grid-template-columns: 1fr; gap: 16px; }
    .lp-band { flex-direction: column; align-items: flex-start; gap: 16px; }
    .lp-band > p { max-width: none; }
  }

  @media (max-width: 620px) {
    .lp-feature-grid, .lp-steps { grid-template-columns: 1fr; }
    .lp-btn { width: 100%; }
    .lp-hero-actions { flex-direction: column; align-items: stretch; }
    /* both the CTA and the language switcher live in the menu at this width, so the
       pill stays on one line down to the narrowest phones */
    .lp-actions .lp-btn, .lp-actions :global(.language-switcher) { display: none; }
    .lp-menu .lp-btn, .lp-menu :global(.language-switcher) { display: flex; }
    .lp-hero { min-height: clamp(520px, 82vh, 700px); }
    .lp-hero-facts { flex-direction: column; align-items: flex-start; gap: 6px; font-size: .92rem; }
    .lp-hero-facts li:not(:first-child)::before { content: none; }
    .lp-step { padding: 22px 0; }
    .lp-fields { grid-template-columns: 1fr; }
    .lp-field-wide { grid-column: auto; }
    .lp-footer-row { flex-direction: column; align-items: flex-start; }
    .lp-footer-links { margin-inline-start: -12px; }
  }

  @media (prefers-reduced-motion: reduce) {
    .lp-roll { animation: none; }
    .lp-btn:hover, .lp-card:hover { transform: none; }
    .lp-arrow, .lp-btn .lp-arrow { transition: none; }
  }
</style>
