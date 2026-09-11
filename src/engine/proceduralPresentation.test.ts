import { afterEach, describe, expect, it, vi } from 'vitest'
import { Box3, BoxGeometry, FileLoader, Group, Line, Mesh, TextureLoader } from 'three'
import type { BufferGeometry, Material, Object3D } from 'three'
import type { WorldSnapshot } from '../world/contracts'
import { createPlacements } from '../world/layout'
import { commandWorld, createWorld, tickWorld } from '../world/simulation'
import { createProceduralPresentation } from './proceduralPresentation'
import type { ProceduralPresentation } from './proceduralPresentation'

const cleanups: (() => void)[] = []
afterEach(() => {
  for (const cleanup of cleanups.splice(0).reverse()) cleanup()
  vi.restoreAllMocks()
})

function setup(world = createWorld(417)): ProceduralPresentation {
  const view = createProceduralPresentation(world)
  cleanups.push(() => view.dispose())
  return view
}

function meshes(root: Object3D): Mesh[] {
  const result: Mesh[] = []
  root.traverse((node) => { if (node instanceof Mesh) result.push(node) })
  return result
}

function advance(world: WorldSnapshot, ticks: number): WorldSnapshot {
  for (let index = 0; index < ticks; index++) world = tickWorld(world)
  return world
}

function startRepair(): WorldSnapshot {
  let world = commandWorld(createWorld(417), { type: 'dispatch' })
  for (let index = 0; index < 200 && world.player.mode === 'walking'; index++) {
    world = tickWorld(world)
  }
  expect(world.player.mode).toBe('repairing')
  return world
}

function routePoints(view: ProceduralPresentation): number[][] {
  const positions = view.route.geometry.getAttribute('position')
  return Array.from({ length: positions.count }, (_, index) =>
    [positions.getX(index), positions.getY(index), positions.getZ(index)])
}

