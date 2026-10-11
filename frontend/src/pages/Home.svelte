<script>
  import { push } from 'svelte-spa-router';
  import LanguageSwitcher from '../components/LanguageSwitcher.svelte';
  import { language, locale } from '../i18n';
  import { homeLandingCopy } from '../i18n/homeLanding';

  const features = [
    { key: 'property', icon: 'bi-buildings', subtitle: 'properties' },
    { key: 'tenant', icon: 'bi-people', subtitle: 'tenants' },
    { key: 'invoices', icon: 'bi-wallet2', subtitle: 'finances' },
  ];
  const steps = [
    { key: 'add', icon: 'bi-building-add' },
    { key: 'manage', icon: 'bi-person-check' },
    { key: 'track', icon: 'bi-house-check' },
  ];
  const socials = [
    ['Facebook', 'facebook', 'https://www.facebook.com/ZenoERP/'],
    ['Instagram', 'instagram', 'https://www.instagram.com/zenoerp/'],
    ['TikTok', 'tiktok', 'https://www.tiktok.com/@zenoerp'],
    ['YouTube', 'youtube', 'https://www.youtube.com/@zenoerp'],
    ['Telegram', 'telegram', 'https://t.me/zenoerp'],
    ['X', 'twitter-x', 'https://x.com/zenoerp'],
  ];
  let navigationOpen = false;
  $: copy = homeLandingCopy[$language] || homeLandingCopy.en;

  function scrollToSection(id) {
    navigationOpen = false;
    document.getElementById(id)?.scrollIntoView({
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
      block: 'start',
    });
  }
  function showFeature(key) {
    scrollToSection(`step-${key}`);
  }
</script>

<svelte:head>
  <title>{$locale.home.title}</title>
  <meta name="description" content={$locale.home.description} />
</svelte:head>

