import { Vector3 } from 'three'
import type { Object3D } from 'three'
import { selectionAmendment } from '../../docs/architecture/cs3-provisional-development-use-2026-09-11.json'
import { AssetLoadError, ContractError } from '../assets/contracts'
import type { AssetManifest } from '../assets/contracts'
import { createGltfLoader, resolveAssetUrl } from '../assets/library'
import { validateManifest } from '../assets/validate'
import { loadReleaseManifest } from '../assets/releaseManifest'
import type { ReleaseManifestBinding } from '../assets/releaseManifest'
import { cameraHeading } from '../camera/controller'
import { ISOMETRIC_CAMERA } from '../camera/isometricCamera'
import { createPresentation } from '../engine/presentation'
import type { Presentation } from '../engine/presentation'
import { createRenderer } from '../engine/renderer'
import type { GameRenderer } from '../engine/renderer'
import { bindGameInput } from '../input/browser'
import { createHud } from '../ui/hud'
import type { WorldCommand } from '../world/contracts'
import { createApplicationLifecycle } from './lifecycle'
import type { ApplicationLifecycle, ApplicationState, FrameResult } from './lifecycle'
import { createSession } from './session'
import { createInspection } from '../diagnostics/inspection'
import type { FrameReceipt, ReadyReceipt as DiagnosticReady, RequiredRequest } from '../diagnostics/metrics'
import type { WorldSnapshot } from '../world/contracts'

export interface GameOptions {
  readonly seed?: number
  readonly scenario?: string
  readonly heading?: number
  readonly zoom?: number
  readonly baseUrl: string
  readonly manifestUrl?: string
  readonly releaseBinding?: ReleaseManifestBinding | null
  readonly diagnostics?: boolean
}

export function normalizeGameSeed(seed: number | undefined): number {
  const value = seed ?? 417
  if (!Number.isSafeInteger(value)) {
    throw new ContractError('SEED', String(value), 'expected a finite safe integer')
  }
  return value
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function immutable<T>(value: T): Readonly<T> {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) immutable(child)
    Object.freeze(value)
  }
  return value
}

export async function loadSelectedManifest(
  baseUrl: string, path: string, signal: AbortSignal,
  onSelection?: (identity: DiagnosticReady['identity'], requests: readonly RequiredRequest[]) => void,
): Promise<AssetManifest> {
  const pointerUrl = resolveAssetUrl(baseUrl, path)
  if (!['localhost', '127.0.0.1', '[::1]'].includes(new URL(pointerUrl).hostname)) {
    throw new AssetLoadError('LOCAL_ONLY', 'selection', 'provisional assets are authorized for local use only')
  }
  async function request(url: string) {
    const response = await fetch(url, { signal, redirect: 'error', cache: 'no-store' })
    if (!response.ok) throw new AssetLoadError('HTTP', 'selection', `request returned ${response.status}`)
    const bytes = await response.arrayBuffer()
    if (bytes.byteLength > 8_388_608) throw new AssetLoadError('MANIFEST_SIZE', 'selection', 'JSON exceeds the local manifest limit')
    return bytes
  }
  function json(bytes: ArrayBuffer): unknown {
    try { return JSON.parse(new TextDecoder().decode(bytes)) } catch {
      throw new AssetLoadError('MANIFEST_JSON', 'selection', 'expected valid JSON')
    }
  }
  const pointerBytes = await request(pointerUrl)
  const pointer = json(pointerBytes)
  const binding = selectionAmendment.binding
  if (!record(pointer) || pointer.schema !== 1 || pointer.kind !== 'cs3-asset-pointer'
    || pointer.qualification !== 'provisional-development'
    || pointer.libraryDigest !== binding.libraryDigest || pointer.manifestSha256 !== binding.manifestSha256
    || pointer.manifest !== `packages/${binding.libraryDigest}/manifest.json`) {
    throw new AssetLoadError('SELECTION', 'selection', 'pointer does not match the authorized immutable development package')
  }
  const bytes = await request(resolveAssetUrl(baseUrl, pointer.manifest))
  const digest = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))]
    .map((byte) => byte.toString(16).padStart(2, '0')).join('')
  if (digest !== pointer.manifestSha256) throw new AssetLoadError('MANIFEST_HASH', 'selection', 'manifest bytes changed')
  const manifest = json(bytes)
  // The existing U6 validator is the runtime boundary; never pass unvalidated JSON to play.
  try { validateManifest(manifest as AssetManifest) } catch (cause) {
    if (cause instanceof ContractError) throw cause
    throw new AssetLoadError('MANIFEST_SCHEMA', 'selection', 'malformed manifest structure')
  }
  const validated = manifest as AssetManifest
  if (validated.libraryDigest !== binding.libraryDigest || validated.profile !== binding.profile
    || validated.assets.some((entry) => entry.file !== `packages/${binding.libraryDigest}/${entry.id}.glb`)) {
    throw new AssetLoadError('PACKAGE_BINDING', 'selection', 'manifest escaped the authorized package/profile')
  }
  const selectionSha256 = [...new Uint8Array(await crypto.subtle.digest('SHA-256', pointerBytes))]
    .map((byte) => byte.toString(16).padStart(2, '0')).join('')
  const assets = validated.assets.map((entry) => ({ url: resolveAssetUrl(baseUrl, entry.file), sha256: entry.sha256 }))
  onSelection?.({
    selectionSha256, manifestSha256: digest, libraryDigest: validated.libraryDigest,
    profile: validated.profile, profileSha256: binding.profileSha256, recipeSha256: binding.recipeSha256, assets,
  }, [
    { url: pointerUrl, role: 'selection', sha256: selectionSha256 },
    { url: resolveAssetUrl(baseUrl, pointer.manifest), role: 'manifest', sha256: digest },
    ...assets.map((entry) => ({ ...entry, role: 'asset' as const })),
  ])
  return validated
}

