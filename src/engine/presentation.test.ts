import { afterEach, describe, expect, it } from 'vitest'
import { loadAssetLibrary } from '../assets/library'
import { createTestCandidate, createTestManifest } from '../../tests/fixtures/assets'
import { createSession } from '../app/session'
import { createWorld, commandWorld, tickWorld } from '../world/simulation'
import { createPresentation } from './presentation'

const cleanups: (() => void)[] = []
afterEach(() => { for (const cleanup of cleanups.splice(0).reverse()) cleanup() })

async function setup() {
  const library = await loadAssetLibrary(createTestManifest(), {
    async load(entry) { return createTestCandidate(entry) },
  })
  cleanups.push(() => library.dispose())
  const view = createPresentation(library, createWorld())
  cleanups.push(() => view.dispose())
  return { library, view, actor: view.instances.get('actor/technician')! }
}

describe('snapshot-owned playable presentation', () => {
  it('joins all 37 authoritative placements and evaluates Idle at time zero', async () => {
    const { view, actor, library } = await setup()
    expect(view.instances.size).toBe(37)
    expect(library.activeLeaseCount).toBe(37)
    expect(actor.root.position.toArray()).toEqual([2, 0, 7])
    expect(actor.root.rotation.y).toBe(0)
    expect(actor.currentClip).toBe('Idle')
    expect(actor.animationTime).toBe(0)
    expect(actor.model.getObjectByName('Body')!.position.y).toBeCloseTo(0.865)
  })

  it('advances once per completed tick, never for repeated renders or paused snapshots', async () => {
    const { view, actor } = await setup()
    const session = createSession({ identity: 'presentation-test' })
    session.setReady(true)
    let world = session.snapshot()
    view.present(world)
    expect(actor.animationTime).toBe(0)
    for (let i = 0; i < 30; i++) {
      world = session.advanceTick()
      view.present(world)
      view.present(world)
    }
    expect(actor.animationTime).toBeCloseTo(1)
    session.enqueue({ type: 'pause' })
    view.present(session.advanceTick())
    view.present(session.advanceTick())
    expect(actor.animationTime).toBeCloseTo(1)
    session.setVisible(false)
    view.present(session.advanceTick())
    expect(actor.animationTime).toBeCloseTo(1)
    session.setReady(false)
    view.present(session.advanceTick())
    expect(actor.animationTime).toBeCloseTo(1)
  })

  it('faces the next route, preserves idle yaw, and resets same-mode Idle on restart', async () => {
    const { view, actor } = await setup()
    let world = commandWorld(createWorld(), { type: 'move', cell: { x: 3, z: 7 } })
    view.present(world)
    expect(actor.currentClip).toBe('Walk')
    expect(actor.root.rotation.y).toBeCloseTo(Math.PI / 2)
    for (let i = 0; i < 5; i++) { world = tickWorld(world); view.present(world) }
    expect(actor.root.position.toArray()).toEqual([3, 0, 7])
    expect(actor.currentClip).toBe('Idle')
    expect(actor.root.rotation.y).toBeCloseTo(Math.PI / 2)
    view.reset(createWorld())
    expect(actor.root.position.toArray()).toEqual([2, 0, 7])
    expect(actor.root.rotation.y).toBe(0)
    expect(actor.animationTime).toBe(0)
  })

  it('uses the completed movement delta when a queued command arrives on a movement tick', async () => {
    const { view, actor } = await setup()
    const session = createSession({ identity: 'arrival-facing' })
    session.setReady(true)
    for (let i = 0; i < 4; i++) view.present(session.advanceTick())
    session.enqueue({ type: 'move', cell: { x: 3, z: 7 } })
    view.present(session.advanceTick())
    expect(session.snapshot().player).toMatchObject({ cell: { x: 3, z: 7 }, mode: 'idle' })
    expect(actor.root.rotation.y).toBeCloseTo(Math.PI / 2)
  })

  it('holds true clip transitions at time zero on arrival and resolution ticks', async () => {
    const { view, actor } = await setup()
    let world = commandWorld(createWorld(), { type: 'dispatch' })
    view.present(world)
    while (world.player.mode === 'walking') {
      world = tickWorld(world)
      view.present(world)
    }
    expect(world.player.mode).toBe('repairing')
    expect(world.fault.progress).toBe(0)
    expect(actor.currentClip).toBe('Repair')
    expect(actor.animationTime).toBe(0)
    for (let i = 0; i < 120; i++) {
      world = tickWorld(world)
      view.present(world)
    }
    expect(world.fault.status).toBe('resolved')
    expect(actor.currentClip).toBe('Idle')
    expect(actor.animationTime).toBe(0)
  })

  it('leaves manual arrival idle, faces the rack on dispatch and hides only the resolved leak', async () => {
    const { view, actor } = await setup()
    let world = createWorld()
    const rack = world.racks.find((rack) => rack.id === world.fault.rackId)!
    world = commandWorld(world, { type: 'move', cell: { x: rack.cell.x, z: rack.cell.z - rack.front } })
    while (world.player.mode === 'walking') { world = tickWorld(world); view.present(world) }
    expect(actor.currentClip).toBe('Idle')
    world = commandWorld(world, { type: 'dispatch' })
    view.present(world)
    expect(actor.currentClip).toBe('Repair')
    expect(Math.cos(actor.root.rotation.y)).toBe(rack.front)
    for (let i = 0; i < 119; i++) { world = tickWorld(world); view.present(world) }
    expect(world.fault.progress).toBe(119 / 120)
    expect(view.instances.get('fault/coolant')!.root.visible).toBe(true)
    world = tickWorld(world); view.present(world)
    expect(actor.currentClip).toBe('Idle')
    expect(view.instances.get('fault/coolant')!.root.visible).toBe(false)
  })

  it('restores every descendant before Repair -> Walk without writing either root', async () => {
    const { view, actor } = await setup()
    let world = commandWorld(createWorld(), { type: 'dispatch' })
    while (world.player.mode !== 'repairing') { world = tickWorld(world); view.present(world) }
    const root = actor.model.getObjectByName('TechnicianRoot')!
    root.position.set(0.1, 0.2, 0.3)
    root.rotation.set(0.1, 0.2, 0.3)
    root.scale.set(1.1, 1.1, 1.1)
    world = commandWorld(world, { type: 'move', cell: { x: 2, z: 7 } })
    view.present(world)
    expect(root.position.toArray()).toEqual([0, 0, 0])
    expect(root.quaternion.toArray()).toEqual([0, 0, 0, 1])
    expect(root.scale.toArray()).toEqual([1, 1, 1])
    expect(actor.root.position.toArray()).toEqual([world.player.cell.x, 0, world.player.cell.z])
    const position = actor.root.position.clone()
    for (let i = 0; i < 60; i++) actor.advanceTick()
    expect(actor.root.position.equals(position)).toBe(true)
    expect(actor.model.position.toArray()).toEqual([0, 0, 0])
  })

  it('keeps two presentations on shared resources at independent loop phases', async () => {
    const { library, actor } = await setup()
    const second = createPresentation(library, createWorld())
    cleanups.push(() => second.dispose())
    const other = second.instances.get('actor/technician')!
    const start = actor.model.getObjectByName('Body')!.position.clone()
    for (let i = 0; i < 60; i++) actor.advanceTick()
    expect(actor.model.getObjectByName('Body')!.position.distanceTo(start)).toBeLessThan(1e-6)
    for (let i = 0; i < 15; i++) other.advanceTick()
    expect(other.animationTime).toBeCloseTo(0.5)
    expect(actor.animationTime).toBeCloseTo(2)
    actor.present('Walk')
    for (let i = 0; i < 30; i++) actor.advanceTick()
    expect(actor.model.getObjectByName('Body')!.position.distanceTo(start)).toBeLessThan(1e-6)
    actor.present('Repair')
    const repairStart = actor.model.getObjectByName('Body')!.position.clone()
    for (let i = 0; i < 60; i++) actor.advanceTick()
    expect(actor.model.getObjectByName('Body')!.position.distanceTo(repairStart)).toBeLessThan(1e-6)
  })

  it('rejects a bad join before acquiring or attaching substitute models', async () => {
    const { library } = await setup()
    const initialLeases = library.activeLeaseCount
    expect(() => createPresentation(library, {
      ...createWorld(), racks: createWorld().racks.slice(1),
    })).toThrow(/MISSING_INSTANCE/)
    expect(library.activeLeaseCount).toBe(initialLeases)
  })

  it('replaces route buffers when routes grow/shrink and releases the previous GPU geometry', async () => {
    const { view } = await setup()
    let world = commandWorld(createWorld(), { type: 'move', cell: { x: 3, z: 7 } })
    view.present(world)
    const first = view.route.geometry
    let released = 0
    first.addEventListener('dispose', () => { released++ })
    world = commandWorld(world, { type: 'dispatch' })
    view.present(world)
    expect(view.route.geometry.getAttribute('position').count).toBe(world.player.path.length + 1)
    expect(released).toBe(1)
    for (let i = 0; i < 5; i++) { world = tickWorld(world); view.present(world) }
    const points = view.route.geometry.getAttribute('position')
    expect(points.count).toBe(world.player.path.length + 1)
    expect([points.getX(0), points.getZ(0)]).toEqual([world.player.cell.x, world.player.cell.z])
    expect([points.getX(points.count - 1), points.getZ(points.count - 1)])
      .toEqual([world.player.path.at(-1)!.x, world.player.path.at(-1)!.z])
  })
})
