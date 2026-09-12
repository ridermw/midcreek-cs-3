import { resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BufferGeometry, Vector3 } from 'three'
import type { Camera, Scene } from 'three'
import type { ReleaseManifestBinding } from '../assets/releaseManifest'
import type { GameHandle } from './game'
import * as sessions from './session'
import { startPagesGame } from './pagesGame'

const gpu = vi.hoisted(() => ({
  render: vi.fn(), finish: vi.fn(), dispose: vi.fn(), lost: false,
}))

vi.mock('three', async (original) => {
  const three = await original<typeof import('three')>()
  return {
    ...three,
    WebGLRenderer: class {
      info = {
        autoReset: false, render: { calls: 0, triangles: 0 },
        reset: () => { this.info.render = { calls: 0, triangles: 0 } },
      }
      shadowMap = { enabled: false, type: 0 }
      private ratio = 1
      setPixelRatio(value: number) { this.ratio = value }
      getPixelRatio() { return this.ratio }
      setSize() {}
      render(scene: Scene, camera: Camera) {
        gpu.render()
        scene.updateMatrixWorld(true)
        camera.updateMatrixWorld(true)
        scene.traverse((node) => {
          if (node instanceof three.Mesh) {
            this.info.render.calls++
            this.info.render.triangles += (node.geometry.index?.count ?? 0) / 3
          }
        })
      }
      getContext() { return { finish: gpu.finish, isContextLost: () => gpu.lost } }
      dispose() { gpu.dispose() }
    },
  }
})

class TestElement extends EventTarget {
  id = ''
  className = ''
  tabIndex = -1
  textContent = ''
  disabled = false
  hidden = false
  value = 0
  width = 1200
  height = 900
  children: TestElement[] = []
  attributes = new Map<string, string>()
  readonly ownerDocument: TestDocument
  readonly tagName: string
  constructor(ownerDocument: TestDocument, tagName: string) {
    super()
    this.ownerDocument = ownerDocument
    this.tagName = tagName
  }
  set innerHTML(html: string) {
    this.children = [...html.matchAll(/<(\w+)[^>]*id="([^"]+)"[^>]*>([^<]*)/g)].map((match) => {
      const element = new TestElement(this.ownerDocument, match[1])
      element.id = match[2]
      element.textContent = match[3]
      element.disabled = match[0].includes('disabled')
      element.hidden = match[0].includes('hidden')
      return element
    })
  }
  append(...children: TestElement[]) { this.children.push(...children) }
  replaceChildren(...children: TestElement[]) { this.children = children }
  setAttribute(name: string, value: string) { this.attributes.set(name, value) }
  querySelector(selector: string): TestElement | null {
    if (selector === `#${this.id}`) return this
    for (const child of this.children) {
      const match = child.querySelector(selector)
      if (match) return match
    }
    return null
  }
  closest() { return this.tagName === 'button' ? this : null }
  getBoundingClientRect() { return { left: 10, top: 20, width: 800, height: 600 } }
  focus() { this.ownerDocument.activeElement = this }
  click() { if (!this.disabled) this.dispatchEvent(new Event('click')) }
}

class TestDocument extends EventTarget {
  visibilityState = 'visible'
  activeElement: TestElement | null = null
  container = new TestElement(this, 'div')
  defaultView = Object.assign(new EventTarget(), {
    devicePixelRatio: 3, innerWidth: 800, innerHeight: 600,
    performance: Object.assign(new EventTarget(), { now: () => 10, timeOrigin: 1, getEntriesByType: () => [], mark: vi.fn() }),
    location: { href: 'https://example.test/play/', origin: 'https://example.test', reload: vi.fn() },
    requestAnimationFrame: (callback: FrameRequestCallback) => { const id = ++this.frameId; this.frames.set(id, callback); return id },
    cancelAnimationFrame: (id: number) => { this.frames.delete(id) },
  })
  frames = new Map<number, FrameRequestCallback>()
  frameId = 0
  createElement(tag: string) { return new TestElement(this, tag) }
  querySelector(selector: string) { return this.container.querySelector(selector) }
  querySelectorAll() { return [] }
  hasFocus() { return true }
  frame(now: number) {
    const pending = [...this.frames.values()]
    this.frames.clear()
    for (const callback of pending) callback(now)
  }
  visibility(value: 'visible' | 'hidden') {
    this.visibilityState = value
    this.dispatchEvent(new Event('visibilitychange'))
  }
}

