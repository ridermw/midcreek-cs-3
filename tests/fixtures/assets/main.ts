import { BufferGeometry, Material, Scene, Texture, WebGLRenderer } from 'three'
import { createApplicationLifecycle } from '../../../src/app/lifecycle'
import type { ApplicationLifecycle, ApplicationLifecycleOptions } from '../../../src/app/lifecycle'
import { createGltfLoader } from '../../../src/assets/library'
import type { AssetLibrary } from '../../../src/assets/library'
import { createAssetInstance } from '../../../src/assets/instance'
import type { AssetInstance } from '../../../src/assets/instance'
import type { AssetManifest } from '../../../src/assets/contracts'
import { validateJoin } from '../../../src/assets/validate'
import { createSession } from '../../../src/app/session'
import { createCamera } from '../../../src/camera/controller'
import { bindGameInput } from '../../../src/input/browser'
import { createPlacements } from '../../../src/world/layout'

const canvas = document.querySelector<HTMLCanvasElement>('#surface')!
const status = document.querySelector<HTMLElement>('#status')!
const dispatch = document.querySelector<HTMLButtonElement>('#dispatch')!
const reload = document.querySelector<HTMLButtonElement>('#reload')!
const params = new URLSearchParams(location.search)
const renderer = new WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true })
const contextLoss = renderer.getContext().getExtension('WEBGL_lose_context')
renderer.setSize(640, 360)
renderer.setClearColor(0x000000)
const camera = createCamera(640, 360)
const scene = new Scene()
const session = createSession({ identity: 'u6-production-module-fixture' })
const instances = new Map<string, AssetInstance>()
const events: string[] = []
const disposal = { geometry: 0, material: 0, texture: 0, bitmap: 0 }
let decodedImages = 0
const decodeImage = globalThis.createImageBitmap.bind(globalThis)
function trackDecode(image: ImageBitmapSource, options?: ImageBitmapOptions): Promise<ImageBitmap>
function trackDecode(image: ImageBitmapSource, sx: number, sy: number, sw: number, sh: number, options?: ImageBitmapOptions): Promise<ImageBitmap>
async function trackDecode(image: ImageBitmapSource, optionsOrX?: ImageBitmapOptions | number, sy?: number, sw?: number, sh?: number, options?: ImageBitmapOptions) {
  const bitmap = typeof optionsOrX === 'number'
    ? await decodeImage(image, optionsOrX, sy!, sw!, sh!, options)
    : await decodeImage(image, optionsOrX)
  decodedImages++
  return bitmap
}
globalThis.createImageBitmap = trackDecode
const disposed = new WeakSet<object>()
let duplicateDisposals = 0
for (const [prototype, key] of [
  [BufferGeometry.prototype, 'geometry'], [Material.prototype, 'material'], [Texture.prototype, 'texture'],
] as const) {
  const originalDispose = prototype.dispose
  prototype.dispose = function () {
    if (disposed.has(this)) duplicateDisposals++
    disposed.add(this)
    disposal[key]++
    originalDispose.call(this)
  }
}
const originalClose = ImageBitmap.prototype.close
ImageBitmap.prototype.close = function () {
  if (disposed.has(this)) duplicateDisposals++
  disposed.add(this)
  disposal.bitmap++
  originalClose.call(this)
}
let library: AssetLibrary | undefined
let releaseAttach: (() => void) | undefined
let releaseRaf: (() => void) | undefined
let failures = 0
let finishes = 0
let reloads = 0
const manifest = await fetch(`./manifest.json${location.search}`).then((response) => response.json()) as AssetManifest
const loader = createGltfLoader('/midcreek-cs-3/')
const detach = () => {
  session.setReady(false)
  dispatch.disabled = true
  for (const instance of instances.values()) {
    scene.remove(instance.root)
    instance.dispose()
  }
  instances.clear()
}
const render = () => {
  renderer.render(scene, camera)
  return { calls: renderer.info.render.calls, triangles: renderer.info.render.triangles }
}
const attachInstances = (loaded: AssetLibrary, target: Map<string, AssetInstance>) => {
  const placements = createPlacements(session.snapshot())
  validateJoin(placements, loaded.manifest.assets.map((entry) => entry.shape))
  for (const placement of placements) {
    const instance = createAssetInstance(placement.instanceId, loaded.acquire(placement.assetId))
    instance.setPlacement(placement.position, placement.yaw)
    instance.root.visible = placement.visible
    if (placement.assetId === 'technician-man') instance.present('Idle')
    target.set(placement.instanceId, instance)
    scene.add(instance.root)
  }
}
let replacement: ApplicationLifecycle | undefined
const replacementInstances = new Map<string, AssetInstance>()
const lifecycleOptions: ApplicationLifecycleOptions = {
  manifest,
  loader,
  requiredLoadDeadlineMs: Number(params.get('deadline') ?? 30_000),
  contextTarget: canvas,
  isContextLost: () => renderer.getContext().isContextLost(),
  showLoading: () => { status.textContent = 'Loading'; events.push('loading') },
  showReady: () => { session.setReady(true); status.textContent = 'Ready'; events.push('ready') },
  showFailure: (error, action) => {
    session.setReady(false)
    dispatch.disabled = true
    failures++
    status.textContent = error.code
    reload.hidden = false
    reload.onclick = action
  },
  reload: () => { reloads++ },
  attach: async (loaded, generation) => {
    library = loaded
    events.push('attach-enter')
    if (params.has('attachDelay')) await new Promise<void>((resolve) => { releaseAttach = resolve })
    if (!generation.isActive()) { events.push('stale-attach'); return }
    attachInstances(loaded, instances)
    const second = createAssetInstance('actor/second', loaded.acquire('technician-man'))
    second.setPlacement({ x: 3, y: 0, z: 7 }, 0)
    second.present('Repair')
    instances.set(second.instanceId, second)
    scene.add(second.root)
    if (params.has('attachThrow')) throw new Error('attachment exception')
    events.push('attached')
    return detach
  },
  detach,
  renderFirstFrame: () => {
    events.push('render')
    if (params.has('renderThrow')) throw new Error('render exception')
    return params.has('empty') ? { calls: 0, triangles: 0 } : render()
  },
  finishGpu: () => { renderer.getContext().finish(); finishes++; events.push('gpu') },
  installInteractive: () => {
    events.push('interactive')
    dispatch.disabled = false
    const binding = bindGameInput(canvas, session, { orbit() {}, zoom() {}, resetView() {} })
    const onDispatch = () => session.enqueue({ type: 'dispatch' })
    dispatch.addEventListener('click', onDispatch)
    return () => {
      session.setReady(false)
      dispatch.disabled = true
      binding.dispose()
      dispatch.removeEventListener('click', onDispatch)
    }
  },
  nextAnimationFrame: async () => {
    if (params.has('rafDelay')) await new Promise<void>((resolve) => { releaseRaf = resolve })
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
    events.push('raf')
  },
}
const lifecycle = createApplicationLifecycle(lifecycleOptions)
const fixture = {
  state: () => lifecycle.state,
  details: () => ({
    state: lifecycle.state, code: lifecycle.error?.code, receipt: lifecycle.readyReceipt,
    ids: [...instances.keys()], events, failures, finishes, reloads,
    leases: library?.activeLeaseCount ?? 0, disposal: { ...disposal }, duplicateDisposals, decodedImages,
    replacement: { state: replacement?.state, ids: [...replacementInstances.keys()], interactive: session.isReady() },
    tick: session.snapshot().clock.tick, cell: session.snapshot().player.cell,
    poses: [...instances].filter(([id]) => id.startsWith('actor/')).map(([id, instance]) => ({
      id, time: instance.animationTime, y: instance.model.getObjectByName('Body')!.position.y,
      position: instance.root.position.toArray(),
    })),
  }),
  pixels: () => {
    render()
    const gl = renderer.getContext()
    const pixels = new Uint8Array(640 * 360 * 4)
    gl.readPixels(0, 0, 640, 360, gl.RGBA, gl.UNSIGNED_BYTE, pixels)
    let colored = 0
    for (let i = 0; i < pixels.length; i += 4) if (pixels[i]! + pixels[i + 1]! + pixels[i + 2]! > 20) colored++
    return colored
  },
  tick(count = 1) {
    for (let i = 0; i < count; i++) {
      const before = session.snapshot().clock.tick
      session.advanceTick()
      if (session.snapshot().clock.tick !== before) for (const instance of instances.values()) instance.advanceTick()
    }
  },
  removeFirst() {
    const first = instances.get('actor/technician')!
    scene.remove(first.root)
    first.dispose()
    instances.delete(first.instanceId)
    return render()
  },
  release: () => { releaseAttach?.(); releaseRaf?.() },
  loseContext: () => {
    if (!contextLoss) throw new Error('WEBGL_lose_context unavailable')
    contextLoss.loseContext()
  },
  restoreContext: () => {
    if (!contextLoss) throw new Error('WEBGL_lose_context unavailable')
    contextLoss.restoreContext()
  },
  async startReplacement() {
    lifecycle.dispose()
    const detachReplacement = () => {
      for (const instance of replacementInstances.values()) {
        scene.remove(instance.root)
        instance.dispose()
      }
      replacementInstances.clear()
    }
    replacement = createApplicationLifecycle({
      ...lifecycleOptions,
      requiredLoadDeadlineMs: 30_000,
      attach: (loaded) => { attachInstances(loaded, replacementInstances); return detachReplacement },
      detach: detachReplacement,
      nextAnimationFrame: () => new Promise<void>((done) => requestAnimationFrame(() => done())),
    })
    await replacement.start()
  },
  dispose: () => { lifecycle.dispose(); replacement?.dispose(); renderer.dispose() },
}
declare global { interface Window { assetFixture: typeof fixture } }
window.assetFixture = fixture
void lifecycle.start()
