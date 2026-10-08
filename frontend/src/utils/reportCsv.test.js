import test from 'node:test';
import assert from 'node:assert/strict';
import { reportCsv } from './reportCsv.js';

test('CSV supports RTL text, quotes, multiline notes and protects spreadsheet formulas', () => {
  const csv = reportCsv(['Meter', 'Notes', 'Amount'], [['005', 'متن "خاص"\nline two', -12.5], ['006', ' =HYPERLINK("bad")', 10]]);
  assert.ok(csv.startsWith('\uFEFF'));
  assert.ok(csv.includes('"005"'));
  assert.ok(csv.includes('متن ""خاص""\nline two'));
  assert.ok(csv.includes('"-12.5"'));
  assert.ok(csv.includes('"\' =HYPERLINK(""bad"")"'));
});
