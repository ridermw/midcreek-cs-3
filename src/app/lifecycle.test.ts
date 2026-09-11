import { describe, expect, it, vi } from 'vitest'
import { createApplicationLifecycle } from './lifecycle'
import type { ApplicationLifecycleOptions } from './lifecycle'
import * as libraries from '../assets/library'
import { createTestCandidate, createTestManifest } from '../../tests/fixtures/assets'

function loaderFor(
  load: (entry: ReturnType<typeof createTestManifest>['assets'][number], signal: AbortSignal) => Promise<ReturnType<typeof createTestCandidate>>,
) {
  return { load }
}

function deferred<T = void>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => { resolve = done })
  return { promise, resolve }
}

function optionsFor(overrides: Partial<ApplicationLifecycleOptions> = {}): ApplicationLifecycleOptions {
  return {
    manifest: createTestManifest(),
    loader: loaderFor(async (entry) => createTestCandidate(entry)),
    showLoading: () => undefined,
    showReady: () => undefined,
    showFailure: () => undefined,
    attach: () => undefined,
    renderFirstFrame: () => ({ calls: 1, triangles: 12 }),
    finishGpu: () => undefined,
    installInteractive: () => undefined,
    nextAnimationFrame: () => undefined,
    ...overrides,
  }
}

