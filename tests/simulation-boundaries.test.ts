import { describe, expect, it } from 'vitest'
import { commandWorld, createWorld, tickWorld } from '../src/world/simulation'

describe('preserved E2 boundary behavior', () => {
  it('moves on global tick five, not five ticks after the command', () => {
    let world = tickWorld(tickWorld(createWorld()))
    world = commandWorld(world, { type: 'move', cell: { x: 3, z: 7 } })
    world = tickWorld(tickWorld(world))
    expect(world.clock.tick).toBe(4)
    expect(world.player.cell).toEqual({ x: 2, z: 7 })
    world = tickWorld(world)
    expect(world.player.cell).toEqual({ x: 3, z: 7 })
  })

  it('invalid and same-cell manual commands preserve work and hidden dispatch intent', () => {
    let world = commandWorld(createWorld(), { type: 'dispatch' })
    world = commandWorld(world, { type: 'move', cell: world.player.cell })
    world = commandWorld(world, { type: 'move', cell: { x: -1, z: 0 } })
    for (let ticks = 0; ticks < 300 && world.player.mode !== 'repairing'; ticks++) world = tickWorld(world)
    expect(world.player.mode).toBe('repairing')
    expect(world.fault.progress).toBe(0)
    world = tickWorld(world)
    for (const cell of [world.player.cell, { x: -1, z: 0 }, { x: Number.NaN, z: 0 }]) {
      const rejected = commandWorld(world, { type: 'move', cell })
      expect(rejected.player.mode).toBe('repairing')
      expect(rejected.fault.progress).toBe(1 / 120)
      expect(tickWorld(rejected).fault.progress).toBe(2 / 120)
    }
  })

  it.each([Infinity, -Infinity, Number.MAX_SAFE_INTEGER + 1, 0.1])(
    'rejects invalid seed %s without changing the safe-integer/uint32 contract', (seed) => {
      expect(() => createWorld(seed)).toThrow(/finite integer/)
    },
  )

  it('accepts zero and negative safe integers and preserves uint32-equivalent seeded choices', () => {
    expect(createWorld(0).seed).toBe(0)
    expect(createWorld(-1).seed).toBe(-1)
    expect(createWorld(-1).fault.rackId).toBe(createWorld(4_294_967_295).fault.rackId)
  })
})
