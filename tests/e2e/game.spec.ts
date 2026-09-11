import { readFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import type { Server } from 'node:http'
import { resolve } from 'node:path'
import { build } from 'vite'
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { Matrix4, Vector3 } from 'three'
import type { GameHandle } from '../../src/app/game'

declare global {
  interface Window {
    midcreek: GameHandle
    gameFrames: { frame(now: number): void; step(count: number): void; flush(): void }
  }
}

let server: Server
let gameUrl: string
test.beforeAll(async () => {
  const built = await build({
    configFile: resolve('vite.config.ts'), logLevel: 'error', build: { write: false },
  })
  const files = new Map<string, { data: Buffer; type: string }>()
  for (const result of Array.isArray(built) ? built : [built]) {
    if (!('output' in result)) throw new Error('Expected completed production build')
    for (const file of result.output) {
      files.set(`/midcreek-cs-3/${file.fileName}`, {
        data: Buffer.from(file.type === 'chunk' ? file.code : file.source),
        type: file.fileName.endsWith('.html') ? 'text/html'
          : file.fileName.endsWith('.css') ? 'text/css' : 'application/javascript',
      })
    }
    files.set('/midcreek-cs-3/away.html', {
      data: Buffer.from('<!doctype html><title>Away</title><p>away</p>'),
      type: 'text/html',
    })
  }
  // Serve only the already selected local package; never copy it into dist/public.
  const pointerBytes = await readFile('assets/library/development/selection.json')
  const pointer = JSON.parse(pointerBytes.toString())
  const manifestBytes = await readFile(`assets/library/${pointer.manifest}`)
  const manifest = JSON.parse(manifestBytes.toString())
  files.set('/midcreek-cs-3/assets/library/development/selection.json', { data: pointerBytes, type: 'application/json' })
  files.set(`/midcreek-cs-3/assets/library/${pointer.manifest}`, { data: manifestBytes, type: 'application/json' })
  for (const entry of manifest.assets) {
    if (!/^packages\/[a-f0-9]{64}\/[a-z-]+\.glb$/.test(entry.file)) throw new Error('Invalid selected package member')
    files.set(`/midcreek-cs-3/assets/library/${entry.file}`, {
      data: await readFile(`assets/library/${entry.file}`), type: 'model/gltf-binary',
    })
  }
  server = createServer((request, response) => {
    let path = new URL(request.url ?? '/', 'http://127.0.0.1').pathname
    if (path.endsWith('/')) path += 'index.html'
    const file = files.get(path)
    response.writeHead(file ? 200 : 404, { 'Content-Type': file?.type ?? 'text/plain', 'Cache-Control': 'no-store' })
    response.end(file?.data ?? 'Not found')
  })
  await new Promise<void>((done, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', done) })
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Game server has no TCP address')
  gameUrl = `http://127.0.0.1:${address.port}/midcreek-cs-3/play/`
})
test.afterAll(async () => {
  if (server) await new Promise<void>((done, reject) => server.close((error) => error ? reject(error) : done()))
})

const pageErrors = new Map<Page, string[]>()
test.beforeEach(async ({ page }, testInfo) => {
  const errors: string[] = []
  pageErrors.set(page, errors)
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'warning' && message.text().includes('BufferGeometry')) errors.push(message.text())
  })
  if (testInfo.title === 'native RAF production journey requires no test scheduler') return
  // Only the browser frame boundary is controlled; all commands, ticks, assets
  // and WebGL rendering go through the built production entry.
  await page.addInitScript(() => {
    let next = 0
    let clock = 0
    const frames = new Map<number, FrameRequestCallback>()
    window.requestAnimationFrame = (callback) => { frames.set(++next, callback); return next }
    window.cancelAnimationFrame = (id) => { frames.delete(id) }
    window.gameFrames = {
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
test.afterEach(async ({ page }) => {
  expect(pageErrors.get(page)).toEqual([])
  pageErrors.delete(page)
})

async function boot(page: Page) {
  await page.goto(gameUrl)
  await expect.poll(async () => {
    await page.evaluate(() => window.gameFrames.frame(0))
    return page.locator('#load-status').textContent()
  }, { timeout: 20_000 }).toBe('Ready - local provisional assets; appearance pending.')
  await page.waitForFunction(() => Boolean(window.midcreek))
  await page.evaluate(() => window.gameFrames.frame(0))
}

const inspect = (page: Page) => page.evaluate(() => window.midcreek.inspect())
const step = (page: Page, count: number) => page.evaluate((count) => window.gameFrames.step(count), count)
const flush = (page: Page) => page.evaluate(() => window.gameFrames.flush())
async function clickCell(page: Page, x: number, z: number) {
  const camera = (await inspect(page)).camera!
  const projected = new Vector3(x, 0, z)
    .applyMatrix4(new Matrix4().fromArray(camera.matrixWorld).invert())
    .applyMatrix4(new Matrix4().fromArray(camera.projection))
  await page.locator('canvas').click({ position: {
    x: (projected.x + 1) * camera.width / 2, y: (1 - projected.y) * camera.height / 2,
  } })
  await flush(page)
}
async function dispatch(page: Page) {
  await page.locator('#dispatch').click()
  await flush(page)
}
async function arrive(page: Page) {
  const world = (await inspect(page)).world
  const remaining = world.player.path.length * 5 - world.clock.tick % 5
  await step(page, remaining)
  expect((await inspect(page)).world.player.path).toEqual([])
}

test('production entry loads the selected hall and renders the exact time-zero pose', async ({ page }) => {
  await boot(page)
  const inspection = await page.evaluate(() => window.midcreek.inspect())
  expect(inspection.state).toBe('ready')
  expect(inspection.world.clock.tick).toBe(0)
  expect(inspection.instances).toHaveLength(37)
  expect(inspection.instances.find((instance) => instance.id === 'actor/technician'))
    .toMatchObject({ position: [2, 0, 7], yaw: 0, clip: 'Idle', time: 0 })
  expect(inspection.firstFrame!.calls).toBeGreaterThan(0)
  expect(inspection.firstFrame!.triangles).toBeGreaterThan(0)
  expect(inspection.camera).toMatchObject({
    profile: 'cs3-standard-v1', lighting: 'cs3-lighting-v1', nativeDepth: true,
    shadows: true, shadowSize: [1024, 1024],
    background: '#e7edf1', shadowBias: -0.0001, shadowNormalBias: 0.01,
  })

  await expect(page.getByRole('button', { name: 'Dispatch technician' })).toBeEnabled()
  await expect(page.locator('canvas')).toBeVisible()
  const capture = await page.locator('canvas').screenshot()
  const pixels = await page.evaluate(async (image) => {
    const bitmap = await createImageBitmap(await (await fetch(`data:image/png;base64,${image}`)).blob())
    const canvas = document.createElement('canvas')
    canvas.width = bitmap.width; canvas.height = bitmap.height
    const context = canvas.getContext('2d')!
    context.drawImage(bitmap, 0, 0)
    const data = context.getImageData(0, 0, canvas.width, canvas.height).data
    bitmap.close()
    let hallPixels = 0
    for (let i = 0; i < data.length; i += 4) {
      if (Math.abs(data[i] - 231) + Math.abs(data[i + 1] - 237) + Math.abs(data[i + 2] - 241) > 35) hallPixels++
    }
    const background = (20 * canvas.width + 20) * 4
    return { background: [...data.slice(background, background + 4)], hallPixels, total: canvas.width * canvas.height }
  }, capture.toString('base64'))
  expect(pixels.background).toEqual([231, 237, 241, 255])
  expect(pixels.hallPixels).toBeGreaterThan(10_000)
  expect(pixels.hallPixels).toBeLessThan(pixels.total * 0.8)
})

test('back-forward restoration creates a fresh live application owner', async ({ page }) => {
  await boot(page)
  const firstGeneration = (await inspect(page)).firstFrame
  await page.goto(new URL('../away.html', gameUrl).href)
  await page.goBack()
  await expect.poll(async () => {
    await page.evaluate(() => window.gameFrames.frame(0))
    return page.locator('#load-status').textContent()
  }, { timeout: 20_000 }).toBe('Ready - local provisional assets; appearance pending.')
  await page.waitForFunction(() => Boolean(window.midcreek))
  expect((await inspect(page)).state).toBe('ready')
  expect((await inspect(page)).firstFrame).toEqual(firstGeneration)
  await page.locator('#dispatch').click()
  await flush(page)
  expect((await inspect(page)).world.message).toContain('dispatched')
})

for (let heading = 0; heading < 4; heading++) {
  test(`heading ${heading}: native rack occlusion and orbit-to-reveal the same technician`, async ({ page }, testInfo) => {
    await boot(page)
    await page.locator('canvas').focus()
    for (let i = 0; i < heading; i++) await page.keyboard.press('e')
    await flush(page)
    expect((await inspect(page)).actorSightline?.firstInstance).toBe('actor/technician')
    await page.screenshot({ path: testInfo.outputPath(`visible-${heading}.png`) })
    await clickCell(page, heading < 2 ? 3 : 12, 4)
    await arrive(page)
    const occluded = await inspect(page)
    expect(occluded.actorSightline?.firstInstance).toMatch(/^rack\//)
    expect(occluded.camera!.nativeDepth).toBe(true)
    await page.screenshot({ path: testInfo.outputPath(`occluded-${heading}.png`) })
    await page.locator('canvas').focus()
    await page.keyboard.press('e')
    await page.keyboard.press('e')
    await flush(page)
    const revealed = await inspect(page)
    expect(revealed.actorSightline?.firstInstance).toBe('actor/technician')
    expect(revealed.world).toEqual(occluded.world)
    expect(revealed.instances).toEqual(occluded.instances)
    expect(revealed.camera!.nativeDepth).toBe(true)
    await page.screenshot({ path: testInfo.outputPath(`revealed-${heading}.png`) })
  })
}

test('real descendant rest reset, loop boundaries, same-mode phase and animation roots', async ({ page }) => {
  await boot(page)
  const actor = async () => (await inspect(page)).instances.find((instance) => instance.id === 'actor/technician')!
  const initial = await actor()
  await step(page, 60)
  const loop = await actor()
  expect(loop.time).toBeCloseTo(2)
  for (const [index, node] of initial.nodes.entries()) {
    for (const property of ['position', 'quaternion', 'scale'] as const) {
      loop.nodes[index][property].forEach((value, i) => expect(value).toBeCloseTo(node[property][i], 5))
    }
  }
  await dispatch(page)
  const walk = await actor()
  await arrive(page)
  await step(page, 22)
  await clickCell(page, 2, 7)
  const afterRepair = await actor()
  expect(afterRepair.clip).toBe('Walk')
  expect(afterRepair.time).toBe(0)
  expect(afterRepair.nodes).toEqual(walk.nodes)
  expect(afterRepair.nodes.filter((node) => /^(TechnicianRoot|Scene)$/.test(node.name)))
    .toEqual(walk.nodes.filter((node) => /^(TechnicianRoot|Scene)$/.test(node.name)))
  await page.locator('#restart').click()
  await flush(page)
  expect(await actor()).toEqual(initial)
})

test('floor click, fault-marker dispatch, travel, work tick 119/120 and resolution use production commands', async ({ page }) => {
  await boot(page)
  await clickCell(page, 3, 7)
  await step(page, 5)
  expect((await inspect(page)).world.player.cell).toEqual({ x: 3, z: 7 })
  const marker = (await inspect(page)).fault!
  await page.locator('canvas').click({ position: marker })
  await flush(page)
  expect((await inspect(page)).world.player.mode).toBe('walking')
  expect((await inspect(page)).route).toHaveLength((await inspect(page)).world.player.path.length)
  await arrive(page)
  const arrival = await inspect(page)
  expect(arrival.world.player.mode).toBe('repairing')
  expect(arrival.world.fault.progress).toBe(0)
  const actor = arrival.instances.find((instance) => instance.id === 'actor/technician')!
  expect(actor.clip).toBe('Repair')
  await step(page, 119)
  expect((await inspect(page)).world.fault).toMatchObject({ status: 'working', progress: 119 / 120 })
  await expect(page.locator('#repair')).toHaveText('119 / 120')
  await step(page, 1)
  const resolved = await inspect(page)
  expect(resolved.world.fault).toMatchObject({ status: 'resolved', progress: 1 })
  expect(resolved.instances.find((instance) => instance.id === 'fault/coolant')!.visible).toBe(false)
  expect(resolved.instances.find((instance) => instance.id === 'actor/technician')!.clip).toBe('Idle')
  await expect(page.locator('#shift-state')).toHaveText('Resolved')
})

test('manual arrival waits for dispatch, repeat/invalid input preserve work and valid movement cancels', async ({ page }) => {
  await boot(page)
  const world = (await inspect(page)).world
  const rack = world.racks.find((rack) => rack.id === world.fault.rackId)!
  await clickCell(page, rack.cell.x, rack.cell.z - rack.front)
  await arrive(page)
  expect((await inspect(page)).world.player.mode).toBe('idle')
  expect((await inspect(page)).world.fault.status).toBe('fault')
  await dispatch(page)
  await step(page, 12)
  const before = await inspect(page)
  await dispatch(page)
  expect((await inspect(page)).world.fault.progress).toBe(12 / 120)
  expect((await inspect(page)).instances.find((instance) => instance.id === 'actor/technician')!.time)
    .toBe(before.instances.find((instance) => instance.id === 'actor/technician')!.time)
  await page.locator('canvas').focus()
  await page.keyboard.down(rack.front === -1 ? 'ArrowUp' : 'ArrowDown')
  await step(page, 1)
  await page.keyboard.up(rack.front === -1 ? 'ArrowUp' : 'ArrowDown')
  expect((await inspect(page)).world.fault.progress).toBe(13 / 120)
  await page.keyboard.down('ArrowLeft')
  await step(page, 1)
  await page.keyboard.up('ArrowLeft')
  expect((await inspect(page)).world.fault).toMatchObject({ status: 'fault', progress: 0 })
  expect((await inspect(page)).instances.find((instance) => instance.id === 'actor/technician')!.clip).toBe('Walk')
})

test('pause/native focus guards, hidden freeze, no catch-up and seeded restart preserve camera rules', async ({ page }) => {
  await boot(page)
  await dispatch(page)
  await arrive(page)
  await step(page, 10)
  await page.locator('#pause').focus()
  await page.keyboard.press('Enter')
  await flush(page)
  const paused = await inspect(page)
  expect(paused.world.paused).toBe(true)
  await page.keyboard.press('ArrowRight')
  await step(page, 120)
  expect((await inspect(page)).world).toEqual(paused.world)
  expect((await inspect(page)).instances).toEqual(paused.instances)
  await page.locator('canvas').focus()
  await page.keyboard.press('e')
  await page.keyboard.press('+')
  expect((await inspect(page)).camera).toMatchObject({ heading: 1, zoom: 1.15 })
  await page.locator('#pause').click()
  await flush(page)
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' })
    document.dispatchEvent(new Event('visibilitychange'))
  })
  const hidden = await inspect(page)
  await page.locator('canvas').focus()
  await page.keyboard.press('f')
  await page.evaluate(() => window.gameFrames.frame(100_000))
  expect((await inspect(page)).world).toEqual(hidden.world)
  expect((await inspect(page)).instances).toEqual(hidden.instances)
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' })
    document.dispatchEvent(new Event('visibilitychange'))
    window.gameFrames.frame(200_000)
  })
  expect((await inspect(page)).world.clock.tick).toBe(hidden.world.clock.tick)
  await step(page, 1)
  expect((await inspect(page)).world.clock.tick).toBe(hidden.world.clock.tick + 1)
  await page.locator('#restart').click()
  await flush(page)
  const restarted = await inspect(page)
  expect(restarted.world).toMatchObject({
    seed: 417, clock: { tick: 0, elapsedSeconds: 0 }, player: { cell: { x: 2, z: 7 }, mode: 'idle' },
    fault: { rackId: hidden.world.fault.rackId, progress: 0, status: 'fault' },
  })
  expect(restarted.instances.find((instance) => instance.id === 'actor/technician'))
    .toMatchObject({ position: [2, 0, 7], yaw: 0, clip: 'Idle', time: 0 })
  expect(restarted.camera).toMatchObject({ heading: 1, zoom: 1.15 })
  await page.locator('canvas').focus()
  await page.keyboard.press('Home')
  expect((await inspect(page)).camera).toMatchObject({ heading: 0, zoom: 1 })
})

const directions = [
  [[2, 6], [2, 8], [1, 7], [3, 7]],
  [[1, 7], [3, 7], [2, 8], [2, 6]],
  [[2, 8], [2, 6], [3, 7], [1, 7]],
  [[3, 7], [1, 7], [2, 6], [2, 8]],
]
for (let heading = 0; heading < 4; heading++) {
  test(`heading ${heading}: four arrows, floor/route/fault projection and responsive camera`, async ({ page }, testInfo) => {
    await boot(page)
    await page.locator('canvas').focus()
    for (let i = 0; i < heading; i++) await page.keyboard.press('e')
    for (const [index, key] of ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].entries()) {
      await page.keyboard.down(key)
      await step(page, 5)
      await page.keyboard.up(key)
      const [x, z] = directions[heading][index]
      expect((await inspect(page)).world.player.cell).toEqual({ x, z })
      await page.locator('#restart').click()
      await flush(page)
      await page.locator('canvas').focus()
    }
    for (const size of [{ width: 1280, height: 720 }, { width: 390, height: 844 }]) {
      await page.setViewportSize(size)
      await expect.poll(async () => (await inspect(page)).camera!.width)
        .toBe(size.width === 1280 ? 1280 : size.width - 32)
      await clickCell(page, 3, 7)
      expect((await inspect(page)).world.player.path).toEqual([{ x: 3, z: 7 }])
      expect((await inspect(page)).route).toHaveLength(1)
      expect((await inspect(page)).camera!.nativeDepth).toBe(true)
      await page.locator('canvas').click({ position: (await inspect(page)).fault! })
      await flush(page)
      const dispatched = await inspect(page)
      expect(dispatched.world.message).toContain('dispatched')
      expect(dispatched.route).toHaveLength(dispatched.world.player.path.length)
      const destination = dispatched.world.player.path.at(-1)!
      const projected = new Vector3(destination.x, 0.035, destination.z)
        .applyMatrix4(new Matrix4().fromArray(dispatched.camera!.matrixWorld).invert())
        .applyMatrix4(new Matrix4().fromArray(dispatched.camera!.projection))
      expect(dispatched.route.at(-1)!.x).toBeCloseTo((projected.x + 1) * dispatched.camera!.width / 2, 4)
      expect(dispatched.route.at(-1)!.y).toBeCloseTo((1 - projected.y) * dispatched.camera!.height / 2, 4)
      await page.screenshot({ path: testInfo.outputPath(`heading-${heading}-${size.width}.png`), fullPage: true })
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)
      expect(overflow).toBe(false)
      await page.locator('#restart').click()
      await flush(page)
    }
  })
}