export async function startGame(container: HTMLElement, options: GameOptions) {
  const document = container.ownerDocument
  const window = document.defaultView!
  if (!window) throw new ContractError('GAME_WINDOW', 'play', 'a live document is required')
  const canvas = document.createElement('canvas')
  canvas.id = 'play-surface'
  canvas.tabIndex = 0
  canvas.setAttribute('aria-label', 'Data hall. Arrow keys or WASD to move; F to dispatch; Q and E to orbit.')
  const viewport = document.createElement('div')
  viewport.className = 'viewport'
  viewport.append(canvas)
  const panel = document.createElement('section')
  panel.className = 'hud'
  panel.setAttribute('aria-label', 'Shift controls')
  container.replaceChildren(viewport, panel)
  const inspection = createInspection(document, canvas)
  if (!options.diagnostics) inspection.stop()
  let renderer: GameRenderer | undefined
  let presentation: Presentation | undefined
  let lifecycle: ApplicationLifecycle | undefined
  let state: ApplicationState = 'loading'
  let code: string | undefined
  let firstFrame: FrameResult | undefined
  let frameId = 0
  let disposed = false
  let restarting = false
  let hidden = document.visibilityState === 'hidden'
  const events = new AbortController()
  const loading = new AbortController()
  const seed = normalizeGameSeed(options.seed)
  const session = createSession({
    identity: selectionAmendment.binding.libraryDigest,
    seed,
    scenario: options.scenario,
    heading: () => renderer ? cameraHeading(renderer.camera) : 0,
  })
  function command(command: WorldCommand) {
    if (hidden) return
    if (session.enqueue(command) && command.type === 'restart') restarting = true
  }
  const hud = createHud(panel, command)
  let lastWorld = session.snapshot()
  let lastState: ApplicationState = state
  let lastHidden = hidden
  hud.render(lastWorld, state, hidden)
  function updateHud() {
    const world = session.snapshot()
    if (world !== lastWorld || state !== lastState || hidden !== lastHidden) {
      hud.render(world, state, hidden)
      lastWorld = world; lastState = state; lastHidden = hidden
    }
  }
  let observer: ResizeObserver | undefined
  window.addEventListener('pagehide', dispose, { once: true, signal: events.signal })
  function release() {
    window.cancelAnimationFrame(frameId)
    session.setReady(false)
    presentation?.dispose()
    presentation = undefined
  }
  function fail(cause: unknown) {
    if (disposed || state === 'failed') return
    state = 'failed'
    code = cause instanceof ContractError ? cause.code : 'APPLICATION_LOAD'
    inspection.interrupt('error', cause instanceof Error ? cause.message : String(cause))
    loading.abort()
    release()
    lifecycle?.dispose()
    renderer?.dispose()
    observer?.disconnect()
    events.abort()
    hud.failure(code, () => window.location.reload())
    updateHud()
  }
  const started = performance.now()
  const deadline = window.setTimeout(() => fail(new AssetLoadError('LOAD_TIMEOUT', 'play', 'required readiness deadline exceeded')), 30_000)
  try {
    const heading = options.heading ?? 0
    const zoom = options.zoom ?? 1
    if (!Number.isInteger(heading) || heading < 0 || heading > 3 || !Number.isFinite(zoom)
      || zoom < ISOMETRIC_CAMERA.zoom.minimum || zoom > ISOMETRIC_CAMERA.zoom.maximum) {
      throw new ContractError('CAMERA_CONFIG', 'play', 'heading 0..3 and zoom 0.65..2.25 required')
    }
    const manifest = options.releaseBinding !== undefined
      ? await loadReleaseManifest(options.baseUrl, options.releaseBinding, loading.signal, inspection.bind)
      : await loadSelectedManifest(
        options.baseUrl, options.manifestUrl ?? 'development/selection.json', loading.signal, inspection.bind,
      )
    if (loading.signal.aborted) throw new AssetLoadError('LOAD_ABORTED', 'play', 'selection no longer active')
    renderer = createRenderer(canvas)
    const view = renderer
    for (let i = 0; i < heading; i++) view.orbit(1)
    view.zoom(zoom - 1)
    const resize = () => {
      if (disposed || state === 'failed') return
      try {
        const rect = viewport.getBoundingClientRect()
        view.resize(rect.width, rect.height, Math.min(window.devicePixelRatio, 1.5))
        if (state === 'ready' && !hidden) render('resize')
      } catch (cause) { fail(cause) }
    }
    resize()
    observer = new ResizeObserver(resize)
    observer.observe(viewport)
    window.addEventListener('resize', resize, { signal: events.signal })
    lifecycle = createApplicationLifecycle({
      manifest, loader: createGltfLoader(options.baseUrl),
      requiredLoadDeadlineMs: Math.max(1, 30_000 - (performance.now() - started)),
      contextTarget: canvas, isContextLost: view.isContextLost,
      showLoading: () => hud.loading(),
      showFailure: fail,
      showReady: (receipt) => {
        firstFrame = receipt.firstFrame
        state = 'ready'
        hidden = document.visibilityState === 'hidden'
        session.setVisible(!hidden)
        session.setReady(true)
        hud.ready()
        updateHud()
        const interactiveAt = performance.now()
        inspection.markReady(session.snapshot(), { ...receipt, readyAt: interactiveAt, interactiveAt })
        frameId = window.requestAnimationFrame(frame)
      },
      attach: (library, generation) => {
        const attached = createPresentation(library, session.snapshot())
        generation.onCleanup(() => { attached.dispose(); session.setReady(false) })
        presentation = attached
        view.scene.add(attached.root)
      },
      renderFirstFrame: () => render('startup'), finishGpu: view.finishGpu,
      nextAnimationFrame: () => new Promise<void>((resolve) => { frameId = window.requestAnimationFrame(() => resolve()) }),
      installInteractive: () => {
        const input = bindGameInput(canvas, {
          ...session, isReady: () => session.isReady() && document.visibilityState !== 'hidden',
        }, view)
        const pointer = (event: PointerEvent) => {
          if (event.button !== 0 || !session.isInteractive()) return
          canvas.focus()
          const rect = canvas.getBoundingClientRect()
          const x = event.clientX - rect.left
          const y = event.clientY - rect.top
          if (presentation?.marker.visible && view.hits(x, y).some((hit) => hit.object === presentation?.marker)) {
            command({ type: 'dispatch' })
          } else {
            const cell = view.pick(x, y)
            if (cell) command({ type: 'move', cell })
          }
        }
        canvas.addEventListener('pointerdown', pointer)
        document.addEventListener('visibilitychange', visibility, { signal: events.signal })
        return () => { input.dispose(); canvas.removeEventListener('pointerdown', pointer); session.setReady(false) }
      },
    })
    await lifecycle.start()
  } catch (cause) {
    fail(cause)
  } finally {
    window.clearTimeout(deadline)
  }

  function visibility() {
    hidden = document.visibilityState === 'hidden'
    session.setVisible(!hidden)
    updateHud()
  }
  function frame(now: number) {
    if (state !== 'ready' || disposed) return
    try {
      const steps = session.pump(now)
      for (const snapshot of steps) presentation!.present(snapshot)
      if (restarting) { presentation!.reset(session.snapshot()); restarting = false }
      else presentation!.present(session.snapshot())
      updateHud()
      if (!hidden) render('raf', steps)
      frameId = window.requestAnimationFrame(frame)
    } catch (cause) { fail(cause) }
  }
  function render(trigger: FrameReceipt['trigger'], steps: readonly WorldSnapshot[] = []) {
    const view = renderer!
    const result = view.render()
    if (inspection.active()) {
      const state = view.frameView()
      inspection.rendered(result, session.snapshot(), steps, trigger, state.camera,
        inspection.dimensions(state.logical, state.applicationDpr))
    }
    return { calls: result.calls, triangles: result.triangles }
  }
  function inspect() {
    const actor = presentation?.instances.get('actor/technician')
    const point = actor ? renderer!.project(actor.root.position.clone().add(new Vector3(0, 1.15, 0))) : undefined
    let firstInstance: string | undefined
    if (point) {
      const hit = renderer!.hits(point.x, point.y)[0]
      let node: Object3D | null = hit?.object ?? null
      while (node) {
        if (presentation!.instances.has(node.name)) { firstInstance = node.name; break }
        node = node.parent
      }
    }
    const routePoints: { x: number; y: number }[] = []
    if (presentation?.route.visible) {
      const positions = presentation.route.geometry.getAttribute('position')
      for (let i = 1; i < positions.count; i++) {
        routePoints.push(renderer!.project(new Vector3().fromBufferAttribute(positions, i)))
      }
    }
    return immutable({
      state, code, world: session.snapshot(), firstFrame,
      camera: renderer?.inspect(),
      instances: [...(presentation?.instances.values() ?? [])].map((instance) => {
        const nodes: { name: string; position: number[]; quaternion: number[]; scale: number[] }[] = []
        if (instance.assetId === 'technician-man') instance.model.traverse((node) => {
          nodes.push({ name: node.name, position: node.position.toArray(), quaternion: node.quaternion.toArray(), scale: node.scale.toArray() })
        })
        return {
          id: instance.instanceId, assetId: instance.assetId, position: instance.root.position.toArray(),
          yaw: instance.root.rotation.y, visible: instance.root.visible,
          clip: instance.currentClip, time: instance.animationTime, nodes,
        }
      }),
      route: routePoints,
      fault: presentation ? renderer!.project(presentation.marker.position) : undefined,
      actorSightline: point ? { point, firstInstance } : undefined,
    })
  }
  function dispose() {
    if (disposed) return
    disposed = true
    inspection.dispose()
    state = 'disposed'
    loading.abort()
    release()
    lifecycle?.dispose()
    session.dispose()
    events.abort()
    observer?.disconnect()
    hud.dispose()
    renderer?.dispose()
  }
  return { inspect, dispose, diagnostics: {
    snapshot: inspection.snapshot, stop: inspection.stop,
  } }
}

export type GameHandle = Awaited<ReturnType<typeof startGame>>