describe('application loading lifecycle', () => {
  it('marks readiness relative to navigation rather than lifecycle start', async () => {
    let now = 500
    const lifecycle = createApplicationLifecycle(optionsFor({
      now: () => now,
      finishGpu: () => { now = 650 },
      nextAnimationFrame: () => { now = 700 },
    }))
    await lifecycle.start()
    expect(lifecycle.readyReceipt?.readyAt).toBe(700)
    expect(lifecycle.readyReceipt?.gpuFinishedAt).toBe(650)
    expect(lifecycle.readyReceipt?.interactiveAt).toBe(700)
    lifecycle.dispose()
  })
  it('releases leases registered during a partial attachment failure', async () => {
    let releases = 0
    const lifecycle = createApplicationLifecycle(optionsFor({
      loader: loaderFor(async (entry) => createTestCandidate(entry, {
        release: () => { releases++ },
      })),
      attach: (library, session) => {
        const lease = library.acquire('technician-man')
        session.onCleanup(() => lease.release())
        throw new Error('attachment failed after acquiring a lease')
      },
    }))

    await lifecycle.start()
    expect(lifecycle.state).toBe('failed')
    expect(lifecycle.error?.code).toBe('APPLICATION_LOAD')
    expect(releases).toBe(5)
    lifecycle.dispose()
  })

  it('does not publish an obsolete failure after cleanup starts a replacement', async () => {
    const target = new EventTarget()
    let visible = ''
    let replacement: ReturnType<typeof createApplicationLifecycle> | undefined
    let replacementStart: Promise<void> | undefined
    const lifecycle = createApplicationLifecycle(optionsFor({
      contextTarget: target,
      showFailure: () => { visible = 'obsolete failure' },
      installInteractive: () => () => {
        lifecycle.dispose()
        replacement = createApplicationLifecycle(optionsFor({
          showLoading: () => { visible = 'replacement loading' },
          showReady: () => { visible = 'replacement ready' },
        }))
        replacementStart = replacement.start()
      },
    }))

    await lifecycle.start()
    target.dispatchEvent(new Event('webglcontextlost', { cancelable: true }))
    await replacementStart
    expect(lifecycle.state).toBe('disposed')
    expect(replacement?.state).toBe('ready')
    expect(visible).toBe('replacement ready')
    replacement?.dispose()
  })

  it('never lets stale attachment cleanup detach a replacement application', async () => {
    const gate = deferred()
    const entered = deferred()
    let activeView = ''
    let oldReleases = 0
    const old = createApplicationLifecycle(optionsFor({
      loader: loaderFor(async (entry) => createTestCandidate(entry, { release: () => { oldReleases++ } })),
      attach: async (_, generation) => {
        entered.resolve()
        await gate.promise
        if (!generation.isActive()) return
        activeView = 'old'
      },
      detach: () => { activeView = '' },
    }))
    const pending = old.start()
    await entered.promise
    old.dispose()
    const replacement = createApplicationLifecycle(optionsFor({
      attach: () => { activeView = 'replacement' },
    }))
    await replacement.start()
    gate.resolve()
    await pending
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(activeView).toBe('replacement')
    expect(oldReleases).toBe(5)
    expect(old.state).toBe('disposed')
    expect(replacement.state).toBe('ready')
    replacement.dispose()
  })

  it('checks actual context loss before the delayed DOM loss event', async () => {
    let lost = false
    const lifecycle = createApplicationLifecycle(optionsFor({
      isContextLost: () => lost,
      nextAnimationFrame: () => { lost = true },
    }))
    await lifecycle.start()
    expect(lifecycle.state).toBe('failed')
    expect(lifecycle.error?.code).toBe('CONTEXT_LOST')
    lifecycle.dispose()
  })

  it('enforces the deadline after synchronous interactive work blocks timer delivery', async () => {
    let clock = 0
    let enabled = false
    const lifecycle = createApplicationLifecycle(optionsFor({
      now: () => clock,
      requiredLoadDeadlineMs: 30,
      installInteractive: () => {
        enabled = true
        clock = 31
        return () => { enabled = false }
      },
    }))
    await lifecycle.start()
    expect(lifecycle.error?.code).toBe('LOAD_TIMEOUT')
    expect(enabled).toBe(false)
    await expect(lifecycle.start()).rejects.toThrow(/LIFECYCLE_STATE/)
    lifecycle.dispose()
  })

  it.each(['attach', 'render', 'gpu', 'raf'] as const)(
    'terminally times out a pending %s stage and cleans its late completion',
    async (stage) => {
      vi.useFakeTimers()
      const gate = deferred()
      const entered = deferred()
      let attached = false
      let inputEnabled = false
      let failures = 0
      let ready = false
      let releases = 0
      const wait = async () => { entered.resolve(); await gate.promise }
      const lifecycle = createApplicationLifecycle(optionsFor({
        requiredLoadDeadlineMs: 30,
        loader: loaderFor(async (entry) => createTestCandidate(entry, { release: () => { releases++ } })),
        attach: async () => {
          if (stage === 'attach') await wait()
          attached = true
          return () => { attached = false }
        },
        detach: () => { attached = false },
        renderFirstFrame: async () => {
          if (stage === 'render') await wait()
          return { calls: 1, triangles: 12 }
        },
        finishGpu: async () => { if (stage === 'gpu') await wait() },
        installInteractive: () => {
          inputEnabled = true
          return () => { inputEnabled = false }
        },
        nextAnimationFrame: async () => { if (stage === 'raf') await wait() },
        showReady: () => { ready = true },
        showFailure: () => { failures++ },
      }))
      try {
        const start = lifecycle.start()
        await entered.promise
        await vi.advanceTimersByTimeAsync(30)
        expect(lifecycle.state).toBe('failed')
        expect(lifecycle.error?.code).toBe('LOAD_TIMEOUT')
        expect(inputEnabled).toBe(false)
        expect(failures).toBe(1)
        expect(releases).toBe(5)
        await start
        gate.resolve()
        await vi.runAllTimersAsync()
        expect(attached).toBe(false)
        expect(ready).toBe(false)
        expect(failures).toBe(1)
      } finally {
        gate.resolve()
        lifecycle.dispose()
        vi.useRealTimers()
      }
    },
  )

  it('releases a resolved library when disposal wins its await boundary', async () => {
    const library = await libraries.loadAssetLibrary(createTestManifest(), loaderFor(async (entry) => createTestCandidate(entry)))
    const load = vi.spyOn(libraries, 'loadAssetLibrary').mockResolvedValueOnce(library)
    try {
      const lifecycle = createApplicationLifecycle(optionsFor())
      const start = lifecycle.start()
      lifecycle.dispose()
      await start
      expect(() => library.acquire('floor-slab').release()).toThrow(/LIBRARY_DISPOSED/)
    } finally {
      load.mockRestore()
      library.dispose()
    }
  })

  it('continues cleanup and exposes the primary failure when cleanup callbacks throw', async () => {
    const target = new EventTarget()
    let releases = 0
    let detached = false
    let visible = ''
    const lifecycle = createApplicationLifecycle(optionsFor({
      loader: loaderFor(async (entry) => createTestCandidate(entry, { release: () => { releases++ } })),
      contextTarget: target,
      installInteractive: () => () => { throw new Error('input cleanup broke') },
      detach: () => { if (lifecycle.state === 'idle') return; detached = true; throw new Error('detach broke') },
      showFailure: (error) => { visible = error.code },
    }))
    await lifecycle.start()
    target.dispatchEvent(new Event('webglcontextlost', { cancelable: true }))
    expect(lifecycle.state).toBe('failed')
    expect(visible).toBe('CONTEXT_LOST')
    expect(detached).toBe(true)
    expect(releases).toBe(5)
    expect(lifecycle.error?.message).toContain('cleanup')
    lifecycle.dispose()
  })

  it('invalidates reentrant interactive installation and disposes the returned input wiring', async () => {
    let enabled = false
    const lifecycle = createApplicationLifecycle(optionsFor({
      installInteractive: () => {
        enabled = true
        lifecycle.dispose()
        return () => { enabled = false }
      },
    }))
    await lifecycle.start()
    expect(lifecycle.state).toBe('disposed')
    expect(enabled).toBe(false)
  })

  it('publishes ready only after a nonempty frame, GPU fence, HUD/input, and the next RAF boundary', async () => {
    const manifest = createTestManifest()
    const events: string[] = []
    const lifecycle = createApplicationLifecycle({
      manifest,
      loader: loaderFor(async (entry) => createTestCandidate(entry)),
      showLoading: () => events.push('loading'),
      showReady: () => events.push('ready'),
      showFailure: () => events.push('failure'),
      attach: () => { events.push('attach') },
      renderFirstFrame: () => { events.push('render'); return { calls: 1, triangles: 12 } },
      finishGpu: () => { events.push('finish') },
      installInteractive: () => { events.push('interactive'); return () => events.push('interactive-dispose') },
      nextAnimationFrame: async () => { events.push('raf') },
    })

    await lifecycle.start()
    expect(lifecycle.state).toBe('ready')
    expect(events).toEqual(['loading', 'attach', 'render', 'finish', 'interactive', 'raf', 'ready'])
    expect(lifecycle.readyReceipt?.firstFrame).toEqual({ calls: 1, triangles: 12 })
    lifecycle.dispose()
  })

  it('fails visibly on timeout and releases late candidates without reviving the session', async () => {
    const manifest = createTestManifest()
    let releases = 0
    const release = () => { releases++ }
    const delayed = deferred()
    let reloads = 0
    let reloadAction: (() => void) | undefined
    let attached = false
    let failures = 0
    const lifecycle = createApplicationLifecycle({
      manifest,
      loader: loaderFor(async (entry) => delayed.promise.then(() => createTestCandidate(entry, { release }))),
      showLoading: vi.fn(),
      showReady: vi.fn(),
      showFailure: (_, action) => { failures++; reloadAction = action },
      attach: () => { attached = true },
      renderFirstFrame: () => ({ calls: 1, triangles: 1 }),
      finishGpu: vi.fn(),
      installInteractive: () => () => undefined,
      nextAnimationFrame: vi.fn(async () => undefined),
      reload: () => { reloads++ },
      requiredLoadDeadlineMs: 1,
    })

    await lifecycle.start()
    expect(lifecycle.state).toBe('failed')
    expect(lifecycle.error?.code).toBe('LOAD_TIMEOUT')
    expect(reloadAction).toBeDefined()
    reloadAction!()
    expect(reloads).toBe(1)

    delayed.resolve()
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(lifecycle.state).toBe('failed')
    expect(lifecycle.readyReceipt).toBeUndefined()
    expect(releases).toBe(5)
    expect(failures).toBe(1)
    expect(attached).toBe(false)
    lifecycle.dispose()
  })

  it('turns context loss into a terminal failed session and never auto-restarts on restoration', async () => {
    const manifest = createTestManifest()
    const target = new EventTarget()
    const showFailure = vi.fn()
    const lifecycle = createApplicationLifecycle({
      manifest,
      loader: loaderFor(async (entry) => createTestCandidate(entry)),
      showLoading: vi.fn(),
      showReady: vi.fn(),
      showFailure,
      attach: vi.fn(),
      renderFirstFrame: () => ({ calls: 1, triangles: 1 }),
      finishGpu: vi.fn(),
      installInteractive: () => () => undefined,
      nextAnimationFrame: vi.fn(async () => undefined),
      contextTarget: target,
    })

    await lifecycle.start()
    target.dispatchEvent(new Event('webglcontextlost', { cancelable: true }))
    target.dispatchEvent(new Event('webglcontextrestored'))
    expect(lifecycle.state).toBe('failed')
    expect(lifecycle.error?.code).toBe('CONTEXT_LOST')
    expect(showFailure).toHaveBeenCalledOnce()
    lifecycle.dispose()
  })
})