for (const fault of ['pointer', 'manifest', 'model', 'corrupt', 'context'] as const) {
  test(`production ${fault} failure stays disabled with Reload`, async ({ page }) => {
    if (fault === 'pointer') await page.route('**/development/selection.json', (route) => route.fulfill({ json: { manifest: '../private' } }))
    if (fault === 'manifest') await page.route('**/manifest.json', (route) => route.fulfill({ json: {} }))
    if (fault === 'model') await page.route('**/rack-standard.glb', (route) => route.fulfill({ status: 404 }))
    if (fault === 'corrupt') await page.route('**/technician-man.glb', (route) => route.fulfill({ body: 'not a GLB' }))
    if (fault === 'context') {
      await boot(page)
      await page.evaluate(() => {
        const context = document.querySelector('canvas')!.getContext('webgl2')!
        const extension = context.getExtension('WEBGL_lose_context')
        if (!extension) throw new Error('WebGL context-loss extension unavailable')
        extension.loseContext()
      })
    } else await page.goto(gameUrl)
    await expect(page.locator('#reload')).toBeVisible()
    await expect(page.locator('#dispatch')).toBeDisabled()
    await expect(page.locator('#pause')).toBeDisabled()
    await expect(page.locator('#restart')).toBeDisabled()
    await page.waitForFunction(() => Boolean(window.midcreek))
    await page.locator('canvas').focus()
    await page.keyboard.press('f')
    await page.keyboard.press('ArrowRight')
    await step(page, 15)
    expect((await inspect(page)).state).toBe('failed')
    expect((await inspect(page)).world.clock.tick).toBe(0)
    expect((await inspect(page)).instances).toEqual([])
    await page.unrouteAll()
    await page.locator('#reload').click()
    await expect.poll(async () => {
      await page.evaluate(() => window.gameFrames.frame(0))
      return page.locator('#load-status').textContent()
    }).toBe('Ready - local provisional assets; appearance pending.')
  })
}

