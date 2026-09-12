import { Vector3 } from 'three'
import type { Object3D } from 'three'
import { ContractError } from '../assets/contracts'
import { cameraHeading } from '../camera/controller'
import { ISOMETRIC_CAMERA } from '../camera/isometricCamera'
import { createInspection } from '../diagnostics/inspection'
import { immutable } from '../diagnostics/metrics'
import type { FrameReceipt } from '../diagnostics/metrics'
import { createProceduralPresentation } from '../engine/proceduralPresentation'
import type { ProceduralPresentation } from '../engine/proceduralPresentation'
import { createRenderer } from '../engine/renderer'
import type { GameRenderer } from '../engine/renderer'
import { bindGameInput } from '../input/browser'
import { createHud } from '../ui/hud'
import type { WorldCommand, WorldSnapshot } from '../world/contracts'
import { createPlacements } from '../world/layout'
import type { GameHandle } from './game'
import type { ApplicationState, FrameResult } from './lifecycle'
import { createSession } from './session'

export interface PagesGameOptions {
  readonly seed?: number
  readonly scenario?: string
  readonly heading?: number
  readonly zoom?: number
  readonly diagnostics?: boolean
}

export async function startPagesGame(
  container: HTMLElement,
  options: PagesGameOptions = {},
): Promise<GameHandle> {
  const document = container.ownerDocument
  const window = document.defaultView!
  if (!window) throw new ContractError('GAME_WINDOW', 'play', 'a live document is required')
  const seed = options.seed ?? 417
  if (!Number.isSafeInteger(seed)) {
    throw new ContractError('SEED', String(seed), 'expected a finite safe integer')
  }
  let renderer: GameRenderer | undefined
  const session = createSession({
    identity: 'source-only-pages-demo-v1', seed, scenario: options.scenario,
    heading: () => renderer ? cameraHeading(renderer.camera) : 0,
  })
  const placements = new Map(createPlacements(session.snapshot()).map((placement) => [placement.instanceId, placement]))
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
  let presentation: ProceduralPresentation | undefined
  let input: ReturnType<typeof bindGameInput> | undefined
  let observer: ResizeObserver | undefined
  let state: ApplicationState = 'loading'
  let code: string | undefined
  let firstFrame: FrameResult | undefined
  let frameId = 0
  let disposed = false
  let restarting = false
  let hidden = document.visibilityState === 'hidden'
  const events = new AbortController()
  function command(command: WorldCommand) {
    if (hidden) return
    if (session.enqueue(command) && command.type === 'restart') restarting = true
  }
  const hud = createHud(panel, command, 'Ready - source-only public Three.js demo.')
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
  function release() {
    window.cancelAnimationFrame(frameId)
    input?.dispose()
    input = undefined
    events.abort()
    observer?.disconnect()
    observer = undefined
    session.setReady(false)
    presentation?.dispose()
    presentation = undefined
    renderer?.dispose()
    renderer = undefined
  }
  function fail(cause: unknown) {
    if (disposed || state === 'failed') return
    state = 'failed'
    code = cause instanceof ContractError ? cause.code : 'APPLICATION_LOAD'
    inspection.interrupt('error', cause instanceof Error ? cause.message : String(cause))
    release()
    hud.failure(code, () => window.location.reload())
    updateHud()
  }
  function visibility() {
    hidden = document.visibilityState === 'hidden'
    session.setVisible(!hidden)
    updateHud()
  }
  function render(trigger: FrameReceipt['trigger'], steps: readonly WorldSnapshot[] = []) {
    const view = renderer!
    const result = view.render()
    if (inspection.active()) {
      const frame = view.frameView()
      inspection.rendered(result, session.snapshot(), steps, trigger, frame.camera,
        inspection.dimensions(frame.logical, frame.applicationDpr))
    }
    return { calls: result.calls, triangles: result.triangles }
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
  try {
    const heading = options.heading ?? 0
    const zoom = options.zoom ?? 1
    if (!Number.isInteger(heading) || heading < 0 || heading > 3 || !Number.isFinite(zoom)
      || zoom < ISOMETRIC_CAMERA.zoom.minimum || zoom > ISOMETRIC_CAMERA.zoom.maximum) {
      throw new ContractError('CAMERA_CONFIG', 'play', 'heading 0..3 and zoom 0.65..2.25 required')
    }
    renderer = createRenderer(canvas)
    const view = renderer
    for (let i = 0; i < heading; i++) view.orbit(1)
    view.zoom(zoom - 1)
    canvas.addEventListener('webglcontextlost', (event) => {
      event.preventDefault()
      fail(new ContractError('CONTEXT_LOST', 'renderer', 'WebGL context was lost; reload required'))
    }, { signal: events.signal })
    presentation = createProceduralPresentation(session.snapshot())
    view.scene.add(presentation.root)
    const resize = () => {
      const rect = viewport.getBoundingClientRect()
      view.resize(rect.width, rect.height, Math.min(window.devicePixelRatio, 1.5))
      if (state === 'ready' && !hidden) render('resize')
    }
    const onResize = () => {
      if (disposed || state === 'failed') return
      try { resize() } catch (cause) { fail(cause) }
    }
    resize()
    observer = new ResizeObserver(onResize)
    observer.observe(viewport)
    window.addEventListener('resize', onResize, { signal: events.signal })
    window.addEventListener('pagehide', dispose, { once: true, signal: events.signal })
    firstFrame = render('startup')
    view.finishGpu()
    if (view.isContextLost()) throw new ContractError('CONTEXT_LOST', 'renderer', 'WebGL context was lost; reload required')
    input = bindGameInput(canvas, {
      ...session, isReady: () => session.isReady() && document.visibilityState !== 'hidden',
    }, view)
    canvas.addEventListener('pointerdown', (event) => {
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
    }, { signal: events.signal })
    document.addEventListener('visibilitychange', visibility, { signal: events.signal })
    hidden = document.visibilityState === 'hidden'
    session.setVisible(!hidden)
    session.setReady(true)
    state = 'ready'
    hud.ready()
    updateHud()
    // Source-only frames are observable, but do not claim an asset-qualified startup receipt.
    frameId = window.requestAnimationFrame(frame)
  } catch (cause) { fail(cause) }

  function inspect(): ReturnType<GameHandle['inspect']> {
    const actor = presentation?.instances.get('actor/technician')
    const point = actor ? renderer!.project(actor.position.clone().add(new Vector3(0, 1.15, 0))) : undefined
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
      state, code, world: session.snapshot(), firstFrame, camera: renderer?.inspect(),
      instances: [...(presentation?.instances.entries() ?? [])].map(([id, instance]) => {
        const assetId = placements.get(id)!.assetId
        const nodes: { name: string; position: number[]; quaternion: number[]; scale: number[] }[] = []
        if (assetId === 'technician-man') instance.traverse((node) => {
          nodes.push({ name: node.name, position: node.position.toArray(), quaternion: node.quaternion.toArray(), scale: node.scale.toArray() })
        })
        return {
          id, assetId, position: instance.position.toArray(), yaw: instance.rotation.y, visible: instance.visible,
          clip: null, time: 0, nodes,
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
    release()
    session.dispose()
    hud.dispose()
  }
  return { inspect, dispose, diagnostics: { snapshot: inspection.snapshot, stop: inspection.stop } }
}
