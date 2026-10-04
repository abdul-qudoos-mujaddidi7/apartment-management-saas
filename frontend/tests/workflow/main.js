import { mount } from 'svelte';
import Harness from './Harness.svelte';
import 'bootstrap/dist/css/bootstrap.min.css';
import '../../src/styles/tokens.css';
import '../../src/styles/design-system.css';
import { installNumericInputs } from '../../src/utils/numericInput.js';
installNumericInputs();
mount(Harness, { target: document.getElementById('app') });
