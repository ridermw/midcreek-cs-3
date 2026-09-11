import { describe, expect, it, vi } from 'vitest'
import { createApplicationLifecycle } from './lifecycle'
import { createTestCandidate, createTestManifest } from '../../tests/fixtures/assets'

function loaderFor(
  load: (entry: ReturnType<typeof createTestManifest>['assets'][number], signal: AbortSignal) => Promise<ReturnType<typeof createTestCandidate>>,
) {
  return { load }
}

describe('application loading lifecycle', () => {
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
  })

  it('fails visibly on timeout and releases late candidates without reviving the session', async () => {
    const manifest = createTestManifest()
    const release = vi.fn()
    let resolveLate!: (value: ReturnType<typeof createTestCandidate>) => void
    const delayed = new Promise<ReturnType<typeof createTestCandidate>>((resolve) => { resolveLate = resolve })
    const reload = vi.fn()
    const lifecycle = createApplicationLifecycle({
      manifest,
      loader: loaderFor(async (entry) => delayed.then(() => createTestCandidate(entry, { release }))),
      showLoading: vi.fn(),
      showReady: vi.fn(),
      showFailure: vi.fn(),
      attach: vi.fn(),
      renderFirstFrame: () => ({ calls: 1, triangles: 1 }),
      finishGpu: vi.fn(),
      installInteractive: () => () => undefined,
      nextAnimationFrame: vi.fn(async () => undefined),
      reload,
      requiredLoadDeadlineMs: 1,
    })

    await lifecycle.start()
    expect(lifecycle.state).toBe('failed')
    expect(lifecycle.error?.code).toBe('LOAD_TIMEOUT')
    reload()
    expect(reload).toHaveBeenCalledOnce()

    resolveLate(createTestCandidate(manifest.assets[0]!))
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(lifecycle.state).toBe('failed')
    expect(lifecycle.readyReceipt).toBeUndefined()
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
  })
})
