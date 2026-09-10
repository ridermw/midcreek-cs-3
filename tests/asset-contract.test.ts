import { describe, expect, it } from 'vitest'
import type { AssetId, AssetShape, Bounds, Placement, Vector3 } from '../src/assets/contracts'
import { validateJoin } from '../src/assets/validate'
import { cellToWorld, createPlacements, isWalkable, worldToCell } from '../src/world/layout'
import { createWorld } from '../src/world/simulation'

const box = (min: Vector3, max: Vector3): Bounds => ({ min, max })
const centered = (x: number, z: number, low: number, high: number) =>
  box({ x: -x, y: low, z: -z }, { x, y: high, z })
function shapes(): AssetShape[] {
  const records: Array<[AssetId, Bounds, Bounds]> = [
    ['floor-slab', centered(8.5, 7.5, -0.1, 0), centered(8.5, 7.5, -0.1, 0)],
    ['rack-standard', centered(0.4, 0.4, 0, 2.1), centered(0.4, 0.4, 0, 2.1)],
    ['cooling-unit', centered(0.4, 0.4, 0, 2.1), centered(0.4, 0.4, 0, 2.1)],
    ['technician-man', centered(0.25, 0.2, 0, 1.73), centered(0.45, 0.45, 0, 1.8)],
    ['coolant-leak', centered(0.45, 0.45, 0, 0.02), centered(0.45, 0.45, 0, 0.02)],
  ]
  return records.map(([id, restBounds, animatedBounds]) => ({
    id, units: 'meters', up: 'Y', handedness: 'right', front: '+Z', pivot: 'floor-center',
    rootPosition: { x: 0, y: 0, z: 0 }, rootYaw: 0, rootScale: { x: 1, y: 1, z: 1 },
    restBounds, animatedBounds,
  }))
}

