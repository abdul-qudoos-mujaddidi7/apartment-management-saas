import { mount } from 'svelte';

import 'bootstrap/dist/css/bootstrap.min.css';
import 'bootstrap-icons/font/bootstrap-icons.css';

/* Typefaces first, then the legacy global sheet, then the design system:
   tokens.css and design-system.css are the only layers allowed to style
   shared components, and both read from the tokens declared in tokens.css. */
import './styles/fonts.css';
import './app.css';
import './styles/tokens.css';
import './styles/design-system.css';

/* The public auth pages carry the landing page's identity rather than the
   console's, so they ship their own `au-`-prefixed layer. */
import './styles/auth.css';

import './i18n';

import { replace } from 'svelte-spa-router';

import App from './App.svelte';

/*
 * svelte-spa-router routes on the URL hash, so a deep link written as a path
 * (…/register, …/login) arrives with an empty hash and silently renders the home
 * route instead. Tidy the address bar into hash form, then tell the router which
 * route to show — its location store was read when the module loaded, which is
 * before this runs, so the replaceState above is not enough on its own.
 */
const base = import.meta.env.BASE_URL || '/';
const basePath = base.endsWith('/') ? base.slice(0, -1) : base;
const path = window.location.pathname.startsWith(base)
  ? window.location.pathname.slice(base.length)
  : window.location.pathname.replace(basePath, '');
const deepLink = !window.location.hash && path && path !== '/' ? `/${path}` : null;
if (deepLink) {
  window.history.replaceState(null, '', `${base}#${deepLink}${window.location.search}`);
}

const app = mount(App, {
  target: document.getElementById('app')
});

if (deepLink) replace(deepLink);

export default app;
