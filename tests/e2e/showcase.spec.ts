import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { createServer } from 'node:http'
import { expect, test as baseTest } from '@playwright/test'
import type { Page } from '@playwright/test'
import { freezeShowcaseStartup } from '../../src/site/accounting.ts'
import { createThumbnailRenderer } from '../../tools/site/thumbnails.mjs'
import { digest } from '../../tools/references/contracts.ts'

const base = '/midcreek-cs-3/'
let showcaseUrl: string
let server: ReturnType<typeof createServer>
const test = baseTest.extend({ baseURL: async ({}, use) => { await use(showcaseUrl) } })
test.beforeAll(async () => {
  const current = JSON.parse(await readFile('.artifacts/site/current.json', 'utf8'))
  const receipt = JSON.parse(await readFile(resolve(current.root, 'receipt.json'), 'utf8'))
  const manifest: Record<string, { file: string; css?: string[] }> = JSON.parse(await readFile('dist/.vite/manifest.json', 'utf8'))
  const allowed = new Set<string>([
    'index.html', 'play/index.html',
    ...Object.values(manifest).flatMap((entry) => [entry.file, ...(entry.css ?? [])]),
    ...receipt.members.map((member: { path: string }) => member.path),
  ])
  server = createServer((request, response) => {
    const url = new URL(request.url ?? '/', 'http://127.0.0.1')
    let path = url.pathname.slice(base.length)
    if (path === '' || path.endsWith('/')) path += 'index.html'
    if (!url.pathname.startsWith(base) || !allowed.has(path)) {
      response.writeHead(404, { 'Content-Type': 'text/plain', 'Content-Length': 9 }); response.end('Not found')
      return
    }
    void readFile(resolve('dist', path)).then((bytes) => {
      const type = path.endsWith('.html') ? 'text/html' : path.endsWith('.css') ? 'text/css'
        : path.endsWith('.js') ? 'text/javascript' : path.endsWith('.json') ? 'application/json'
          : path.endsWith('.webp') ? 'image/webp' : 'image/png'
      response.writeHead(200, { 'Content-Type': type, 'Content-Length': bytes.length, 'Cache-Control': 'no-store' })
      response.end(bytes)
    }).catch((error: unknown) => {
      console.error('SHOWCASE_TEST_SERVER', error)
      response.writeHead(500); response.end('Required built member unavailable')
    })
  })
  await new Promise<void>((done, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', done) })
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Expected test server loopback address')
  showcaseUrl = `http://127.0.0.1:${address.port}${base}`
})
test.afterAll(async () => {
  server?.closeAllConnections()
  if (server) await new Promise<void>((done, reject) => server.close((error) => error ? reject(error) : done()))
})
async function openGallery(page: Page) {
  await page.goto('./')
  await expect(page.locator('#build-status')).toHaveText('Showcase ready.')
  await page.getByRole('button', { name: 'Open reference gallery' }).click()
  await expect(page.locator('.gallery-card')).toHaveCount(6)
}

test('real approved built shell: no preload, exact results, cold startup cap and later-byte separation', async ({ page, context }, info) => {
  const requests: string[] = []
  page.on('request', (request) => requests.push(new URL(request.url()).pathname))
  const cdp = await context.newCDPSession(page)
  await cdp.send('Network.enable')
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: true })
  const network = new Map<string, { url: string; bytes: number; compression: string; wireBytes: number; finished: boolean }>()
  cdp.on('Network.requestWillBeSent', (e) => network.set(e.requestId, { url: e.request.url, bytes: 0, compression: 'identity', wireBytes: 0, finished: false }))
  cdp.on('Network.responseReceived', (e) => {
    const row = network.get(e.requestId)
    const compression = Object.entries(e.response.headers).find(([key]) => key.toLowerCase() === 'content-encoding')?.[1]
    const length = Object.entries(e.response.headers).find(([key]) => key.toLowerCase() === 'content-length')?.[1]
    if (row) { row.compression = compression ?? 'identity'; row.bytes = Number(length) }
  })
  cdp.on('Network.loadingFinished', (e) => {
    const row = network.get(e.requestId)
    if (row) { row.finished = true; row.wireBytes = e.encodedDataLength }
  })
  await page.goto('./')
  await expect(page.locator('#build-status')).toHaveText('Showcase ready.')
  for (const text of [
    'U5 technical passed', 'Appearance pending', 'U7 playable passed locally',
    'U8 deterministic instrumentation passed', 'Named-target timing unqualified',
    'Production/release blocked', 'Not measured yet',
  ]) await expect(page.getByText(text, { exact: true })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Play demo', exact: true })).toHaveAttribute('href', `${base}play/`)
  expect(requests.every((path) => path.startsWith(base))).toBe(true)
  expect(requests.join('\n')).not.toMatch(/gallery|\.png|\.webp|\.glb|library|\.map/)
  expect(await page.locator('link[rel=prefetch],link[rel=preload][as=image],img[src]').count()).toBe(0)
  const startup = await page.evaluate(() => window.showcase.startup)
  expect([...network.values()].map((r) => r.url).sort()).toEqual(startup.resources.map((r) => r.url).sort())
  for (const resource of startup.resources) {
    expect([...network.values()].find((r) => r.url === resource.url)?.bytes).toBe(resource.encodedBodySize)
  }
  for (const [id, row] of network) {
    expect(row.compression).toBe('identity')
    expect(row.wireBytes).toBeGreaterThan(row.bytes)
    const body = await cdp.send('Network.getResponseBody', { requestId: id })
    expect(Buffer.from(body.body, body.base64Encoded ? 'base64' : 'utf8').length).toBe(row.bytes)
  }
  const qualified = freezeShowcaseStartup({ ...startup, networkVerified: true, pending: [...network.values()].filter((r) => !r.finished).map((r) => r.url) })
  expect(qualified.status).toBe('passed')
  expect(qualified.transferBytes).toBeLessThanOrEqual(2_000_000)
  const startupNetwork = structuredClone([...network.values()])
  const file = JSON.parse(await readFile('.artifacts/site/current.json', 'utf8'))
  const receipt = JSON.parse(await readFile(resolve(file.root, 'receipt.json'), 'utf8'))
  expect(receipt.status).toBe('approved-for-staging')
  expect(receipt.thumbnails).toHaveLength(49)
  await page.getByRole('button', { name: 'Open reference gallery' }).click()
  await expect(page.locator('.gallery-card')).toHaveCount(6)
  await expect.poll(() => requests.filter((p) => p.endsWith('.webp')).length).toBe(6)
  await expect(page.locator('.gallery-card img')).toHaveCount(6)
  expect(requests.filter((p) => p.endsWith('gallery/index.json'))).toHaveLength(1)
  expect(requests.some((p) => p.endsWith('.png'))).toBe(false)
  expect(await page.evaluate(() => window.showcase.startup)).toEqual(startup)
  await expect.poll(() => page.evaluate(() => window.showcase.laterBytes())).toBeGreaterThan(0)
  await info.attach('startup.json', { body: JSON.stringify({
    ...qualified, serving: 'real dist shell; loopback HTTP, no compression (not Pages)', startupNetwork,
    laterNetwork: [...network.values()].filter((r) => r.url.includes('/gallery/')),
    cache: 'CDP disabled', serviceWorkers: 'blocked', productionReferences: 49,
  }), contentType: 'application/json' })
  await cdp.detach()
})

test('keyboard dialog, selection replacement, Escape cleanup and focus return', async ({ page }) => {
  await page.addInitScript(() => {
    const created: { url: string; type: string }[] = []; const revoked: string[] = []
    const create = URL.createObjectURL.bind(URL); const revoke = URL.revokeObjectURL.bind(URL)
    URL.createObjectURL = (blob) => {
      const url = create(blob)
      created.push({ url, type: blob instanceof Blob ? blob.type : 'media-source' })
      return url
    }
    URL.revokeObjectURL = (url) => { revoked.push(url); revoke(url) }
    Object.assign(window, { blobProof: { created, revoked } })
  })

  await openGallery(page)
  const opener = page.locator('.gallery-select').first()
  await opener.focus()
  await page.keyboard.press('Enter')
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  await expect(dialog.locator('img')).toBeVisible()
  await page.keyboard.press('ArrowRight')
  await expect(dialog.locator('img')).toBeVisible()
  await expect.poll(() => page.evaluate(() => {
    const proof = Reflect.get(window, 'blobProof') as { revoked: string[] }
    return proof.revoked.length
  })).toBeGreaterThan(0)
  await page.keyboard.press('Escape')
  await expect(dialog).not.toBeVisible()
  await expect(opener).toBeFocused()
  expect(await page.evaluate(() => {
    const proof = Reflect.get(window, 'blobProof') as { created: { url: string; type: string }[]; revoked: string[] }
    return proof.created.filter((entry) => entry.type === 'image/png').every((entry) => proof.revoked.includes(entry.url))
  })).toBe(true)
  await page.getByRole('button', { name: 'Next page' }).click()
  await expect(page.locator('.gallery-card')).toHaveCount(6)
  await expect(page.locator('.gallery-select').first()).toBeFocused()
  await page.getByRole('button', { name: 'Close reference gallery' }).click()
  await expect.poll(() => page.evaluate(() => {
    const proof = Reflect.get(window, 'blobProof') as { created: { url: string }[]; revoked: string[] }
    return proof.created.every((entry) => proof.revoked.includes(entry.url))
  })).toBe(true)
})

test('back-forward restoration returns the gallery to a consistent closed state', async ({ page }) => {
  await openGallery(page)
  await page.getByRole('link', { name: 'Play demo', exact: true }).click()
  await page.goBack()
  await expect(page.getByRole('button', { name: 'Open reference gallery' })).toHaveAttribute('aria-expanded', 'false')
  await expect(page.locator('#gallery-panel')).toBeHidden()
  await expect(page.locator('.gallery-card')).toHaveCount(0)
})

test('missing/failed/corrupt thumbnails and originals retain captions, credit and retry', async ({ page }) => {
  let thumbnails = true; let originals = true
  await page.route('**/gallery/thumbnails/**', (route) => thumbnails ? route.fulfill({ status: 404, body: 'Missing' }) : route.continue())
  await page.route('**/gallery/originals/**', (route) => originals ? route.fulfill({ status: 503, body: 'Unavailable' }) : route.continue())
  await openGallery(page)
  await expect(page.getByText('Thumbnail unavailable.').first()).toBeVisible()
  thumbnails = false
  await page.getByRole('button', { name: 'Retry thumbnail' }).first().click()
  await expect(page.locator('.gallery-card img').first()).toBeVisible()
  await page.locator('.gallery-select').first().click()
  await expect(page.getByRole('dialog').getByRole('status')).toContainText('Original unavailable.')
  await expect(page.locator('#dialog-credit')).toContainText('Cel Shift concept art')
  originals = false
  await page.getByRole('button', { name: 'Retry original' }).click()
  await expect(page.getByRole('dialog').locator('img')).toBeVisible()
  await page.getByRole('button', { name: 'Close image' }).click()
  await page.unroute('**/gallery/originals/**')
  await page.route('**/gallery/originals/**', (route) => route.fulfill({ contentType: 'image/png', body: 'not an image' }))
  await page.locator('.gallery-select').first().click()
  await expect(page.getByRole('dialog').getByRole('status')).toContainText('Original unavailable.')
})

test('replacement and close abort delayed original requests without stale content', async ({ page }) => {
  const pending: string[] = []; const aborted: string[] = []
  page.on('requestfailed', (r) => { if (r.url().includes('/originals/')) aborted.push(r.url()) })
  await page.route('**/gallery/originals/**', async (route) => {
    pending.push(route.request().url())
    await new Promise((done) => setTimeout(done, 1500))
    await route.continue().catch((error: unknown) => {
      if (!(error instanceof Error) || !/closed|handled|cancel/i.test(error.message)) throw error
    })
  })
  await openGallery(page)
  await page.locator('.gallery-select').first().click()
  await expect(page.getByRole('dialog').getByRole('status')).toContainText('Loading original')
  await page.getByRole('button', { name: 'Next image' }).click()
  await expect.poll(() => pending.length).toBe(2)
  await page.keyboard.press('Escape')
  await expect.poll(() => aborted.length).toBe(2)
  await expect(page.getByRole('dialog')).not.toBeVisible()
  await expect(page.locator('#original-image')).toHaveAttribute('src', /^$/)
})

test('small index failures retry; unknown/private metadata is rejected before any image fetch', async ({ page }) => {
  let failed = true
  await page.route('**/gallery/index.json', (route) => failed ? route.fulfill({ status: 500, body: 'Failed' }) : route.continue())
  await page.goto('./')
  await page.getByRole('button', { name: 'Open reference gallery' }).click()
  await expect(page.locator('#gallery-status')).toContainText('Gallery unavailable.')
  failed = false
  await page.getByRole('button', { name: 'Retry gallery' }).click()
  await expect(page.locator('.gallery-card')).toHaveCount(6)
  await page.getByRole('button', { name: 'Close reference gallery' }).click()
  await page.unroute('**/gallery/index.json')
  await page.route('**/gallery/index.json', async (route) => {
    const response = await route.fetch()
    const body = await response.json()
    body.items[0].privatePath = '/private/sentinel'
    await route.fulfill({ json: body })
  })

  const urls: string[] = []
  page.on('request', (r) => urls.push(r.url()))
  await page.getByRole('button', { name: 'Open reference gallery' }).click()
  await expect(page.locator('#gallery-status')).toContainText('Gallery unavailable.')
  expect(urls.some((url) => /\.(png|webp)$/.test(url))).toBe(false)
  await expect(page.getByText('/private/sentinel')).toHaveCount(0)
})

test('oversized gallery index is cancelled before allocation and requests no images', async ({ page }) => {
  await page.route('**/gallery/index.json', (route) => route.fulfill({
    contentType: 'application/json', body: `${' '.repeat(100_001)}{}`,
  }))
  const urls: string[] = []
  page.on('request', (request) => urls.push(request.url()))
  await page.goto('./')
  await page.getByRole('button', { name: 'Open reference gallery' }).click()
  await expect(page.locator('#gallery-status')).toContainText('Gallery unavailable.')
  expect(urls.some((url) => /\.(png|webp)$/.test(url))).toBe(false)
})

test('narrow stacking, reachable controls, explicit keyboard requirement and no touch claim', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await openGallery(page)
  await expect(page.getByText('Keyboard required for gameplay.', { exact: true })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  const cards = page.locator('.gallery-card')
  const first = await cards.nth(0).boundingBox(); const second = await cards.nth(1).boundingBox()
  expect(first && second && second.y >= first.y + first.height).toBe(true)
  await page.getByRole('button', { name: 'Next page' }).focus()
  await page.keyboard.press('Enter')
  await expect(page.locator('.gallery-select').first()).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('dialog')).toBeVisible()
  expect(await page.getByRole('dialog').evaluate((dialog) => dialog.scrollWidth <= dialog.clientWidth)).toBe(true)
})

