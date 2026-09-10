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
