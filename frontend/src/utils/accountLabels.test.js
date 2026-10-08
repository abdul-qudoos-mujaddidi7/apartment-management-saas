import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { createServer } from 'vite';
import { accountNameLabel, accountTypeLabel } from './accountLabels.js';

const require = createRequire(import.meta.url);
const { DEFAULT_ACCOUNTS } = require('../../../backend/src/modules/financials/financial-account.service.js');

// Read the enum straight from the schema so a new account type cannot slip
// through untranslated.
const schema = readFileSync(fileURLToPath(new URL('../../../backend/prisma/schema.prisma', import.meta.url)), 'utf8');
const accountTypes = schema.match(/enum FinancialAccountType \{([^}]*)\}/)[1].trim().split(/\s+/);

test('every built-in account and type is translated in all three languages', async () => {
  const server = await createServer({
    root: fileURLToPath(new URL('../..', import.meta.url)),
    server: { middlewareMode: true },
    logLevel: 'silent',
  });
  try {
    for (const language of ['en', 'fa', 'ps']) {
      const { default: words } = await server.ssrLoadModule(`/src/i18n/${language}.js`);

      for (const [systemKey, name] of DEFAULT_ACCOUNTS) {
        const label = accountNameLabel({ systemKey, name }, words);
        assert.equal(label, words.accounts.names[systemKey], `${language}: ${systemKey} is not translated`);
        assert.ok(label.trim().length > 0, `${language}: empty label for ${systemKey}`);
      }

      for (const type of accountTypes) {
        assert.equal(accountTypeLabel(type, words), words.accounts.types[type], `${language}: ${type} is not translated`);
        assert.ok(words.accounts.types[type].trim().length > 0, `${language}: empty type label for ${type}`);
      }
    }
  } finally {
    await server.close();
  }
});

test('account labels fall back to the stored (English) values', () => {
  const locale = { accounts: { names: {}, types: {} } };
  assert.equal(accountNameLabel({ systemKey: 'CUSTOM_KEY', name: 'Petty Cash' }, locale), 'Petty Cash');
  assert.equal(accountNameLabel({ name: 'Individual Owner' }, locale), 'Individual Owner');
  assert.equal(accountTypeLabel('OTHER', locale), 'OTHER');
  assert.equal(accountNameLabel(null, locale), '');
  assert.equal(accountTypeLabel('', locale), '');
});