<div class="home-page" id="home">
  <div class="hero-wrap">
    <section class="hero" aria-labelledby="hero-title">
      <img class="hero-photo" src="/images/home/residences-hero.webp" alt="" aria-hidden="true" width="1536" height="1024" fetchpriority="high" />
      <div class="hero-tint" aria-hidden="true"></div>
      <header class="home-header">
        <nav class="home-nav" aria-label={$locale.home.nav.homeLabel}>
          <a class="home-brand" href="#/" aria-label={$locale.home.nav.homeLabel}><i class="bi bi-houses-fill" aria-hidden="true"></i><span>{$locale.common.apartmentPro}</span></a>
          <div class="nav-links">
            <button type="button" on:click={() => scrollToSection('home')}>{$locale.home.nav.home}</button>
            <button type="button" on:click={() => scrollToSection('how-it-works')}>{copy.how}</button>
            <button type="button" on:click={() => scrollToSection('contact')}>{$locale.home.footer.contact}</button>
          </div>
          <div class="nav-actions">
            <LanguageSwitcher />
            <button class="signin" type="button" on:click={() => push('/login')}>{$locale.common.signIn}</button>
            <button class="menu-toggle" type="button" aria-expanded={navigationOpen} aria-controls="home-mobile-menu" aria-label={$locale.home.nav.toggle} on:click={() => navigationOpen = !navigationOpen}><i class={`bi ${navigationOpen ? 'bi-x-lg' : 'bi-list'}`} aria-hidden="true"></i></button>
          </div>
        </nav>
        {#if navigationOpen}
          <div class="mobile-menu" id="home-mobile-menu">
            <button type="button" on:click={() => scrollToSection('how-it-works')}>{copy.how}</button>
            <button type="button" on:click={() => scrollToSection('contact')}>{$locale.home.footer.contact}</button>
            <button type="button" on:click={() => push('/login')}>{$locale.common.signIn}</button>
          </div>
        {/if}
      </header>
      <div class="hero-copy">
        <h1 id="hero-title">{$locale.home.hero.title}<span>{$locale.home.hero.titleAccent}</span></h1>
        <p class="hero-description">{copy.description}</p>
      </div>
      <div class="hero-curve" aria-hidden="true"></div>
    </section>
    <div class="quick-bar" aria-label={$locale.home.features.kicker}>
      {#each features as feature}
        <button class="quick-item" type="button" on:click={() => showFeature(feature.key)}><span class="quick-icon"><i class={`bi ${feature.icon}`} aria-hidden="true"></i></span><span class="quick-copy"><strong>{$locale.home.footer[feature.subtitle]}</strong><span>{copy[feature.subtitle]}</span></span><i class="bi bi-chevron-down quick-chevron" aria-hidden="true"></i></button>
      {/each}
      <button class="home-button primary hero-cta" type="button" on:click={() => push('/register')}>{$locale.common.getStarted}<i class="bi bi-arrow-right arrow" aria-hidden="true"></i></button>
    </div>
  </div>
  <main>
    <section class="how-section home-wrap" id="how-it-works" aria-labelledby="how-title">
      <div class="section-heading"><h2 id="how-title">{copy.how}</h2></div>
      <ol class="steps">
        {#each steps as step, index}
          <li class="step" id={`step-${features[index].key}`}>
            <span class="step-icon"><i class={`bi ${step.icon}`} aria-hidden="true"></i></span>
            {#if index < steps.length - 1}<span class="step-connector" aria-hidden="true"></span>{/if}
            <h3>{copy.steps[step.key][0]}</h3><p>{copy.steps[step.key][1]}</p>
          </li>
        {/each}
      </ol>
    </section>
  </main>
  <footer class="home-footer" id="contact">
    <div class="home-wrap footer-main">
      <div class="footer-brand">
        <a class="home-brand" href="#/"><i class="bi bi-houses-fill" aria-hidden="true"></i><span>{$locale.common.apartmentPro}</span></a>
        <p>{copy.footer.description}</p>
        <div class="footer-socials">{#each socials as [name, icon, href]}<a {href} target="_blank" rel="noopener noreferrer" aria-label={name}><i class={`bi bi-${icon}`} aria-hidden="true"></i></a>{/each}</div>
      </div>
      <nav class="footer-column" aria-labelledby="footer-about-title">
        <h2 id="footer-about-title">{copy.footer.about}</h2>
        <ul class="footer-links">
          <li><button type="button" on:click={() => scrollToSection('how-it-works')}>{copy.how}</button></li>
          <li><a href="#/register">{$locale.common.getStarted}</a></li>
          <li><a href="#/login">{$locale.common.signIn}</a></li>
        </ul>
      </nav>
      <nav class="footer-column" aria-labelledby="footer-support-title">
        <h2 id="footer-support-title">{copy.footer.support}</h2>
        <ul class="footer-links">
          <li><a href="mailto:support@zenoerp.com">{copy.footer.emailSupport}</a></li>
          <li><a href="https://wa.me/93704495743" target="_blank" rel="noopener noreferrer">{copy.footer.whatsappSupport}</a></li>
          <li><a href="https://t.me/zenoerp" target="_blank" rel="noopener noreferrer">{copy.footer.telegramSupport}</a></li>
        </ul>
      </nav>
      <div class="footer-column footer-contact">
        <h2>{$locale.home.footer.contact}</h2>
        <p>{$locale.home.footer.contactDescription}</p>
        <a href="https://ap.zenoerp.com" target="_blank" rel="noopener noreferrer"><span dir="ltr">ap.zenoerp.com</span></a>
        <a href="mailto:support@zenoerp.com"><span dir="ltr">support@zenoerp.com</span></a>
        <a href="https://wa.me/93704495743" target="_blank" rel="noopener noreferrer"><span dir="ltr">+93 70 449 5743</span></a>
      </div>
    </div>
    <div class="footer-bottom"><p>{$locale.home.footer.copyright}</p></div>
  </footer>
</div>

<style>
  .home-page { --home-ink:var(--text-strong); --home-muted:var(--text-muted); --home-blue:var(--accent); --home-blue-hover:var(--accent-hover); --home-blue-text:var(--accent-text); --home-line:var(--border); display:flow-root; color:var(--home-ink); background:#fff; min-height:100svh; font-family:var(--font-ui); -webkit-font-smoothing:antialiased; }
  .home-page :is(h1,h2,h3,p) { margin:0; }
  .home-page :is(h1,h2,h3) { text-wrap:balance; }
  .home-page :is(button,a) { font-family:inherit; -webkit-tap-highlight-color:transparent; }
  .home-page button { cursor:pointer; }
  .home-page a { color:inherit; text-decoration:none; }
  .home-page :is(button,a):focus-visible { outline:3px solid var(--home-blue); outline-offset:4px; }
  .home-header :is(button,a):focus-visible { outline-color:#fff; }
  .home-wrap { width:min(100%,1060px); padding-inline:32px; margin-inline:auto; }
  .hero-wrap { position:relative; width:100%; margin:0; }
  .hero { position:relative; height:490px; overflow:hidden; background:var(--brand-400); isolation:isolate; }
  .hero-photo,.hero-tint { position:absolute; inset:0; width:100%; height:100%; }
  .hero-photo { object-fit:cover; object-position:center 50%; z-index:-3; }
  .hero-tint { z-index:-2; background:linear-gradient(180deg,color-mix(in srgb,var(--accent-active) 83%,transparent) 0%,color-mix(in srgb,var(--accent) 55%,transparent) 28%,color-mix(in srgb,var(--accent) 12%,transparent) 65%,color-mix(in srgb,var(--navy-deep) 12%,transparent) 100%); }
  .home-header { position:relative; z-index:5; padding-inline:35px; }
  .home-nav { min-height:82px; display:flex; align-items:center; gap:30px; }
  .home-brand { display:inline-flex; align-items:center; gap:8px; font-size:18px; font-weight:700; letter-spacing:-.4px; flex-shrink:0; min-height:44px; color:#fff; }
  .home-brand > i { font-size:23px; }
  .home-header .home-brand { color:#fff; }
  .nav-links { display:flex; gap:20px; margin-inline-start:auto; }
  .nav-links button { border:0; background:transparent; color:#fff; min-height:44px; padding:0 4px; font-size:12px; font-weight:500; }
  .nav-links button:hover { text-decoration:underline; text-underline-offset:5px; }
  .nav-actions { display:flex; align-items:center; gap:15px; }
  .nav-actions :global(.language-switcher) { border:0; background:transparent; color:#fff; font-size:12px; min-height:44px; padding-inline-start:0; gap:5px; }
  .nav-actions :global(.language-switcher select) { color:#fff; font-size:12px; min-height:44px; background-image:none; padding-inline-end:0; }
  .nav-actions :global(.language-switcher option) { color:var(--home-ink); background:#fff; }
  .signin { min-height:44px; padding:0 22px; border:1px solid #ffffff80; border-radius:5px; color:#fff; background:#ffffff08; font-size:12px; }
  .signin:hover { background:#ffffff24; border-color:#fff; }
  .menu-toggle { display:none; background:#ffffff12; border:1px solid #ffffff80; color:#fff; width:44px; height:44px; border-radius:6px; font-size:22px; }
  .mobile-menu { position:absolute; inset:72px 20px auto; display:grid; gap:5px; padding:12px; border:1px solid #ffffff50; border-radius:12px; background:var(--accent-active); box-shadow:0 8px 25px #15204630; }
  .mobile-menu button { min-height:44px; border:0; border-radius:6px; color:#fff; background:#ffffff08; text-align:start; padding-inline:14px; }
  .mobile-menu button:hover { background:#ffffff20; }
  .hero-copy { max-width:650px; margin:15px auto 0; text-align:center; padding-inline:25px; color:#fff; }
  .hero-copy h1 { color:#fff; font-size:clamp(36px,3.5vw,49px); font-weight:700; line-height:1.22; letter-spacing:-1.1px; }
  .hero-copy h1 span { display:block; }
  .hero-description { max-width:430px; margin:14px auto 0 !important; font-size:13px; line-height:1.8; color:#fff; text-wrap:pretty; }
  .hero-curve { position:absolute; z-index:1; width:140%; height:80px; bottom:-58px; inset-inline-start:-20%; background:#fff; border-radius:50% 50% 0 0; }
  .quick-bar { position:relative; z-index:3; display:grid; grid-template-columns:repeat(3,minmax(0,1fr)) auto; align-items:center; gap:8px; width:min(calc(100% - 100px),920px); margin:-23px auto 0; padding:12px; border:1px solid #edf0f5; border-radius:9px; background:#fff; box-shadow:0 8px 28px #26335a12; }
  .quick-item { display:flex; align-items:center; gap:10px; min-height:52px; padding:8px 14px; border:0; border-radius:5px; background:#f8f9fc; color:var(--home-ink); text-align:start; }
  .quick-item:hover { background:var(--accent-soft); }
  .quick-icon { font-size:17px; color:var(--home-blue); }
  .quick-copy { display:flex; flex-direction:column; gap:3px; min-width:0; }
  .quick-copy strong { font-size:12px; font-weight:600; }
  .quick-copy > span { font-size:10px; color:var(--home-muted); }
  .quick-chevron { margin-inline-start:auto; color:var(--home-muted); font-size:10px; }
  .home-button { display:inline-flex; align-items:center; justify-content:center; gap:12px; border:1px solid transparent; border-radius:5px; padding:12px 21px; min-height:44px; font-size:12px; line-height:1.4; font-weight:600; transition:background .18s,border-color .18s; }
  .primary { background:var(--home-blue); color:var(--text-on-accent); }
  .primary:hover { background:var(--home-blue-hover); }
  .hero-cta { min-height:52px; padding-inline:25px; }
  .how-section { padding-block:39px 35px; scroll-margin-top:24px; }
  .section-heading { text-align:center; }
  .section-heading h2 { font-size:24px; font-weight:700; letter-spacing:-.5px; color:var(--home-ink); }
  .steps { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:60px; max-width:820px; margin:27px auto 0; padding:0; list-style:none; }
  .step { position:relative; text-align:center; scroll-margin-top:32px; }
  .step-connector { position:absolute; inset-inline-start:calc(50% + 35px); inset-block-start:24px; width:calc(100% - 10px); border-top:1px dashed var(--home-muted); }
  .step-connector::before { content:''; position:absolute; inset-inline-start:0; top:-3px; width:5px; height:5px; background:var(--home-muted); transform:rotate(45deg); }
  .step-connector::after { content:''; position:absolute; inset-inline-end:-1px; top:-4px; border-block:3px solid transparent; border-inline-start:5px solid var(--home-muted); }
  .step-icon { display:inline-grid; place-items:center; width:49px; height:49px; border:1px solid var(--accent-border); border-radius:50%; background:#fff; color:var(--home-blue-text); font-size:22px; }
  .step h3 { margin-top:11px; font-size:13px; font-weight:600; color:var(--home-ink); line-height:1.6; }
  .step p { max-width:210px; margin:5px auto 0; color:var(--home-muted); font-size:12px; line-height:1.8; }
  .home-footer { background:#fff; border-top:1px solid var(--home-line); }
  .footer-main { display:grid; grid-template-columns:1.5fr .75fr .95fr 1.1fr; align-items:start; gap:48px; width:min(100%,1240px); padding-block:28px 22px; }
  .footer-brand .home-brand { color:var(--home-blue-text); font-size:20px; min-height:32px; }
  .footer-brand .home-brand > i { font-size:25px; }
  .footer-brand > p { max-width:32ch; color:var(--home-muted); font-size:13px; line-height:1.85; margin-top:12px; }
  .footer-column { min-width:0; }
  .footer-column h2 { color:var(--home-ink); font-size:16px; font-weight:700; line-height:32px; margin-bottom:12px; letter-spacing:0; }
  .footer-links { margin:0; padding:0; list-style:none; }
  .footer-links :is(a,button),.footer-contact a { display:flex; align-items:center; min-height:32px; padding:4px 0; border:0; color:var(--home-muted); background:transparent; text-align:start; font-size:13px; line-height:1.6; }
  .footer-links :is(a,button):hover,.footer-contact a:hover { color:var(--home-blue-text); }
  .footer-contact > p { color:var(--home-muted); font-size:13px; line-height:1.85; margin-bottom:8px; }
  .footer-contact a { overflow-wrap:anywhere; }
  .footer-socials { display:flex; flex-wrap:wrap; gap:2px; margin-top:12px; }
  .footer-socials a { display:grid; place-items:center; height:44px; width:44px; color:var(--home-blue-text); border-radius:50%; font-size:16px; }
  .footer-socials a:hover { background:var(--accent-soft); }
  .footer-bottom { padding:12px 20px; color:var(--text-on-accent); background:var(--home-blue); text-align:center; font-size:11px; line-height:1.8; }
  :global([dir='rtl']) .home-page .arrow { transform:scaleX(-1); }
  :global([dir='rtl']) .hero-copy h1 { letter-spacing:0; line-height:1.45; font-size:clamp(35px,3.3vw,46px); }
  @media (max-width:1000px) {
    .home-header { padding-inline:25px; }
    .home-nav { gap:16px; }
    .nav-links { gap:12px; }
    .home-brand { font-size:16px; }
    .nav-actions { gap:12px; }
    .quick-bar { width:calc(100% - 70px); }
    .quick-item { padding-inline:9px; gap:7px; }
    .hero-cta { padding-inline:15px; }
    .footer-main { gap:28px; grid-template-columns:1.3fr .75fr .95fr 1.1fr; }
  }
  @media (max-width:800px) {
    .footer-main { grid-template-columns:repeat(2,minmax(0,1fr)); gap:28px 40px; }
    .nav-links,.signin { display:none; }
    .nav-actions { margin-inline-start:auto; }
    .menu-toggle { display:grid; place-items:center; }
    .hero { height:465px; }
    .hero-copy { margin-top:20px; }
    .quick-bar { width:calc(100% - 36px); }
    .quick-copy > span,.quick-chevron { display:none; }
    .quick-item { justify-content:center; }
    .quick-copy strong { font-size:11px; }
    .steps { gap:26px; }
    .step-connector { width:calc(100% - 44px); }
  }
  @media (max-width:580px) {
    .home-wrap { padding-inline:22px; }
    .hero { height:435px; }
    .hero-photo { object-position:center 58%; }
    .home-header { padding-inline:16px; }
    .home-nav { min-height:72px; gap:10px; }
    .home-brand { font-size:16px; gap:6px; }
    .home-brand > i { font-size:20px; }
    .nav-actions { gap:9px; }
    .nav-actions :global(.language-switcher) { font-size:11px; }
    .nav-actions :global(.language-switcher select) { font-size:11px; max-width:65px; }
    .hero-copy { margin-top:12px; padding-inline:16px; }
    .hero-copy h1 { font-size:33px; line-height:1.3; letter-spacing:-.7px; }
    :global([dir='rtl']) .hero-copy h1 { font-size:30px; }
    .hero-description { font-size:11px; max-width:290px; line-height:1.9; margin-top:10px !important; }
    .quick-bar { grid-template-columns:repeat(3,minmax(0,1fr)); gap:6px; width:calc(100% - 20px); padding:9px; margin-top:-22px; }
    .quick-item { padding:8px 4px; gap:6px; min-height:44px; }
    .quick-icon { font-size:14px; }
    .quick-copy strong { font-size:10px; }
    .hero-cta { grid-column:1 / -1; min-height:44px; }
    .how-section { padding-block:28px 20px; }
    .section-heading h2 { font-size:22px; }
    .steps { gap:12px; margin-top:21px; }
    .step-connector { inset-inline-start:calc(50% + 27px); width:calc(100% - 42px); inset-block-start:20px; }
    .step-icon { width:40px; height:40px; font-size:19px; }
    .step h3 { font-size:11px; line-height:1.7; }
    .step p { font-size:10px; line-height:1.8; }
    .footer-main { gap:22px 20px; padding-block:22px 18px; }
    .footer-brand,.footer-contact { grid-column:1 / -1; }
    .footer-brand > p { max-width:42ch; }
    .footer-column h2 { margin-bottom:7px; font-size:15px; }
    .footer-links :is(a,button),.footer-contact a { min-height:44px; }
  }
  @media (max-width:360px) {
    .home-header { padding-inline:12px; }
    .home-brand { font-size:14px; }
    .nav-actions :global(.language-switcher > i) { display:none; }
    .hero-copy h1 { font-size:30px; }
    :global([dir='rtl']) .hero-copy h1 { font-size:27px; }
    .steps { gap:9px; }
    .step h3 { font-size:10px; }
  }
  @media (prefers-reduced-motion:reduce) { .home-page :is(button,a) { transition:none; } }
</style>
