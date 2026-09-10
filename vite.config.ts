import { resolve } from 'node:path'
import { defineConfig } from 'vite'

export default defineConfig({
  base: '/midcreek-cs-3/',
  publicDir: false,
  cacheDir: '.artifacts/cache/vite',
  build: {
    sourcemap: false,
    manifest: true,
    rolldownOptions: {
      input: {
        showcase: resolve(import.meta.dirname, 'index.html'),
        play: resolve(import.meta.dirname, 'play/index.html'),
      },
    },
  },
})
