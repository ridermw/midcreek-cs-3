import { AssetLoadError, ContractError } from '../assets/contracts'
import type { AssetManifest } from '../assets/contracts'
import { loadAssetLibrary } from '../assets/library'
import type { AssetLibrary, AssetLoader } from '../assets/library'

export type ApplicationState = 'idle' | 'loading' | 'ready' | 'failed' | 'disposed'

export interface FrameResult {
  readonly calls: number
  readonly triangles: number
}

export interface ReadyReceipt {
  readonly generation: number
  readonly libraryDigest: string
  readonly firstFrame: FrameResult
  readonly readyAt: number
  readonly interactiveAt: number
  readonly gpuFinishedAt: number
  readonly timeOrigin: number
}

export interface ApplicationLifecycleOptions {
  readonly manifest: AssetManifest
  readonly loader: AssetLoader
  readonly requiredLoadDeadlineMs?: number
  readonly showLoading: () => void
  readonly showReady: (receipt: ReadyReceipt) => void
  readonly showFailure: (error: AssetLoadError, reload: () => void) => void
  // Async attachment must check isActive before mutation and return its own cleanup.
  readonly attach: (library: AssetLibrary, session: {
    readonly signal: AbortSignal
    readonly isActive: () => boolean
    readonly onCleanup: (cleanup: () => void) => void
  }) => void | (() => void) | Promise<void | (() => void)>
  readonly detach?: () => void
  readonly renderFirstFrame: () => FrameResult | Promise<FrameResult>
  readonly finishGpu: () => void | Promise<void>
  readonly installInteractive: () => void | (() => void)
  readonly nextAnimationFrame: () => void | Promise<void>
  readonly contextTarget?: EventTarget
  readonly isContextLost?: () => boolean
  readonly reload?: () => void
  readonly now?: () => number
}

function defaultNow(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now()
}

function lifecycleError(cause: unknown, fallbackCode: string): AssetLoadError {
  if (cause instanceof AssetLoadError) return cause
  if (cause instanceof ContractError) {
    return new AssetLoadError(cause.code, cause.subject, cause.message)
  }
  return new AssetLoadError(
    fallbackCode,
    'application',
    cause instanceof Error ? cause.message : String(cause),
  )
}

export interface ApplicationLifecycle {
  readonly state: ApplicationState
  readonly generation: number
  readonly error?: AssetLoadError
  readonly readyReceipt?: ReadyReceipt
  start(): Promise<void>
  dispose(): void
}

