import { mount } from 'svelte';

import 'bootstrap/dist/css/bootstrap.min.css';
import 'bootstrap-icons/font/bootstrap-icons.css';

import './styles/fonts.css';
import './app.css';
import './styles/tokens.css';
import './styles/design-system.css';

import './i18n';

import Probe from './Probe.svelte';

try {
  localStorage.setItem('apartmentpro.language', 'en');
} catch { /* private mode */ }

mount(Probe, { target: document.getElementById('probe') });
