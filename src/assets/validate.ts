import { ASSET_IDS, ContractError } from './contracts'
import type { AssetId, AssetShape, Bounds, Placement, PlacementClass, Vector3 } from './contracts'
import { createRacks, isWalkable } from '../world/layout'

export const GEOMETRY_TOLERANCE = 2e-4
export const UNIT_TOLERANCE = 1e-6
const AXES = ['x', 'y', 'z'] as const
const PERMITTED: Record<AssetId, Bounds> = {
  'floor-slab': { min: { x: -8.5, y: -0.1, z: -7.5 }, max: { x: 8.5, y: 0, z: 7.5 } },
  'rack-standard': { min: { x: -0.4, y: 0, z: -0.4 }, max: { x: 0.4, y: 2.1, z: 0.4 } },
  'cooling-unit': { min: { x: -0.4, y: 0, z: -0.4 }, max: { x: 0.4, y: 2.1, z: 0.4 } },
  'technician-man': { min: { x: -0.45, y: 0, z: -0.45 }, max: { x: 0.45, y: 1.8, z: 0.45 } },
  'coolant-leak': { min: { x: -0.45, y: 0, z: -0.45 }, max: { x: 0.45, y: 0.02, z: 0.45 } },
}

function fail(code: string, subject: string, message: string): never {
  throw new ContractError(code, subject, message)
}

function near(a: number, b: number, tolerance = GEOMETRY_TOLERANCE): boolean {
  return Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= tolerance
}

function samePosition(a: Vector3, b: Vector3): boolean {
  return AXES.every((axis) => near(a[axis], b[axis]))
}

function unitScale(scale: Vector3, subject: string): void {
  if (!AXES.every((axis) => near(scale[axis], 1, UNIT_TOLERANCE))) {
    fail('UNIT_SCALE', subject, 'positive unit scale required; automatic rescaling is forbidden')
  }
}

export function validateBounds(bounds: Bounds, subject: string): void {
  for (const axis of AXES) {
    if (!Number.isFinite(bounds.min[axis]) || !Number.isFinite(bounds.max[axis])
      || bounds.min[axis] >= bounds.max[axis]) {
      fail('INVALID_BOUNDS', subject, `nonempty finite ${axis} extent required`)
    }
  }
}

function contains(outer: Bounds, inner: Bounds, subject: string): void {
  for (const axis of AXES) {
    if (inner.min[axis] < outer.min[axis] - GEOMETRY_TOLERANCE
      || inner.max[axis] > outer.max[axis] + GEOMETRY_TOLERANCE) {
      fail('ESCAPED_BOUNDS', subject, `${axis} extends beyond the declared envelope`)
    }
  }
}

export function validateShape(asset: AssetShape): void {
  if (!ASSET_IDS.includes(asset.id)) fail('UNKNOWN_ASSET', asset.id, 'not in the required library')
  if (asset.units !== 'meters' || asset.up !== 'Y' || asset.handedness !== 'right'
    || asset.front !== '+Z' || asset.pivot !== 'floor-center') {
    fail('COORDINATES', asset.id, 'meters, Y-up, right-handed, floor-centered, +Z-front required')
  }
  unitScale(asset.rootScale, asset.id)
  if (!AXES.every((axis) => near(asset.rootPosition[axis], 0, UNIT_TOLERANCE))
    || !near(asset.rootYaw, 0, UNIT_TOLERANCE)) {
    fail('ROOT_TRANSFORM', asset.id, 'template root must be identity')
  }
  validateBounds(asset.restBounds, asset.id)
  validateBounds(asset.animatedBounds, asset.id)
  contains(PERMITTED[asset.id], asset.restBounds, asset.id)
  contains(PERMITTED[asset.id], asset.animatedBounds, asset.id)
  contains(asset.animatedBounds, asset.restBounds, asset.id)
  const restHeight = asset.id === 'technician-man' ? 1.73
    : asset.id === 'rack-standard' || asset.id === 'cooling-unit' ? 2.1 : null
  if (restHeight !== null && (!near(asset.restBounds.min.y, 0) || !near(asset.restBounds.max.y, restHeight))) {
    fail('REST_HEIGHT', asset.id, `expected ground-to-top height ${restHeight}`)
  }
  if (asset.id === 'floor-slab' && (!samePosition(asset.restBounds.min, PERMITTED['floor-slab'].min)
    || !samePosition(asset.restBounds.max, PERMITTED['floor-slab'].max))) {
    fail('FLOOR_BOUNDS', asset.id, 'floor must cover the authoritative hall footprint')
  }
}