export function createApplicationLifecycle(
  options: ApplicationLifecycleOptions,
): ApplicationLifecycle {
  let state: ApplicationState = 'idle'
  let generation = 0
  let error: AssetLoadError | undefined
  let readyReceipt: ReadyReceipt | undefined
  let library: AssetLibrary | undefined
  let interactiveDispose: (() => void) | undefined
  let attachmentCleanups: (() => void)[] = []
  let attaching = false
  let attached = false
  let controller: AbortController | undefined
  let endStart: (() => void) | undefined
  let timeout: ReturnType<typeof setTimeout> | undefined
  let startTime = 0
  let failureShown = false
  let contextListener: ((event: Event) => void) | undefined

  const now = options.now ?? defaultNow
  const reload = () => {
    if (options.reload) {
      options.reload()
    } else if (typeof window !== 'undefined') {
      window.location.reload()
    }
  }

  const installContextListener = () => {
    if (!contextListener && options.contextTarget) {
      contextListener = (event) => {
        if (state !== 'loading' && state !== 'ready') return
        if (event.cancelable) event.preventDefault()
        fail(generation, new AssetLoadError(
          'CONTEXT_LOST',
          'renderer',
          'WebGL context was lost; reload to start a new application session',
        ))
      }
      options.contextTarget.addEventListener('webglcontextlost', contextListener)
    }
  }

  const removeContextListener = () => {
    if (contextListener && options.contextTarget) {
      options.contextTarget.removeEventListener('webglcontextlost', contextListener)
    }
    contextListener = undefined
  }

  const cleanup = (actions: readonly (() => void)[]) => {
    const errors: unknown[] = []
    for (const action of actions) {
      try { action() } catch (cause) { errors.push(cause) }
    }
    if (errors.length) {
      const cleanupError = new AggregateError(errors, 'Application cleanup failed')
      if (error) {
        error.cause = cleanupError
        error.message += '; cleanup failed'
      } else {
        error = lifecycleError(cleanupError, 'CLEANUP')
        error.cause = cleanupError
      }
    }
  }

  const releaseResources = () => {
    const input = interactiveDispose
    const attachments = attachmentCleanups
    const shouldDetach = attached || attaching
    interactiveDispose = undefined
    attachmentCleanups = []
    attached = false
    cleanup([
      () => input?.(),
      ...attachments.reverse(),
      () => { if (shouldDetach) options.detach?.() },
      () => {
        if (!library || (attaching && library.activeLeaseCount > 0)) return
        const ownedLibrary = library
        ownedLibrary.dispose()
        if (library === ownedLibrary) library = undefined
      },
    ])
  }

  const invalidate = () => {
    generation += 1
    clearTimeout(timeout)
    controller?.abort()
    controller = undefined
    removeContextListener()
    endStart?.()
    endStart = undefined
  }

  const fail = (token: number, nextError: AssetLoadError) => {
    if (token !== generation || state === 'disposed' || state === 'failed') return
    state = 'failed'
    error = nextError
    readyReceipt = undefined
    invalidate()
    const failedGeneration = generation
    releaseResources()
    if (generation !== failedGeneration || state !== 'failed') return
    if (!failureShown) {
      failureShown = true
      options.showFailure(nextError, reload)
    }
  }

  const assertActive = (token: number) => {
    if (token === generation && state === 'loading' && options.isContextLost?.()) {
      fail(token, new AssetLoadError('CONTEXT_LOST', 'renderer', 'WebGL context was lost; reload required'))
    }
    if (token === generation && state === 'loading'
      && now() - startTime >= (options.requiredLoadDeadlineMs ?? 30_000)) {
      fail(token, new AssetLoadError('LOAD_TIMEOUT', 'application', 'required readiness deadline exceeded'))
    }
    if (token !== generation || state !== 'loading') {
      throw new AssetLoadError('STALE_GENERATION', 'application', 'async continuation belongs to an inactive session')
    }
  }

  const lifecycle: ApplicationLifecycle = {
    get state() { return state },
    get generation() { return generation },
    get error() { return error },
    get readyReceipt() { return readyReceipt },
    async start() {
      if (state === 'loading' || state === 'ready' || state === 'failed') {
        throw new ContractError('LIFECYCLE_STATE', state, 'application session is already active')
      }
      if (state === 'disposed') {
        throw new ContractError('LIFECYCLE_DISPOSED', 'application', 'cannot start a disposed lifecycle')
      }
      generation += 1
      const token = generation
      state = 'loading'
      error = undefined
      readyReceipt = undefined
      failureShown = false
      installContextListener()
      startTime = now()
      const loadController = new AbortController()
      controller = loadController
      const ended = new Promise<void>((resolve) => { endStart = resolve })
      timeout = setTimeout(() => {
        fail(token, new AssetLoadError('LOAD_TIMEOUT', 'application', 'required assets did not become ready before the deadline'))
      }, options.requiredLoadDeadlineMs ?? 30_000)
      // loading -> attach -> render -> fence -> wiring -> RAF -> ready
      // any failure/disposal invalidates first; late results only release.
      const run = async () => {
        try {
          options.showLoading()
          assertActive(token)
          const resolvedLibrary = await loadAssetLibrary(options.manifest, options.loader, {
            signal: loadController.signal,
          })
          if (token !== generation || state !== 'loading') {
            cleanup([() => resolvedLibrary.dispose()])
            return
          }
          library = resolvedLibrary
          assertActive(token)
          attaching = true
          attached = true
          try {
            const detached = await options.attach(resolvedLibrary, {
              signal: loadController.signal,
              isActive: () => token === generation && state === 'loading' && !loadController.signal.aborted,
              onCleanup: (attachmentCleanup) => {
                if (token === generation && state === 'loading' && !loadController.signal.aborted) {
                  attachmentCleanups.push(attachmentCleanup)
                } else {
                  cleanup([attachmentCleanup])
                }
              },
            })
            if (typeof detached === 'function') attachmentCleanups.push(detached)
          } finally {
            attaching = false
            if (token !== generation || state !== 'loading') releaseResources()
          }
          assertActive(token)
          const firstFrame = await options.renderFirstFrame()
          assertActive(token)
          if (!Number.isFinite(firstFrame.calls) || !Number.isFinite(firstFrame.triangles)
            || firstFrame.calls <= 0 || firstFrame.triangles <= 0) {
            throw new AssetLoadError('FIRST_FRAME_EMPTY', 'renderer', 'required first render was empty')
          }
          await options.finishGpu()
          assertActive(token)
          const gpuFinishedAt = now()
          const installed = options.installInteractive()
          if (typeof installed === 'function') {
            if (token !== generation || state !== 'loading') cleanup([installed])
            else interactiveDispose = installed
          }
          assertActive(token)
          await options.nextAnimationFrame()
          assertActive(token)
          const interactiveAt = now()
          readyReceipt = Object.freeze({
            generation: token,
            libraryDigest: options.manifest.libraryDigest,
            firstFrame: Object.freeze({ ...firstFrame }),
            readyAt: interactiveAt,
            interactiveAt,
            gpuFinishedAt,
            timeOrigin: performance.timeOrigin,
          })
          state = 'ready'
          options.showReady(readyReceipt)
        } catch (cause) {
          if (token !== generation) return
          fail(token, lifecycleError(cause, 'APPLICATION_LOAD'))
        } finally {
          clearTimeout(timeout)
          if (controller === loadController) controller = undefined
        }
      }
      await Promise.race([run(), ended])
    },
    dispose() {
      if (state === 'disposed') return
      state = 'disposed'
      readyReceipt = undefined
      invalidate()
      releaseResources()
    },
  }

  return lifecycle
}
