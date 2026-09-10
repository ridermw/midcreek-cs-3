import { describe, expect, it } from 'vitest'
import { createWorld } from '../world/simulation'
import { createHeldKeys } from './heldKeys'

const MATRIX = [
  [{ x: 0, z: -1 }, { x: 0, z: 1 }, { x: -1, z: 0 }, { x: 1, z: 0 }],
  [{ x: -1, z: 0 }, { x: 1, z: 0 }, { x: 0, z: 1 }, { x: 0, z: -1 }],
  [{ x: 0, z: 1 }, { x: 0, z: -1 }, { x: 1, z: 0 }, { x: -1, z: 0 }],
  [{ x: 1, z: 0 }, { x: -1, z: 0 }, { x: 0, z: -1 }, { x: 0, z: 1 }],
]
const KEYS = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']

describe('fixed-tick physical held keys', () => {
  for (let heading = 0; heading < 4; heading++) {
    for (const [index, key] of KEYS.entries()) {
      it(`${key} at heading ${heading} samples the committed camera direction`, () => {
        const held = createHeldKeys()
        held.keyDown(key, false)
        const delta = MATRIX[heading]![index]!
        expect(held.sample(createWorld(), heading)).toEqual({
          type: 'move', cell: { x: 2 + delta.x, z: 7 + delta.z },
        })
      })
    }
  }

  it('normalizes aliases without multiplying movement or releasing a different physical key', () => {
    const held = createHeldKeys()
    held.keyDown('W', false)
    held.keyDown('ArrowUp', false)
    held.keyUp('w')
    expect(held.sample(createWorld(), 0)).toEqual({ type: 'move', cell: { x: 2, z: 6 } })
    held.keyUp('ArrowUp')
    expect(held.sample(createWorld(), 0)).toBeNull()
    expect(held.keyDown('Tab', false)).toBe(false)
  })

  it('cancels opposites before vertical-first precedence in either press order', () => {
    const cases = [
      { keys: ['ArrowUp', 'ArrowDown'], cell: null },
      { keys: ['ArrowLeft', 'ArrowRight'], cell: null },
      { keys: ['ArrowUp', 'ArrowLeft'], cell: { x: 2, z: 6 } },
      { keys: ['ArrowUp', 'ArrowRight'], cell: { x: 2, z: 6 } },
      { keys: ['ArrowDown', 'ArrowLeft'], cell: { x: 2, z: 8 } },
      { keys: ['ArrowDown', 'ArrowRight'], cell: { x: 2, z: 8 } },
      { keys: ['ArrowUp', 'ArrowDown', 'ArrowRight'], cell: { x: 3, z: 7 } },
      { keys: ['ArrowUp', 'ArrowDown', 'ArrowLeft'], cell: { x: 1, z: 7 } },
      { keys: ['ArrowLeft', 'ArrowRight', 'ArrowUp'], cell: { x: 2, z: 6 } },
      { keys: ['ArrowLeft', 'ArrowRight', 'ArrowDown'], cell: { x: 2, z: 8 } },
      { keys: KEYS, cell: null },
    ]
    for (const { keys, cell } of cases) {
      for (const order of [keys, [...keys].reverse()]) {
        const held = createHeldKeys()
        order.forEach((key) => held.keyDown(key, false))
        expect(held.sample(createWorld(), 0)).toEqual(cell ? { type: 'move', cell } : null)
      }
    }
  })

  it('ignores repeat storms and cannot resume from a repeated keydown after clearing', () => {
    const held = createHeldKeys()
    held.keyDown('ArrowRight', false)
    for (let i = 0; i < 50; i++) expect(held.keyDown('ArrowRight', true)).toBe(false)
    expect(held.sample(createWorld(), 0)).toEqual({ type: 'move', cell: { x: 3, z: 7 } })
    held.clear('blur')
    held.keyDown('ArrowRight', true)
    expect(held.sample(createWorld(), 0)).toBeNull()
    held.keyUp('ArrowRight')
    held.keyDown('ArrowRight', false)
    expect(held.sample(createWorld(), 0)).not.toBeNull()
    expect(() => held.sample(createWorld(), Infinity)).toThrow(/HEADING/)
  })
})
