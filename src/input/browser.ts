import { ContractError } from '../assets/contracts'
import type { GameSession } from '../app/session'
import { movementForKey } from './keyboard'

export function bindGameInput(surface: HTMLElement, session: GameSession, camera: {
  orbit(step: -1 | 1): void
  zoom(delta: number): void
  resetView(): void
}): { dispose(): void } {
  const document = surface.ownerDocument
  const window = document.defaultView
  if (!window) throw new ContractError('INPUT_WINDOW', 'play', 'surface has no live document window')
  const controller = new AbortController()
  const { signal } = controller
  const guarded = (target: EventTarget | null) => target instanceof Element
    && target.closest('button, a, input, select, textarea, [contenteditable]') !== null

  window.addEventListener('keydown', (event) => {
    if (guarded(event.target) || event.ctrlKey || event.metaKey || event.altKey || !session.isReady()) return
    const key = event.key.length === 1 ? event.key.toLowerCase() : event.key
    if (movementForKey(key, 0)) {
      if (session.isInteractive()) {
        session.held.keyDown(key, event.repeat)
        event.preventDefault()
      }
      return
    }
    if (event.repeat) return
    const actions: Record<string, () => void> = {
      q: () => camera.orbit(-1),
      e: () => camera.orbit(1),
      f: () => { session.enqueue({ type: 'dispatch' }) },
      ' ': () => { session.enqueue({ type: 'pause' }) },
      Home: camera.resetView,
      '+': () => camera.zoom(0.15),
      '-': () => camera.zoom(-0.15),
    }
    const action = actions[key]
    if (action) {
      action()
      event.preventDefault()
    }
  }, { signal })
  window.addEventListener('keyup', (event) => session.held.keyUp(event.key), { signal })
  window.addEventListener('blur', () => session.held.clear('blur'), { signal })
  document.addEventListener('focusin', (event) => {
    if (guarded(event.target)) session.held.clear('focus')
  }, { signal })
  document.addEventListener('visibilitychange', () => {
    session.setVisible(document.visibilityState !== 'hidden')
  }, { signal })
  session.setVisible(document.visibilityState !== 'hidden')
  return {
    dispose() {
      controller.abort()
      session.held.clear('teardown')
    },
  }
}
