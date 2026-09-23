<script>
  import { push } from 'svelte-spa-router';

  import LanguageSwitcher from '../components/LanguageSwitcher.svelte';
  import { locale } from '../i18n';

  const features = [
    { key: 'property', icon: 'bi-buildings' },
    { key: 'tenant', icon: 'bi-people' },
    { key: 'invoices', icon: 'bi-receipt' },
  ];
  const steps = ['add', 'manage', 'track'];
  const stats = ['units', 'onTime', 'adminTime'];
  const rentTiles = ['paid','paid','paid','paid','paid','paid','paid','paid','due','paid','paid','empty'];

  let navigationOpen = false;

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
  <header class="lp-header">
    <nav class="lp-nav lp-wrap" aria-label="Primary navigation">
      <button class="lp-brand" type="button" on:click={() => scrollToSection('home')} aria-label={$locale.home.nav.homeLabel}>
        <span class="lp-mark" aria-hidden="true"><i class="bi bi-buildings"></i></span>
        <span>{$locale.common.apartmentPro}</span>
      </button>

      <ul class="lp-links">
        <li><button type="button" on:click={() => scrollToSection('features')}>{$locale.home.nav.features}</button></li>
        <li><button type="button" on:click={() => scrollToSection('about')}>{$locale.home.nav.about}</button></li>
      </ul>

      <div class="lp-actions">
        <LanguageSwitcher />
        <button class="lp-signin" type="button" on:click={() => push('/login')}>{$locale.common.signIn}</button>
        <button class="lp-button lp-button-primary lp-desktop-cta" type="button" on:click={() => push('/register')}>
          {$locale.common.getStarted}
          <i class="bi bi-arrow-right lp-arrow" aria-hidden="true"></i>
        </button>
        <button
          class="lp-toggle"
          type="button"
          aria-expanded={navigationOpen}
          aria-controls="lp-mobile-menu"
          aria-label={$locale.home.nav.toggle}
          on:click={() => (navigationOpen = !navigationOpen)}
        >
          <i class={`bi ${navigationOpen ? 'bi-x-lg' : 'bi-list'}`} aria-hidden="true"></i>
        </button>
      </div>
    </nav>

    <div class="lp-mobile-menu lp-wrap" id="lp-mobile-menu" hidden={!navigationOpen}>
      <button type="button" on:click={() => scrollToSection('features')}>{$locale.home.nav.features}</button>
      <button type="button" on:click={() => scrollToSection('about')}>{$locale.home.nav.about}</button>
      <button type="button" on:click={() => push('/login')}>{$locale.common.signIn}</button>
      <button class="lp-button lp-button-primary" type="button" on:click={() => push('/register')}>
        {$locale.common.getStarted}
      </button>
      <div class="lp-mobile-language"><LanguageSwitcher /></div>
    </div>
  </header>

  <main>
    <section class="lp-hero" id="home">
      <picture class="lp-hero-media" aria-hidden="true">
        <source media="(max-width: 660px)" srcset="/images/home/hero-tall.jpg" />
        <img src="/images/home/hero-wide.jpg" alt="" width="1280" height="853" fetchpriority="high" />
      </picture>
      <div class="lp-hero-veil" aria-hidden="true"></div>

      <div class="lp-wrap lp-hero-grid">
        <div class="lp-hero-copy">
          <p class="lp-kicker">{$locale.home.hero.kicker}</p>
          <h1>
            {$locale.home.hero.title}
            <span>{$locale.home.hero.titleAccent}</span>
          </h1>
          <p class="lp-hero-lede">{$locale.home.hero.description}</p>

          <div class="lp-hero-actions">
            <button class="lp-button lp-button-primary" type="button" on:click={() => push('/register')}>
              {$locale.common.getStarted}
              <i class="bi bi-arrow-right lp-arrow" aria-hidden="true"></i>
            </button>
            <button class="lp-button lp-button-secondary" type="button" on:click={() => scrollToSection('features')}>
              {$locale.home.hero.seeHow}
            </button>
          </div>

          <ul class="lp-hero-stats" aria-label={$locale.home.hero.chip.summary}>
            {#each stats as stat}
              <li>
                <strong>{$locale.home.hero.stats[stat][0]}</strong>
                <span>{$locale.home.hero.stats[stat][1]}</span>
              </li>
            {/each}
          </ul>
        </div>

        <aside class="lp-rent-status" aria-label={$locale.home.hero.chip.summary}>
          <div class="lp-rent-copy">
            <strong>{$locale.home.hero.chip.title}</strong>
            <span>{$locale.home.hero.chip.detail}</span>
          </div>
          <div class="lp-rent-tiles" aria-hidden="true">
            {#each rentTiles as tile}
              <i class:due={tile === 'due'} class:empty={tile === 'empty'}></i>
            {/each}
          </div>
        </aside>
      </div>
    </section>

    <section class="lp-section" id="features">
      <div class="lp-wrap">
        <div class="lp-section-heading">
          <p class="lp-kicker">{$locale.home.features.kicker}</p>
          <h2>{$locale.home.features.title} {$locale.home.features.titleBreak}</h2>
          <p>{$locale.home.features.description}</p>
        </div>

        <div class="lp-feature-grid">
          {#each features as feature}
            <article class="lp-feature">
              <span class="lp-feature-icon" aria-hidden="true"><i class={`bi ${feature.icon}`}></i></span>
              <h3>{$locale.home.features.items[feature.key][0]}</h3>
              <p>{$locale.home.features.items[feature.key][1]}</p>
            </article>
          {/each}
        </div>
      </div>
    </section>

    <section class="lp-section lp-process-section" id="about">
      <div class="lp-wrap lp-process-grid">
        <div class="lp-section-heading lp-process-heading">
          <p class="lp-kicker">{$locale.home.process.kicker}</p>
          <h2>{$locale.home.process.title} {$locale.home.process.titleBreak}</h2>
          <p>{$locale.home.process.description}</p>
          <button class="lp-text-link" type="button" on:click={() => push('/register')}>
            {$locale.common.getStarted}
            <i class="bi bi-arrow-right lp-arrow" aria-hidden="true"></i>
          </button>
        </div>

        <ol class="lp-steps">
          {#each steps as step, index}
            <li>
              <span class="lp-step-number" aria-hidden="true">{index + 1}</span>
              <div>
                <h3>{$locale.home.process.items[step][0]}</h3>
                <p>{$locale.home.process.items[step][1]}</p>
              </div>
            </li>
          {/each}
        </ol>
      </div>
    </section>

    <section class="lp-cta-section">
      <div class="lp-wrap">
        <div class="lp-cta">
          <div>
            <p class="lp-kicker">{$locale.home.cta.kicker}</p>
            <h2>{$locale.home.cta.title} {$locale.home.cta.titleBreak}</h2>
            <p>{$locale.home.cta.description}</p>
          </div>
          <button class="lp-button lp-button-light" type="button" on:click={() => push('/register')}>
            {$locale.common.getStarted}
            <i class="bi bi-arrow-right lp-arrow" aria-hidden="true"></i>
          </button>
        </div>
      </div>
    </section>
  </main>

  <footer class="lp-footer">
    <div class="lp-wrap lp-footer-row">
      <button class="lp-brand" type="button" on:click={() => scrollToSection('home')}>
        <span class="lp-mark" aria-hidden="true"><i class="bi bi-buildings"></i></span>
        <span>{$locale.common.apartmentPro}</span>
      </button>
      <p>{$locale.home.footer.copyright}</p>
      <div class="lp-footer-actions">
        <a href="mailto:hello@apartmentpro.com">hello@apartmentpro.com</a>
        <button type="button" on:click={() => push('/login')}>{$locale.common.signIn}</button>
      </div>
    </div>
  </footer>
</div>

<style>
  :global(body) { background: var(--surface); }

  .lp-page {
    --lp-primary: var(--accent);
    --lp-primary-readable: var(--accent-text);
    --lp-primary-strong: var(--accent-active);
    --lp-soft: var(--accent-soft);
    --lp-soft-border: var(--accent-soft-border);
    --lp-ink: var(--text-strong);
    --lp-text: var(--text);
    --lp-muted: var(--text-muted);
    --lp-border: var(--border);
    --lp-gutter: clamp(1.25rem, 4vw, 3rem);

    min-height: 100vh;
    color: var(--lp-text);
    background: var(--surface);
    font-family: var(--font-ui);
    -webkit-font-smoothing: antialiased;
  }

  .lp-page :is(h1,h2,h3) { margin: 0; color: var(--lp-ink); font-weight: var(--weight-bold); letter-spacing: var(--tracking-tight); line-height: 1.12; text-wrap: balance; }
  .lp-page :is(button,a) { font-family: inherit; }
  .lp-page :is(button,a):focus-visible { outline: 3px solid var(--brand-300); outline-offset: 3px; border-radius: var(--radius-sm); }
  .lp-wrap { width: 100%; max-width: 76rem; margin-inline: auto; padding-inline: var(--lp-gutter); }
  .lp-kicker { margin: 0 0 .75rem; color: var(--lp-primary-readable); font-size: var(--text-xs); font-weight: var(--weight-bold); letter-spacing: .1em; text-transform: uppercase; }

  .lp-header { position: absolute; z-index: 20; inset: 0 0 auto; color: #fff; }
  .lp-nav { display: flex; align-items: center; min-height: 6rem; gap: 1rem; }
  .lp-brand { display: inline-flex; align-items: center; gap: .65rem; min-height: 44px; margin-inline-end: auto; padding: 0; border: 0; color: #fff; background: transparent; font-size: 1.08rem; font-weight: var(--weight-bold); cursor: pointer; }
  .lp-mark { display: grid; place-items: center; width: 2.45rem; height: 2.45rem; border: 1px solid rgba(255,255,255,.35); border-radius: .72rem; color: #fff; background: rgba(53,134,255,.55); box-shadow: 0 8px 22px -12px rgba(0,0,0,.75); backdrop-filter: blur(8px); }
  .lp-links { display: flex; align-items: center; gap: .2rem; margin: 0; padding: 0; list-style: none; }
  .lp-links button,.lp-signin { min-height: 44px; padding: 0 .85rem; border: 0; border-radius: .55rem; color: rgba(255,255,255,.88); background: transparent; font-size: var(--text-sm); font-weight: var(--weight-semibold); cursor: pointer; transition: color var(--transition),background var(--transition); }
  .lp-links button:hover,.lp-signin:hover { color: #fff; background: rgba(255,255,255,.12); }
  .lp-actions { display: flex; align-items: center; gap: .35rem; }
  .lp-actions :global(.language-switcher) { min-block-size: 44px; border-color: rgba(255,255,255,.3); border-radius: .65rem; color: #fff; background: rgba(8,24,38,.3); backdrop-filter: blur(10px); }
  .lp-actions :global(.language-switcher select) { color: #fff; }
  .lp-actions :global(.language-switcher option) { color: var(--text-strong); }
  .lp-header .lp-desktop-cta { border-color: rgba(169,205,255,.7); color: #fff; background: rgba(53,134,255,.24); box-shadow: none; backdrop-filter: blur(10px); }
  .lp-header .lp-desktop-cta:hover { border-color: #fff; background: rgba(53,134,255,.5); }
  .lp-toggle { display: none; place-items: center; width: 44px; height: 44px; border: 1px solid rgba(255,255,255,.35); border-radius: .6rem; color: #fff; background: rgba(8,24,38,.28); font-size: 1.1rem; cursor: pointer; }
  .lp-mobile-menu { display: none; padding-block: 0 1rem; }
  .lp-mobile-menu[hidden] { display: none; }

  .lp-button { display: inline-flex; align-items: center; justify-content: center; gap: .55rem; min-height: 44px; padding: .65rem 1.2rem; border: 1px solid transparent; border-radius: .65rem; font-size: var(--text-sm); font-weight: var(--weight-bold); line-height: 1; cursor: pointer; transition: color var(--transition),background var(--transition),border-color var(--transition),box-shadow var(--transition); }
  .lp-button-primary { color: #fff; background: var(--lp-primary-readable); box-shadow: 0 10px 22px -14px rgba(37,112,230,.8); }
  .lp-button-primary:hover { background: var(--lp-primary-strong); box-shadow: 0 12px 26px -14px rgba(28,88,184,.85); }
  .lp-button-secondary { border-color: var(--lp-border); color: var(--lp-ink); background: var(--surface); box-shadow: var(--control-shadow); }
  .lp-button-secondary:hover { border-color: var(--accent-border); color: var(--lp-primary-readable); background: var(--lp-soft); }
  .lp-button-light { color: var(--lp-primary-strong); background: #fff; box-shadow: 0 12px 26px -16px rgba(10,25,49,.55); }
  .lp-button-light:hover { background: var(--brand-50); }
  .lp-button:active { box-shadow: none; }
  .lp-arrow { transition: transform var(--transition); }
  .lp-button:hover .lp-arrow,.lp-text-link:hover .lp-arrow { transform: translateX(3px); }
  :global([dir='rtl']) .lp-arrow { transform: scaleX(-1); }
  :global([dir='rtl']) .lp-button:hover .lp-arrow,:global([dir='rtl']) .lp-text-link:hover .lp-arrow { transform: scaleX(-1) translateX(3px); }

  .lp-hero { position: relative; display: flex; align-items: center; overflow: hidden; min-height: clamp(44rem,100svh,58rem); padding: 7.5rem 0 4rem; background: var(--navy-deep); }
  .lp-hero-media,.lp-hero-veil { position: absolute; inset: 0; }
  .lp-hero-media img { display: block; width: 100%; height: 100%; object-fit: cover; object-position: center 48%; }
  .lp-hero-veil { background: linear-gradient(90deg,rgba(5,18,29,.96) 0%,rgba(5,18,29,.84) 37%,rgba(7,24,38,.42) 68%,rgba(7,24,38,.2) 100%),linear-gradient(0deg,rgba(4,16,26,.72) 0%,rgba(4,16,26,0) 48%); }
  :global([dir='rtl']) .lp-hero-veil { background: linear-gradient(270deg,rgba(5,18,29,.96) 0%,rgba(5,18,29,.84) 37%,rgba(7,24,38,.42) 68%,rgba(7,24,38,.2) 100%),linear-gradient(0deg,rgba(4,16,26,.72) 0%,rgba(4,16,26,0) 48%); }
  .lp-hero-grid { position: relative; z-index: 1; display: grid; grid-template-columns: minmax(0,1fr) auto; align-items: end; gap: clamp(3rem,8vw,8rem); }
  .lp-hero-copy { max-width: 47rem; }
  .lp-hero .lp-kicker { color: var(--brand-300); }
  .lp-hero h1 { max-width: 13ch; color: #fff; font-size: clamp(3rem,6vw,5.8rem); line-height: 1.02; }
  .lp-hero h1 span { display: block; color: #fff; }
  .lp-hero-lede { max-width: 39rem; margin: 1.5rem 0 0; color: rgba(255,255,255,.82); font-size: clamp(16px,1.4vw,19px); line-height: 1.7; }
  .lp-hero-actions { display: flex; flex-wrap: wrap; gap: .75rem; margin-block-start: 1.75rem; }
  .lp-hero .lp-button-primary { color: var(--lp-primary-strong); background: #fff; box-shadow: 0 14px 32px -18px rgba(0,0,0,.7); }
  .lp-hero .lp-button-primary:hover { color: var(--lp-primary-strong); background: var(--brand-50); }
  .lp-hero .lp-button-secondary { border-color: rgba(255,255,255,.55); color: #fff; background: rgba(6,20,32,.24); box-shadow: none; backdrop-filter: blur(8px); }
  .lp-hero .lp-button-secondary:hover { border-color: #fff; color: #fff; background: rgba(255,255,255,.12); }
  .lp-hero-stats { display: flex; flex-wrap: wrap; gap: .8rem 1.3rem; margin: 1.8rem 0 0; padding: 0; list-style: none; }
  .lp-hero-stats li { min-width: 0; }
  .lp-hero-stats strong { display: inline; color: #fff; font-family: var(--font-data); font-size: 1.05rem; font-variant-numeric: tabular-nums; }
  .lp-hero-stats span { margin-inline-start: .35rem; color: rgba(255,255,255,.68); font-size: var(--text-sm); }
  .lp-rent-status { align-self: end; min-width: 16rem; margin-block-end: 4.5rem; padding: 1.2rem; border: 1px solid rgba(169,205,255,.22); border-radius: 1rem; color: #fff; background: rgba(8,31,48,.72); box-shadow: 0 20px 48px -28px rgba(0,0,0,.8); backdrop-filter: blur(12px); }
  .lp-rent-copy { display: flex; flex-direction: column; }
  .lp-rent-copy strong { font-size: var(--text-base); }
  .lp-rent-copy span { margin-block-start: .25rem; color: rgba(255,255,255,.68); font-size: var(--text-sm); }
  .lp-rent-tiles { display: grid; grid-template-columns: repeat(6,1fr); gap: .35rem; margin-block-start: .9rem; }
  .lp-rent-tiles i { display: block; height: .55rem; border-radius: .22rem; background: var(--brand-300); }
  .lp-rent-tiles i.due { background: var(--warning-border); }
  .lp-rent-tiles i.empty { background: rgba(255,255,255,.28); }

  .lp-section { scroll-margin-top: 5rem; padding: clamp(4.5rem,8vw,7rem) 0; }
  .lp-section-heading { max-width: 42rem; margin-block-end: 2.25rem; }
  .lp-section-heading h2,.lp-cta h2 { font-size: clamp(1.9rem,3.5vw,3rem); }
  .lp-section-heading > p:last-child,.lp-cta div > p:last-child { margin: 1rem 0 0; color: var(--lp-muted); font-size: 16px; line-height: 1.7; }
  .lp-feature-grid { display: grid; grid-template-columns: repeat(3,minmax(0,1fr)); border-block: 1px solid var(--lp-border); }
  .lp-feature { min-width: 0; padding: 2rem; border-inline-start: 1px solid var(--lp-border); }
  .lp-feature:first-child { border-inline-start: 0; }
  .lp-feature-icon { display: grid; place-items: center; width: 2.75rem; height: 2.75rem; margin-block-end: 1.35rem; border-radius: .8rem; color: var(--lp-primary-readable); background: var(--lp-soft); font-size: 1.15rem; }
  .lp-feature h3 { font-size: 1.1rem; }
  .lp-feature p { margin: .7rem 0 0; color: var(--lp-muted); font-size: 15px; line-height: 1.65; }

  .lp-process-section { background: var(--canvas); }
  .lp-process-grid { display: grid; grid-template-columns: minmax(0,.8fr) minmax(24rem,1.2fr); gap: clamp(3rem,8vw,7rem); }
  .lp-process-heading { margin: 0; }
  .lp-text-link { display: inline-flex; align-items: center; gap: .5rem; min-height: 44px; margin-block-start: 1.1rem; padding: 0; border: 0; color: var(--lp-primary-readable); background: transparent; font-size: var(--text-sm); font-weight: var(--weight-bold); cursor: pointer; }
  .lp-steps { margin: 0; padding: 0; border-block-start: 1px solid var(--border-strong); list-style: none; }
  .lp-steps li { display: grid; grid-template-columns: auto 1fr; gap: 1rem; padding: 1.35rem 0; border-block-end: 1px solid var(--border-strong); }
  .lp-step-number { display: grid; place-items: center; width: 2.2rem; height: 2.2rem; border: 1px solid var(--lp-soft-border); border-radius: 50%; color: var(--lp-primary-readable); background: var(--surface); font-family: var(--font-data); font-size: var(--text-xs); font-weight: var(--weight-bold); }
  .lp-steps h3 { font-size: 1rem; }
  .lp-steps p { margin: .45rem 0 0; color: var(--lp-muted); font-size: 15px; line-height: 1.55; }

  .lp-cta-section { padding: clamp(3.5rem,7vw,6rem) 0; }
  .lp-cta { display: flex; align-items: center; justify-content: space-between; gap: 2rem; padding: clamp(2rem,5vw,3.5rem); border-radius: 1.25rem; color: #fff; background: var(--lp-primary-readable); box-shadow: 0 24px 55px -34px rgba(28,88,184,.8); }
  .lp-cta .lp-kicker { color: var(--brand-200); }
  .lp-cta h2 { max-width: 18ch; color: #fff; }
  .lp-cta div > p:last-child { color: rgba(255,255,255,.8); }
  .lp-cta .lp-button { flex: 0 0 auto; }

  .lp-footer { border-block-start: 1px solid var(--lp-border); }
  .lp-footer-row { display: flex; align-items: center; gap: 1.5rem; min-height: 6rem; }
  .lp-footer-row p { margin: 0 auto; color: var(--lp-muted); font-size: var(--text-xs); }
  .lp-footer-actions { display: flex; align-items: center; gap: 1rem; }
  .lp-footer-actions a,.lp-footer-actions button { display: inline-flex; align-items: center; min-height: 44px; padding: 0; border: 0; color: var(--lp-muted); background: transparent; font-size: var(--text-xs); font-weight: var(--weight-semibold); text-decoration: none; cursor: pointer; }
  .lp-footer-actions a:hover,.lp-footer-actions button:hover { color: var(--lp-primary-readable); }

  @media (max-width: 920px) {
    .lp-links,.lp-signin,.lp-desktop-cta { display: none; }
    .lp-toggle { display: grid; }
    .lp-mobile-menu:not([hidden]) { display: grid; gap: .3rem; padding-block: .75rem 1rem; border-block-start: 1px solid rgba(255,255,255,.22); background: rgba(5,18,29,.94); box-shadow: 0 14px 30px -22px rgba(0,0,0,.9); backdrop-filter: blur(14px); }
    .lp-mobile-menu button:not(.lp-button) { min-height: 48px; padding: 0 .75rem; border: 0; border-radius: .55rem; color: rgba(255,255,255,.88); background: transparent; text-align: start; font-size: var(--text-sm); font-weight: var(--weight-semibold); }
    .lp-mobile-menu button:not(.lp-button):hover { color: #fff; background: rgba(255,255,255,.1); }
    .lp-mobile-language { padding: .5rem .75rem 0; }
    .lp-mobile-language :global(.language-switcher) { width: 100%; justify-content: center; border-color: rgba(255,255,255,.25); color: #fff; background: rgba(255,255,255,.08); }
    .lp-mobile-language :global(.language-switcher select) { color: #fff; }
    .lp-mobile-language :global(.language-switcher option) { color: var(--text-strong); }
    .lp-hero-grid { grid-template-columns: 1fr; }
    .lp-hero-copy { max-width: 44rem; }
    .lp-hero h1 { max-width: 13ch; }
    .lp-rent-status { justify-self: end; width: min(100%,18rem); margin-block: 1.5rem 0; }
    .lp-process-grid { grid-template-columns: 1fr; }
    .lp-process-heading { max-width: 44rem; }
  }

  @media (max-width: 660px) {
    .lp-nav { min-height: 4.25rem; }
    .lp-actions :global(.language-switcher) { display: none; }
    .lp-hero { min-height: 48rem; padding: 7rem 0 3rem; }
    .lp-hero-veil,:global([dir='rtl']) .lp-hero-veil { background: linear-gradient(180deg,rgba(5,18,29,.84) 0%,rgba(5,18,29,.72) 45%,rgba(5,18,29,.94) 100%); }
    .lp-hero h1 { font-size: clamp(2.35rem,13vw,3.4rem); }
    .lp-hero-actions { align-items: stretch; flex-direction: column; }
    .lp-hero-actions .lp-button { width: 100%; }
    .lp-hero-stats { gap: .65rem; }
    .lp-hero-stats strong { font-size: 1rem; }
    .lp-rent-status { justify-self: stretch; width: 100%; margin-block-start: 1rem; }
    .lp-feature-grid { grid-template-columns: 1fr; border-block-end: 0; }
    .lp-feature,.lp-feature:first-child { padding: 1.5rem 0; border-inline-start: 0; border-block-end: 1px solid var(--lp-border); }
    .lp-cta { align-items: flex-start; flex-direction: column; }
    .lp-cta .lp-button { width: 100%; }
    .lp-footer-row { align-items: flex-start; flex-direction: column; padding-block: 1.5rem; }
    .lp-footer-row p { margin: 0; }
    .lp-footer-actions { flex-wrap: wrap; }
  }

  @media (prefers-reduced-motion: reduce) {
    .lp-page :is(button,a,i) { transition: none; }
  }
</style>
