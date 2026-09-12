import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { expect, test as baseTest } from '@playwright/test'
import type { Page } from '@playwright/test'
import { Matrix4, Vector3 } from 'three'
import type { PagesArtifact } from '../../tools/pages.ts'

const base = '/midcreek-cs-3/'
const ready = 'Ready - source-only public Three.js demo.'
let files: PagesArtifact['files']

declare global {
  interface Window {
    pagesFrames: { frame(now: number): void; step(count: number): void; flush(): void }
  }
}

const test = baseTest.extend<{ requestAudit: void }>({
  requestAudit: [async ({ context, baseURL }, use, info) => {
    if (!baseURL) throw new Error('PAGES_TEST: built-artifact baseURL is required')
    const origin = new URL(baseURL).origin
    const requests: string[] = []
    const failures: string[] = []
    const errors: string[] = []
    context.on('request', (request) => requests.push(request.url()))
    context.on('requestfailed', (request) => failures.push(`${request.url()}: ${request.failure()?.errorText}`))
    context.on('response', (response) => {
      if (response.status() !== 200) failures.push(`${response.status()}: ${response.url()}`)
    })
    context.on('page', (page) => page.on('pageerror', (error) => errors.push(error.message)))
    await use()
    await info.attach('pages-request-ledger', {
      body: JSON.stringify({ requests, failures, errors }, null, 2), contentType: 'application/json',
    })
    const members = new Set(files.map((file) => file.path))
    for (const request of requests) {
      const url = new URL(request)
      expect(url.origin, request).toBe(origin)
      expect(url.pathname, request).toMatch(/^\/midcreek-cs-3\//)
      expect(url.search, request).toBe('')
      expect(url.pathname, request).not.toMatch(/assets\/library|gallery|\.glb|\.map$|\.artifacts|receipt|prompt|capture|\/logs?\//i)
      const path = url.pathname.slice(base.length)
      expect(members.has(path.endsWith('/') || path === '' ? `${path}index.html` : path), request).toBe(true)
    }
    expect(failures).toEqual([])
    expect(errors).toEqual([])
  }, { auto: true }],
})

test.beforeAll(async () => {
  const manifest: Pick<PagesArtifact, 'files'> = JSON.parse(
    await readFile('.artifacts/pages/current/pages-manifest.json', 'utf8'),
  )
  files = manifest.files
})

const inspect = (page: Page) => page.evaluate(() => window.midcreek.inspect())
const step = (page: Page, count: number) => page.evaluate((count) => window.pagesFrames.step(count), count)
const flush = (page: Page) => page.evaluate(() => window.pagesFrames.flush())

async function boot(page: Page) {
  await page.goto('./play/')
  await expect(page.locator('#load-status')).toHaveText(ready)
  await page.waitForFunction(() => Boolean(window.midcreek))
  await page.evaluate(() => window.pagesFrames.frame(0))
  await page.locator('canvas').focus()
}

async function clickCell(page: Page, x: number, z: number) {
  const camera = (await inspect(page)).camera!
  const projected = new Vector3(x, 0, z)
    .applyMatrix4(new Matrix4().fromArray(camera.matrixWorld).invert())
    .applyMatrix4(new Matrix4().fromArray(camera.projection))
  await page.locator('canvas').click({ position: {
    x: (projected.x + 1) * camera.width / 2,
    y: (1 - projected.y) * camera.height / 2,
  } })
  await flush(page)
}

async function arrive(page: Page) {
  const world = (await inspect(page)).world
  await step(page, world.player.path.length * 5 - world.clock.tick % 5)
  expect((await inspect(page)).world.player.path).toEqual([])
}

test('source-only Pages showcase completes the repair journey with native RAF', async ({ page }) => {
  await page.goto('./')
  await expect(page.locator('#build-status')).toHaveText('Source-only playable showcase ready.')
  await expect(page.getByText('Public Three.js demo built entirely from tracked source.')).toBeVisible()
  await expect(page.locator('#references, #studies, #gallery-toggle, #image-dialog')).toHaveCount(0)
  await expect(page.locator('body')).not.toContainText(/RELEASE_BLOCKED|provisional assets/i)
  const play = page.getByRole('link', { name: 'Play demo', exact: true })
  await expect(play).toHaveAttribute('href', `${base}play/`)
  await play.click()
  await expect(page).toHaveURL(new RegExp(`${base}play/$`))
  await expect(page.locator('#load-status')).toHaveText(ready)
  await expect(page.locator('canvas')).toBeVisible()
  await page.waitForFunction(() => Boolean(window.midcreek))
  const initial = await inspect(page)
  expect(initial.state).toBe('ready')
  expect(initial.instances).toHaveLength(37)
  expect(initial.firstFrame!.calls).toBeGreaterThan(0)
  expect(initial.firstFrame!.triangles).toBeGreaterThan(0)
  await page.getByRole('button', { name: 'Dispatch technician' }).click()
  await expect.poll(async () => (await inspect(page)).world.fault.status, { timeout: 15_000 }).toBe('resolved')
  await expect(page.locator('#shift-state')).toHaveText('Resolved')
  await expect(page.locator('#repair')).toHaveText('120 / 120')
  await expect(page.getByRole('progressbar', { name: 'Repair progress' })).toHaveJSProperty('value', 120)
  await expect(page.getByRole('button', { name: 'Dispatch technician' })).toBeDisabled()
  expect((await inspect(page)).instances.find((instance) => instance.assetId === 'coolant-leak')?.visible).toBe(false)
})

test.describe('built playable with controlled frame boundaries', () => {
  test.beforeEach(async ({ page }) => {
    // Match game.spec.ts: control only RAF; production input, simulation and WebGL remain real.
    await page.addInitScript(() => {
      let next = 0
      let clock = 0
      const frames = new Map<number, FrameRequestCallback>()
      window.requestAnimationFrame = (callback) => { frames.set(++next, callback); return next }
      window.cancelAnimationFrame = (id) => { frames.delete(id) }
      window.pagesFrames = {
        frame(now) {
          clock = now
          const pending = [...frames.values()]
          frames.clear()
          for (const callback of pending) callback(now)
        },
        step(count) { for (let i = 0; i < count; i++) this.frame(clock + 1000 / 30) },
        flush() { this.frame(clock) },
      }
    })
  })

  for (const [heading, right, up] of [
    [0, { x: 3, z: 7 }, { x: 2, z: 6 }],
    [1, { x: 2, z: 6 }, { x: 1, z: 7 }],
    [2, { x: 1, z: 7 }, { x: 2, z: 8 }],
    [3, { x: 2, z: 8 }, { x: 3, z: 7 }],
  ] as const) {
    test(`heading ${heading}: held arrows and WASD move in camera-relative directions`, async ({ page }) => {
      await boot(page)
      for (let i = 0; i < heading; i++) await page.keyboard.press('e')
      for (const [key, cell] of [['ArrowRight', right], ['w', up]] as const) {
        await page.keyboard.down(key)
        await step(page, 5)
        await page.keyboard.up(key)
        expect((await inspect(page)).world.player.cell).toEqual(cell)
        await step(page, 10)
        expect((await inspect(page)).world.player.cell).toEqual(cell)
        await page.getByRole('button', { name: 'Restart seed 417' }).click()
        await flush(page)
        await page.locator('canvas').focus()
      }
    })
  }

  test('floor picking moves the technician and the visible fault marker dispatches repair', async ({ page }) => {
    await boot(page)
    await clickCell(page, 3, 7)
    expect((await inspect(page)).world.player.path).toEqual([{ x: 3, z: 7 }])
    expect((await inspect(page)).route).toHaveLength(1)
    await arrive(page)
    expect((await inspect(page)).world.player.cell).toEqual({ x: 3, z: 7 })
    await page.locator('canvas').click({ position: (await inspect(page)).fault! })
    await flush(page)
    await expect(page.locator('#message')).toContainText('dispatched')
    await arrive(page)
    await step(page, 120)
    expect((await inspect(page)).world.fault).toMatchObject({ status: 'resolved', progress: 1 })
  })

  for (const input of ['pointer', 'keyboard'] as const) {
    test(`${input} movement cancels an in-progress repair and permits redispatch`, async ({ page }) => {
      await boot(page)
      await page.keyboard.press('f')
      await flush(page)
      await arrive(page)
      await step(page, 12)
      expect((await inspect(page)).world.fault).toMatchObject({ status: 'working', progress: 12 / 120 })
      if (input === 'pointer') await clickCell(page, 3, 7)
      else {
        await page.keyboard.down('ArrowLeft')
        await step(page, 1)
        await page.keyboard.up('ArrowLeft')
      }
      expect((await inspect(page)).world.fault).toMatchObject({ status: 'fault', progress: 0 })
      await expect(page.locator('#message')).toContainText('Repair cancelled')
      await expect(page.locator('#repair')).toHaveText('0 / 120')
      await step(page, 120)
      expect((await inspect(page)).world.fault).toMatchObject({ status: 'fault', progress: 0 })
      await page.getByRole('button', { name: 'Dispatch technician' }).click()
      await flush(page)
      await arrive(page)
      await step(page, 120)
      await expect(page.locator('#shift-state')).toHaveText('Resolved')
    })
  }

  test('pause freezes repair, guarded focus preserves native controls, and restart restores the seed', async ({ page }) => {
    await boot(page)
    const initial = await inspect(page)
    await page.keyboard.press('f')
    await flush(page)
    await arrive(page)
    await step(page, 12)
    await page.getByRole('button', { name: 'Pause', exact: true }).focus()
    await page.keyboard.press('Enter')
    await flush(page)
    const paused = await inspect(page)
    expect(paused.world.paused).toBe(true)
    await expect(page.locator('#shift-state')).toHaveText('Paused')
    await expect(page.locator('#dispatch')).toBeDisabled()
    await page.keyboard.press('ArrowRight')
    await step(page, 120)
    expect((await inspect(page)).world).toEqual(paused.world)
    expect((await inspect(page)).instances).toEqual(paused.instances)
    await page.locator('canvas').focus()
    await page.keyboard.press('e')
    await page.keyboard.press('+')
    expect((await inspect(page)).camera).toMatchObject({ heading: 1, zoom: 1.15 })
    await page.keyboard.press('Space')
    await flush(page)
    await step(page, 1)
    expect((await inspect(page)).world.fault.progress).toBe(13 / 120)
    await page.getByRole('button', { name: 'Restart seed 417' }).click()
    await flush(page)
    expect((await inspect(page)).world).toEqual(initial.world)
    expect((await inspect(page)).instances).toEqual(initial.instances)
    expect((await inspect(page)).camera).toMatchObject({ heading: 1, zoom: 1.15 })
    await expect(page.locator('#dispatch')).toBeEnabled()
    await expect(page.locator('#repair')).toHaveText('0 / 120')
  })

  test('orbit wraps, zoom clamps, and Home resets the view without moving the world', async ({ page }) => {
    await boot(page)
    const initial = await inspect(page)
    await page.keyboard.press('q')
    expect((await inspect(page)).camera!.heading).toBe(3)
    await page.keyboard.press('e')
    expect((await inspect(page)).camera!.heading).toBe(0)
    for (let i = 0; i < 12; i++) await page.keyboard.press('+')
    expect((await inspect(page)).camera!.zoom).toBe(2.25)
    for (let i = 0; i < 12; i++) await page.keyboard.press('-')
    expect((await inspect(page)).camera!.zoom).toBe(0.65)
    await page.keyboard.press('e')
    await page.keyboard.press('Home')
    await flush(page)
    expect((await inspect(page)).camera).toEqual(initial.camera)
    expect((await inspect(page)).world).toEqual(initial.world)
  })

  test('hidden-page time and held keys are discarded without a catch-up burst', async ({ page }) => {
    await boot(page)
    await page.keyboard.down('ArrowRight')
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' })
      document.dispatchEvent(new Event('visibilitychange'))
    })
    const hidden = await inspect(page)
    await expect(page.locator('#shift-state')).toHaveText('Hidden')
    await expect(page.locator('#dispatch')).toBeDisabled()
    await page.keyboard.press('f')
    await page.evaluate(() => window.pagesFrames.frame(100_000))
    expect((await inspect(page)).world).toEqual(hidden.world)
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' })
      document.dispatchEvent(new Event('visibilitychange'))
      window.pagesFrames.frame(200_000)
    })
    expect((await inspect(page)).world).toEqual(hidden.world)
    await step(page, 5)
    await page.keyboard.up('ArrowRight')
    expect((await inspect(page)).world.clock.tick).toBe(hidden.world.clock.tick + 5)
    expect((await inspect(page)).world.player.cell).toEqual(hidden.world.player.cell)
    await expect(page.locator('#dispatch')).toBeEnabled()
  })

  test('390px showcase and playable stay usable without horizontal overflow', async ({ page }, info) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('./')
    await expect(page.locator('#build-status')).toHaveText('Source-only playable showcase ready.')
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.getByRole('link', { name: 'Play demo', exact: true }).click()
    await expect(page.locator('#load-status')).toHaveText(ready)
    await page.waitForFunction(() => Boolean(window.midcreek))
    await page.evaluate(() => window.pagesFrames.frame(0))
    await expect.poll(async () => (await inspect(page)).camera!.width).toBe(358)
    await expect(page.locator('canvas')).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    for (const name of ['Dispatch technician', 'Pause', 'Restart seed 417']) {
      const button = page.getByRole('button', { name, exact: true })
      await expect(button).toBeVisible()
      const rect = await button.boundingBox()
      expect(rect!.x).toBeGreaterThanOrEqual(0)
      expect(rect!.x + rect!.width).toBeLessThanOrEqual(390)
    }
    await clickCell(page, 3, 7)
    await arrive(page)
    expect((await inspect(page)).world.player.cell).toEqual({ x: 3, z: 7 })
    await page.getByRole('button', { name: 'Dispatch technician' }).click()
    await flush(page)
    await arrive(page)
    await step(page, 120)
    await expect(page.locator('#shift-state')).toHaveText('Resolved')
    await page.getByRole('button', { name: 'Restart seed 417' }).click()
    await flush(page)
    await expect(page.locator('#dispatch')).toBeEnabled()
    await info.attach('pages-narrow-layout', { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' })
  })

  test('back link and browser back/forward restore a live playable owner', async ({ page }) => {
    await page.goto('./')
    await page.getByRole('link', { name: 'Play demo', exact: true }).click()
    await expect(page.locator('#load-status')).toHaveText(ready)
    await expect(page.getByRole('link', { name: 'Back to showcase' })).toHaveAttribute('href', base)
    await page.getByRole('link', { name: 'Back to showcase' }).click()
    await expect(page.locator('#build-status')).toHaveText('Source-only playable showcase ready.')
    await page.goBack()
    await expect(page.locator('#load-status')).toHaveText(ready)
    await page.waitForFunction(() => window.midcreek?.inspect().state === 'ready')
    await page.evaluate(() => window.pagesFrames.frame(0))
    await page.getByRole('button', { name: 'Dispatch technician' }).click()
    await flush(page)
    await arrive(page)
    await step(page, 120)
    await expect(page.locator('#shift-state')).toHaveText('Resolved')
    await page.goForward()
    await expect(page.locator('#build-status')).toHaveText('Source-only playable showcase ready.')
    await page.goBack()
    await expect(page.locator('#load-status')).toHaveText(ready)
    await page.waitForFunction(() => window.midcreek?.inspect().state === 'ready')
    await page.evaluate(() => window.pagesFrames.frame(0))
    expect((await inspect(page)).world).toMatchObject({
      clock: { tick: 0 }, player: { cell: { x: 2, z: 7 } }, fault: { status: 'fault', progress: 0 },
    })
    await step(page, 1)
    expect((await inspect(page)).world.clock.tick).toBe(1)
  })
})

