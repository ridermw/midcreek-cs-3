import { describe, expect, it, vi } from 'vitest'
import { getEventListeners } from 'node:events'
import { Mesh, MeshBasicMaterial, NumberKeyframeTrack, QuaternionKeyframeTrack, SkinnedMesh, Texture, VectorKeyframeTrack } from 'three'
import { ContractError } from './contracts'
import { loadAssetLibrary, resolveAssetDependencyUrl, resolveAssetUrl } from './library'
import { validateAssetCandidate, validateManifest } from './validate'
import { createTestCandidate, createTestManifest } from '../../tests/fixtures/assets'

describe('asset library loading and ownership', () => {
  it('removes caller abort subscriptions and never starts a pre-aborted load', async () => {
    const controller = new AbortController()
    let requests = 0
    const loader = {
      async load(entry: ReturnType<typeof createTestManifest>['assets'][number]) {
        requests++
        return createTestCandidate(entry)
      },
    }
    const library = await loadAssetLibrary(createTestManifest(), loader, { signal: controller.signal })
    library.dispose()
    expect(getEventListeners(controller.signal, 'abort')).toHaveLength(0)
    controller.abort()
    await expect(loadAssetLibrary(createTestManifest(), loader, { signal: controller.signal })).rejects.toThrow(/LOAD_ABORTED/)
    expect(requests).toBe(5)
  })

  it('resolves production prefixes on the application origin in browsers and explicit Node contexts', () => {
    vi.stubGlobal('location', new URL('https://cs3.example/midcreek-cs-3/play/'))
    try {
      expect(resolveAssetUrl('/midcreek-cs-3/', 'assets/floor.glb')).toBe('https://cs3.example/midcreek-cs-3/assets/floor.glb')
      expect(resolveAssetUrl('/midcreek-cs-3/', 'assets/floor.glb', 'https://node.example/play/')).toBe('https://node.example/midcreek-cs-3/assets/floor.glb')
      expect(() => resolveAssetUrl('https://foreign.example/', 'floor.glb')).toThrow(/PATH/)
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it.each(['../private.glb', '%2e%2e/private.glb', '%252e%252e/private.glb', 'x%2fy.glb', 'x%5cy.glb', 'x.glb?private', 'x.glb#private', '//foreign/x', 'x\\y', 'https://foreign/x'])(
    'rejects ambiguous or escaping asset path %s', (file) => {
      expect(() => resolveAssetUrl('https://cs3.example/midcreek-cs-3/', file)).toThrow(/PATH/)
    },
  )

  it('confines external glTF dependencies to the approved application prefix', () => {
    const application = 'https://cs3.example/midcreek-cs-3/play/'
    const prefix = 'https://cs3.example/midcreek-cs-3/'
    const gltf = 'https://cs3.example/midcreek-cs-3/assets/library/technician.glb'
    expect(resolveAssetDependencyUrl(prefix, 'texture.png', gltf, application))
      .toBe('https://cs3.example/midcreek-cs-3/assets/library/texture.png')
    expect(resolveAssetDependencyUrl(prefix, 'blob:https://cs3.example/id', gltf, application))
      .toBe('blob:https://cs3.example/id')
    expect(() => resolveAssetDependencyUrl(prefix, 'https://foreign.example/texture.png', gltf, application))
      .toThrow(/DEPENDENCY_PATH/)
    expect(() => resolveAssetDependencyUrl(prefix, '../../../../private.png', gltf, application))
      .toThrow(/DEPENDENCY_PATH/)
  })

  it('requires the fixed technician clip set even when manifest and candidate agree', () => {
    const manifest = createTestManifest()
    const assets = manifest.assets.map((entry) => entry.id === 'technician-man'
      ? { ...entry, clips: entry.clips.slice(0, 1) }
      : entry)
    expect(() => validateManifest({ ...manifest, assets })).toThrow(/CLIP_SET/)
  })

  it('rejects a manifest entry whose shape identifies another otherwise valid asset', () => {
    const manifest = createTestManifest()
    const assets = manifest.assets.map((entry) => entry.id === 'rack-standard'
      ? { ...entry, shape: manifest.assets[2]!.shape } : entry)
    expect(() => validateManifest({ ...manifest, assets })).toThrow(/SHAPE_IDENTITY/)
  })

  it('rejects duplicate loaded clip names instead of replacing a missing required clip', () => {
    const entry = createTestManifest().assets[3]!
    const candidate = createTestCandidate(entry)
    candidate.animations[2]!.name = 'Idle'
    expect(() => validateAssetCandidate(candidate, entry)).toThrow(/CLIP_IDENTITY/)
  })

  it.each([
    ['animated key escape', 'ANIMATED_BOUNDS'],
    ['animated midpoint escape', 'ANIMATED_BOUNDS'],
    ['scale animation', 'RIGID_ANIMATION'],
    ['morph animation', 'RIGID_ANIMATION'],
    ['missing target', 'TRACK_TARGET'],
    ['root alias', 'ROOT_MOTION'],
    ['root uuid', 'ROOT_MOTION'],
    ['nonfinite times', 'TRACK_TIME'],
    ['skinned mesh', 'RIGID_ANIMATION'],
    ['duration tolerance', 'CLIP_CONTRACT'],
    ['reflected descendant', 'RIGID_ANIMATION'],
    ['invalid quaternion', 'RIGID_ANIMATION'],
    ['missing texture UV', 'TEXTURE_UV'],
  ])('rejects %s before leasing or attachment', (kind, code) => {
    const entry = createTestManifest().assets[3]!
    const candidate = createTestCandidate(entry)
    const clip = candidate.animations[0]!
    const root = candidate.scene.children[0]!
    if (kind === 'animated key escape') {
      clip.tracks = [new VectorKeyframeTrack('Body.position', [0, 1, 2], [0, 0.865, 0, 0, 2, 0, 0, 0.865, 0])]
    } else if (kind === 'animated midpoint escape') {
      clip.tracks = [new QuaternionKeyframeTrack('Body.quaternion', [0, 2], [0, 0, 0, 1, 0, Math.SQRT1_2, 0, Math.SQRT1_2])]
    } else if (kind === 'scale animation') {
      clip.tracks = [new VectorKeyframeTrack('Body.scale', [0, 2], [1, 1, 1, 1, 0.9, 1])]
    } else if (kind === 'morph animation') {
      clip.tracks = [new NumberKeyframeTrack('Body.morphTargetInfluences[0]', [0, 2], [0, 1])]
    } else if (kind === 'missing target') {
      clip.tracks[0]!.name = 'Missing.position'
    } else if (kind === 'root alias') {
      clip.tracks[0]!.name = '.position'
    } else if (kind === 'root uuid') {
      clip.tracks[0]!.name = `${root.uuid}.position`
    } else if (kind === 'nonfinite times') {
      clip.tracks[0]!.times[1] = NaN
    } else if (kind === 'skinned mesh') {
      root.add(new SkinnedMesh())
    } else if (kind === 'reflected descendant') {
      root.children[0]!.scale.x = -1
    } else if (kind === 'invalid quaternion') {
      clip.tracks = [new QuaternionKeyframeTrack('Body.quaternion', [0, 2], [0, 0, 0, 0, 0, 0, 0, 1])]
    } else if (kind === 'missing texture UV') {
      const body = root.children[0] as Mesh
      body.geometry.deleteAttribute('uv')
      ;(body.material as MeshBasicMaterial).map = new Texture()
    } else {
      clip.duration += 0.0001
    }
    expect(() => validateAssetCandidate(candidate, entry)).toThrow(code)
  })

  it('samples valid rigid clips without changing the template rest pose', () => {
    const entry = createTestManifest().assets[3]!
    const candidate = createTestCandidate(entry)
    const before = candidate.scene.getObjectByName('Body')!.position.toArray()
    expect(() => validateAssetCandidate(candidate, entry)).not.toThrow()
    expect(candidate.scene.getObjectByName('Body')!.position.toArray()).toEqual(before)
    expect(candidate.animations.map((clip) => clip.name)).toEqual(['Idle', 'Walk', 'Repair'])
  })

  it('disposes identities shared across candidates exactly once, even when one cleanup throws', async () => {
    const manifest = createTestManifest()
    const candidates = manifest.assets.map((entry) => createTestCandidate(entry))
    const material = new MeshBasicMaterial()
    let closed = 0
    const image = { close: () => { closed++ } }
    const texture = new Texture(image)
    material.map = texture
    let textures = 0
    let materials = 0
    let geometries = 0
    texture.addEventListener('dispose', () => { textures++; throw new Error('texture disposal failed') })
    material.addEventListener('dispose', () => { materials++ })
    const sharedGeometry = (candidates[1]!.scene.getObjectByName('Body') as Mesh).geometry
    for (const candidate of candidates) {
      const body = candidate.scene.getObjectByName('Body') as Mesh
      ;(body.material as MeshBasicMaterial).dispose()
      body.material = material
      if (candidate.id === 'cooling-unit') {
        body.geometry.dispose()
        body.geometry = sharedGeometry
      }
    }
    sharedGeometry.addEventListener('dispose', () => { geometries++ })
    const library = await loadAssetLibrary(manifest, {
      async load(entry) { return candidates.find((candidate) => candidate.id === entry.id)! },
    })
    expect(() => library.dispose()).toThrow(/cleanup|disposal/i)
    expect({ closed, textures, materials, geometries }).toEqual({ closed: 1, textures: 1, materials: 1, geometries: 1 })
    library.dispose()
    expect(closed).toBe(1)
  })

  it('preserves validation failure and cleans every sibling when candidate cleanup throws', async () => {
    const manifest = createTestManifest()
    const released: string[] = []
    await expect(loadAssetLibrary(manifest, {
      async load(entry) {
        const candidate = createTestCandidate(entry, {
          release: () => { released.push(entry.id); throw new Error('cleanup broke') },
        })
        return entry.id === 'floor-slab' ? { ...candidate, sha256: 'b'.repeat(64) } : candidate
      },
    })).rejects.toThrow(/HASH/)
    expect(new Set(released).size).toBe(5)
    expect(released).toHaveLength(5)
  })

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
