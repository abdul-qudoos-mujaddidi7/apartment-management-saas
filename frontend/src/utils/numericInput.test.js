import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeNumericInput } from './numericInput.js';
test('numeric input strips padding while preserving decimal precision and localized digits', () => {
  for (const [value, expected] of [['05','5'], ['005','5'], ['000','0'], ['0.5','0.5'], ['0.05','0.05'], ['000.05','0.05'], ['005.20','5.20'], ['۰۰۵','5'], ['٠٠٥٫٠٥','5.05'], ['',''], ['-005','-5']]) assert.equal(normalizeNumericInput(value), expected);
});