let document: TestDocument
let game: GameHandle | undefined
let resized: (() => void) | undefined
const disconnect = vi.fn()
const container = () => document.container as unknown as HTMLElement
const element = (id: string) => document.querySelector(`#${id}`)!
function key(key: string, type = 'keydown') {
  document.defaultView.dispatchEvent(Object.assign(new Event(type, { cancelable: true }), { key, repeat: false }))
}
function pointer(point: { x: number; y: number }, button = 0) {
  element('play-surface').dispatchEvent(Object.assign(new Event('pointerdown'), {
    button, clientX: point.x + 10, clientY: point.y + 20,
  }))
}
function advance(count: number, from = 0) {
  for (let index = 0; index <= count; index++) document.frame((from + index) * 1000 / 30)
}

beforeEach(() => {
  vi.resetAllMocks()
  gpu.lost = false
  document = new TestDocument()
  document.container.id = 'game'
  resized = undefined
  vi.stubGlobal('Element', TestElement)
  vi.stubGlobal('ResizeObserver', class {
    constructor(callback: () => void) { resized = callback }
    observe() {}
    disconnect = disconnect
  })
})
afterEach(() => {
  game?.dispose()
  game = undefined
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('play entry runtime selection', () => {
  it.each([true, false, undefined])('selects the explicit Pages flag %s and preserves asset-backed options', async (enabled) => {
    const { build } = await import('vite')
    const releaseBinding: ReleaseManifestBinding = {
      manifestSha256: 'a'.repeat(64), libraryDigest: 'b'.repeat(64), profile: 'cs3-standard-v1',
      profileSha256: 'c'.repeat(64), recipeSha256: 'd'.repeat(64),
    }
    const result = await build({
      configFile: false, publicDir: false, logLevel: 'silent', base: '/midcreek-cs-3/',
      define: {
        'import.meta.env.CS3_PAGES_DEMO': JSON.stringify(enabled) ?? 'undefined',
        'import.meta.env.CS3_RELEASE_BINDING': JSON.stringify(releaseBinding),
      },
      plugins: [{
        name: 'test-entry-orchestrators',
        enforce: 'pre',
        resolveId(source) {
          if (source === '../app/pagesGame' || source === '../app/game') return `\0${source}`
        },
        load(id) {
          if (id === '\0../app/pagesGame') return 'export async function startPagesGame(container) { return { kind: "pages", container } }'
          if (id === '\0../app/game') return 'export async function startGame(container, options) { return { kind: "assets", container, options } }'
        },
      }],
      build: { write: false, target: 'esnext', minify: false, rolldownOptions: { input: resolve(import.meta.dirname, '../play/main.ts') } },
    })
    if (!('output' in result)) throw new Error('Expected an in-memory entry build')
    const entry = result.output.find((output) => output.type === 'chunk' && output.isEntry)
    if (!entry || entry.type !== 'chunk') throw new Error('Missing built play entry')
    const link = new TestElement(document, 'a')
    link.id = 'showcase-link'
    document.container.append(link)
    Object.assign(document.defaultView.location, { search: '?qualification' })
    const run = new Function('document', 'window', `return (async () => { ${entry.code} })()`)
    await run(document, document.defaultView)
    expect(Reflect.get(document.defaultView, 'midcreek')).toEqual(enabled
      ? { kind: 'pages', container: document.container }
      : { kind: 'assets', container: document.container, options: {
        baseUrl: '/midcreek-cs-3/assets/library/', releaseBinding, diagnostics: true,
      } })
    expect(Reflect.get(link, 'href')).toBe('/midcreek-cs-3/')
    document.defaultView.dispatchEvent(Object.assign(new Event('pageshow'), { persisted: true }))
    expect(document.defaultView.location.reload).toHaveBeenCalledTimes(1)
  })
})

describe('source-only Pages runtime', () => {
  it('starts ready without fetching a manifest or GLB', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch')
    game = await startPagesGame(container())
    expect(fetch).not.toHaveBeenCalled()
    expect(element('load-status').textContent).toBe('Ready - source-only public Three.js demo.')
    expect(game.inspect().state).toBe('ready')
    expect(game.inspect().instances).toHaveLength(37)
    expect(game.inspect().firstFrame!.calls).toBeGreaterThan(0)
    expect(game.inspect().firstFrame!.triangles).toBeGreaterThan(0)
    expect(element('dispatch').disabled).toBe(false)
    expect(document.frames.size).toBe(1)
    expect(game.diagnostics.snapshot().frames).toEqual([])
  })

  it('fences the rendered scene before enabling gameplay', async () => {
    gpu.finish.mockImplementation(() => {
      expect(gpu.render).toHaveBeenCalledTimes(1)
      expect(element('dispatch').disabled).toBe(true)
      expect(document.frames.size).toBe(0)
    })
    game = await startPagesGame(container())
    expect(gpu.finish).toHaveBeenCalledTimes(1)
    expect(game.inspect().state).toBe('ready')
  })

  it('uses the source-only replay identity and honors seed, scenario and camera options', async () => {
    const createSession = vi.spyOn(sessions, 'createSession')
    game = await startPagesGame(container(), { seed: 418, scenario: 'coolant-leak', heading: 3, zoom: 2.25, diagnostics: true })
    expect(createSession.mock.results[0].value.replayLog()).toMatchObject({ seed: 418, identity: 'source-only-pages-demo-v1' })
    expect(game.inspect()).toMatchObject({ world: { seed: 418 }, camera: { heading: 3, zoom: 2.25 } })
    expect(game.diagnostics.snapshot().frames[0]).toMatchObject({
      trigger: 'startup', dimensions: { applicationDpr: 1.5, logical: [800, 600] },
    })
    expect(game.diagnostics.snapshot().ready).toBeUndefined()
    expect(game.diagnostics.snapshot().startup).toBeUndefined()
    expect(element('restart').textContent).toBe('Restart seed 418')
  })

  it.each([1.5, NaN, Infinity, -Infinity, Number.MAX_SAFE_INTEGER + 1])('rejects invalid seed %s without acquiring resources', async (seed) => {
    await expect(startPagesGame(container(), { seed })).rejects.toThrow(/SEED/)
    expect(document.container.children).toEqual([])
    expect(gpu.render).not.toHaveBeenCalled()
  })

  it('rejects unsupported scenarios before installing the DOM or listeners', async () => {
    await expect(startPagesGame(container(), { scenario: 'unknown' })).rejects.toThrow(/SCENARIO/)
    expect(document.container.children).toEqual([])
  })

  it.each([
    { heading: -1 }, { heading: 4 }, { heading: 0.5 }, { heading: NaN }, { heading: Infinity },
    { zoom: 0.64 }, { zoom: 2.26 }, { zoom: NaN }, { zoom: Infinity },
  ])('shows an explicit failure for invalid camera options %j', async (options) => {
    game = await startPagesGame(container(), options)
    expect(game.inspect()).toMatchObject({ state: 'failed', code: 'CAMERA_CONFIG', instances: [] })
    expect(element('load-status').textContent).toContain('Unable to start (CAMERA_CONFIG)')
    expect(element('dispatch').disabled).toBe(true)
    expect(element('reload').hidden).toBe(false)
    element('reload').click()
    expect(document.defaultView.location.reload).toHaveBeenCalledTimes(1)
    expect(document.frames.size).toBe(0)
  })

  it('dispatches by marker hit, completes repair and resets the same seed', async () => {
    game = await startPagesGame(container())
    const initial = game.inspect().world
    pointer(game.inspect().fault!)
    document.frame(0)
    expect(game.inspect().world.player.mode).toBe('walking')
    expect(game.inspect().route.length).toBeGreaterThan(0)
    advance(300, 1)
    expect(game.inspect().world.fault).toMatchObject({ status: 'resolved', progress: 1 })
    expect(game.inspect().instances.find((instance) => instance.id === 'fault/coolant')?.visible).toBe(false)
    element('restart').click()
    document.frame(11_000)
    expect(game.inspect().world).toEqual(initial)
    expect(game.inspect().route).toEqual([])
    expect(game.inspect().instances.find((instance) => instance.id === 'actor/technician')).toMatchObject({
      position: [2, 0, 7], yaw: 0, clip: null, time: 0,
    })
  })

  it('picks floor movement instead of dispatching and ignores non-primary clicks', async () => {
    game = await startPagesGame(container())
    const camera = game.inspect().camera!
    const { Matrix4 } = await import('three')
    const point = new Vector3(2, 0, 8)
      .applyMatrix4(new Matrix4().fromArray(camera.matrixWorld).invert())
      .applyMatrix4(new Matrix4().fromArray(camera.projection))
    const screen = { x: (point.x + 1) * 400, y: (1 - point.y) * 300 }
    pointer(screen, 2)
    document.frame(0)
    expect(game.inspect().world.player.mode).toBe('idle')
    pointer(screen)
    advance(6, 1)
    expect(game.inspect().world.player.cell).toEqual({ x: 2, z: 8 })
    expect(game.inspect().world.fault.status).toBe('fault')
    expect(document.activeElement).toBe(element('play-surface'))
  })

  it('wires held movement, camera controls, pause and resume', async () => {
    game = await startPagesGame(container())
    const initialCell = game.inspect().world.player.cell
    key('ArrowRight')
    advance(6)
    key('ArrowRight', 'keyup')
    expect(game.inspect().world.player.cell).not.toEqual(initialCell)
    key('e')
    key('+')
    expect(game.inspect().camera).toMatchObject({ heading: 1, zoom: 1.15 })
    key('Home')
    expect(game.inspect().camera).toMatchObject({ heading: 0, zoom: 1 })
    key(' ')
    document.frame(300)
    const tick = game.inspect().world.clock.tick
    expect(element('shift-state').textContent).toBe('Paused')
    document.frame(500)
    expect(game.inspect().world.clock.tick).toBe(tick)
    element('pause').click()
    document.frame(600)
    document.frame(700)
    expect(game.inspect().world.clock.tick).toBeGreaterThan(tick)
  })

  it('gates hidden input and rendering and resumes without a clock backlog', async () => {
    document.visibility('hidden')
    game = await startPagesGame(container())
    const initial = game.inspect().world
    expect(element('dispatch').disabled).toBe(true)
    key('f')
    key('e')
    pointer(game.inspect().fault!)
    advance(30)
    expect(game.inspect().world).toEqual(initial)
    expect(game.inspect().camera?.heading).toBe(0)
    expect(gpu.render).toHaveBeenCalledTimes(1)
    document.visibility('visible')
    document.frame(10_000)
    expect(game.inspect().world.clock.tick).toBe(0)
    document.frame(10_100)
    expect(game.inspect().world.clock.tick).toBe(3)
    expect(element('dispatch').disabled).toBe(false)
    resized!()
    expect(gpu.render).toHaveBeenCalledTimes(4)
  })

  it('returns immutable instance, actor sightline and route inspection data', async () => {
    game = await startPagesGame(container())
    const snapshot = game.inspect()
    expect(Object.isFrozen(snapshot)).toBe(true)
    expect(Object.isFrozen(snapshot.instances[0].position)).toBe(true)
    expect(snapshot.instances.filter((instance) => instance.assetId === 'rack-standard')).toHaveLength(32)
    expect(snapshot.actorSightline?.firstInstance).toBe('actor/technician')
    expect(snapshot.instances.find((instance) => instance.id === 'actor/technician')?.nodes.length).toBeGreaterThan(0)
  })

  it.each(['render', 'finish'] as const)('fails closed and frees the scene when startup %s fails', async (stage) => {
    gpu[stage].mockImplementation(() => { throw new Error('GPU unavailable') })
    const dispose = vi.spyOn(BufferGeometry.prototype, 'dispose')
    game = await startPagesGame(container(), { diagnostics: true })
    expect(game.inspect()).toMatchObject({ state: 'failed', code: 'APPLICATION_LOAD', instances: [] })
    expect(dispose).toHaveBeenCalled()
    expect(gpu.dispose).toHaveBeenCalledTimes(1)
    expect(document.frames.size).toBe(0)
    expect(element('dispatch').disabled).toBe(true)
    expect(game.diagnostics.snapshot().interruptions).toContainEqual(expect.objectContaining({ kind: 'error', detail: 'GPU unavailable' }))
    game.dispose()
    expect(gpu.dispose).toHaveBeenCalledTimes(1)
  })

  it('stops gameplay and exposes reload when a running context is lost', async () => {
    game = await startPagesGame(container())
    const event = new Event('webglcontextlost', { cancelable: true })
    element('play-surface').dispatchEvent(event)
    expect(event.defaultPrevented).toBe(true)
    expect(game.inspect()).toMatchObject({ state: 'failed', code: 'CONTEXT_LOST', instances: [] })
    expect(element('reload').hidden).toBe(false)
    expect(document.frames.size).toBe(0)
  })

  it('disposes idempotently on pagehide and removes input, RAF and resize work', async () => {
    game = await startPagesGame(container())
    const renderCount = gpu.render.mock.calls.length
    document.defaultView.dispatchEvent(new Event('pagehide'))
    game.dispose()
    game.dispose()
    key('e')
    element('dispatch').click()
    document.visibility('hidden')
    document.frame(1000)
    resized!()
    expect(game.inspect()).toMatchObject({ state: 'disposed', instances: [], world: { clock: { tick: 0 } } })
    expect(gpu.dispose).toHaveBeenCalledTimes(1)
    expect(disconnect).toHaveBeenCalledTimes(1)
    expect(gpu.render).toHaveBeenCalledTimes(renderCount)
    expect(document.frames.size).toBe(0)
  })
})
