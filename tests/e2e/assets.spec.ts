import { createHash } from 'node:crypto'
import { createServer } from 'node:http'
import type { Server } from 'node:http'
import { resolve } from 'node:path'
import { build } from 'vite'
import { expect, test } from '@playwright/test'
import { createTestManifest } from '../fixtures/assets'
import { syntheticGlb } from '../fixtures/assets/glb'

let server: Server
let fixtureUrl: string
test.beforeAll(async ({ browser }) => {
  console.log(`U6 browser: ${browser.browserType().name()} ${browser.version()}`)
  const built = await build({
    configFile: false, root: resolve('tests/fixtures/assets'), base: '/midcreek-cs-3/',
    logLevel: 'error', publicDir: false,
    build: { write: false, sourcemap: false, target: 'esnext' },
  })
  const files = new Map<string, { data: Buffer; type: string }>()
  for (const result of Array.isArray(built) ? built : [built]) {
    if (!('output' in result)) throw new Error('Expected completed assets fixture build')
    for (const file of result.output) {
      files.set(`/midcreek-cs-3/${file.fileName}`, {
        data: Buffer.from(file.type === 'chunk' ? file.code : file.source),
        type: file.fileName.endsWith('.html') ? 'text/html' : 'application/javascript',
      })
    }
  }
  server = createServer((request, response) => {
    const url = new URL(request.url ?? '/', 'http://127.0.0.1')
    if (url.pathname.endsWith('/manifest.json')) {
      const manifest = createTestManifest()
      const assets = manifest.assets.map((entry) => {
        const variant = url.searchParams.get('fault')
        const sourceEntry = entry.id === 'technician-man' && variant === 'clip-pair'
          ? { ...entry, clips: entry.clips.slice(0, 1) }
          : entry
        const bytes = entry.id === 'rack-standard' && variant === 'corrupt'
          ? new TextEncoder().encode('not a GLB').buffer
          : syntheticGlb(sourceEntry, {
            image: entry.id === 'rack-standard' && (variant === 'image' || variant === 'image-corrupt') ? 'missing.png'
              : entry.id === 'rack-standard' && variant === 'foreign-dependency' ? 'https://foreign.example/texture.png'
                : entry.id === 'rack-standard' && variant === 'traversal-dependency' ? '../../../../private.png'
                  : entry.id === 'technician-man' && variant === 'partial' ? 'late.png' : 'embedded',
            invalidAnimationAccessor: entry.id === 'technician-man' && variant === 'partial',
            missingUv: variant === 'uv',
            parserFault: entry.id === 'technician-man' && variant === 'partial-geometry' ? 'invalid-accessor'
              : entry.id === 'technician-man' && variant === 'partial-material' ? 'unsupported-mode' : undefined,
          })
        const file = `assets/${variant ?? 'valid'}/${entry.id}.glb`
        files.set(`/midcreek-cs-3/${file}`, { data: Buffer.from(bytes), type: 'model/gltf-binary' })
        const sha256 = createHash('sha256').update(Buffer.from(bytes)).digest('hex')
        if (entry.id !== 'technician-man') return { ...entry, file, sha256 }
        return {
          ...sourceEntry, file,
          sha256: variant === 'hash' ? '0'.repeat(64) : sha256,
          rootName: variant === 'node' ? 'MissingRoot' : entry.rootName,
          requiredNodeNames: variant === 'node' ? ['MissingRoot', 'Body'] : entry.requiredNodeNames,
          clips: variant === 'clip' ? entry.clips.slice(1) : sourceEntry.clips,
          shape: variant === 'bounds' ? { ...entry.shape, restBounds: { ...entry.shape.restBounds, max: { ...entry.shape.restBounds.max, x: 0.4 } } }
            : variant === 'scale' ? { ...entry.shape, rootScale: { x: 0.01, y: 0.01, z: 0.01 } }
              : variant === 'id' ? { ...entry.shape, id: 'cooling-unit' } : entry.shape,
        }
      })
      response.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
      response.end(JSON.stringify({ ...manifest, assets }))
      return
    }
    const file = files.get(url.pathname === '/midcreek-cs-3/' ? '/midcreek-cs-3/index.html' : url.pathname)
    if (!file) { response.writeHead(404); response.end('Not found'); return }
    response.writeHead(200, { 'Content-Type': file.type, 'Cache-Control': 'no-store' })
    response.end(file.data)
  })
  await new Promise<void>((done, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', done) })
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Assets fixture has no TCP address')
  fixtureUrl = `http://127.0.0.1:${address.port}/midcreek-cs-3/`
})
test.afterAll(async () => {
  if (server) await new Promise<void>((done, reject) => server.close((error) => error ? reject(error) : done()))
})

test('real first render, time-zero pose, input gating and two-instance shared ownership', async ({ page }) => {
  await page.goto(`${fixtureUrl}?rafDelay=1`)
  await expect.poll(() => page.evaluate(() => window.assetFixture?.details().events.includes('interactive'))).toBe(true)
  await page.locator('#surface').focus()
  await page.keyboard.down('ArrowRight')
  await page.evaluate(() => window.assetFixture.tick(5))
  expect((await page.evaluate(() => window.assetFixture.details())).tick).toBe(0)
  await page.evaluate(() => window.assetFixture.release())
  await expect(page.locator('#status')).toHaveText('Ready')
  const ready = await page.evaluate(() => window.assetFixture.details())
  expect(ready.ids).toHaveLength(38)
  expect(new Set(ready.ids).size).toBe(38)
  expect(ready.receipt!.firstFrame.calls).toBeGreaterThan(0)
  expect(ready.receipt!.firstFrame.triangles).toBeGreaterThan(0)
  expect(ready.finishes).toBe(1)
  expect(ready.events).toEqual(['loading', 'attach-enter', 'attached', 'render', 'gpu', 'interactive', 'raf', 'ready'])
  expect(ready.poses[1]!.y).toBeCloseTo(0.905)
  expect(ready.poses[0]!.position).toEqual([2, 0, 7])
  expect(await page.evaluate(() => window.assetFixture.pixels())).toBeGreaterThan(1000)
  expect(await page.evaluate(() => window.assetFixture.removeFirst())).toMatchObject({ calls: 37, triangles: 444 })
  await page.evaluate(() => window.assetFixture.tick(5))
  const surviving = await page.evaluate(() => window.assetFixture.details())
  expect(surviving.poses[0]!.time).toBeCloseTo(5 / 30)
  expect(surviving.poses[0]!.y).not.toBe(ready.poses[1]!.y)
  expect(surviving.disposal).toEqual({ geometry: 0, material: 0, texture: 0, bitmap: 0 })
  expect(await page.evaluate(() => window.assetFixture.pixels())).toBeGreaterThan(1000)
  await page.evaluate(() => { window.assetFixture.dispose(); window.assetFixture.dispose() })
  const disposed = await page.evaluate(() => window.assetFixture.details())
  // The loader keeps a base material and a configured mesh material per GLB.
  expect(disposed.disposal).toEqual({ geometry: 5, material: 10, texture: 5, bitmap: 5 })
  expect(disposed.duplicateDisposals).toBe(0)
})

for (const [fault, code] of [
  ['404', 'HTTP'], ['corrupt', 'GLTF_PARSE'], ['image', 'IMAGE_DEPENDENCY'],
  ['image-corrupt', 'IMAGE_DEPENDENCY'], ['hash', 'HASH'], ['node', 'SCENE_ROOT'],
  ['foreign-dependency', 'DEPENDENCY_PATH'], ['traversal-dependency', 'DEPENDENCY_PATH'],
  ['clip', 'CLIP_SET'], ['clip-pair', 'CLIP_SET'], ['bounds', 'BOUNDS'], ['scale', 'UNIT_SCALE'], ['id', 'SHAPE_IDENTITY'],
  ['uv', 'TEXTURE_UV'],
  ['empty', 'FIRST_FRAME_EMPTY'], ['attachThrow', 'APPLICATION_LOAD'], ['renderThrow', 'APPLICATION_LOAD'],
] as const) {
  test(`${fault} failure exposes one Reload and leaves production input disabled`, async ({ page }) => {
    if (fault === '404') await page.route('**/rack-standard.glb', (route) => route.fulfill({ status: 404 }))
    if (fault === 'image-corrupt') await page.route('**/missing.png', (route) => route.fulfill({ contentType: 'image/png', body: 'not an image' }))
    const query = fault === 'empty' || fault.endsWith('Throw') ? `${fault}=1` : `fault=${fault}`
    await page.goto(`${fixtureUrl}?${query}`)
    await expect(page.locator('#status')).toHaveText(code)
    await expect(page.locator('#reload')).toBeVisible()
    await expect(page.locator('#dispatch')).toBeDisabled()
    await page.locator('#surface').focus()
    await page.keyboard.press('ArrowRight')
    await page.evaluate(() => window.assetFixture.tick(10))
    await page.locator('#reload').click()
    const details = await page.evaluate(() => window.assetFixture.details())
    expect(details.failures).toBe(1)
    expect(details.reloads).toBe(1)
    expect(details.tick).toBe(0)
    expect(details.ids).toEqual([])
  })
}

test('a delayed successful asset cannot render or advance gameplay before decode completes', async ({ page }) => {
  let release!: () => void
  const gate = new Promise<void>((done) => { release = done })
  await page.route('**/rack-standard.glb', async (route) => { await gate; await route.continue() })
  await page.goto(fixtureUrl)
  await expect.poll(() => page.evaluate(() => window.assetFixture?.state())).toBe('loading')
  await expect(page.locator('#dispatch')).toBeDisabled()
  await page.locator('#surface').focus()
  await page.keyboard.press('ArrowRight')
  await page.evaluate(() => window.assetFixture.tick(10))
  const loading = await page.evaluate(() => window.assetFixture.details())
  expect(loading.tick).toBe(0)
  expect(loading.events).toEqual(['loading'])
  release()
  await expect(page.locator('#status')).toHaveText('Ready')
  expect(await page.evaluate(() => window.assetFixture.pixels())).toBeGreaterThan(1000)
})

test('context loss during a pending request cleans late decoding and cannot enable input', async ({ page }) => {
  let release!: () => void
  const gate = new Promise<void>((done) => { release = done })
  await page.route('**/rack-standard.glb', async (route) => { await gate; await route.continue() })
  await page.goto(fixtureUrl)
  await expect.poll(() => page.evaluate(() => window.assetFixture?.state())).toBe('loading')
  await page.evaluate(() => window.assetFixture.loseContext())
  await expect(page.locator('#status')).toHaveText('CONTEXT_LOST')
  release()
  await expect(page.locator('#dispatch')).toBeDisabled()
  await expect(page.locator('#reload')).toBeVisible()
  expect((await page.evaluate(() => window.assetFixture.details())).ids).toEqual([])
})

test('RAF timeout removes installed input wiring before any gameplay tick', async ({ page }) => {
  await page.goto(`${fixtureUrl}?rafDelay=1&deadline=500`)
  await expect.poll(() => page.evaluate(() => window.assetFixture?.details().events.includes('interactive'))).toBe(true)
  await expect(page.locator('#status')).toHaveText('LOAD_TIMEOUT')
  await expect(page.locator('#dispatch')).toBeDisabled()
  await page.locator('#surface').focus()
  await page.keyboard.press('ArrowRight')
  await page.evaluate(() => { window.assetFixture.release(); window.assetFixture.tick(10) })
  expect((await page.evaluate(() => window.assetFixture.details())).tick).toBe(0)
  expect((await page.evaluate(() => window.assetFixture.details())).failures).toBe(1)
})

test('a new application stays rendered and interactive after the superseded attachment completes', async ({ page }) => {
  await page.goto(`${fixtureUrl}?attachDelay=1`)
  await expect.poll(() => page.evaluate(() => window.assetFixture?.details().events.includes('attach-enter'))).toBe(true)
  await page.evaluate(() => window.assetFixture.startReplacement())
  await expect(page.locator('#status')).toHaveText('Ready')
  await page.evaluate(() => window.assetFixture.release())
  await expect.poll(() => page.evaluate(() => window.assetFixture.details().events.includes('stale-attach'))).toBe(true)
  const details = await page.evaluate(() => window.assetFixture.details())
  expect(details.state).toBe('disposed')
  expect(details.replacement.state).toBe('ready')
  expect(details.replacement.ids).toHaveLength(37)
  expect(details.replacement.interactive).toBe(true)
  expect(details.disposal.bitmap).toBe(5)
  expect(await page.evaluate(() => window.assetFixture.pixels())).toBeGreaterThan(1000)
  await page.evaluate(() => window.assetFixture.dispose())
  expect((await page.evaluate(() => window.assetFixture.details())).disposal.bitmap).toBe(10)
})

test('delayed network completion stays disabled and times out without late attachment', async ({ page }) => {
  let release!: () => void
  const gate = new Promise<void>((done) => { release = done })
  await page.route('**/rack-standard.glb', async (route) => { await gate; await route.continue() })
  await page.goto(`${fixtureUrl}?deadline=500`)
  await expect(page.locator('#status')).toHaveText('Loading')
  await expect(page.locator('#dispatch')).toBeDisabled()
  await expect(page.locator('#status')).toHaveText('LOAD_TIMEOUT')
  release()
  await page.evaluate(() => window.assetFixture.tick(10))
  expect((await page.evaluate(() => window.assetFixture.details())).ids).toEqual([])
})

test('parse rejection releases partial geometry and a required image that decodes later', async ({ page }) => {
  let release!: () => void
  const gate = new Promise<void>((done) => { release = done })
  await page.route('**/technician-man.glb', async (route) => {
    await expect.poll(() => page.evaluate(() => window.assetFixture?.details().decodedImages)).toBe(4)
    await route.continue()
  })
  await page.route('**/late.png', async (route) => {
    await gate
    await route.fulfill({
      contentType: 'image/png',
      body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR4nGP4DwQACfsD/fteaysAAAAASUVORK5CYII=', 'base64'),
    })
  })
  await page.goto(`${fixtureUrl}?fault=partial`)
  await expect.poll(() => page.evaluate(() => window.assetFixture?.state())).toBe('failed')
  release()
  await expect.poll(() => page.evaluate(() => window.assetFixture.details().disposal.bitmap)).toBe(5)
  const failed = await page.evaluate(() => window.assetFixture.details())
  expect(failed.code).toBe('GLTF_PARSE')
  expect(failed.disposal.geometry).toBe(5)
  expect(failed.duplicateDisposals).toBe(0)
  expect(failed.ids).toEqual([])
})

for (const fault of ['partial-geometry', 'partial-material'] as const) {
  test(`${fault} parser rejection releases every completed parser allocation`, async ({ page }) => {
    await page.route('**/technician-man.glb', async (route) => {
      await expect.poll(() => page.evaluate(() => window.assetFixture?.details().decodedImages)).toBe(4)
      await route.continue()
    })
    await page.goto(`${fixtureUrl}?fault=${fault}`)
    await expect.poll(() => page.evaluate(() => window.assetFixture?.state())).toBe('failed')
    await expect.poll(() => page.evaluate(() => window.assetFixture.details().disposal.geometry))
      .toBe(fault === 'partial-geometry' ? 5 : 6)
    const failed = await page.evaluate(() => window.assetFixture.details())
    expect(failed.code).toBe('GLTF_PARSE')
    expect(failed.disposal.material).toBe(fault === 'partial-geometry' ? 9 : 10)
    expect(failed.disposal.texture).toBe(5)
    expect(failed.disposal.bitmap).toBe(5)
    expect(failed.duplicateDisposals).toBe(0)
  })
}

// attach waits -> generation invalidated -> wait resolves -> release only, never publish ready.
for (const ending of ['timeout', 'dispose', 'context'] as const) {
  test(`late attachment after ${ending} cannot revive a generation`, async ({ page }) => {
    await page.goto(`${fixtureUrl}?attachDelay=1${ending === 'timeout' ? '&deadline=500' : ''}`)
    await expect.poll(() => page.evaluate(() => window.assetFixture?.details().events.includes('attach-enter'))).toBe(true)
    if (ending === 'dispose') await page.evaluate(() => window.assetFixture.dispose())
    else if (ending === 'context') await page.evaluate(() => window.assetFixture.loseContext())
    await expect.poll(() => page.evaluate(() => window.assetFixture.state())).toBe(ending === 'dispose' ? 'disposed' : 'failed')
    await page.evaluate(() => window.assetFixture.release())
    await expect.poll(() => page.evaluate(() => window.assetFixture.details().events.includes('stale-attach'))).toBe(true)
    expect((await page.evaluate(() => window.assetFixture.details())).ids).toEqual([])
    expect((await page.evaluate(() => window.assetFixture.details())).disposal.bitmap).toBe(5)
  })
}

test('context loss while ready disables input and context restoration never revives the session', async ({ page }) => {
  await page.goto(fixtureUrl)
  await expect(page.locator('#status')).toHaveText('Ready')
  await page.evaluate(() => window.assetFixture.loseContext())
  await expect(page.locator('#status')).toHaveText('CONTEXT_LOST')
  await expect(page.locator('#dispatch')).toBeDisabled()
  await page.evaluate(() => window.assetFixture.restoreContext())
  await page.evaluate(() => window.assetFixture.tick(5))
  expect((await page.evaluate(() => window.assetFixture.details())).tick).toBe(0)
  expect((await page.evaluate(() => window.assetFixture.details())).state).toBe('failed')
})