test('native RAF production journey requires no test scheduler', async ({ page }) => {
  await page.goto(gameUrl)
  await expect(page.locator('#load-status')).toHaveText('Ready - local provisional assets; appearance pending.')
  await page.locator('#dispatch').click()
  await expect.poll(async () => (await inspect(page)).world.fault.status, { timeout: 12_000 }).toBe('resolved')
  await expect(page.locator('#repair')).toHaveText('120 / 120')
  expect((await inspect(page)).world.clock.tick).toBeGreaterThanOrEqual(175)
})

test('a delayed required model gates controls; blur clears held movement after ready', async ({ page }) => {
  let release!: () => void
  const gate = new Promise<void>((done) => { release = done })
  await page.route('**/rack-standard.glb', async (route) => { await gate; await route.continue() })
  await page.goto(gameUrl)
  await expect(page.locator('#load-status')).toHaveText('Loading required assets...')
  await expect(page.locator('#dispatch')).toBeDisabled()
  await page.locator('canvas').focus()
  await page.keyboard.press('ArrowRight')
  await step(page, 30)
  release()
  await expect.poll(async () => {
    await page.evaluate(() => window.gameFrames.frame(0))
    return page.locator('#load-status').textContent()
  }).toBe('Ready - local provisional assets; appearance pending.')
  await page.waitForFunction(() => Boolean(window.midcreek))
  await page.evaluate(() => window.gameFrames.frame(0))
  expect((await inspect(page)).world.clock.tick).toBe(0)
  await page.keyboard.down('ArrowRight')
  await step(page, 1)
  await page.evaluate(() => window.dispatchEvent(new Event('blur')))
  await step(page, 19)
  await page.keyboard.up('ArrowRight')
  expect((await inspect(page)).world.player.cell).toEqual({ x: 3, z: 7 })
})