describe('source-only procedural presentation', () => {
  it('creates the exact 37 authoritative placements without loading assets', () => {
    const fileLoad = vi.spyOn(FileLoader.prototype, 'load')
    const textureLoad = vi.spyOn(TextureLoader.prototype, 'load')
    const view = setup()
    expect(view.instances.size).toBe(37)
    expect(view.instances.get('actor/technician')?.position.toArray()).toEqual([2, 0, 7])
    expect(view.instances.get('rack/A-01')?.position.toArray()).toEqual([4, 0, 3])
    expect(view.instances.get('rack/B-01')?.rotation.y).toBe(Math.PI)
    const placements = createPlacements(createWorld(417))
    expect([...view.instances.keys()]).toEqual(placements.map((placement) => placement.instanceId))
    for (const placement of placements) {
      const instance = view.instances.get(placement.instanceId)!
      expect(instance.name).toBe(placement.instanceId)
      expect(instance.parent).toBe(view.root)
      expect(instance.position.toArray()).toEqual(Object.values(placement.position))
      expect(instance.rotation.y).toBe(placement.yaw)
      expect(instance.scale.toArray()).toEqual([1, 1, 1])
      expect(instance.visible).toBe(placement.visible)
      expect(meshes(instance).length).toBeGreaterThan(0)
    }
    expect(fileLoad).not.toHaveBeenCalled()
    expect(textureLoad).not.toHaveBeenCalled()
  })

  it('builds floor-centered rack shells and server shelves using shared primitives', () => {
    const view = setup()
    const first = meshes(view.instances.get('rack/A-01')!)
    const second = meshes(view.instances.get('rack/B-01')!)
    expect(first).toHaveLength(8)
    expect(second).toHaveLength(8)
    expect(first[0].geometry).toBeInstanceOf(BoxGeometry)
    expect((first[0].geometry as BoxGeometry).parameters).toMatchObject({
      width: 0.86, height: 2.4, depth: 0.9,
    })
    expect(first[0].position.toArray()).toEqual([0, 1.2, 0])
    for (let index = 0; index < first.length; index++) {
      expect(first[index]).not.toBe(second[index])
      expect(first[index].geometry).toBe(second[index].geometry)
      expect(first[index].material).toBe(second[index].material)
      expect(first[index].castShadow).toBe(true)
      expect(first[index].receiveShadow).toBe(true)
      if (index === 0) continue
      expect((first[index].geometry as BoxGeometry).parameters).toMatchObject({
        width: 0.76, height: 0.14, depth: 0.92,
      })
      expect(first[index].position.x).toBe(0)
      expect(first[index].position.y).toBeCloseTo(0.32 + (index - 1) * 0.28)
      expect(first[index].position.z).toBe(-0.02)
      expect(first[index].geometry).toBe(first[1].geometry)
    }
    const floor = view.instances.get('hall/floor')!
    const bounds = new Box3().setFromObject(floor)
    expect(bounds.min.x).toBe(-0.5)
    expect(bounds.max.x).toBe(16.5)
    expect(bounds.min.z).toBe(-0.5)
    expect(bounds.max.z).toBe(14.5)
    expect(bounds.max.y).toBeCloseTo(0)
    for (const mesh of meshes(floor)) {
      expect(mesh.castShadow).toBe(false)
      expect(mesh.receiveShadow).toBe(true)
    }
    const west = meshes(view.instances.get('plant/west-01')!)
    const east = meshes(view.instances.get('plant/east-01')!)
    expect(west.length).toBeGreaterThan(0)
    expect(east).toHaveLength(west.length)
    for (let index = 0; index < west.length; index++) {
      expect(west[index].geometry).toBe(east[index].geometry)
      expect(west[index].material).toBe(east[index].material)
    }
  })

  it('disposes every generated geometry and material exactly once', () => {
    const view = setup()
    const parent = new Group()
    parent.add(view.root)
    const geometries = new Set<BufferGeometry>()
    const materials = new Set<Material>()
    view.root.traverse((node) => {
      if (node instanceof Mesh || node instanceof Line) {
        geometries.add(node.geometry)
        const list = Array.isArray(node.material) ? node.material : [node.material]
        list.forEach((material) => materials.add(material))
      }
    })
    expect(geometries.size).toBeGreaterThan(0)
    expect(materials.size).toBeGreaterThan(0)
    const geometrySpies = [...geometries].map((geometry) => vi.spyOn(geometry, 'dispose'))
    const materialSpies = [...materials].map((material) => vi.spyOn(material, 'dispose'))
    view.dispose()
    view.dispose()
    expect(geometrySpies.every((spy) => spy.mock.calls.length === 1)).toBe(true)
    expect(materialSpies.every((spy) => spy.mock.calls.length === 1)).toBe(true)
    expect(view.root.parent).toBeNull()
    expect(view.root.children).toHaveLength(0)
    expect(view.instances.size).toBe(0)
  })

  it('presents walking cell, next-step yaw, and the complete route above the floor', () => {
    const view = setup()
    const actor = view.instances.get('actor/technician')!
    let world = commandWorld(createWorld(417), { type: 'move', cell: { x: 4, z: 7 } })
    view.present(world)
    expect(actor.position.toArray()).toEqual([2, 0, 7])
    expect(actor.rotation.y).toBeCloseTo(Math.PI / 2)
    expect(view.route.visible).toBe(true)
    const points = routePoints(view)
    expect(points.map(([x, , z]) => [x, z])).toEqual([[2, 7], [3, 7], [4, 7]])
    for (const [, y] of points) expect(y).toBeCloseTo(0.035)
    expect(view.route.geometry.boundingSphere?.radius).toBeCloseTo(1)

    world = advance(world, 5)
    view.present(world)
    expect(actor.position.x).toBe(3)
    expect(actor.position.y).toBeCloseTo(0)
    expect(actor.position.z).toBe(7)
    expect(actor.rotation.y).toBeCloseTo(Math.PI / 2)
    expect(routePoints(view).map(([x, , z]) => [x, z])).toEqual([[3, 7], [4, 7]])

    world = advance(world, 5)
    view.present(world)
    expect(actor.position.toArray()).toEqual([4, 0, 7])
    expect(actor.rotation.y).toBeCloseTo(Math.PI / 2)
    expect(actor.rotation.z).toBe(0)
    expect(view.route.visible).toBe(false)
    expect(routePoints(view).map(([x, , z]) => [x, z])).toEqual([[4, 7]])
    view.present(tickWorld(world))
    expect(actor.rotation.y).toBeCloseTo(Math.PI / 2)
  })

  it.each([
    { cell: { x: 1, z: 7 }, yaw: -Math.PI / 2 },
    { cell: { x: 2, z: 6 }, yaw: Math.PI },
    { cell: { x: 2, z: 8 }, yaw: 0 },
  ])('faces the next route step toward $cell', ({ cell, yaw }) => {
    const view = setup()
    const walking = commandWorld(createWorld(417), { type: 'move', cell })
    view.present(walking)
    expect(view.instances.get('actor/technician')!.rotation.y).toBeCloseTo(yaw)
  })

  it('uses the completed movement delta when the walking snapshot was not rendered', () => {
    const view = setup()
    const walking = commandWorld(createWorld(417), { type: 'move', cell: { x: 3, z: 7 } })
    const arrived = advance(walking, 5)
    expect(arrived.player.mode).toBe('idle')
    view.present(arrived)
    expect(view.instances.get('actor/technician')!.position.toArray()).toEqual([3, 0, 7])
    expect(view.instances.get('actor/technician')!.rotation.y).toBeCloseTo(Math.PI / 2)
  })

  it('derives walking motion only from the tick, not render count, pauses, or elapsed time', () => {
    const view = setup()
    const actor = view.instances.get('actor/technician')!
    const walking = commandWorld(createWorld(417), { type: 'move', cell: { x: 4, z: 7 } })
    const firstTick = tickWorld(walking)
    view.present(firstTick)
    expect(actor.position.y).toBeCloseTo(0.02645033635316129)
    const pose = actor.position.clone()
    for (let index = 0; index < 10; index++) view.present(firstTick)
    view.present(tickWorld(commandWorld(firstTick, { type: 'pause' })))
    view.present({ ...firstTick, clock: { tick: 1, elapsedSeconds: 999 } })
    expect(actor.position.equals(pose)).toBe(true)
    expect(actor.rotation.z).toBe(0)

    const secondTick = tickWorld(firstTick)
    view.present(secondTick)
    expect(actor.position.y).toBeCloseTo(0.04279754323328191)
    const fresh = setup(secondTick)
    expect(fresh.instances.get('actor/technician')!.position.toArray()).toEqual(actor.position.toArray())
    expect(fresh.instances.get('actor/technician')!.rotation.y).toBe(actor.rotation.y)
    expect(fresh.route.visible).toBe(true)
    expect(routePoints(fresh)).toEqual(routePoints(view))
  })

  it('faces the faulty rack, leans deterministically during repair, and clears lean on walking', () => {
    const view = setup()
    let world = startRepair()
    world = advance(world, (7 - world.clock.tick % 6) % 6)
    const rack = world.racks.find((rack) => rack.id === world.fault.rackId)!
    view.present(world)
    const actor = view.instances.get('actor/technician')!
    expect(actor.position.toArray()).toEqual([rack.cell.x, 0, rack.cell.z - rack.front])
    expect(Math.cos(actor.rotation.y)).toBe(rack.front)
    expect(actor.rotation.z).toBeCloseTo(0.06928203230275509)
    expect(view.route.visible).toBe(false)
    const lean = actor.rotation.z
    view.present(world)
    view.present(tickWorld(commandWorld(world, { type: 'pause' })))
    expect(actor.rotation.z).toBe(lean)
    const fresh = setup(world)
    expect(fresh.instances.get('actor/technician')!.rotation.z).toBe(lean)

    world = commandWorld(world, { type: 'move', cell: { x: 2, z: 7 } })
    expect(world.player.mode).toBe('walking')
    view.present(world)
    expect(actor.rotation.z).toBe(0)
    expect(actor.position.y).toBeCloseTo(Math.abs(Math.sin(world.clock.tick * Math.PI / 5)) * 0.045)
    expect(view.route.visible).toBe(true)
    expect(view.instances.get('fault/coolant')!.visible).toBe(true)
  })

  it('moves the leak to either rack service aisle and the marker above its owner', () => {
    const view = setup()
    const initial = createWorld(417)
    view.present({ ...initial, fault: { ...initial.fault, rackId: 'A-01' } })
    expect(view.instances.get('fault/coolant')!.position.toArray()).toEqual([4, 0, 4])
    expect(view.marker.position.toArray()).toEqual([4, 2.65, 3])
    view.present({ ...initial, fault: { ...initial.fault, rackId: 'B-02' } })
    expect(view.instances.get('fault/coolant')!.position.toArray()).toEqual([5, 0, 4])
    expect(view.marker.position.toArray()).toEqual([5, 2.65, 5])
    expect(view.marker.visible).toBe(true)
  })

  it('hides only the resolved fault and marker, then restores the initial state on reset', () => {
    const view = setup()
    let world = advance(startRepair(), 119)
    view.present(world)
    expect(world.fault.progress).toBe(119 / 120)
    expect(view.instances.get('fault/coolant')!.visible).toBe(true)
    expect(view.marker.visible).toBe(true)
    world = tickWorld(world)
    expect(world.fault.status).toBe('resolved')
    view.present(world)
    expect(view.instances.get('fault/coolant')!.visible).toBe(false)
    expect(view.marker.visible).toBe(false)
    expect(view.instances.get('actor/technician')!.rotation.z).toBe(0)
    expect(view.instances.get('actor/technician')!.position.y).toBe(0)
    for (const [id, instance] of view.instances) {
      if (id !== 'fault/coolant') expect(instance.visible).toBe(true)
    }

    const actor = view.instances.get('actor/technician')!
    view.reset(createWorld(417))
    expect(view.instances.get('actor/technician')).toBe(actor)
    expect(actor.position.toArray()).toEqual([2, 0, 7])
    expect(actor.rotation.y).toBe(0)
    expect(actor.rotation.z).toBe(0)
    expect(view.instances.get('fault/coolant')!.visible).toBe(true)
    expect(view.marker.visible).toBe(true)
    expect(view.route.visible).toBe(false)
    expect(routePoints(view).map(([x, , z]) => [x, z])).toEqual([[2, 7]])
  })

  it('resets route buffers and facing even into a different walking snapshot', () => {
    const view = setup()
    const initial = createWorld(417)
    const east = commandWorld(initial, { type: 'move', cell: { x: 4, z: 7 } })
    const north = commandWorld(initial, { type: 'move', cell: { x: 2, z: 5 } })
    view.present(east)
    const oldGeometry = view.route.geometry
    const released = vi.spyOn(oldGeometry, 'dispose')
    view.reset(north)
    expect(view.instances.get('actor/technician')!.rotation.y).toBe(Math.PI)
    expect(view.route.visible).toBe(true)
    expect(routePoints(view).map(([x, , z]) => [x, z])).toEqual([[2, 7], [2, 6], [2, 5]])
    expect(released).toHaveBeenCalledTimes(1)
    view.reset(initial)
    view.reset(initial)
    expect(view.instances.get('actor/technician')!.rotation.y).toBe(0)
    expect(view.route.visible).toBe(false)
    expect(routePoints(view).map(([x, , z]) => [x, z])).toEqual([[2, 7]])
    view.dispose()
    expect(released).toHaveBeenCalledTimes(1)
  })

  it('replaces growing and shrinking routes, disposing retired and final geometry exactly once', () => {
    const view = setup()
    const initial = createWorld(417)
    const emptyGeometry = view.route.geometry
    const emptyReleased = vi.spyOn(emptyGeometry, 'dispose')
    const short = commandWorld(initial, { type: 'move', cell: { x: 3, z: 7 } })
    view.present(short)
    expect(emptyReleased).toHaveBeenCalledTimes(1)
    const shortGeometry = view.route.geometry
    const shortReleased = vi.spyOn(shortGeometry, 'dispose')
    view.present(short)
    view.present(tickWorld(short))
    expect(view.route.geometry).toBe(shortGeometry)
    expect(shortReleased).not.toHaveBeenCalled()
    const long = commandWorld(short, { type: 'move', cell: { x: 5, z: 7 } })
    view.present(long)
    expect(shortReleased).toHaveBeenCalledTimes(1)
    expect(routePoints(view).map(([x, , z]) => [x, z])).toEqual([[2, 7], [3, 7], [4, 7], [5, 7]])
    const longReleased = vi.spyOn(view.route.geometry, 'dispose')
    view.present(advance(long, 5))
    expect(longReleased).toHaveBeenCalledTimes(1)
    expect(routePoints(view).map(([x, , z]) => [x, z])).toEqual([[3, 7], [4, 7], [5, 7]])
    const lastReleased = vi.spyOn(view.route.geometry, 'dispose')
    view.dispose()
    view.dispose()
    for (const released of [emptyReleased, shortReleased, longReleased, lastReleased]) {
      expect(released).toHaveBeenCalledTimes(1)
    }
  })

  it('owns shared resources per presentation and ignores updates after disposal', () => {
    const first = setup()
    const second = setup()
    const firstMesh = meshes(first.instances.get('rack/A-01')!)[0]
    const secondMesh = meshes(second.instances.get('rack/A-01')!)[0]
    expect(firstMesh.geometry).not.toBe(secondMesh.geometry)
    expect(firstMesh.material).not.toBe(secondMesh.material)
    const secondReleased = vi.spyOn(secondMesh.geometry, 'dispose')
    const actor = first.instances.get('actor/technician')!
    const before = actor.position.clone()
    const routeGeometry = first.route.geometry
    first.dispose()
    const walking = commandWorld(createWorld(417), { type: 'move', cell: { x: 3, z: 7 } })
    first.present(tickWorld(walking))
    first.reset(walking)
    expect(first.instances.size).toBe(0)
    expect(first.root.children).toHaveLength(0)
    expect(first.route.geometry).toBe(routeGeometry)
    expect(actor.position.equals(before)).toBe(true)
    expect(secondReleased).not.toHaveBeenCalled()
    second.present(tickWorld(walking))
    expect(second.instances.get('actor/technician')!.position.y).toBeGreaterThan(0)
    second.dispose()
    expect(secondReleased).toHaveBeenCalledTimes(1)
  })
})
