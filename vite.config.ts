import { lstatSync, realpathSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import { pagesCopy } from './src/site/content.ts'

const pages = process.env.CS3_PAGES_DEMO === '1'
const repository = import.meta.dirname
if (pages && (process.env.CS3_PAGES_SNAPSHOT !== repository || !process.permission)) {
  throw new Error('PAGES_SNAPSHOT: use pages:build to isolate source inputs before Vite reads them')
}
const dependencies = pages ? realpathSync(resolve(repository, 'node_modules')) : ''
const pagesHtml: Record<string, string> = {
  omit: '',
  description: `<meta name="description" content="${pagesCopy.description}">`,
  hero: `<p class="lede">${pagesCopy.hero}</p>`,
  muted: `<p class="muted" id="hero-muted">${pagesCopy.muted}</p>`,
  status: `<p id="build-status" role="status">${pagesCopy.status}</p>`,
  timing: `<p>${pagesCopy.timing}</p>`,
  footer: `<footer>${pagesCopy.footer}</footer>`,
  noscript: `<noscript>${pagesCopy.noscript}</noscript>`,
}

export default defineConfig({
  base: '/midcreek-cs-3/',
  define: { 'import.meta.env.CS3_PAGES_DEMO': JSON.stringify(pages) },
  ...(pages ? { envDir: false, envPrefix: [] } : {}),
  publicDir: false,
  cacheDir: '.artifacts/cache/vite',
  plugins: pages ? [{
    name: 'source-only-pages',
    enforce: 'pre',
    async resolveId(id, importer) {
      if (!id.startsWith('.') && !id.startsWith('/')) return
      const resolved = await this.resolve(id, importer, { skipSelf: true })
      if (!resolved) throw new Error('PAGES_FORBIDDEN: input is absent from the source-only snapshot')
      return resolved
    },
    load(id) {
      const path = id.split('?')[0]!
      if (path.startsWith('\0') || path.startsWith(`${dependencies}/`)) return
      if (!path.startsWith(`${repository}/`) || !lstatSync(path).isFile()) {
        throw new Error('PAGES_FORBIDDEN: only regular snapshot source inputs are allowed')
      }
    },
    transformIndexHtml: {
      order: 'pre',
      handler(html) {
        return html.replace(/<!-- pages:(\w+) -->[\s\S]*?<!-- \/pages:\1 -->/g, (_, key: string) => {
          if (!Object.hasOwn(pagesHtml, key)) throw new Error(`PAGES_TEMPLATE: unknown ${key}`)
          return pagesHtml[key]!
        })
      },
    },
  }] : [],
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