test('play navigation requests no gallery index, originals or thumbnails', async ({ page }) => {
  await page.goto('./')
  const urls: string[] = []
  page.on('request', (r) => urls.push(r.url()))
  await page.getByRole('link', { name: 'Play demo', exact: true }).click()
  await expect(page).toHaveURL(/\/play\/$/)
  await expect(page.locator('#load-status')).toHaveText('Unable to start (RELEASE_BLOCKED). Reload to try again.')
  expect(urls.join('\n')).not.toMatch(/gallery|reference-manifest|\.webp|\.png/)
  expect(urls.some((url) => url.includes('/assets/library/'))).toBe(false)
})

test('awaiting approval is honest and fetches neither index nor images', async ({ page }) => {
  await page.route(`**${base}`, async (route) => {
    const response = await route.fetch()
    await route.fulfill({ response, body: (await response.text()).replace('data-publication="approved-for-staging"', 'data-publication="awaiting-approval"') })
  })
  const requests: string[] = []
  page.on('request', (r) => requests.push(r.url()))
  await page.goto('./')
  await page.getByRole('button', { name: 'Open reference gallery' }).click()
  await expect(page.getByText('Reference gallery awaiting publication approval', { exact: true })).toBeVisible()
  expect(requests.some((url) => url.includes('/gallery/'))).toBe(false)
})

