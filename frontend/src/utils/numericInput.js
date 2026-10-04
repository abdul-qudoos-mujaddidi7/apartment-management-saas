import { PERSIAN_DIGITS } from './shamsiDate.js';

export function normalizeNumericInput(value) {
  return String(value).replace(/[۰-۹]/g, d => String(PERSIAN_DIGITS.indexOf(d)))
    .replace(/[٠-٩]/g, d => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
    .replace(/٫/g, '.').replace(/^(-?)0+(?=\d)/, '$1');
}

// Capture runs before Svelte's bindings. Identifiers remain text inputs.
export function installNumericInputs(root = document) {
  const numeric = node => node instanceof HTMLInputElement && (node.type === 'number' || ['decimal', 'numeric'].includes(node.inputMode)) && !node.dataset.identifier;
  const input = event => {
    if (!numeric(event.target)) return;
    const node = event.target;
    const value = normalizeNumericInput(node.value);
    if (node.value !== value) node.value = value;
  };
  const focus = event => { if (numeric(event.target) && /^0+$/.test(event.target.value)) event.target.select(); };
  const paste = event => {
    if (!numeric(event.target)) return;
    const value = normalizeNumericInput(event.clipboardData.getData('text').trim());
    if (!/^-?\d*(\.\d*)?$/.test(value)) return;
    event.preventDefault();
    event.target.value = value;
    event.target.dispatchEvent(new Event('input', { bubbles: true }));
  };
  const before = event => {
    if (!numeric(event.target) || !event.data || !/[۰-۹٠-٩٫]/.test(event.data)) return;
    event.preventDefault();
    const node = event.target;
    const start = node.selectionStart ?? node.value.length;
    const end = node.selectionEnd ?? start;
    node.value = normalizeNumericInput(node.value.slice(0, start) + event.data + node.value.slice(end));
    node.dispatchEvent(new Event('input', { bubbles: true }));
  };
  root.addEventListener('input', input, true);
  root.addEventListener('focusin', focus, true);
  root.addEventListener('paste', paste, true);
  root.addEventListener('beforeinput', before, true);
  return () => {
    root.removeEventListener('input', input, true);
    root.removeEventListener('focusin', focus, true);
    root.removeEventListener('paste', paste, true);
    root.removeEventListener('beforeinput', before, true);
  };
}
