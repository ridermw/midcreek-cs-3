import type { GameHandle } from '../src/app/game.ts'
import type { Interruption, WorkloadAction } from '../src/diagnostics/metrics.ts'
import type { NativeRecipe, createNativeWorkload } from './qualificationWorkload.ts'

export interface NativePageCapture {
  done: boolean
  actions: WorkloadAction[]
  interruptions: Interruption[]
  resizeRequests: { beforeRender: number; viewport: readonly [number, number]; requestedAt: number; completedAt?: number }[]
  windowPositions: { at: number; x: number; y: number }[]
  stop(): void
}
declare global {
  interface Window {
    midcreek: GameHandle
    u8Native: NativePageCapture
    u8Resize(width: number, height: number): Promise<void>
  }
}

// Installed before navigation; observes native RAF/ResizeObserver, never replaces clocks or render callbacks.
export function installNativeWorkload(factory: typeof createNativeWorkload, recipe: NativeRecipe) {
  const driver = factory(recipe)
  const events = new AbortController()
  let seen = 0
  let raf = 0
  let observing = false
  let busy = false
  let observer: ResizeObserver | undefined
  let viewport: readonly [number, number] = [1280, 720]
  const state: NativePageCapture = window.u8Native = {
    done: false, actions: [], interruptions: [], resizeRequests: [], windowPositions: [],
    stop() {
      if (state.done) return
      state.done = true
      window.cancelAnimationFrame(raf)
      observer?.disconnect()
      events.abort()
      window.midcreek?.diagnostics.stop()
    },
  }
  const interrupt = (kind: string, detail: string) => {
    if (!state.done) state.interruptions.push({ at: performance.now(), kind, detail })
  }
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') interrupt('hidden', document.visibilityState)
  }, { signal: events.signal })
  window.addEventListener('blur', () => interrupt('background', 'window lost foreground focus'), { signal: events.signal })
  window.addEventListener('pagehide', () => interrupt('navigation', 'qualification page hidden/unloaded'), { signal: events.signal })
  window.addEventListener('error', (event) => interrupt('error', event.message), { signal: events.signal })
  window.addEventListener('unhandledrejection', (event) => interrupt('error', String(event.reason)), { signal: events.signal })
  if (document.visibilityState !== 'visible') interrupt('hidden', 'document initially hidden')
  if (!document.hasFocus()) interrupt('background', 'document initially unfocused')

  function observe() {
    if (state.done || busy || !window.midcreek) return
    busy = true
    try {
      const captured = window.midcreek.diagnostics.snapshot()
      if (!captured.ready) {
        const application = window.midcreek.inspect()
        if (application.state === 'failed') {
          interrupt('startup-error', application.code ?? 'application failed before readiness')
          state.stop()
        }
        return
      }
      const canvas = document.querySelector('canvas')!
      if (!observing) {
        observing = true
        observer = new ResizeObserver(observe)
        observer.observe(canvas.parentElement!)
        window.addEventListener('resize', observe, { signal: events.signal })
      }
      const lastPosition = state.windowPositions.at(-1)
      if (!lastPosition || lastPosition.x !== window.screenX || lastPosition.y !== window.screenY) {
        state.windowPositions.push({ at: performance.now(), x: window.screenX, y: window.screenY })
        if (lastPosition) interrupt('display-position', 'window moved during capture')
      }
      for (const frame of captured.frames.slice(seen)) {
        seen++
        for (const directive of driver.observe(frame)) {
          if (frame.renderCount !== captured.frames.length) {
            interrupt('workload-boundary', `action due before render ${directive.beforeRender}, observed after ${captured.frames.length}`)
          }
          const beforeRender = captured.frames.length + 1
          if (directive.type === 'stop') {
            state.stop()
            break
          }
          if (directive.type === 'move') {
            const cell = directive.cell!
            const camera = captured.frames.at(-1)!.camera
            const m = camera.matrixWorld, p = camera.projection
            const dx = cell.x - m[12]!, dy = -m[13]!, dz = cell.z - m[14]!
            const x = dx * m[0]! + dy * m[1]! + dz * m[2]!
            const y = dx * m[4]! + dy * m[5]! + dz * m[6]!
            const z = dx * m[8]! + dy * m[9]! + dz * m[10]!
            const w = p[3]! * x + p[7]! * y + p[11]! * z + p[15]!
            const rect = canvas.getBoundingClientRect()
            const clientX = rect.left + ((p[0]! * x + p[4]! * y + p[8]! * z + p[12]!) / w + 1) * rect.width / 2
            const clientY = rect.top + (1 - (p[1]! * x + p[5]! * y + p[9]! * z + p[13]!) / w) * rect.height / 2
            if (clientX < rect.left || clientX >= rect.right || clientY < rect.top || clientY >= rect.bottom) {
              throw new Error('WORKLOAD_POINTER: loop cell is outside canvas')
            }
            canvas.dispatchEvent(new PointerEvent('pointerdown', { button: 0, clientX, clientY, bubbles: true }))
            state.actions.push({ type: 'move', beforeRender, cell })
          } else if (directive.type === 'dispatch') {
            const button = document.querySelector<HTMLButtonElement>('#dispatch')
            if (!button || button.disabled) throw new Error('WORKLOAD_DISPATCH: enabled dispatch button required')
            button.click()
            state.actions.push({ type: 'dispatch', beforeRender })
          } else if (directive.type === 'view') {
            const heading = captured.frames.at(-1)!.camera.heading
            canvas.focus()
            for (let i = 0; i < (directive.heading - heading + 4) % 4; i++) {
              canvas.dispatchEvent(new KeyboardEvent('keydown', { key: 'e', bubbles: true }))
              canvas.dispatchEvent(new KeyboardEvent('keyup', { key: 'e', bubbles: true }))
            }
            if (viewport[0] !== directive.viewport[0] || viewport[1] !== directive.viewport[1]) {
              viewport = directive.viewport
              const request: NativePageCapture['resizeRequests'][number] = {
                beforeRender: directive.beforeRender, viewport, requestedAt: performance.now(),
              }
              state.resizeRequests.push(request)
              void window.u8Resize(viewport[0], viewport[1]).then(() => {
                request.completedAt = performance.now()
              }, (error: unknown) => {
                interrupt('resize-error', String(error))
                state.stop()
              })
            }
          }
        }
        if (state.done) break
      }
    } catch (error) {
      interrupt('workload-error', error instanceof Error ? error.message : String(error))
      state.stop()
    } finally {
      busy = false
    }
  }
  function poll() {
    observe()
    if (!state.done) raf = window.requestAnimationFrame(poll)
  }
  raf = window.requestAnimationFrame(poll)
}