for (const failure of ['network', 'corrupt', 'missing'] as const) {
  test(`${failure} thumbnail and original expose errors without hiding navigation or credit`, async ({ page }) => {
    await page.route('**/gallery/{originals,thumbnails}/**', (route) => failure === 'network'
      ? route.abort('failed')
      : route.fulfill({ status: failure === 'missing' ? 404 : 200, contentType: 'image/png', body: 'Invalid image' }))
    await openGallery(page)
    await expect(page.getByText('Thumbnail unavailable.').first()).toBeVisible()
    await page.locator('.gallery-select').first().click()
    await expect(page.getByRole('dialog').getByRole('status')).toContainText('Original unavailable.')
    await expect(page.getByRole('button', { name: 'Next image' })).toBeEnabled()
    await expect(page.locator('#dialog-credit')).toContainText('Approved for CS3 use and release staging only')
    await page.keyboard.press('Escape')
    await expect(page.locator('.gallery-select').first()).toBeFocused()
  })
}

test('source-map and unexpected initial responses invalidate the built-shell ledger', async ({ page }) => {
  await page.addInitScript(({ base }) => {
    void fetch(`${base}unexpected.json`).then((r) => r.text())
    void fetch(`${base}assets/showcase.js.map`).then((r) => r.text())
  }, { base })
  await page.route('**/unexpected.json', (route) => route.fulfill({ body: 'unexpected initial response' }))
  await page.route('**/assets/showcase.js.map', (route) => route.fulfill({ body: 'not an approved resource' }))
  await page.goto('./')
  await expect(page.locator('#build-status')).toHaveText('Showcase ready.')
  const startup = await page.evaluate(() => window.showcase.startup)
  expect(startup.status).toBe('unqualified')
  expect(startup.issues).toContain('Unexpected initial request')
})

