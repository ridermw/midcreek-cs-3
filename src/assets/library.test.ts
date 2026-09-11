import { describe, expect, it, vi } from 'vitest'
import { ContractError } from './contracts'
import { loadAssetLibrary } from './library'
import { validateManifest } from './validate'
import { createTestCandidate, createTestManifest } from '../../tests/fixtures/assets'

describe('asset library loading and ownership', () => {
  it('loads the exact manifest, validates every candidate, and keeps shared resources alive across leases', async () => {
    const manifest = createTestManifest()
    const releases = new Map<string, number>()
    const library = await loadAssetLibrary(manifest, {
      async load(entry) {
        return createTestCandidate(entry, {
          release: () => releases.set(entry.id, (releases.get(entry.id) ?? 0) + 1),
        })
      },
    })

    const first = library.acquire('technician-man')
    const second = library.acquire('technician-man')
    expect(first.template.scene).toBe(second.template.scene)
    expect(library.activeLeaseCount).toBe(2)

    first.release()
    expect(library.activeLeaseCount).toBe(1)
    expect(releases.get('technician-man')).toBeUndefined()

    second.release()
    expect(library.activeLeaseCount).toBe(0)
    library.dispose()
    expect([...releases.values()].every((count) => count === 1)).toBe(true)
    expect(releases.size).toBe(manifest.assets.length)
  })

  it('releases fulfilled and late candidates exactly once after a partial failure', async () => {
    const manifest = createTestManifest()
    const releases = new Map<string, number>()
    let resolveLate!: (candidate: ReturnType<typeof createTestCandidate>) => void
    const late = new Promise<ReturnType<typeof createTestCandidate>>((resolve) => {
      resolveLate = resolve
    })
    const promise = loadAssetLibrary(manifest, {
      load(entry) {
        if (entry.id === 'floor-slab') {
          return Promise.resolve(createTestCandidate(entry, {
            release: () => releases.set(entry.id, (releases.get(entry.id) ?? 0) + 1),
          }))
        }
        if (entry.id === 'rack-standard') {
          return Promise.reject(new ContractError('HTTP', entry.id, 'not found'))
        }
        if (entry.id === 'cooling-unit') {
          return late
        }
        return Promise.resolve(createTestCandidate(entry, {
          release: () => releases.set(entry.id, (releases.get(entry.id) ?? 0) + 1),
        }))
      },
    })

    await expect(promise).rejects.toThrow(/HTTP|ASSET_LOAD/)
    resolveLate(createTestCandidate(manifest.assets[2]!, {
      release: () => releases.set('cooling-unit', (releases.get('cooling-unit') ?? 0) + 1),
    }))
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(releases.get('floor-slab')).toBe(1)
    expect(releases.get('cooling-unit')).toBe(1)
  })

  it('rejects a candidate whose bytes do not match the manifest identity', async () => {
    const manifest = createTestManifest()
    const loader = {
      load: vi.fn(async (entry) => ({
        ...createTestCandidate(entry),
        sha256: 'b'.repeat(64),
      })),
    }
    await expect(loadAssetLibrary(manifest, loader)).rejects.toThrow(/HASH|identity/i)
    expect(loader.load).toHaveBeenCalled()
  })

  it('rejects malformed manifests before requesting any asset', async () => {
    const manifest = createTestManifest()
    const malformed = {
      ...manifest,
      assets: manifest.assets.map((entry, index) => index === 0
        ? { ...entry, file: '../private.glb' }
        : entry),
    }
    expect(() => validateManifest(malformed)).toThrow(/PATH/)
    const loader = { load: vi.fn() }
    await expect(loadAssetLibrary(malformed, loader)).rejects.toThrow(/PATH/)
    expect(loader.load).not.toHaveBeenCalled()
  })
})
