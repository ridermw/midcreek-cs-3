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
}

export interface ApplicationLifecycleOptions {
  readonly manifest: AssetManifest
  readonly loader: AssetLoader
  readonly requiredLoadDeadlineMs?: number
  readonly showLoading: () => void
  readonly showReady: (receipt: ReadyReceipt) => void
  readonly showFailure: (error: AssetLoadError, reload: () => void) => void
  readonly attach: (library: AssetLibrary) => void | Promise<void>
  readonly detach?: () => void
  readonly renderFirstFrame: () => FrameResult | Promise<FrameResult>
  readonly finishGpu: () => void | Promise<void>
  readonly installInteractive: () => void | (() => void)
  readonly nextAnimationFrame: () => void | Promise<void>
  readonly contextTarget?: EventTarget
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
  let controller: AbortController | undefined
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

  const releaseResources = () => {
    interactiveDispose?.()
    interactiveDispose = undefined
    options.detach?.()
    if (library) {
      library.dispose()
      library = undefined
    }
  }

  const fail = (token: number, nextError: AssetLoadError) => {
    if (token !== generation || state === 'disposed' || state === 'failed') return
    generation += 1
    state = 'failed'
    error = nextError
    readyReceipt = undefined
    controller?.abort()
    controller = undefined
    removeContextListener()
    releaseResources()
    if (!failureShown) {
      failureShown = true
      options.showFailure(nextError, reload)
    }
  }

  const assertActive = (token: number) => {
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
      if (state === 'loading' || state === 'ready') {
        throw new ContractError('LIFECYCLE_STATE', state, 'application session is already active')
      }
      if (state === 'disposed') {
        throw new ContractError('LIFECYCLE_DISPOSED', 'application', 'cannot start a disposed lifecycle')
      }
      releaseResources()
      generation += 1
      const token = generation
      state = 'loading'
      error = undefined
      readyReceipt = undefined
      failureShown = false
      installContextListener()
      startTime = now()
      options.showLoading()
      const loadController = new AbortController()
      controller = loadController
      let timedOut = false
      const timeout = setTimeout(() => {
        timedOut = true
        loadController.abort()
      }, options.requiredLoadDeadlineMs ?? 30_000)
      try {
        library = await loadAssetLibrary(options.manifest, options.loader, {
          signal: loadController.signal,
        })
        assertActive(token)
        await options.attach(library)
        assertActive(token)
        const firstFrame = await options.renderFirstFrame()
        if (!Number.isFinite(firstFrame.calls) || !Number.isFinite(firstFrame.triangles)
          || firstFrame.calls <= 0 || firstFrame.triangles <= 0) {
          throw new AssetLoadError('FIRST_FRAME_EMPTY', 'renderer', 'required first render was empty')
        }
        assertActive(token)
        await options.finishGpu()
        assertActive(token)
        const installed = options.installInteractive()
        interactiveDispose = typeof installed === 'function' ? installed : undefined
        await options.nextAnimationFrame()
        assertActive(token)
        const interactiveAt = now()
        readyReceipt = Object.freeze({
          generation: token,
          libraryDigest: options.manifest.libraryDigest,
          firstFrame: Object.freeze({ ...firstFrame }),
          readyAt: interactiveAt - startTime,
          interactiveAt,
        })
        state = 'ready'
        options.showReady(readyReceipt)
      } catch (cause) {
        if (token !== generation) return
        const failure = timedOut
          ? new AssetLoadError('LOAD_TIMEOUT', 'library', 'required assets did not become ready before the deadline')
          : lifecycleError(cause, 'APPLICATION_LOAD')
        fail(token, failure)
      } finally {
        clearTimeout(timeout)
        if (controller === loadController) controller = undefined
      }
    },
    dispose() {
      if (state === 'disposed') return
      generation += 1
      controller?.abort()
      controller = undefined
      removeContextListener()
      releaseResources()
      state = 'disposed'
      error = undefined
      readyReceipt = undefined
    },
  }

  return lifecycle
}