describe('TypeScript-owned layout and visual join', () => {
  it('maps one-meter cells and rounds floor picks without mesh-derived walkability', () => {
    expect(cellToWorld({ x: 2, z: 7 })).toEqual({ x: 2, y: 0, z: 7 })
    expect(worldToCell({ x: 2.49, y: 0, z: 7.49 })).toEqual({ x: 2, z: 7 })
    expect(worldToCell({ x: 2.5, y: 0, z: 7.5 })).toEqual({ x: 3, z: 8 })
    expect(worldToCell({ x: 4, y: 0, z: 3 })).toBeNull()
    expect(worldToCell({ x: 16.51, y: 0, z: 7 })).toBeNull()
    expect(() => cellToWorld({ x: 0.5, z: 7 })).toThrow(/CELL/)
    expect(() => worldToCell({ x: Number.NaN, y: 0, z: 7 })).toThrow(/POINT/)
  })

  it('places exactly 37 immutable instances and faces every rack toward its service aisle', () => {
    const world = createWorld()
    const placements = createPlacements(world)
    expect(placements).toHaveLength(37)
    expect(new Set(placements.map((p) => p.instanceId)).size).toBe(37)
    expect(Object.isFrozen(placements)).toBe(true)
    expect(placements.every((p) => Object.isFrozen(p) && Object.isFrozen(p.position) && Object.isFrozen(p.scale))).toBe(true)
    for (const rack of world.racks) {
      const p = placements.find((entry) => entry.instanceId === `rack/${rack.id}`)!
      expect(p.assetId).toBe('rack-standard')
      expect(p.position).toEqual({ x: rack.cell.x, y: 0, z: rack.cell.z })
      expect(p.yaw).toBe(rack.front === 1 ? Math.PI : 0)
      expect(p.position.z + Math.cos(p.yaw)).toBe(rack.cell.z - rack.front)
      expect(isWalkable(rack.cell)).toBe(false)
    }
    expect(placements.find((p) => p.instanceId === 'hall/floor')?.position).toEqual({ x: 8, y: 0, z: 7 })
    expect(placements.find((p) => p.instanceId === 'plant/west-01')?.position).toEqual({ x: -1.5, y: 0, z: 7 })
    expect(placements.find((p) => p.instanceId === 'plant/east-01')?.position).toEqual({ x: 17.5, y: 0, z: 7 })
    expect(placements.find((p) => p.instanceId === 'actor/technician')?.position).toEqual({ x: 2, y: 0, z: 7 })
    expect(() => validateJoin(placements, shapes())).not.toThrow()
  })

  it('requires every instance and every unique template exactly once', () => {
    const placements = createPlacements(createWorld())
    expect(() => validateJoin(placements.slice(1), shapes())).toThrow(/MISSING_INSTANCE/)
    expect(() => validateJoin([...placements, placements[0]!], shapes())).toThrow(/DUPLICATE_INSTANCE/)
    expect(() => validateJoin(placements, shapes().slice(1))).toThrow(/MISSING_ASSET/)
    expect(() => validateJoin(placements, [...shapes(), shapes()[0]!])).toThrow(/DUPLICATE_ASSET/)
    expect(() => validateJoin([...placements, { ...placements[0]!, instanceId: 'unowned' }], shapes())).toThrow(/UNKNOWN_INSTANCE/)
  })

  it.each([
    ['rootScale', { x: 0.01, y: 0.01, z: 0.01 }, 'UNIT_SCALE'],
    ['rootScale', { x: -1, y: 1, z: 1 }, 'UNIT_SCALE'],
    ['rootPosition', { x: 0.2, y: 0, z: 0 }, 'ROOT_TRANSFORM'],
    ['rootYaw', 0.1, 'ROOT_TRANSFORM'],
    ['units', 'centimeters', 'COORDINATES'],
    ['front', '-Z', 'COORDINATES'],
    ['pivot', 'center', 'COORDINATES'],
  ])('rejects incorrect template %s', (field, value, code) => {
    const assets = shapes()
    assets[1] = { ...assets[1]!, [field]: value }
    expect(() => validateJoin(createPlacements(createWorld()), assets)).toThrow(code)
  })

  it('rejects escaped, nonfinite, inverted and undersized declared geometry', () => {
    for (const bounds of [
      centered(0.51, 0.4, 0, 2.1),
      centered(0.4, 0.4, 0, 2.2),
      centered(0.4, 0.4, 0, 2.0),
      centered(0.4, 0.4, 0, Number.NaN),
      centered(0.4, 0.4, 2.1, 0),
    ]) {
      const assets = shapes()
      assets[1] = { ...assets[1]!, restBounds: bounds }
      expect(() => validateJoin(createPlacements(createWorld()), assets)).toThrow(/BOUNDS|HEIGHT/)
    }
    const assets = shapes()
    assets[3] = { ...assets[3]!, animatedBounds: centered(0.46, 0.45, 0, 1.8) }
    expect(() => validateJoin(createPlacements(createWorld()), assets)).toThrow(/BOUNDS/)
  })

  it('does not exempt decorations, floor, actors or fault visuals from placement constraints', () => {
    const original = createPlacements(createWorld())
    const invalid: Array<[string, Partial<Placement>]> = [
      ['plant/west-01', { position: { x: 0, y: 0, z: 7 } }],
      ['hall/floor', { position: { x: 8, y: 0.1, z: 7 } }],
      ['actor/technician', { position: { x: 4, y: 0, z: 3 } }],
      ['fault/coolant', { position: { x: 0, y: 0, z: 0 } }],
      ['rack/B-01', { yaw: 0 }],
      ['rack/A-01', { scale: { x: 1, y: 0.9, z: 1 } }],
      ['rack/A-01', { placementClass: 'outside-hall-decoration' }],
      ['rack/A-01', { logicalOwner: 'A-02' }],
    ]
    for (const [id, change] of invalid) {
      const changed = original.map((p) => p.instanceId === id ? { ...p, ...change } : p)
      expect(() => validateJoin(changed, shapes())).toThrow()
    }
    expect(original.filter((p) => p.placementClass === 'nonblocking-fault-visual')).toHaveLength(1)
    expect(() => validateJoin(original, shapes())).not.toThrow()
  })
})