interface PlacementRule {
  assetId: AssetId
  kind: PlacementClass
  owner: string
  position?: Vector3
  yaw?: number
}

function expectedPlacements(): Map<string, PlacementRule> {
  const expected = new Map<string, PlacementRule>()
  expected.set('hall/floor', { assetId: 'floor-slab', kind: 'floor', owner: 'hall', position: { x: 8, y: 0, z: 7 }, yaw: 0 })
  for (const rack of createRacks()) {
    expected.set(`rack/${rack.id}`, {
      assetId: 'rack-standard', kind: 'blocking-rack', owner: rack.id,
      position: { x: rack.cell.x, y: 0, z: rack.cell.z }, yaw: rack.front === 1 ? Math.PI : 0,
    })
  }
  expected.set('plant/west-01', { assetId: 'cooling-unit', kind: 'outside-hall-decoration', owner: 'plant', position: { x: -1.5, y: 0, z: 7 }, yaw: 0 })
  expected.set('plant/east-01', { assetId: 'cooling-unit', kind: 'outside-hall-decoration', owner: 'plant', position: { x: 17.5, y: 0, z: 7 }, yaw: 0 })
  expected.set('actor/technician', { assetId: 'technician-man', kind: 'actor', owner: 'technician' })
  expected.set('fault/coolant', { assetId: 'coolant-leak', kind: 'nonblocking-fault-visual', owner: 'fault-rack', yaw: 0 })
  return expected
}

export function validateJoin(placements: readonly Placement[], library: readonly AssetShape[]): void {
  const assets = new Map<AssetId, AssetShape>()
  for (const asset of library) {
    if (assets.has(asset.id)) fail('DUPLICATE_ASSET', asset.id, 'one template per visual ID required')
    validateShape(asset)
    assets.set(asset.id, asset)
  }
  for (const id of ASSET_IDS) {
    if (!assets.has(id)) fail('MISSING_ASSET', id, 'required visual template absent')
  }
  const expected = expectedPlacements()
  const seen = new Set<string>()
  for (const p of placements) {
    if (seen.has(p.instanceId)) fail('DUPLICATE_INSTANCE', p.instanceId, 'logical IDs must bind exactly once')
    seen.add(p.instanceId)
    const declaration = expected.get(p.instanceId)
    if (!declaration) fail('UNKNOWN_INSTANCE', p.instanceId, 'no logical placement owner')
    if (p.assetId !== declaration.assetId || p.placementClass !== declaration.kind) {
      fail('PLACEMENT_BINDING', p.instanceId, 'wrong asset or placement class')
    }
    unitScale(p.scale, p.instanceId)
    if (!AXES.every((axis) => Number.isFinite(p.position[axis])) || !Number.isFinite(p.yaw)) {
      fail('PLACEMENT_TRANSFORM', p.instanceId, 'finite transform required')
    }
    if ((declaration.position && !samePosition(p.position, declaration.position))
      || (declaration.yaw !== undefined && !near(p.yaw, declaration.yaw, UNIT_TOLERANCE))) {
      fail('PLACEMENT_TRANSFORM', p.instanceId, 'transform disagrees with the logical layout')
    }
    if (declaration.owner !== 'fault-rack' && p.logicalOwner !== declaration.owner) {
      fail('PLACEMENT_OWNER', p.instanceId, 'wrong logical owner')
    }
    if (p.placementClass === 'actor' || p.placementClass === 'nonblocking-fault-visual') {
      if (!near(p.position.y, 0) || !isWalkable({ x: p.position.x, z: p.position.z })) {
        fail('PLACEMENT_FLOOR', p.instanceId, 'must occupy a walkable ground cell')
      }
    }
    if (p.placementClass === 'nonblocking-fault-visual') {
      const rack = createRacks().find((rack) => rack.id === p.logicalOwner)
      if (!rack || !samePosition(p.position, { x: rack.cell.x, y: 0, z: rack.cell.z - rack.front })) {
        fail('FAULT_PLACEMENT', p.instanceId, 'floor visual must align with its rack service cell')
      }
    }
    if (p.placementClass === 'outside-hall-decoration') {
      const bounds = assets.get(p.assetId)!.animatedBounds
      if (!(p.position.x + bounds.max.x < -0.5 || p.position.x + bounds.min.x > 16.5
        || p.position.z + bounds.max.z < -0.5 || p.position.z + bounds.min.z > 14.5)) {
        fail('DECORATION_BOUNDS', p.instanceId, 'decoration must remain wholly outside the hall')
      }
    }
  }
  for (const id of expected.keys()) {
    if (!seen.has(id)) fail('MISSING_INSTANCE', id, 'required logical instance absent')
  }
}