test('page teardown during pending loading cannot attach a late hall', async ({ page }) => {
  let release!: () => void
  const gate = new Promise<void>((done) => { release = done })
  await page.route('**/rack-standard.glb', async (route) => { await gate; await route.continue() })
  await page.goto(gameUrl)
  await expect(page.locator('#load-status')).toHaveText('Loading required assets...')
  await page.evaluate(() => window.dispatchEvent(new Event('pagehide')))
  release()
  await page.waitForFunction(() => Boolean(window.midcreek))
  await step(page, 10)
  expect((await inspect(page)).state).toBe('disposed')
  expect((await inspect(page)).instances).toEqual([])
  expect((await inspect(page)).world.clock.tick).toBe(0)
})

test('selection timeout is terminal and late completion cannot enable the session', async ({ page }) => {
  let release!: () => void
  const gate = new Promise<void>((done) => { release = done })
  await page.route('**/development/selection.json', async (route) => { await gate; await route.continue() })
  await page.goto(gameUrl)
  await expect(page.locator('#load-status')).toHaveText('Loading required assets...')
  await expect(page.locator('#load-status')).toContainText('LOAD_TIMEOUT', { timeout: 35_000 })
  release()
  await page.waitForFunction(() => Boolean(window.midcreek))
  await step(page, 30)
  expect((await inspect(page)).state).toBe('failed')
  expect((await inspect(page)).world.clock.tick).toBe(0)
  await expect(page.locator('#reload')).toBeVisible()
  await expect(page.locator('#dispatch')).toBeDisabled()
})
