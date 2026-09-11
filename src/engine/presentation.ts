import { BufferGeometry, Group, Line, LineBasicMaterial, Mesh, MeshBasicMaterial, OctahedronGeometry, Vector3 } from 'three'
import { createAssetInstance } from '../assets/instance'
import type { AssetInstance } from '../assets/instance'
import type { AssetLibrary } from '../assets/library'
import { validateJoin } from '../assets/validate'
import type { WorldSnapshot } from '../world/contracts'
import { cellToWorld, createPlacements } from '../world/layout'

export function createPresentation(library: AssetLibrary, initial: WorldSnapshot) {
  const placements = createPlacements(initial)
  validateJoin(placements, library.manifest.assets.map((entry) => entry.shape))
  const root = new Group()
  root.name = 'hall-presentation'
  const instances = new Map<string, AssetInstance>()
  const routeMaterial = new LineBasicMaterial({ color: 0x116e87 })
  const route = new Line(new BufferGeometry(), routeMaterial)
  route.name = 'route'
  const markerGeometry = new OctahedronGeometry(0.24)
  const markerMaterial = new MeshBasicMaterial({ color: 0xffb347 })
  const marker = new Mesh(markerGeometry, markerMaterial)
  marker.name = 'fault-indicator'
  root.add(route, marker)
  let previous = initial
  let yaw = 0
  let disposed = false

  function dispose() {
    if (disposed) return
    disposed = true
    root.removeFromParent()
    for (const instance of instances.values()) instance.dispose()
    instances.clear()
    route.geometry.dispose()
    routeMaterial.dispose()
    markerGeometry.dispose()
    markerMaterial.dispose()
    root.clear()
  }

  try {
    for (const placement of placements) {
      const instance = createAssetInstance(placement.instanceId, library.acquire(placement.assetId))
      instances.set(placement.instanceId, instance)
      instance.setPlacement(placement.position, placement.yaw)
      instance.root.visible = placement.visible
      instance.model.traverse((node) => {
        if (node instanceof Mesh) {
          node.castShadow = placement.placementClass !== 'floor'
          node.receiveShadow = true
        }
      })
      root.add(instance.root)
    }
    instances.get('actor/technician')!.present('idle')
  } catch (cause) {
    dispose()
    throw cause
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
    actor.setPlacement(cellToWorld(world.player.cell), yaw)
    const previousClip = actor.currentClip
    actor.present(world.player.mode)
    // A true transition owns its time-zero pose; later completed ticks advance it.
    if (world.clock.tick === previous.clock.tick + 1 && actor.currentClip === previousClip) actor.advanceTick()
    const leak = instances.get('fault/coolant')!
    leak.setPlacement(cellToWorld({ x: rack.cell.x, z: rack.cell.z - rack.front }), 0)
    leak.root.visible = world.fault.status !== 'resolved'
    marker.visible = leak.root.visible
    marker.position.set(rack.cell.x, 2.65, rack.cell.z)
    route.visible = world.player.path.length > 0
    if (world.player.path !== previous.player.path
      || world.player.cell.x !== previous.player.cell.x || world.player.cell.z !== previous.player.cell.z) {
      const nextGeometry = new BufferGeometry().setFromPoints([world.player.cell, ...world.player.path]
        .map((cell) => new Vector3(cell.x, 0.035, cell.z)))
      route.geometry.dispose()
      route.geometry = nextGeometry
      route.geometry.computeBoundingSphere()
    }
    previous = world
  }

  function reset(world: WorldSnapshot) {
    if (disposed) return
    yaw = 0
    instances.get('actor/technician')!.present(null)
    previous = world
    present(world)
  }

  present(initial)
  return { root, instances: instances as ReadonlyMap<string, AssetInstance>, marker, route, present, reset, dispose }
}

export type Presentation = ReturnType<typeof createPresentation>
