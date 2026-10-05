import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { createServer } from 'vite';
import { contractDocumentLabels } from './contractDocumentLabels.js';

const require = createRequire(import.meta.url);
const { contractPdfSchema } = require('../../../backend/src/modules/lease-contracts/lease-contract.validation.js');

test('contract download labels pass the API validation in every contract language', async () => {
  const server = await createServer({
    root: fileURLToPath(new URL('../..', import.meta.url)),
    server: { middlewareMode: true },
    logLevel: 'silent',
  });
  try {
    for (const language of ['en', 'fa', 'ps']) {
      const { default: words } = await server.ssrLoadModule(`/src/i18n/${language}.js`);
      // Match the JSON round trip used by the actual download request.
      const request = JSON.parse(JSON.stringify({
        language,
        disposition: 'attachment',
        labels: contractDocumentLabels(words),
      }));
      const result = contractPdfSchema.safeParse(request);
      assert.equal(result.success, true, `${language}: ${JSON.stringify(result.error?.issues)}`);
      assert.equal(result.data.labels.lessor, words.leaseContract.lessor);
      assert.equal(result.data.labels.utilities.WATER, words.tenantProfile.utilities.WATER);
    }
  } finally {
    await server.close();
  }
});
