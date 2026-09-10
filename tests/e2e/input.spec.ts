import { createServer } from 'node:http'
import type { Server } from 'node:http'
import { resolve } from 'node:path'
import { build } from 'vite'
import { expect, test } from '@playwright/test'

let server: Server
let fixtureUrl: string
test.beforeAll(async () => {
  const built = await build({
    configFile: false, root: resolve('tests/fixtures/input'), base: '/input/',
    logLevel: 'error', publicDir: false,
    build: { write: false, sourcemap: false },
  })
  const files = new Map<string, { data: Buffer; type: string }>()
  for (const result of Array.isArray(built) ? built : [built]) {
    if (!('output' in result)) throw new Error('Expected completed input fixture build')
    for (const file of result.output) {
      const content = file.type === 'chunk' ? file.code : file.source
      files.set(`/input/${file.fileName}`, {
        data: Buffer.from(content),
        type: file.fileName.endsWith('.html') ? 'text/html' : 'application/javascript',
      })
    }
  }
  server = createServer((request, response) => {
    const path = new URL(request.url ?? '/', 'http://127.0.0.1').pathname
    const file = files.get(path === '/input/' ? '/input/index.html' : path)
    if (!file) { response.writeHead(404); response.end('Not found'); return }
    response.writeHead(200, { 'Content-Type': file.type, 'Cache-Control': 'no-store' })
    response.end(file.data)
  })
  await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve) })
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Input fixture has no TCP address')
  fixtureUrl = `http://127.0.0.1:${address.port}/input/`
})
test.afterAll(async () => {
  if (server) await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
})
test.beforeEach(async ({ page }) => {
  await page.goto(fixtureUrl)
  await page.waitForFunction(() => Boolean(window.inputFixture))
  await page.evaluate(() => window.inputFixture.ready(true))
  await page.locator('#surface').focus()
})

const directions = [
  [[2, 6], [2, 8], [1, 7], [3, 7]],
  [[1, 7], [3, 7], [2, 8], [2, 6]],
  [[2, 8], [2, 6], [3, 7], [1, 7]],
  [[3, 7], [1, 7], [2, 6], [2, 8]],
]
for (let heading = 0; heading < 4; heading++) {
  for (const [index, key] of ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].entries()) {
    test(`real held ${key} at heading ${heading} follows the fixed-tick matrix`, async ({ page }) => {
      await page.evaluate((value) => window.inputFixture.heading(value), heading)
      await page.keyboard.down(key)
      await page.evaluate(() => window.inputFixture.tick(5))
      await page.keyboard.up(key)
      const [x, z] = directions[heading]![index]!
      expect(await page.evaluate(() => window.inputFixture.snapshot().player.cell)).toEqual({ x, z })
      expect((await page.evaluate(() => window.inputFixture.replay())).operations).toHaveLength(10)
    })
  }
}

test('browser repeat events do not add simulation commands and clearing prevents repeat resurrection', async ({ page }) => {
  await page.keyboard.down('ArrowRight')
  for (let i = 0; i < 12; i++) await page.keyboard.down('ArrowRight')
  await page.evaluate(() => window.inputFixture.tick(1))
  await page.evaluate(() => window.dispatchEvent(new Event('blur')))
  await page.keyboard.down('ArrowRight')
  await page.evaluate(() => window.inputFixture.tick(19))
  expect(await page.evaluate(() => window.inputFixture.snapshot().player.cell)).toEqual({ x: 3, z: 7 })
  expect((await page.evaluate(() => window.inputFixture.replay())).operations.filter((op) => op.kind === 'command')).toHaveLength(1)
  await page.keyboard.up('ArrowRight')
  await page.keyboard.down('ArrowRight')
  await page.evaluate(() => window.inputFixture.tick(5))
  expect(await page.evaluate(() => window.inputFixture.snapshot().player.cell)).toEqual({ x: 4, z: 7 })
})

test('all guarded focus targets clear movement, accept keyup and preserve native button activation', async ({ page }) => {
  for (const selector of ['input', 'a', '[contenteditable]', '#pause']) {
    await page.locator('#surface').focus()
    await page.keyboard.down('ArrowRight')
    await page.locator(selector).focus()
    await page.keyboard.up('ArrowRight')
    await page.keyboard.press('ArrowDown')
    await page.evaluate(() => window.inputFixture.tick(5))
    expect(await page.evaluate(() => window.inputFixture.snapshot().player.cell)).toEqual({ x: 2, z: 7 })
  }
  await page.locator('#pause').focus()
  await page.keyboard.press('Enter')
  await page.evaluate(() => window.inputFixture.tick(1))
  expect(await page.evaluate(() => window.inputFixture.snapshot().paused)).toBe(true)
  await page.locator('#surface').focus()
  await page.keyboard.press('e')
  expect(await page.evaluate(() => window.inputFixture.cameraHeading())).toBe(1)
  await page.keyboard.press('f')
  await page.evaluate(() => window.inputFixture.tick(1))
  expect(await page.evaluate(() => window.inputFixture.snapshot().message)).toContain('before dispatching')
  await page.keyboard.down('ArrowRight')
  await page.evaluate(() => window.inputFixture.tick(20))
  expect(await page.evaluate(() => window.inputFixture.snapshot().player.cell)).toEqual({ x: 2, z: 7 })
})

test('visibility events discard wall-clock backlog and readiness/failure disable keys', async ({ page }) => {
  await page.evaluate(() => window.inputFixture.pump(0))
  await page.keyboard.down('ArrowRight')
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' })
    document.dispatchEvent(new Event('visibilitychange'))
    window.inputFixture.pump(10_000)
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' })
    document.dispatchEvent(new Event('visibilitychange'))
    window.inputFixture.pump(20_000)
  })
  expect(await page.evaluate(() => window.inputFixture.snapshot().clock.tick)).toBe(0)
  await page.evaluate(() => window.inputFixture.ready(false))
  await page.keyboard.up('ArrowRight')
  await page.keyboard.down('ArrowRight')
  await page.evaluate(() => window.inputFixture.tick(10))
  expect(await page.evaluate(() => window.inputFixture.snapshot().clock.tick)).toBe(0)
  await page.evaluate(() => window.inputFixture.ready(true))
  await page.keyboard.down('ArrowRight')
  await page.evaluate(() => window.inputFixture.tick(5))
  expect(await page.evaluate(() => window.inputFixture.snapshot().player.cell)).toEqual({ x: 2, z: 7 })
})

test('the production showcase does not intercept arrow navigation', async ({ page }) => {
  await page.goto('./')
  const prevented = await page.evaluate(() => {
    const event = new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true })
    document.body.dispatchEvent(event)
    return event.defaultPrevented
  })
  expect(prevented).toBe(false)
})
