import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { createServer } from 'node:http'
import { resolve } from 'node:path'
import { build } from 'vite'
import { expect } from '@playwright/test'
import type { Page } from '@playwright/test'
import type { GameHandle } from '../../src/app/game'
import { Matrix4, Vector3 } from 'three'
import type { NetworkReceipt } from '../../src/diagnostics/metrics'

declare global {
  interface Window {
    midcreek: GameHandle
    u8Frames: { step(count?: number): void; flush(): void }
    glProof: { calls: number; triangles: number }
  }
}

export async function serveQualification() {
  const built = await build({ configFile: resolve('vite.config.ts'), logLevel: 'error', build: { write: false } })
  const files = new Map<string, { data: Buffer; type: string }>()
  for (const result of Array.isArray(built) ? built : [built]) {
    if (!('output' in result)) throw new Error('Expected production build output')
    for (const file of result.output) files.set(`/midcreek-cs-3/${file.fileName}`, {
      data: Buffer.from(file.type === 'chunk' ? file.code : file.source),
      type: file.fileName.endsWith('.html') ? 'text/html' : file.fileName.endsWith('.css') ? 'text/css' : 'application/javascript',
    })
  }
  const pointer = await readFile('assets/library/development/selection.json')
  const selection = JSON.parse(pointer.toString())
  const manifest = await readFile(`assets/library/${selection.manifest}`)
  files.set('/midcreek-cs-3/assets/library/development/selection.json', { data: pointer, type: 'application/json' })
  files.set(`/midcreek-cs-3/assets/library/${selection.manifest}`, { data: manifest, type: 'application/json' })
  for (const entry of JSON.parse(manifest.toString()).assets) {
    if (!/^packages\/[a-f0-9]{64}\/[a-z-]+\.glb$/.test(entry.file)) throw new Error('Invalid selected member')
    files.set(`/midcreek-cs-3/assets/library/${entry.file}`, {
      data: await readFile(`assets/library/${entry.file}`), type: 'model/gltf-binary',
    })
  }
  const server = createServer((request, response) => {
    let path = new URL(request.url ?? '/', 'http://127.0.0.1').pathname
    if (path.endsWith('/')) path += 'index.html'
    const file = files.get(path)
    response.writeHead(file ? 200 : 404, {
      'Content-Type': file?.type ?? 'text/plain', 'Cache-Control': 'no-store',
      'Content-Length': file?.data.length ?? Buffer.byteLength('Not found'),
    })
    response.end(file?.data ?? 'Not found')
  })
  await new Promise<void>((done, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', done) })
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Expected loopback TCP server')
  return {
    url: `http://127.0.0.1:${address.port}/midcreek-cs-3/play/?qualification=1`,
    close: () => new Promise<void>((done, reject) => server.close((error) => error ? reject(error) : done())),
  }
}

export async function controlledRendering(page: Page) {
  await page.addInitScript(() => {
    const nativeNow = performance.now.bind(performance)
    let clock: number | undefined
    let id = 0
    const callbacks = new Map<number, FrameRequestCallback>()
    Object.defineProperty(performance, 'now', { value: () => clock === undefined ? nativeNow() : (clock += 0.001) })
    window.requestAnimationFrame = (callback) => { callbacks.set(++id, callback); return id }
    window.cancelAnimationFrame = (id) => { callbacks.delete(id) }
    const pump = () => {
      const pending = [...callbacks.values()]
      callbacks.clear()
      for (const callback of pending) callback(clock ?? nativeNow())
    }

    window.u8Frames = {
      flush: pump,
      step(count = 1) {
        for (let i = 0; i < count; i++) { clock = (clock ?? nativeNow()) + 1000 / 60; pump() }
      },
    }
    // Observe the real WebGL submissions, not a simulated renderer-info object.
    window.glProof = { calls: 0, triangles: 0 }
    const gl = WebGL2RenderingContext.prototype
    const elements = gl.drawElements
    gl.drawElements = function(mode, count, type, offset) {
      elements.call(this, mode, count, type, offset)
      window.glProof.calls++; if (mode === this.TRIANGLES) window.glProof.triangles += count / 3
    }
    const arrays = gl.drawArrays
    gl.drawArrays = function(mode, first, count) {
      arrays.call(this, mode, first, count)
      window.glProof.calls++; if (mode === this.TRIANGLES) window.glProof.triangles += count / 3
    }
    const instancedElements = gl.drawElementsInstanced
    gl.drawElementsInstanced = function(mode, count, type, offset, instances) {
      instancedElements.call(this, mode, count, type, offset, instances)
      window.glProof.calls++; if (mode === this.TRIANGLES) window.glProof.triangles += count / 3 * instances
    }
    const instancedArrays = gl.drawArraysInstanced
    gl.drawArraysInstanced = function(mode, first, count, instances) {
      instancedArrays.call(this, mode, first, count, instances)
      window.glProof.calls++; if (mode === this.TRIANGLES) window.glProof.triangles += count / 3 * instances
    }
  })
}

export async function bootQualification(page: Page, url: string) {
  await page.goto(url)
  await expect.poll(async () => {
    await page.evaluate(() => window.u8Frames.flush())
    return page.locator('#load-status').textContent()
  }, { timeout: 20_000 }).toContain('Ready')
  await page.waitForFunction(() => Boolean(window.midcreek))
}

export async function clickQualificationCell(page: Page, cell: { x: number; z: number }) {
  const camera = await page.evaluate(() => window.midcreek.inspect().camera!)
  const point = new Vector3(cell.x, 0, cell.z)
    .applyMatrix4(new Matrix4().fromArray(camera.matrixWorld).invert())
    .applyMatrix4(new Matrix4().fromArray(camera.projection))
  await page.locator('canvas').click({ position: {
    x: (point.x + 1) * camera.width / 2, y: (1 - point.y) * camera.height / 2,
  } })
}

export async function observeQualificationNetwork(page: Page) {
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Network.enable')
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: true })
  type Request = {
    requestId: string; url: string; wallTime: number; timestamp: number;
    end: number | null; transferSize: number | null; encodedBodySize: number | null;
    cache: 'network' | 'local'; failed: boolean
  }
  const requests = new Map<string, Request>()
  cdp.on('Network.requestWillBeSent', (event) => {
    if (event.redirectResponse) {
      const previous = requests.get(event.requestId)
      if (previous) previous.failed = true
      return
    }
    requests.set(event.requestId, {
      requestId: event.requestId, url: event.request.url, wallTime: event.wallTime, timestamp: event.timestamp,
      end: null, encodedBodySize: null, transferSize: null, cache: 'network', failed: false,
    })
  })
  cdp.on('Network.responseReceived', (event) => {
    const request = requests.get(event.requestId)
    if (!request) return
    const length = Object.entries(event.response.headers).find(([key]) => key.toLowerCase() === 'content-length')?.[1]
    request.encodedBodySize = length !== undefined ? Number(length) : null
    if (event.response.fromDiskCache || event.response.fromServiceWorker) request.cache = 'local'
  })
  cdp.on('Network.requestServedFromCache', (event) => {
    const request = requests.get(event.requestId)
    if (request) request.cache = 'local'
  })
  cdp.on('Network.loadingFinished', (event) => {
    const request = requests.get(event.requestId)
    if (request) { request.end = event.timestamp; request.transferSize = event.encodedDataLength }
  })
  cdp.on('Network.loadingFailed', (event) => {
    const request = requests.get(event.requestId)
    if (request) request.failed = true
  })
  return {
    async snapshot(timeOrigin: number): Promise<NetworkReceipt> {
      return {
        source: 'cdp', complete: true, overflow: false,
        requests: [...requests.values()].map((r) => ({
          requestId: r.requestId, url: r.url, startTime: r.wallTime * 1000 - timeOrigin,
          responseEnd: r.end === null ? null : r.wallTime * 1000 + (r.end - r.timestamp) * 1000 - timeOrigin,
          encodedBodySize: r.encodedBodySize, transferSize: r.transferSize, cache: r.cache, failed: r.failed,
        })),
      }
    },
    async contentHash() {
      const contents: { path: string; sha256: string }[] = []
      for (const r of requests.values()) {
        if (!/^https?:/.test(r.url) || r.failed || r.end === null) continue
        const response = await cdp.send('Network.getResponseBody', { requestId: r.requestId })
        const bytes = Buffer.from(response.body, response.base64Encoded ? 'base64' : 'utf8')
        contents.push({ path: new URL(r.url).pathname, sha256: createHash('sha256').update(bytes).digest('hex') })
      }
      return createHash('sha256').update(JSON.stringify(contents.sort((a, b) => a.path.localeCompare(b.path)))).digest('hex')
    },
    close: () => cdp.detach(),
  }
}
