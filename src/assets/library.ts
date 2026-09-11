import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { LoadingManager } from 'three'
import type {
  AnimationClip,
  BufferGeometry,
  Material,
  Mesh,
  Object3D,
  Texture,
} from 'three'
import { AssetLoadError, ContractError } from './contracts'
import type {
  AssetCandidate,
  AssetId,
  AssetManifest,
  AssetManifestEntry,
} from './contracts'
import { validateAssetCandidate, validateManifest, validateRelativeAssetPath } from './validate'

export interface AssetLoader {
  load(entry: AssetManifestEntry, signal: AbortSignal): Promise<AssetCandidate>
}

export interface AssetTemplate {
  readonly id: AssetId
  readonly entry: AssetManifestEntry
  readonly scene: Object3D
  readonly animations: readonly AnimationClip[]
}

export interface AssetLease {
  readonly template: AssetTemplate
  release(): void
}

interface LoadedRecord {
  readonly candidate: AssetCandidate
  readonly template: AssetTemplate
  leases: number
}

interface ResourceSets {
  readonly geometries: Set<BufferGeometry>
  readonly materials: Set<Material>
  readonly textures: Set<Texture>
}

function materialsFor(object: Object3D): readonly Material[] {
  const mesh = object as Mesh
  if (!mesh.isMesh || !mesh.material) return []
  return (Array.isArray(mesh.material) ? mesh.material : [mesh.material]) as Material[]
}

function collectObjectResources(object: Object3D, resources: ResourceSets): void {
  object.traverse((node) => {
    const mesh = node as Mesh
    if (mesh.isMesh && mesh.geometry) resources.geometries.add(mesh.geometry)
    for (const material of materialsFor(node)) {
      resources.materials.add(material)
      for (const value of Object.values(material)) {
        if (value && typeof value === 'object' && 'isTexture' in value
          && (value as Texture).isTexture) {
          resources.textures.add(value as Texture)
        }
      }
    }
  })
}

function disposeResourceSets(resources: ResourceSets, disposed: WeakSet<object>): unknown[] {
  const imageData = new Set<object>()
  const errors: unknown[] = []
  const once = (resource: object, action: () => void) => {
    if (disposed.has(resource)) return
    disposed.add(resource)
    try { action() } catch (cause) { errors.push(cause) }
  }
  for (const texture of resources.textures) {
    const data = texture.source?.data
    if (data && typeof data === 'object') imageData.add(data)
    once(texture, () => texture.dispose())
  }
  for (const data of imageData) {
    const close = (data as { close?: unknown }).close
    if (typeof close === 'function') once(data, () => close.call(data))
  }
  for (const material of resources.materials) once(material, () => material.dispose())
  for (const geometry of resources.geometries) once(geometry, () => geometry.dispose())
  return errors
}

function disposeCandidates(candidates: readonly AssetCandidate[], disposed = new WeakSet<object>()): void {
  const resources: ResourceSets = {
    geometries: new Set(),
    materials: new Set(),
    textures: new Set(),
  }
  const releases: AssetCandidate[] = []
  for (const candidate of candidates) {
    if (disposed.has(candidate)) continue
    disposed.add(candidate)
    releases.push(candidate)
    for (const geometry of candidate.resources?.geometries ?? []) resources.geometries.add(geometry)
    for (const material of candidate.resources?.materials ?? []) resources.materials.add(material)
    for (const texture of candidate.resources?.textures ?? []) resources.textures.add(texture)
    collectObjectResources(candidate.scene, resources)
  }
  const errors = disposeResourceSets(resources, disposed)
  for (const candidate of releases) {
    try { candidate.release?.() } catch (cause) { errors.push(cause) }
  }
  if (errors.length) throw new AggregateError(errors, 'Asset resource cleanup failed')
}

// Library owns GPU data + decoded images across ALL templates.
// Instances own nodes/mixers and leases; releasing A never disposes B's data.
// Last lease released -> library teardown -> each shared identity disposed once.
export class AssetLibrary {
  readonly manifest: AssetManifest
  private readonly records: ReadonlyMap<AssetId, LoadedRecord>
  private disposed = false

  constructor(
    manifest: AssetManifest,
    records: ReadonlyMap<AssetId, LoadedRecord>,
  ) {
    this.manifest = manifest
    this.records = records
  }

