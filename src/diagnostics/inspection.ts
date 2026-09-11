import type { WorldSnapshot } from '../world/contracts'
import {
  freezeStartup, immutable, workloadPhases,
} from './metrics'
import type {
  Dimensions, FrameReceipt, Interruption, ReadyReceipt, RequiredRequest, ResourceReceipt, StartupReceipt,
} from './metrics'

export function createInspection(document: Document, canvas: HTMLCanvasElement) {
  const window = document.defaultView!
  const clock = window.performance
  const frames: FrameReceipt[] = []
  const interruptions: Interruption[] = []
  const listeners = new AbortController()
  let startup: StartupReceipt | undefined
  let ready: ReadyReceipt | undefined
  let required: RequiredRequest[] = []
  let identity: ReadyReceipt['identity'] | undefined
  let overflow = false
  let stopped = false
  const interrupt = (kind: string, detail: string) => {
    if (!stopped) interruptions.push(immutable({ at: clock.now(), kind, detail }))
  }
  clock.addEventListener('resourcetimingbufferfull', () => {
    overflow = true
    interrupt('resource-buffer-overflow', 'Resource Timing buffer filled')
  }, { signal: listeners.signal })
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') interrupt('hidden', document.visibilityState)
  }, { signal: listeners.signal })
  window.addEventListener('blur', () => interrupt('background', 'window lost foreground focus'), { signal: listeners.signal })
  window.addEventListener('error', (event) => interrupt('error', event.message), { signal: listeners.signal })
  window.addEventListener('unhandledrejection', (event) => interrupt('error', String(event.reason)), { signal: listeners.signal })
  if (document.visibilityState !== 'visible') interrupt('hidden', 'document initially hidden')

  function dimensions(logical: readonly [number, number], applicationDpr: number): Dimensions {
    const rect = canvas.getBoundingClientRect()
    return {
      viewport: [window.innerWidth, window.innerHeight], canvas: [rect.width, rect.height],
      logical, drawingBuffer: [canvas.width, canvas.height],
      deviceDpr: window.devicePixelRatio, applicationDpr,
    }
  }
  function resources(): ResourceReceipt[] {
    const navigation = clock.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined
    const entries = clock.getEntriesByType('resource') as PerformanceResourceTiming[]
    return [...(navigation ? [navigation] : []), ...entries].map((entry) => ({
      url: entry.name, startTime: entry.startTime, responseEnd: entry.responseEnd,
      transferSize: entry.transferSize, encodedBodySize: entry.encodedBodySize, decodedBodySize: entry.decodedBodySize,
      cache: entry.transferSize === 0 ? entry.decodedBodySize > 0 ? 'local' : 'unknown'
        : entry.transferSize < entry.encodedBodySize ? 'revalidated' : 'network',
      role: required.find((r) => r.url === entry.name)?.role ?? 'other',
      initiatorType: entry.initiatorType,
    }))
  }
  return {
    active: () => !stopped,
    dimensions,
    bind(binding: ReadyReceipt['identity'], requests: readonly RequiredRequest[]) {
      if (stopped) return
      if (startup || identity) throw new Error('DIAGNOSTICS_BINDING: selection can only bind once')
      identity = immutable(structuredClone(binding))
      const entryRequests: RequiredRequest[] = [{ url: window.location.href, role: 'html' }]
      for (const script of document.querySelectorAll<HTMLScriptElement>('script[src]')) {
        entryRequests.push({ url: script.src, role: 'script' })
      }
      for (const link of document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"],link[rel="modulepreload"]')) {
        entryRequests.push({ url: link.href, role: link.rel === 'stylesheet' ? 'style' : 'script' })
      }
      required = [...new Map([...entryRequests, ...requests].map((r) => [r.url, { ...r }])).values()]
    },
    rendered(
      result: { calls: number; triangles: number; renderCount: number; startedAt: number; completedAt: number },
      world: WorldSnapshot, worldSteps: readonly WorldSnapshot[], trigger: FrameReceipt['trigger'],
      camera: FrameReceipt['camera'], dimensions: Dimensions,
    ) {
      if (stopped) return
      frames.push(immutable({
        ...result, trigger, tick: world.clock.tick, simulationSeconds: world.clock.elapsedSeconds,
        mode: world.player.mode, cell: world.player.cell, path: world.player.path,
        fault: { status: world.fault.status, progress: world.fault.progress }, paused: world.paused,
        worldSteps: [...worldSteps], camera, dimensions,
        visible: document.visibilityState === 'visible', focused: document.hasFocus(),
      }))
    },
    markReady(world: WorldSnapshot, receipt: {
      generation: number; readyAt: number; interactiveAt: number; gpuFinishedAt: number
    }) {
      if (stopped) return
      if (!identity || !frames[0] || startup) throw new Error('DIAGNOSTICS_READY: binding and real first render required exactly once')
      const firstFrame = frames[0]
      const entries = resources()
      const navigation = clock.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined
      startup = freezeStartup({
        origin: window.location.origin, timeOrigin: clock.timeOrigin, readyAt: receipt.readyAt,
        loadEventEnd: navigation?.loadEventEnd ?? 0, required, resources: entries,
        pending: required.filter((r) => !entries.some((e) => e.url === r.url && e.responseEnd > 0 && e.responseEnd <= receipt.readyAt)).map((r) => r.url),
        overflow,
      })
      ready = immutable({
        generation: receipt.generation,
        readyAt: receipt.readyAt, interactiveAt: receipt.interactiveAt, gpuFinishedAt: receipt.gpuFinishedAt,
        timeOrigin: clock.timeOrigin, seed: world.seed, scenario: 'coolant-leak',
        firstFrame, identity, dimensions: firstFrame.dimensions,
      })
      clock.mark('cs3-interactive', { startTime: receipt.interactiveAt })
      clock.mark('cs3-ready', { startTime: receipt.readyAt })
    },
    interrupt,
    snapshot() {
      return immutable({ ready, startup, frames: [...frames], phases: workloadPhases(frames), interruptions: [...interruptions] })
    },
    stop() { stopped = true; listeners.abort() },
    dispose() {
      interrupt('disposed', 'application disposed before capture stopped')
      stopped = true
      listeners.abort()
    },
  }
}
