import type { AnimationClip, BufferGeometry, Material, Object3D, Texture } from 'three'

export const ASSET_IDS = [
  'floor-slab', 'rack-standard', 'cooling-unit', 'technician-man', 'coolant-leak',
] as const
export type AssetId = typeof ASSET_IDS[number]
export interface Vector3 { readonly x: number; readonly y: number; readonly z: number }
export interface Bounds { readonly min: Vector3; readonly max: Vector3 }
export type PlacementClass =
  | 'floor' | 'blocking-rack' | 'outside-hall-decoration' | 'actor' | 'nonblocking-fault-visual'

export interface Placement {
  readonly instanceId: string
  readonly assetId: AssetId
  readonly logicalOwner: string
  readonly placementClass: PlacementClass
  readonly position: Vector3
  readonly yaw: number
  readonly scale: Vector3
  readonly visible: boolean
}

export interface AssetShape {
  readonly id: AssetId
  readonly units: 'meters'
  readonly up: 'Y'
  readonly handedness: 'right'
  readonly front: '+Z'
  readonly pivot: 'floor-center'
  readonly rootPosition: Vector3
  readonly rootYaw: number
  readonly rootScale: Vector3
  readonly restBounds: Bounds
  readonly animatedBounds: Bounds
}

export interface AssetClipContract {
  readonly name: string
  readonly duration: number
  readonly rootMotion: false
}

export interface AssetManifestEntry {
  readonly id: AssetId
  readonly file: string
  readonly sha256: string
  readonly rootName: string
  readonly requiredNodeNames: readonly string[]
  readonly shape: AssetShape
  readonly clips: readonly AssetClipContract[]
}

export interface AssetManifest {
  readonly schema: 1
  readonly profile: string
  readonly libraryDigest: string
  readonly assets: readonly AssetManifestEntry[]
}

export interface AssetCandidate {
  readonly id: AssetId
  readonly sha256: string
  readonly scene: Object3D
  readonly animations: readonly AnimationClip[]
  // Includes parser-owned allocations not reachable from the selected scene.
  readonly resources?: {
    readonly geometries: Iterable<BufferGeometry>
    readonly materials: Iterable<Material>
    readonly textures: Iterable<Texture>
  }
  readonly release?: () => void
}

export class ContractError extends Error {
  readonly code: string
  readonly subject: string

  constructor(code: string, subject: string, detail: string) {
    super(`${code}: ${subject}: ${detail}`)
    this.name = 'ContractError'
    this.code = code
    this.subject = subject
  }
}

export class AssetLoadError extends ContractError {
  readonly assetId?: AssetId

  constructor(
    code: string,
    subject: string,
    detail: string,
    assetId?: AssetId,
  ) {
    super(code, subject, detail)
    this.name = 'AssetLoadError'
    this.assetId = assetId
  }
}