  get activeLeaseCount(): number {
    let count = 0
    for (const record of this.records.values()) count += record.leases
    return count
  }

  acquire(assetId: AssetId): AssetLease {
    if (this.disposed) throw new ContractError('LIBRARY_DISPOSED', assetId, 'library is already disposed')
    const record = this.records.get(assetId)
    if (!record) throw new ContractError('MISSING_ASSET', assetId, 'asset is not loaded')
    record.leases += 1
    let released = false
    return {
      template: record.template,
      release: () => {
        if (released) return
        released = true
        record.leases -= 1
      },
    }
  }

  dispose(): void {
    if (this.disposed) return
    if (this.activeLeaseCount !== 0) {
      throw new ContractError('ACTIVE_LEASES', 'library', 'release every instance before tearing down shared resources')
    }
    this.disposed = true
    disposeCandidates([...this.records.values()].map((record) => record.candidate))
  }
}

function errorFor(cause: unknown, entry: AssetManifestEntry): AssetLoadError | ContractError {
  if (cause instanceof AssetLoadError || cause instanceof ContractError) return cause
  const detail = cause instanceof Error ? cause.message : String(cause)
  return new AssetLoadError('ASSET_LOAD', entry.id, detail, entry.id)
}

export async function loadAssetLibrary(
  manifest: AssetManifest,
  loader: AssetLoader,
  options: { readonly signal?: AbortSignal } = {},
): Promise<AssetLibrary> {
  validateManifest(manifest)
  if (options.signal?.aborted) throw new AssetLoadError('LOAD_ABORTED', 'library', 'load was cancelled')
  const controller = new AbortController()
  let cancelled = false
  const loaded = new Map<AssetId, LoadedRecord>()
  const released = new WeakSet<object>()
  const cleanupErrors: unknown[] = []
  let failure: AssetLoadError | ContractError | undefined
  const release = (candidate: AssetCandidate): void => {
    try { disposeCandidates([candidate], released) } catch (cause) {
      cleanupErrors.push(cause)
      if (failure) failure.cause = new AggregateError(cleanupErrors, 'Asset resource cleanup failed')
    }
  }
  let rejectAbort: ((reason: AssetLoadError) => void) | undefined
  const abortFromCaller = (): void => {
    cancelled = true
    controller.abort()
    rejectAbort?.(new AssetLoadError('LOAD_ABORTED', 'library', 'load was cancelled'))
  }
  options.signal?.addEventListener('abort', abortFromCaller, { once: true })
  const abortPromise = options.signal
    ? new Promise<never>((_, reject) => {
      rejectAbort = reject
    })
    : null

  const request = async (entry: AssetManifestEntry): Promise<void> => {
    let candidate: AssetCandidate | undefined
    try {
      candidate = await loader.load(entry, controller.signal)
      if (cancelled || controller.signal.aborted) {
        release(candidate)
        candidate = undefined
        return
      }
      validateAssetCandidate(candidate, entry)
      const template: AssetTemplate = Object.freeze({
        id: entry.id,
        entry,
        scene: candidate.scene,
        animations: Object.freeze([...candidate.animations]),
      })
      loaded.set(entry.id, { candidate, template, leases: 0 })
      candidate = undefined
    } catch (cause) {
      const error = errorFor(cause, entry)
      failure ??= error
      if (candidate) release(candidate)
      throw error
    }
  }

  try {
    const requests = Promise.all(manifest.assets.map(request))
    if (abortPromise) await Promise.race([requests, abortPromise])
    else await requests
    if (cancelled) throw new AssetLoadError('LOAD_ABORTED', 'library', 'load was cancelled')
    return new AssetLibrary(manifest, loaded)
  } catch (cause) {
    failure ??= cause instanceof ContractError ? cause : new AssetLoadError('LOAD_ABORTED', 'library', String(cause))
    cancelled = true
    controller.abort()
    for (const record of loaded.values()) release(record.candidate)
    loaded.clear()
    if (cleanupErrors.length) failure.cause = new AggregateError(cleanupErrors, 'Asset resource cleanup failed')
    throw failure
  } finally {
    options.signal?.removeEventListener('abort', abortFromCaller)
  }
}

