import { mount } from 'svelte';
import Harness from './Harness.svelte';
import 'bootstrap/dist/css/bootstrap.min.css';
import 'bootstrap-icons/font/bootstrap-icons.css';
import '../../src/styles/tokens.css';
import '../../src/styles/design-system.css';
mount(Harness, { target: document.getElementById('app') });