test('an extra request still pending at shell readiness cannot be qualified away', async ({ page }) => {
  const pending = new Set<string>()
  page.on('request', (r) => pending.add(r.url()))
  page.on('requestfinished', (r) => pending.delete(r.url()))
  await page.route('**/delayed-initial.json', async (route) => {
    await new Promise((done) => setTimeout(done, 1000))
    await route.fulfill({ body: 'Delayed initial response' })
  })
  await page.addInitScript(({ base }) => { void fetch(`${base}delayed-initial.json`).then((r) => r.text()) }, { base })
  await page.goto('./')
  await expect(page.locator('#build-status')).toHaveText('Showcase ready.')
  expect([...pending].some((url) => url.endsWith('delayed-initial.json'))).toBe(true)
  const startup = await page.evaluate(() => window.showcase.startup)
  expect(freezeShowcaseStartup({ ...startup, networkVerified: true, pending: [...pending] }).status).toBe('unqualified')
  await page.waitForResponse('**/delayed-initial.json')
})

test('Clawpilot theme precedes other scripts and applies the required typography and colors', async ({ page }) => {
  for (const [theme, background, accent] of [['light', 'rgb(247, 244, 239)', '#b11f4b'], ['dark', 'rgb(61, 59, 58)', '#fd8ea1']] as const) {
    await page.goto(`./?clawpilotTheme=${theme}`)
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme)
    expect(await page.locator('script').first().textContent()).toContain('clawpilotTheme')
    const style = await page.evaluate(() => ({
      background: getComputedStyle(document.body).backgroundColor,
      font: getComputedStyle(document.body).fontFamily,
      accent: getComputedStyle(document.documentElement).getPropertyValue('--cp-accent').trim(),
    }))
    expect(style.background).toBe(background)
    expect(style.accent).toBe(accent)
    expect(style.font).toContain('"Segoe UI", Aptos')
  }
})

