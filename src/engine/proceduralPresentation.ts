import {
  BoxGeometry, BufferGeometry, CircleGeometry, Group, Line, LineBasicMaterial,
  Mesh, MeshBasicMaterial, MeshStandardMaterial, OctahedronGeometry, SphereGeometry, Vector3,
} from 'three'
import type { Material, Object3D } from 'three'
import type { Placement } from '../assets/contracts'
import type { WorldSnapshot } from '../world/contracts'
import { cellToWorld, createPlacements, HALL } from '../world/layout'

export interface ProceduralPresentation {
  readonly root: Group
  readonly marker: Object3D
  readonly instances: ReadonlyMap<string, Object3D>
  readonly route: Line
  present(world: WorldSnapshot): void
  reset(world: WorldSnapshot): void
  dispose(): void
}

export function createProceduralPresentation(initial: WorldSnapshot): ProceduralPresentation {
  const placements = createPlacements(initial)
  const root = new Group()
  root.name = 'hall-presentation'
  const instances = new Map<string, Object3D>()
  const geometries = new Set<BufferGeometry>()
  const materials = new Set<Material>()
  let previous = initial
  let yaw = 0
  let disposed = false

  function geometry<T extends BufferGeometry>(value: T): T {
    geometries.add(value)
    return value
  }

  function material<T extends Material>(value: T): T {
    materials.add(value)
    return value
  }

  const floorGeometry = geometry(new BoxGeometry(HALL.width, 0.15, HALL.depth))
  const rackGeometry = geometry(new BoxGeometry(0.86, 2.4, 0.9))
  const serverGeometry = geometry(new BoxGeometry(0.76, 0.14, 0.92))
  const coolingGeometry = geometry(new BoxGeometry(1.2, 2.1, 2.2))
  const ventGeometry = geometry(new BoxGeometry(1.02, 0.12, 2.22))
  const bodyGeometry = geometry(new BoxGeometry(0.44, 0.64, 0.26))
  const headGeometry = geometry(new SphereGeometry(0.195, 12, 8))
  const legGeometry = geometry(new BoxGeometry(0.16, 0.7, 0.2))
  const armGeometry = geometry(new BoxGeometry(0.14, 0.56, 0.2))
  const leakGeometry = geometry(new CircleGeometry(0.6, 24))
  const floorMaterial = material(new MeshStandardMaterial({ color: 0xdde6eb, roughness: 0.9 }))
  const rackMaterial = material(new MeshStandardMaterial({ color: 0x273943, roughness: 0.65, metalness: 0.25 }))
  const serverMaterial = material(new MeshStandardMaterial({ color: 0x65838f, roughness: 0.5, metalness: 0.35 }))
  const coolingMaterial = material(new MeshStandardMaterial({ color: 0xa8c9d5, roughness: 0.65 }))
  const technicianMaterial = material(new MeshStandardMaterial({ color: 0xf0a33a, roughness: 0.85 }))
  const headMaterial = material(new MeshStandardMaterial({ color: 0xe6bc94, roughness: 0.9 }))
  const leakMaterial = material(new MeshStandardMaterial({ color: 0x22afca, roughness: 0.25 }))
  const route = new Line(createRouteGeometry(initial), material(new LineBasicMaterial({ color: 0x116e87 })))
  route.name = 'route'
  const marker = new Mesh(
    geometry(new OctahedronGeometry(0.24)),
    material(new MeshBasicMaterial({ color: 0xffb347 })),
  )
  marker.name = 'fault-indicator'
  root.add(route, marker)

  function floorSlab(): Object3D {
    const root = new Group()
    const slab = new Mesh(floorGeometry, floorMaterial)
    slab.position.y = -0.075
    root.add(slab)
    return root
  }

  function rack(): Object3D {
    const root = new Group()
    const shell = new Mesh(rackGeometry, rackMaterial)
    shell.position.y = 1.2
    shell.castShadow = true
    shell.receiveShadow = true
    root.add(shell)
    for (let y = 0.32; y < 2.2; y += 0.28) {
      const server = new Mesh(serverGeometry, serverMaterial)
      server.position.set(0, y, -0.02)
      root.add(server)
    }
    return root
  }

  function coolingUnit(): Object3D {
    const root = new Group()
    const shell = new Mesh(coolingGeometry, coolingMaterial)
    shell.position.y = 1.05
    root.add(shell)
    for (let y = 0.5; y < 1.8; y += 0.3) {
      const vent = new Mesh(ventGeometry, rackMaterial)
      vent.position.y = y
      root.add(vent)
    }
    return root
  }

  function technician(): Object3D {
    const root = new Group()
    const body = new Mesh(bodyGeometry, technicianMaterial)
    body.position.y = 1.02
    const head = new Mesh(headGeometry, headMaterial)
    head.position.y = 1.535
    root.add(body, head)
    for (const side of [-1, 1]) {
      const leg = new Mesh(legGeometry, rackMaterial)
      leg.position.set(side * 0.12, 0.35, 0)
      const arm = new Mesh(armGeometry, technicianMaterial)
      arm.position.set(side * 0.3, 1.02, 0)
      root.add(leg, arm)
    }
    return root
  }

  function coolantLeak(): Object3D {
    const root = new Group()
    const puddle = new Mesh(leakGeometry, leakMaterial)
    puddle.rotation.x = -Math.PI / 2
    puddle.scale.y = 0.7
    puddle.position.y = 0.018
    root.add(puddle)
    return root
  }

  const factories: Record<Placement['assetId'], () => Object3D> = {
    'floor-slab': floorSlab,
    'rack-standard': rack,
    'cooling-unit': coolingUnit,
    'technician-man': technician,
    'coolant-leak': coolantLeak,
  }

  for (const placement of placements) {
    const instance = factories[placement.assetId]()
    instance.name = placement.instanceId
    instance.position.copy(placement.position)
    instance.rotation.y = placement.yaw
    instance.scale.copy(placement.scale)
    instance.visible = placement.visible
    instance.traverse((node) => {
      if (node instanceof Mesh) {
        node.castShadow = placement.placementClass !== 'floor'
        node.receiveShadow = true
      }
    })
    instances.set(placement.instanceId, instance)
    root.add(instance)
  }

  function createRouteGeometry(world: WorldSnapshot): BufferGeometry {
    const next = geometry(new BufferGeometry().setFromPoints([world.player.cell, ...world.player.path]
      .map((cell) => new Vector3(cell.x, 0.035, cell.z))))
    next.computeBoundingSphere()
    return next
  }

  function updateRoute(world: WorldSnapshot) {
    const next = createRouteGeometry(world)
    geometries.delete(route.geometry)
    route.geometry.dispose()
    route.geometry = next
  }

  function present(world: WorldSnapshot) {
    if (disposed) return
    const actor = instances.get('actor/technician')!
    const rack = world.racks.find((rack) => rack.id === world.fault.rackId)!
    const next = world.player.mode === 'walking' ? world.player.path[0]
      : world.player.mode === 'repairing' ? rack.cell : undefined
    if (next) yaw = Math.atan2(next.x - world.player.cell.x, next.z - world.player.cell.z)
    else if (world.player.cell.x !== previous.player.cell.x || world.player.cell.z !== previous.player.cell.z) {
      yaw = Math.atan2(world.player.cell.x - previous.player.cell.x, world.player.cell.z - previous.player.cell.z)
    }
    actor.position.copy(cellToWorld(world.player.cell))
    actor.rotation.y = yaw
    actor.position.y = world.player.mode === 'walking'
      ? Math.abs(Math.sin(world.clock.tick * Math.PI / 5)) * 0.045
      : 0
    actor.rotation.z = world.player.mode === 'repairing'
      ? Math.sin(world.clock.tick * Math.PI / 3) * 0.08
      : 0
    const leak = instances.get('fault/coolant')!
    leak.position.copy(cellToWorld({ x: rack.cell.x, z: rack.cell.z - rack.front }))
    leak.visible = world.fault.status !== 'resolved'
    marker.visible = leak.visible
    marker.position.set(rack.cell.x, 2.65, rack.cell.z)
    route.visible = world.player.path.length > 0
    if (world.player.path !== previous.player.path
      || world.player.cell.x !== previous.player.cell.x || world.player.cell.z !== previous.player.cell.z) {
      updateRoute(world)
    }
    previous = world
  }

  function reset(world: WorldSnapshot) {
    if (disposed) return
    yaw = 0
    previous = world
    updateRoute(world)
    present(world)
  }

  function dispose() {
    if (disposed) return
    disposed = true
    root.removeFromParent()
    for (const value of geometries) value.dispose()
    for (const value of materials) value.dispose()
    geometries.clear()
    materials.clear()
    instances.clear()
    root.clear()
  }

  present(initial)
  return { root, marker, route, instances, present, reset, dispose }
}
