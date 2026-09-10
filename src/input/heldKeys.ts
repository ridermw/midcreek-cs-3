import { ContractError } from '../assets/contracts'
import type { WorldCommand, WorldSnapshot } from '../world/contracts'
import { movementForKey } from './keyboard'

export type ClearReason = 'blur' | 'hidden' | 'focus' | 'pause' | 'restart' | 'pointer' | 'dispatch' | 'failure' | 'teardown'
export interface HeldKeys {
  keyDown(key: string, repeat: boolean): boolean
  keyUp(key: string): void
  clear(reason: ClearReason): void
  sample(world: WorldSnapshot, heading: number): WorldCommand | null
}

function normalized(key: string): string {
  return key.length === 1 ? key.toLowerCase() : key
}

export function createHeldKeys(): HeldKeys {
  const held = new Set<string>()
  const has = (arrow: string, letter: string) => held.has(arrow) || held.has(letter)
  return {
    keyDown(key, repeat) {
      const physical = normalized(key)
      if (repeat || movementForKey(physical, 0) === null) return false
      held.add(physical)
      return true
    },
    keyUp(key) { held.delete(normalized(key)) },
    clear(_reason) { held.clear() },
    sample(world, heading) {
      if (!Number.isInteger(heading) || heading < 0 || heading > 3) {
        throw new ContractError('INVALID_HEADING', String(heading), 'expected a committed quarter-turn 0..3')
      }
      if (world.paused) return null
      const vertical = Number(has('ArrowDown', 's')) - Number(has('ArrowUp', 'w'))
      const horizontal = Number(has('ArrowRight', 'd')) - Number(has('ArrowLeft', 'a'))
      const key = vertical < 0 ? 'ArrowUp' : vertical > 0 ? 'ArrowDown'
        : horizontal < 0 ? 'ArrowLeft' : horizontal > 0 ? 'ArrowRight' : null
      if (!key) return null
      const delta = movementForKey(key, heading)!
      return {
        type: 'move',
        cell: { x: world.player.cell.x + delta.x, z: world.player.cell.z + delta.z },
      }
    },
  }
}