test('actual Canvas recipe preserves a non-3:2 input without crop/stretch and verifies production output dimensions', async ({ page }) => {
  await page.goto('./')
  // Synthetic shape exercises geometry only. It is never inserted into the public allowlist or written to disk.
  const square = Buffer.from(await page.evaluate(async () => {
    const canvas = document.createElement('canvas'); canvas.width = 100; canvas.height = 100
    const context = canvas.getContext('2d')!
    context.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--cp-accent')
    context.fillRect(0, 0, 100, 100)
    const blob = await new Promise<Blob>((done, reject) => canvas.toBlob((blob) => blob ? done(blob) : reject(new Error('PNG failed'))))
    return Array.from(new Uint8Array(await blob.arrayBuffer()))
  }))
  const renderer = await createThumbnailRenderer()
  try {
    const thumb = await renderer.render(square, { sha256: digest(square), width: 100, height: 100 })
    expect(thumb.bytes.length).toBeLessThanOrEqual(60_000)
    const pixels = await page.evaluate(async (bytes) => {
      const image = await createImageBitmap(new Blob([new Uint8Array(bytes)], { type: 'image/webp' }))
      const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height
      const context = canvas.getContext('2d')!; context.drawImage(image, 0, 0)
      const alpha = (x: number, y: number) => context.getImageData(x, y, 1, 1).data[3]
      const result = { width: image.width, height: image.height, left: alpha(0, 128), edge: alpha(63, 128), square: alpha(64, 128), right: alpha(383, 128), top: alpha(192, 0), bottom: alpha(192, 255) }
      image.close()
      return result
    }, [...thumb.bytes])
    expect(pixels).toEqual({ width: 384, height: 256, left: 0, edge: 0, square: 255, right: 0, top: 255, bottom: 255 })
    await expect(renderer.render(Buffer.from('bad'), { sha256: digest(square), width: 100, height: 100 })).rejects.toThrow(/SOURCE_HASH/)
  } finally { await renderer.close() }
  const current = JSON.parse(await readFile('.artifacts/site/current.json', 'utf8'))
  const receipt = JSON.parse(await readFile(resolve(current.root, 'receipt.json'), 'utf8'))
  for (const record of receipt.thumbnails) {
    const bytes = await readFile(resolve(current.root, record.file))
    const dimensions = await page.evaluate(async (bytes) => {
      const image = await createImageBitmap(new Blob([new Uint8Array(bytes)], { type: 'image/webp' }))
      const dimensions = [image.width, image.height]; image.close(); return dimensions
    }, [...bytes])
    expect(dimensions).toEqual([384, 256])
  }
})
