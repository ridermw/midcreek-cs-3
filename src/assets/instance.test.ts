import { describe, expect, it } from 'vitest'
import { createAssetInstance } from './instance'
import { loadAssetLibrary } from './library'
import { createTestCandidate, createTestManifest } from '../../tests/fixtures/assets'

describe('asset instance animation and ownership', () => {
  it('keeps the wrapper transform outside animation and does not restart the same mode', async () => {
    const manifest = createTestManifest()
    const library = await loadAssetLibrary(manifest, {
      async load(entry) { return createTestCandidate(entry) },
    })
    const instance = createAssetInstance('technician-a', library.acquire('technician-man'))
    instance.setPlacement({ x: 2, y: 0, z: 7 }, Math.PI / 2)
    expect(instance.root.position.toArray()).toEqual([2, 0, 7])
    expect(instance.root.rotation.y).toBe(Math.PI / 2)

    instance.present('Idle')
    instance.advanceTick()
    const elapsed = instance.animationTime
    instance.present('Idle')
    expect(instance.animationTime).toBe(elapsed)

    instance.present('Repair')
    expect(instance.animationTime).toBe(0)
    instance.advanceTick()
    expect(instance.animationTime).toBeCloseTo(1 / 30)
    expect(instance.root.position.toArray()).toEqual([2, 0, 7])

    instance.dispose()
    library.dispose()
  })

  it('restores descendant transforms before a clip change and releases its lease once', async () => {
    const manifest = createTestManifest()
    const library = await loadAssetLibrary(manifest, {
      async load(entry) { return createTestCandidate(entry) },
    })
    const instance = createAssetInstance('technician-a', library.acquire('technician-man'))
    const body = instance.model.getObjectByName('Body')
    expect(body).toBeDefined()
    instance.present('Walk')
    body!.position.y = 0.75
    instance.present('Repair')
    expect(body!.position.y).toBeCloseTo(0.865)

    instance.dispose()
    instance.dispose()
    expect(library.activeLeaseCount).toBe(0)
    library.dispose()
  })
})