test('strict server serves exact built bytes, directory indexes and HEAD responses', async ({ request }) => {
  for (const file of files) {
    const response = await request.get(`./${file.path}`)
    expect(response.status(), file.path).toBe(200)
    const body = await response.body()
    expect(body.length).toBe(file.bytes)
    expect(createHash('sha256').update(body).digest('hex')).toBe(file.sha256)
    expect(response.headers()['cache-control']).toBe('no-store')
    const type = file.path.endsWith('.html') ? 'text/html'
      : file.path.endsWith('.css') ? 'text/css'
        : file.path.endsWith('.json') ? 'application/json' : 'text/javascript'
    expect(response.headers()['content-type']).toContain(type)
  }
  for (const path of ['./', './play/']) {
    const index = files.find((file) => file.path === (path === './' ? 'index.html' : 'play/index.html'))!
    const response = await request.get(path)
    expect(response.status()).toBe(200)
    expect(createHash('sha256').update(await response.body()).digest('hex')).toBe(index.sha256)
    const head = await request.head(path)
    expect(head.status()).toBe(200)
    expect(head.headers()['content-length']).toBe(String(index.bytes))
    expect(await head.body()).toHaveLength(0)
  }
  const post = await request.post('./play/')
  expect(post.status()).toBe(405)
  expect(post.headers().allow).toBe('GET, HEAD')
})

test('unknown, private, unprefixed and encoded paths return plain 404, never an SPA fallback', async ({ request }) => {
  for (const path of [
    './missing.html', './play/unknown/', './play/missing.js', './play/missing.glb',
    './assets/library/development/selection.json', './assets/library/leak.glb', './gallery/index.json',
    './pages-manifest.json', './.artifacts/pages/current/pages-manifest.json',
    './src/play/main.ts', './package.json', './assets/missing.js.map',
    '/', '/play/', '/assets/root.js', '/midcreek-cs-3-extra/', '/midcreek-cs-3',
    './%69ndex.html', './play%2findex.html', './%2e%2e%2fpackage.json', './%252e%252e/package.json',
    './%5cindex.html', './%00', './%',
  ]) {
    const response = await request.get(path)
    expect(response.status(), path).toBe(404)
    expect(response.headers()['content-type'], path).toContain('text/plain')
    expect(await response.text(), path).toBe('Not found')
  }
})