function resolveApplicationBase(
  baseUrl: string,
  applicationUrl: string | undefined = globalThis.location?.href,
): URL {
  let base: URL
  try {
    base = new URL(baseUrl, applicationUrl)
  } catch {
    throw new ContractError('PATH', 'base', 'relative prefixes require an application URL')
  }
  if (!['http:', 'https:'].includes(base.protocol) || !base.pathname.endsWith('/')
    || base.search || base.hash || base.username || base.password
    || (applicationUrl && base.origin !== new URL(applicationUrl).origin)) {
    throw new ContractError('PATH', 'base', 'a same-origin application directory prefix is required')
  }
  return base
}

export function resolveAssetUrl(
  baseUrl: string,
  file: string,
  applicationUrl: string | undefined = globalThis.location?.href,
): string {
  validateRelativeAssetPath(file)
  const base = resolveApplicationBase(baseUrl, applicationUrl)
  const resolved = new URL(file, base)
  if (resolved.origin !== base.origin || !resolved.pathname.startsWith(base.pathname)) {
    throw new ContractError('PATH', file, 'asset path escaped the configured base')
  }
  return resolved.toString()
}

export function resolveAssetDependencyUrl(
  baseUrl: string,
  dependencyUrl: string,
  gltfUrl: string,
  applicationUrl: string | undefined = globalThis.location?.href,
): string {
  const base = resolveApplicationBase(baseUrl, applicationUrl)
  if (dependencyUrl.startsWith('data:')) return dependencyUrl
  if (dependencyUrl.startsWith('blob:')) {
    const blob = new URL(dependencyUrl)
    if (blob.origin === base.origin) return dependencyUrl
    throw new AssetLoadError('DEPENDENCY_PATH', dependencyUrl, 'blob dependency must use the application origin')
  }
  let resolved: URL
  try {
    resolved = new URL(dependencyUrl, gltfUrl)
  } catch {
    throw new AssetLoadError('DEPENDENCY_PATH', dependencyUrl, 'glTF dependency URL is invalid')
  }
  if (!['http:', 'https:'].includes(resolved.protocol) || resolved.origin !== base.origin
    || !resolved.pathname.startsWith(base.pathname) || resolved.search || resolved.hash
    || resolved.username || resolved.password) {
    throw new AssetLoadError('DEPENDENCY_PATH', dependencyUrl, 'glTF dependency escaped the application prefix')
  }
  return resolved.toString()
}

async function sha256(bytes: ArrayBuffer): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, '0')).join('')
}

