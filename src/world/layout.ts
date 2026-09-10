import type { Cell, Rack, WorldSnapshot } from './contracts'
import { ContractError } from '../assets/contracts'
import type { AssetId, Placement, PlacementClass, Vector3 } from '../assets/contracts'

export const HALL = {
  width: 17,
  depth: 15,
  rackHeight: 2.1,
  technicianHeight: 1.73,
} as const

const EMPTY_PATH = Object.freeze([]) as readonly Cell[]
const DIRECTIONS = [
  { x: -1, z: 0 },
  { x: 0, z: -1 },
  { x: 1, z: 0 },
  { x: 0, z: 1 },
] as const
const ROWS = [
  { label: 'A', z: 3, front: -1 as const },
  { label: 'B', z: 5, front: 1 as const },
  { label: 'C', z: 9, front: -1 as const },
  { label: 'D', z: 11, front: 1 as const },
] as const

function freezeCell(cell: Cell): Cell {
  return Object.freeze({ x: cell.x, z: cell.z })
}

function cellKey(cell: Pick<Cell, 'x' | 'z'>): string {
  return `${cell.x},${cell.z}`
}

function isGridCoordinate(value: number, limit: number): boolean {
  return Number.isSafeInteger(value) && value >= 0 && value < limit
}

const RACKS = Object.freeze(
  ROWS.flatMap(({ label, z, front }) =>
    Array.from({ length: 8 }, (_, index): Rack =>
      Object.freeze({
        id: `${label}-${String(index + 1).padStart(2, '0')}`,
        cell: freezeCell({ x: index + 4, z }),
        front,
      }),
    ),
  ),
) as readonly Rack[]
const BLOCKED = new Set(RACKS.map(({ cell }) => cellKey(cell)))

function freezePath(path: readonly Cell[]): readonly Cell[] {
  return path.length === 0 ? EMPTY_PATH : Object.freeze(path.map(freezeCell))
}

function buildPath(
  targetKey: string,
  startKey: string,
  parents: ReadonlyMap<string, string | null>,
  cells: ReadonlyMap<string, Cell>,
): readonly Cell[] {
  const path: Cell[] = []
  let currentKey: string | null = targetKey

  while (currentKey && currentKey !== startKey) {
    const cell = cells.get(currentKey)
    const parent = parents.get(currentKey)
    if (!cell || parent === undefined) {
      throw new Error('Failed to reconstruct a deterministic hall path.')
    }
    path.push(cell)
    currentKey = parent
  }

  path.reverse()
  return freezePath(path)
}

export function createRacks(): readonly Rack[] {
  return RACKS
}

export function isWalkable(cell: Cell): boolean {
  return (
    isGridCoordinate(cell.x, HALL.width) &&
    isGridCoordinate(cell.z, HALL.depth) &&
    !BLOCKED.has(cellKey(cell))
  )
}

export function findPath(start: Cell, target: Cell): readonly Cell[] | null {
  if (!isWalkable(start) || !isWalkable(target)) return null
  if (start.x === target.x && start.z === target.z) return EMPTY_PATH

  const startCell = { x: start.x, z: start.z }
  const startKey = cellKey(startCell)
  const targetKey = cellKey(target)
  const queue: Cell[] = [startCell]
  const parents = new Map<string, string | null>([[startKey, null]])
  const cells = new Map<string, Cell>([[startKey, startCell]])

  for (let index = 0; index < queue.length; index += 1) {
    const current = queue[index]!
    const currentKey = cellKey(current)

    for (const direction of DIRECTIONS) {
      const next = { x: current.x + direction.x, z: current.z + direction.z }
      const nextKey = cellKey(next)
      if (parents.has(nextKey) || !isWalkable(next)) continue
      parents.set(nextKey, currentKey)
      cells.set(nextKey, next)
      if (nextKey === targetKey) {
        return buildPath(targetKey, startKey, parents, cells)
      }
      queue.push(next)
    }
  }

  return null
}

export function cellToWorld(cell: Cell): Vector3 {
  if (!isGridCoordinate(cell.x, HALL.width) || !isGridCoordinate(cell.z, HALL.depth)) {
    throw new ContractError('INVALID_CELL', `${cell.x},${cell.z}`, 'expected an integer hall cell')
  }
  return Object.freeze({ x: cell.x, y: 0, z: cell.z })
}

export function worldToCell(point: Vector3): Cell | null {
  if (![point.x, point.y, point.z].every(Number.isFinite)) {
    throw new ContractError('INVALID_POINT', 'floor-pick', 'coordinates must be finite')
  }
  const cell = { x: Math.round(point.x), z: Math.round(point.z) }
  return isWalkable(cell) ? Object.freeze(cell) : null
}

function placement(
  instanceId: string, assetId: AssetId, logicalOwner: string,
  placementClass: PlacementClass, position: Vector3, yaw = 0, visible = true,
): Placement {
  return Object.freeze({
    instanceId, assetId, logicalOwner, placementClass,
    position: Object.freeze({ ...position }), yaw,
    scale: Object.freeze({ x: 1, y: 1, z: 1 }), visible,
  })
}

export function createPlacements(world: WorldSnapshot): readonly Placement[] {
  const faultRack = world.racks.find((rack) => rack.id === world.fault.rackId)
  if (!faultRack) throw new ContractError('MISSING_RACK', world.fault.rackId, 'fault has no logical owner')
  return Object.freeze([
    placement('hall/floor', 'floor-slab', 'hall', 'floor', { x: 8, y: 0, z: 7 }),
    ...world.racks.map((rack) => placement(
      `rack/${rack.id}`, 'rack-standard', rack.id, 'blocking-rack',
      cellToWorld(rack.cell), rack.front === 1 ? Math.PI : 0,
    )),
    placement('plant/west-01', 'cooling-unit', 'plant', 'outside-hall-decoration', { x: -1.5, y: 0, z: 7 }),
    placement('plant/east-01', 'cooling-unit', 'plant', 'outside-hall-decoration', { x: 17.5, y: 0, z: 7 }),
    placement('actor/technician', 'technician-man', 'technician', 'actor', cellToWorld(world.player.cell)),
    placement('fault/coolant', 'coolant-leak', faultRack.id, 'nonblocking-fault-visual',
      cellToWorld({ x: faultRack.cell.x, z: faultRack.cell.z - faultRack.front }),
      0, world.fault.status !== 'resolved'),
  ])
}
