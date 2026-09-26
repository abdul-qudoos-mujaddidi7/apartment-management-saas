import { svelte } from '@sveltejs/vite-plugin-svelte'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [svelte()],
  server: {
    /* The printed contract has exactly one stylesheet, `contract-document.css`,
       and it is owned by the API's contract module — the side that renders the
       PDF and therefore cannot be the one missing it. This lets the dev server
       read that single file from one directory above the frontend root, so the
       preview and the downloaded PDF are never two different designs. */
    fs: { allow: ['..'] },
  },
})
