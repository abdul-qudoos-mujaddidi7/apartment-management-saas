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

import App from './App.svelte';

const app = mount(App, {
  target: document.getElementById('app')
});

export default app;
