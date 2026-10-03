import { svelte } from '@sveltejs/vite-plugin-svelte'
import { defineConfig } from 'vite'
import { readFileSync } from 'node:fs'

const { version: appVersion } = JSON.parse(
  readFileSync(new URL('../backend/package.json', import.meta.url), 'utf8'),
)

export default defineConfig({
  plugins: [svelte()],
  define: {
    __APP_VERSION__: JSON.stringify(appVersion),
  },
  server: {
    /* The printed contract has exactly one stylesheet, `contract-document.css`,
       and it is owned by the API's contract module — the side that renders the
       PDF and therefore cannot be the one missing it. This lets the dev server
       read that single file from one directory above the frontend root, so the
       preview and the downloaded PDF are never two different designs. */
    fs: { allow: ['..'] },
  },
})
