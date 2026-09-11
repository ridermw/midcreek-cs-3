import { expect, test } from '@playwright/test'
import { bootQualification, controlledRendering, observeQualificationNetwork, serveQualification } from './qualificationHarness'
import { reconcileStartupNetwork } from '../../src/diagnostics/metrics'

let server: Awaited<ReturnType<typeof serveQualification>>
test.beforeAll(async () => { server = await serveQualification() })
test.afterAll(async () => { await server?.close() })
test.beforeEach(async ({ page }) => { await controlledRendering(page) })

test('real rendered receipts bind startup and all WebGL passes; RAF alone is not a frame', async ({ page }) => {
  await bootQualification(page, server.url)
  const initial = await page.evaluate(() => window.midcreek.diagnostics.snapshot())
  expect(initial.ready?.seed).toBe(417)
  expect(initial.ready?.scenario).toBe('coolant-leak')
  expect(initial.ready?.identity.libraryDigest).toBe('200366356f3665ac9ef45c404bd9462e29b2ae0c813b688c4df3ed2cf119a934')
  expect(initial.startup?.required.filter((r) => r.role === 'asset')).toHaveLength(5)
  expect(initial.startup?.required.map((r) => r.role)).toEqual(expect.arrayContaining(['html', 'script', 'style', 'selection', 'manifest']))
  expect(initial.ready?.firstFrame.calls).toBeGreaterThan(0)
  expect(initial.ready?.gpuFinishedAt).toBeLessThanOrEqual(initial.ready!.interactiveAt)
  expect(initial.ready?.readyAt).toBe(initial.ready?.interactiveAt)
  const proof = await page.evaluate(() => {
    window.glProof = { calls: 0, triangles: 0 }
    window.u8Frames.step()
    return { frame: window.midcreek.diagnostics.snapshot().frames.at(-1)!, proof: window.glProof }
  })
  expect(proof.frame.calls).toBe(proof.proof.calls)
  expect(proof.frame.triangles).toBe(proof.proof.triangles)
  expect(proof.frame.renderCount).toBe(initial.frames.length + 1)
  await page.evaluate(() => {
    window.midcreek.dispose()
    requestAnimationFrame(() => undefined)
    window.u8Frames.step()
  })
  expect((await page.evaluate(() => window.midcreek.diagnostics.snapshot())).frames).toHaveLength(initial.frames.length + 1)
})

test('required asset delayed beyond load is counted; later optional fetch cannot alter frozen startup', async ({ page }) => {
  let release!: () => void
  const gate = new Promise<void>((done) => { release = done })
  await page.route('**/coolant-leak.glb', async (route) => { await gate; await route.continue() })
  await page.goto(server.url, { waitUntil: 'load' })
  expect(await page.locator('#load-status').textContent()).not.toContain('Ready')
  release()
  await expect.poll(async () => {
    await page.evaluate(() => window.u8Frames.flush())
    return page.locator('#load-status').textContent()
  }).toContain('Ready')
  const before = await page.evaluate(() => window.midcreek.diagnostics.snapshot().startup!)
  expect(before.resources.find((r) => r.url.endsWith('/coolant-leak.glb'))!.responseEnd).toBeGreaterThan(before.loadEventEnd)
  expect(before.resources.every((r) => r.responseEnd <= before.readyAt)).toBe(true)
  await page.evaluate(() => fetch('../gallery-later.webp'))
  expect(await page.evaluate(() => window.midcreek.diagnostics.snapshot().startup)).toEqual(before)
})

test('required requests starting after loadEventEnd are bound and reconcile with independent CDP responses', async ({ page }) => {
  const network = await observeQualificationNetwork(page)
  let release!: () => void
  const gate = new Promise<void>((done) => { release = done })
  await page.route('**/development/selection.json', async (route) => { await gate; await route.continue() })
  await page.goto(server.url, { waitUntil: 'load' })
  release()
  await expect.poll(async () => {
    await page.evaluate(() => window.u8Frames.flush())
    return page.locator('#load-status').textContent()
  }).toContain('Ready')
  const captured = await page.evaluate(() => window.midcreek.diagnostics.snapshot())
  const startup = captured.startup!
  expect(startup.required.filter((r) => r.role === 'asset')).toHaveLength(5)
  expect(startup.resources.filter((r) => r.role === 'asset').every((r) => r.startTime > startup.loadEventEnd)).toBe(true)
  expect(startup.issues).toEqual([])
  expect(reconcileStartupNetwork(startup, await network.snapshot(startup.timeOrigin))).toEqual([])
  await network.close()
})

test('pending unexpected initial requests cannot disappear from qualification', async ({ page }) => {
  const network = await observeQualificationNetwork(page)
  let release!: () => void
  const gate = new Promise<void>((done) => { release = done })
  await page.route('**/unexpected-initial', async (route) => {
    await gate
    await route.fulfill({ status: 200, body: 'unexpected' })
  })
  await page.addInitScript(() => {
    void fetch('/unexpected-initial')
  })
  await bootQualification(page, server.url)
  const startup = await page.evaluate(() => window.midcreek.diagnostics.snapshot().startup!)
  const independent = await network.snapshot(startup.timeOrigin)
  expect(independent.requests.find((r) => r.url.endsWith('/unexpected-initial'))!.responseEnd).toBeNull()
  expect(reconcileStartupNetwork(startup, independent).join(' ')).toMatch(/pending|mismatch/)
  release()
  await network.close()
})

test('hidden and error interruptions are retained, and zero transfer fields never become zero-cost passes', async ({ page }) => {
  await page.addInitScript(() => {
    const original = performance.getEntriesByType.bind(performance)
    performance.getEntriesByType = (type) => original(type).map((entry) => {
      if (type !== 'resource' || !entry.name.endsWith('/coolant-leak.glb')) return entry
      return new Proxy(entry, { get: (target, key) => key === 'transferSize' ? 0 : Reflect.get(target, key, target) })
    })
  })
  await bootQualification(page, server.url)
  const before = await page.evaluate(() => window.midcreek.diagnostics.snapshot())
  expect(before.startup!.issues.join(' ')).toMatch(/unmeasurable/)
  const after = await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' })
    document.dispatchEvent(new Event('visibilitychange'))
    window.u8Frames.step(3)
    window.dispatchEvent(new ErrorEvent('error', { message: 'controlled instrumentation error' }))
    return window.midcreek.diagnostics.snapshot()
  })
  expect(after.frames).toHaveLength(before.frames.length)
  expect(after.interruptions.map((i) => i.kind)).toEqual(expect.arrayContaining(['hidden', 'error']))
  expect(after.interruptions.some((i) => i.detail.includes('controlled instrumentation error'))).toBe(true)
})
