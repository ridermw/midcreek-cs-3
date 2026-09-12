import { createHash } from 'node:crypto'
import { constants } from 'node:fs'
import { open, readFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { dirname, extname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { isDeepStrictEqual } from 'node:util'
import { defineConfig } from '@playwright/test'
import { validatePages } from './tools/pages.ts'

const repository = dirname(fileURLToPath(import.meta.url))
const base = '/midcreek-cs-3/'
const port = 4175
const url = `http://127.0.0.1:${port}${base}`
const runRoot = process.env.CS3_JOB_ROOT ?? '.artifacts/browser-pages'
const types: Readonly<Record<string, string>> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
}

async function servePages() {
  // The publisher atomically swaps the dist/manifest pair.
  const current = join(repository, '.artifacts/pages/current')
  const artifact = await validatePages(join(current, 'dist'))
  const manifest: unknown = JSON.parse(await readFile(join(current, 'pages-manifest.json'), 'utf8'))
  if (!isDeepStrictEqual(manifest, { files: artifact.files })) {
    throw new Error('PAGES_PREVIEW_MANIFEST: published file identities do not match the artifact')
  }
  const files = new Map<string, { data: Buffer; type: string }>()
  for (const member of artifact.files) {
    const file = await open(join(artifact.root, member.path), constants.O_RDONLY | constants.O_NOFOLLOW)
    let data: Buffer
    try { data = await file.readFile() } finally { await file.close() }
    if (data.length !== member.bytes || createHash('sha256').update(data).digest('hex') !== member.sha256) {
      throw new Error(`PAGES_PREVIEW_CHANGED: ${member.path}`)
    }
    const type = types[extname(member.path)]
    if (!type) throw new Error(`PAGES_PREVIEW_TYPE: ${member.path}`)
    files.set(`${base}${member.path}`, { data, type })
  }

  // Serve an immutable allowlisted snapshot, never resolve a request against the filesystem.
  const server = createServer((request, response) => {
    const path = (request.url ?? '').split('?')[0]!
    const file = files.get(path.endsWith('/') ? `${path}index.html` : path)
    if (!file) {
      response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8', 'Content-Length': 9 })
      response.end(request.method === 'HEAD' ? undefined : 'Not found')
      return
    }
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      response.writeHead(405, { 'Content-Type': 'text/plain; charset=utf-8', Allow: 'GET, HEAD' })
      response.end('Method not allowed')
      return
    }
    response.writeHead(200, {
      'Content-Type': file.type, 'Content-Length': file.data.length,
      'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
    })
    response.end(request.method === 'HEAD' ? undefined : file.data)
  })
  await new Promise<void>((done, reject) => {
    server.once('error', reject)
    server.listen(port, '127.0.0.1', done)
  })
  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.once(signal, () => {
      server.closeAllConnections()
      server.close((error) => {
        if (error) { console.error('PAGES_PREVIEW_CLOSE', error); process.exitCode = 1 }
      })
    })
  }
  console.log(`PAGES_PREVIEW: ${url}`)
}

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: 'pages.spec.ts',
  timeout: 45_000,
  workers: 1,
  fullyParallel: false,
  outputDir: `${runRoot}/test-results`,
  reporter: [['list'], ['json', { outputFile: `${runRoot}/playwright-results.json` }]],
  use: {
    baseURL: url,
    channel: 'chrome',
    viewport: { width: 1280, height: 720 },
    deviceScaleFactor: 1,
    serviceWorkers: 'block',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npm run pages:build && node --experimental-strip-types playwright.pages.config.ts --serve',
    cwd: repository,
    url,
    reuseExistingServer: false,
    timeout: 120_000,
    gracefulShutdown: { signal: 'SIGTERM', timeout: 5_000 },
  },
})

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url) && process.argv[2] === '--serve') {
  servePages().catch((error: unknown) => {
    console.error('PAGES_PREVIEW_FAILED', error)
    process.exitCode = 1
  })
}