export function createGltfLoader(baseUrl: string): AssetLoader {
  return {
    async load(entry, signal) {
      const url = resolveAssetUrl(baseUrl, entry.file)
      let response: Response
      try {
        response = await fetch(url, { signal })
      } catch (cause) {
        throw new AssetLoadError('REQUEST', entry.id, cause instanceof Error ? cause.message : String(cause), entry.id)
      }
      if (!response.ok) {
        throw new AssetLoadError('HTTP', entry.id, `request returned ${response.status}`, entry.id)
      }
      const bytes = await response.arrayBuffer()
      const digest = await sha256(bytes)
      if (digest !== entry.sha256) {
        throw new AssetLoadError('HASH', entry.id, 'loaded bytes do not match the manifest', entry.id)
      }
      const manager = new LoadingManager()
      const dependencyErrors: unknown[] = []
      let dependencyPathError: AssetLoadError | undefined
      const objectUrls = new Set<string>()
      manager.onError = () => { dependencyErrors.push(new Error('Required glTF dependency failed')) }
      manager.setURLModifier((dependencyUrl) => {
        try {
          const resolved = resolveAssetDependencyUrl(baseUrl, dependencyUrl, url)
          if (resolved.startsWith('blob:')) objectUrls.add(resolved)
          return resolved
        } catch (cause) {
          dependencyPathError = cause instanceof AssetLoadError
            ? cause
            : new AssetLoadError('DEPENDENCY_PATH', entry.id, String(cause), entry.id)
          throw dependencyPathError
        }
      })
      const resources: ResourceSets = {
        geometries: new Set<BufferGeometry>(),
        materials: new Set<Material>(),
        textures: new Set<Texture>(),
      }
      const disposed = new WeakSet<object>()
      let failed: AssetLoadError | undefined
      const cleanupErrors: unknown[] = []
      const cleanup = () => {
        cleanupErrors.push(...disposeResourceSets(resources, disposed))
        if (failed && cleanupErrors.length) {
          failed.cause = new AggregateError([failed.cause, ...cleanupErrors], 'glTF failure and cleanup errors')
        }
        for (const objectUrl of objectUrls) URL.revokeObjectURL(objectUrl)
        objectUrls.clear()
      }
      const track = <T>(promise: Promise<T>, collect: (value: T) => void): Promise<T> =>
        promise.then((value) => {
          collect(value)
          if (failed) cleanup()
          return value
        })
      const collectObject = (object: Object3D) => {
        collectObjectResources(object, resources)
      }
      const loader = new GLTFLoader(manager)
      // Per-parser instrumentation catches allocations before scene/animation rejection,
      // including images that settle after failure. Never patch a global loader/manager.
      loader.register((parser) => {
        const instrumented = parser as typeof parser & {
          primitiveCache: Record<string, { promise: Promise<BufferGeometry> }>
        }
        const trackedGeometryPromises = new WeakSet<Promise<BufferGeometry>>()
        const trackPrimitiveCache = () => {
          for (const cached of Object.values(instrumented.primitiveCache)) {
            if (trackedGeometryPromises.has(cached.promise)) continue
            trackedGeometryPromises.add(cached.promise)
            void track(cached.promise, (geometry) => resources.geometries.add(geometry)).catch(() => undefined)
          }
        }
        const geometries = parser.loadGeometries.bind(parser)
        parser.loadGeometries = (primitives) => {
          try {
            return track(geometries(primitives), (values) => {
              for (const geometry of values) resources.geometries.add(geometry)
            })
          } finally {
            // A malformed later primitive can throw synchronously after an
            // earlier primitive has already entered the parser cache.
            trackPrimitiveCache()
          }
        }
        const material = parser.loadMaterial.bind(parser)
        parser.loadMaterial = (index) => track(material(index), (value) => resources.materials.add(value))
        const mesh = parser.loadMesh.bind(parser)
        parser.loadMesh = (index) => track(mesh(index), collectObject)
        const assignFinalMaterial = parser.assignFinalMaterial.bind(parser)
        parser.assignFinalMaterial = (value) => {
          assignFinalMaterial(value)
          collectObject(value)
        }
        const image = parser.loadImageSource.bind(parser)
        parser.loadImageSource = (index, imageLoader) => track(image(index, imageLoader), (value) => resources.textures.add(value))
          .catch((cause: unknown) => { dependencyErrors.push(cause); throw cause })
        const texture = parser.loadTexture.bind(parser)
        parser.loadTexture = (index) => track(texture(index), (value) => {
          if (value) resources.textures.add(value)
          else dependencyErrors.push(new Error('Required image did not decode'))
        })
        return { name: 'CS3_resource_ownership' }
      })
      const path = url.slice(0, url.lastIndexOf('/') + 1)
      let onAbort: (() => void) | undefined
      try {
        const aborted = new Promise<never>((_, reject) => {
          onAbort = () => reject(new AssetLoadError('LOAD_ABORTED', entry.id, 'load was cancelled', entry.id))
          if (signal.aborted) onAbort()
          else signal.addEventListener('abort', onAbort, { once: true })
        })
        const gltf = await Promise.race([loader.parseAsync(bytes, path), aborted])
        for (const scene of gltf.scenes) collectObject(scene)
        if (dependencyErrors.length) {
          const error = new AssetLoadError('IMAGE_DEPENDENCY', entry.id, 'required glTF image/dependency failed', entry.id)
          error.cause = new AggregateError(dependencyErrors)
          throw error
        }
        return { id: entry.id, sha256: digest, scene: gltf.scene, animations: gltf.animations, resources }
      } catch (cause) {
        failed = dependencyPathError ?? (cause instanceof AssetLoadError ? cause
          : new AssetLoadError(dependencyErrors.length ? 'IMAGE_DEPENDENCY' : 'GLTF_PARSE', entry.id, 'required glTF parsing/decode failed', entry.id)
        )
        if (failed !== cause) failed.cause = cause
        cleanup()
        throw failed
      } finally {
        if (onAbort) signal.removeEventListener('abort', onAbort)
        for (const objectUrl of objectUrls) URL.revokeObjectURL(objectUrl)
        objectUrls.clear()
      }
    },
  }
}
