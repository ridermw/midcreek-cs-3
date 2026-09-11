import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import type {
  AnimationClip,
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
import { validateAssetCandidate, validateManifest } from './validate'

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

function materialsFor(object: Object3D): readonly Material[] {
  const mesh = object as Mesh
  if (!mesh.isMesh || !mesh.material) return []
  return (Array.isArray(mesh.material) ? mesh.material : [mesh.material]) as Material[]
}

export function disposeCandidate(candidate: AssetCandidate): void {
  const geometries = new Set<{ dispose(): void }>()
  const materials = new Set<Material>()
  const textures = new Set<Texture>()
  const imageData = new Set<object>()

  candidate.scene.traverse((object) => {
    const mesh = object as Mesh
    if (mesh.isMesh && mesh.geometry) geometries.add(mesh.geometry)
    for (const material of materialsFor(object)) {
      materials.add(material)
      for (const value of Object.values(material)) {
        if (value && typeof value === 'object' && 'isTexture' in value
          && (value as Texture).isTexture) {
          textures.add(value as Texture)
        }
      }
    }
  })
  for (const texture of textures) {
    const data = texture.source?.data
    if (data && typeof data === 'object') imageData.add(data)
    texture.dispose()
  }
  for (const data of imageData) {
    const close = (data as { close?: unknown }).close
    if (typeof close === 'function') close.call(data)
  }
  for (const material of materials) material.dispose()
  for (const geometry of geometries) geometry.dispose()
  candidate.release?.()
}

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
    for (const record of this.records.values()) disposeCandidate(record.candidate)
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
  const controller = new AbortController()
  let cancelled = false
  const loaded = new Map<AssetId, LoadedRecord>()
  const released = new WeakSet<object>()
  const release = (candidate: AssetCandidate): void => {
    if (released.has(candidate)) return
    released.add(candidate)
    disposeCandidate(candidate)
  }
  const abortFromCaller = (): void => {
    cancelled = true
    controller.abort()
  }
  options.signal?.addEventListener('abort', abortFromCaller, { once: true })
  const abortPromise = options.signal
    ? new Promise<never>((_, reject) => {
      if (options.signal!.aborted) {
        reject(new AssetLoadError('LOAD_ABORTED', 'library', 'load was cancelled'))
      } else {
        options.signal!.addEventListener('abort', () => {
          reject(new AssetLoadError('LOAD_ABORTED', 'library', 'load was cancelled'))
        }, { once: true })
      }
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
      if (candidate) release(candidate)
      throw errorFor(cause, entry)
    }
  }

  try {
    const requests = Promise.all(manifest.assets.map(request))
    if (abortPromise) await Promise.race([requests, abortPromise])
    else await requests
    if (cancelled) throw new AssetLoadError('LOAD_ABORTED', 'library', 'load was cancelled')
    return new AssetLibrary(manifest, loaded)
  } catch (cause) {
    cancelled = true
    controller.abort()
    for (const record of loaded.values()) release(record.candidate)
    loaded.clear()
    throw cause
  } finally {
    options.signal?.removeEventListener('abort', abortFromCaller)
  }
}

export function resolveAssetUrl(baseUrl: string, file: string): string {
  if (!file || file.startsWith('/') || file.includes('\\')
    || file.split('/').some((part) => part.length === 0 || part === '.' || part === '..')
    || /^[a-z][a-z\d+.-]*:/i.test(file)) {
    throw new ContractError('PATH', file || 'asset', 'asset files must be relative same-origin paths')
  }
  const base = new URL(baseUrl, 'http://localhost/')
  const resolved = new URL(file, base)
  if (resolved.origin !== base.origin || !resolved.pathname.startsWith(base.pathname)) {
    throw new ContractError('PATH', file, 'asset path escaped the configured base')
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
      const loader = new GLTFLoader()
      const path = url.slice(0, url.lastIndexOf('/') + 1)
      const gltf = await new Promise<{
        scene: Object3D
        animations: AnimationClip[]
      }>((resolve, reject) => {
        loader.parse(bytes, path, resolve, reject)
      })
      return { id: entry.id, sha256: digest, scene: gltf.scene, animations: gltf.animations }
    },
  }
}
