import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { chromium } from '@playwright/test'
import { digest, validatePngHeader } from '../references/contracts.ts'
import { THUMBNAIL_RECIPE, validateThumbnail } from './publication.ts'

const require = createRequire(import.meta.url)

// One buffer, one selected route and one Canvas decode at a time; no directory server.
export async function createThumbnailRenderer() {
  const playwrightVersion = require('@playwright/test/package.json').version
  if (playwrightVersion !== '1.62.1') throw new Error('THUMBNAIL_TOOL: pinned Playwright 1.62.1 required')
  const encoderSha256 = digest(await readFile(new URL('./thumbnails.mjs', import.meta.url)))
  let active
  let origin
  const server = createServer((request, response) => {
    const allowedHost = origin && request.headers.host === new URL(origin).host
    const body = request.url === '/source.png' ? active : request.url === '/' ? Buffer.from('CS3 build-only image decoder') : undefined
    if (!allowedHost || request.method !== 'GET' || !body) {
      response.writeHead(404, { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store' })
      response.end('Not selected')
      return
    }
    response.writeHead(200, {
      'Content-Type': request.url === '/' ? 'text/plain; charset=utf-8' : 'image/png',
      'Content-Length': body.length, 'Cache-Control': 'no-store',
      'Content-Security-Policy': "default-src 'none'; connect-src 'self'; img-src blob:",
    })
    response.end(body)
  })
  await new Promise((done, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', done) })
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('THUMBNAIL_SERVER: no loopback address')
  origin = `http://127.0.0.1:${address.port}`
  let browser
  const close = async () => {
    try { await browser?.close() } finally {
      active = undefined
      server.closeAllConnections()
      await new Promise((done, reject) => server.close((error) => error ? reject(error) : done()))
    }
  }
  try {
    browser = await chromium.launch({ channel: 'chrome', headless: true })
    const page = await browser.newPage({ serviceWorkers: 'block' })
    await page.goto(origin)
    return {
      async render(bytes, source) {
        if (active) throw new Error('THUMBNAIL_CONCURRENCY: only one source may be decoded')
        if (digest(bytes) !== source.sha256) throw new Error('SOURCE_HASH: selected source changed')
        validatePngHeader(bytes.subarray(0, 33), 'selected-source', source.width, source.height)
        active = Buffer.from(bytes)
        try {
          const result = await page.evaluate(async ({ width, height, recipe }) => {
            const response = await fetch('/source.png', { cache: 'no-store', redirect: 'error' })
            if (!response.ok) throw new Error(`THUMBNAIL_SOURCE_HTTP: ${response.status}`)
            const image = await createImageBitmap(await response.blob())
            const canvas = document.createElement('canvas')
            try {
              if (image.width !== width || image.height !== height) throw new Error('THUMBNAIL_SOURCE_DIMENSIONS')
              canvas.width = recipe.width; canvas.height = recipe.height
              const context = canvas.getContext('2d')
              if (!context) throw new Error('THUMBNAIL_CANVAS: 2D context unavailable')
              const scale = Math.min(canvas.width / image.width, canvas.height / image.height)
              const drawWidth = image.width * scale; const drawHeight = image.height * scale
              context.drawImage(image, (canvas.width - drawWidth) / 2, (canvas.height - drawHeight) / 2, drawWidth, drawHeight)
              const blob = await new Promise((done) => canvas.toBlob(done, recipe.mime, recipe.quality))
              if (!blob || blob.type !== recipe.mime) throw new Error('THUMBNAIL_ENCODER: WebP output unavailable')
              if (blob.size > recipe.maxBytes) throw new Error('THUMBNAIL_SIZE: recipe exceeds 60000 bytes')
              const decoded = await createImageBitmap(blob)
              try {
                if (decoded.width !== recipe.width || decoded.height !== recipe.height) throw new Error('THUMBNAIL_OUTPUT_DIMENSIONS')
              } finally { decoded.close() }
              return Array.from(new Uint8Array(await blob.arrayBuffer()))
            } finally {
              image.close()
              canvas.width = 0; canvas.height = 0
            }
          }, { width: source.width, height: source.height, recipe: THUMBNAIL_RECIPE })
          const output = Buffer.from(result)
          const outputSha256 = digest(output)
          const record = {
            sourceSha256: source.sha256, outputSha256, sourceWidth: source.width, sourceHeight: source.height,
            width: 384, height: 256, bytes: output.length, file: `gallery/thumbnails/${outputSha256}.webp`,
            recipe: THUMBNAIL_RECIPE, browserVersion: browser.version(), playwrightVersion, encoderSha256,
          }
          validateThumbnail(record, output, source.sha256)
          return { record, bytes: output }
        } finally { active = undefined }
      },
      close,
    }
  } catch (error) {
    await close()
    throw error
  }
}
