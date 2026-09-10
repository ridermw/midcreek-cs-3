import { ContractError } from '../assets/contracts'
import { createHeldKeys } from '../input/heldKeys'
import type { HeldKeys } from '../input/heldKeys'
import type { WorldCommand, WorldSnapshot } from '../world/contracts'
import { commandWorld, createWorld, tickWorld, TICK_SECONDS } from '../world/simulation'

const SIMULATION_SOURCE = '7ce1aa3a9d11cc5198167221a11f0cc5edb214e4'
interface OperationPosition { readonly ordinal: number; readonly epoch: number; readonly tickBefore: number }
export type ReplayOperation = OperationPosition & (
  | { readonly kind: 'command'; readonly command: WorldCommand }
  | { readonly kind: 'tick'; readonly command?: never }
)
export interface ReplayRecord {
  readonly schema: 1
  readonly seed: number
  readonly scenario: 'coolant-leak'
  readonly identity: string
  readonly simulationSource: string
  readonly operations: readonly ReplayOperation[]
}
export interface GameSession {
  readonly held: HeldKeys
  enqueue(command: WorldCommand): boolean
  advanceTick(): WorldSnapshot
  pump(nowMilliseconds: number): readonly WorldSnapshot[]
  snapshot(): WorldSnapshot
  replayLog(): ReplayRecord
  isReady(): boolean
  isInteractive(): boolean
  setReady(ready: boolean): void
  setVisible(visible: boolean): void
  dispose(): void
}

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function normalizeCommand(value: unknown, code = 'COMMAND'): WorldCommand {
  if (!object(value)) throw new ContractError(code, 'command', 'expected an object')
  if (value.type === 'move') {
    if (Object.keys(value).some((key) => key !== 'type' && key !== 'cell') || !object(value.cell)
      || Object.keys(value.cell).some((key) => key !== 'x' && key !== 'z')
      || typeof value.cell.x !== 'number' || typeof value.cell.z !== 'number'
      || !Number.isFinite(value.cell.x) || !Number.isFinite(value.cell.z)) {
      throw new ContractError(code, 'move', 'expected finite serializable x/z coordinates')
    }
    return Object.freeze({ type: 'move', cell: Object.freeze({ x: value.cell.x, z: value.cell.z }) })
  }
  if ((value.type === 'dispatch' || value.type === 'pause' || value.type === 'restart')
    && Object.keys(value).length === 1) return Object.freeze({ type: value.type })
  throw new ContractError(code, String(value.type), 'unknown operation or unexpected command fields')
}

// Discrete events -> ordered drain -> held sample -> one world tick.
// Pause/restart/visibility transitions clear the wall-clock backlog, not world intent.
export function createSession(options: {
  identity: string
  seed?: number
  scenario?: string
  heading?: () => number
}): GameSession {
  if (options.scenario !== undefined && options.scenario !== 'coolant-leak') {
    throw new ContractError('SCENARIO', options.scenario, 'only coolant-leak is implemented')
  }
  if (!options.identity) throw new ContractError('IDENTITY', 'session', 'source/build identity is required')
  const identity = options.identity
  let world = createWorld(options.seed)
  const seed = world.seed
  const held = createHeldKeys()
  const operations: ReplayOperation[] = []
  let queue: WorldCommand[] = []
  let epoch = 0
  let ready = false
  let visible = true
  let disposed = false
  let lastTime: number | null = null
  let accumulator = 0

  const resetClock = () => { lastTime = null; accumulator = 0 }
  function apply(command: WorldCommand): void {
    const operation = Object.freeze({
      ordinal: operations.length, epoch, tickBefore: world.clock.tick,
      kind: 'command' as const, command,
    })
    world = commandWorld(world, command)
    operations.push(operation)
    if (command.type === 'restart') epoch++
  }
  function drain(): boolean {
    const pending = queue
    queue = []
    let reset = false
    for (const command of pending) {
      apply(command)
      if (command.type === 'pause' || command.type === 'restart') {
        held.clear(command.type)
        resetClock()
        reset = true
      }
      if (command.type === 'restart') break
    }
    return reset
  }
  const session: GameSession = {
    held,
    enqueue(command) {
      if (!ready || disposed) return false
      const normalized = normalizeCommand(command)
      held.clear(normalized.type === 'move' ? 'pointer' : normalized.type)
      queue.push(normalized)
      return true
    },
    advanceTick() {
      if (!ready || disposed) return world
      if (drain() || !visible || world.paused) return world
      const command = held.sample(world, options.heading?.() ?? 0)
      if (command) apply(normalizeCommand(command))
      const operation = Object.freeze({
        ordinal: operations.length, epoch, tickBefore: world.clock.tick, kind: 'tick' as const,
      })
      world = tickWorld(world)
      operations.push(operation)
      return world
    },
    pump(now) {
      if (!Number.isFinite(now) || now < 0 || (lastTime !== null && now < lastTime)) {
        throw new ContractError('CLOCK', String(now), 'expected a finite monotonic timestamp')
      }
      if (!ready || disposed) { resetClock(); return [] }
      const previousTime = lastTime
      const reset = drain()
      lastTime = now
      if (reset || previousTime === null || !visible || world.paused) { accumulator = 0; return [] }
      accumulator += Math.min((now - previousTime) / 1000, 0.25)
      const snapshots: WorldSnapshot[] = []
      while (accumulator + 1e-12 >= TICK_SECONDS) {
        snapshots.push(session.advanceTick())
        accumulator = Math.max(0, accumulator - TICK_SECONDS)
      }
      return snapshots
    },
    snapshot: () => world,
    replayLog: () => Object.freeze({
      schema: 1, seed, scenario: 'coolant-leak', identity,
      simulationSource: SIMULATION_SOURCE, operations: Object.freeze([...operations]),
    }),
    isReady: () => ready && !disposed,
    isInteractive: () => ready && visible && !world.paused && !disposed,
    setReady(value) {
      if (disposed) throw new ContractError('SESSION_DISPOSED', 'readiness', 'cannot reactivate a disposed session')
      ready = value
      resetClock()
      if (!value) { held.clear('failure'); queue = [] }
    },
    setVisible(value) {
      visible = value
      resetClock()
      if (!value) held.clear('hidden')
    },
    dispose() {
      disposed = true
      ready = false
      queue = []
      held.clear('teardown')
      resetClock()
    },
  }
  return session
}

export function replaySession(input: unknown, expectedIdentity?: string): readonly WorldSnapshot[] {
  if (!object(input) || input.schema !== 1 || input.scenario !== 'coolant-leak'
    || input.simulationSource !== SIMULATION_SOURCE || typeof input.identity !== 'string'
    || !input.identity || (expectedIdentity !== undefined && input.identity !== expectedIdentity)
    || typeof input.seed !== 'number' || !Number.isSafeInteger(input.seed) || !Array.isArray(input.operations)) {
    throw new ContractError('REPLAY_HEADER', 'record', 'unsupported identity, schema, seed or scenario')
  }
  let world = createWorld(input.seed)
  let epoch = 0
  const snapshots: WorldSnapshot[] = []
  for (const [ordinal, operation] of input.operations.entries()) {
    if (!object(operation) || operation.ordinal !== ordinal || operation.epoch !== epoch
      || operation.tickBefore !== world.clock.tick) {
      throw new ContractError('REPLAY_ORDER', String(ordinal), 'ordinal, epoch or tickBefore mismatch')
    }
    if (operation.kind === 'command') {
      const command = normalizeCommand(operation.command, 'REPLAY_COMMAND')
      world = commandWorld(world, command)
      if (command.type === 'restart') epoch++
    } else if (operation.kind === 'tick' && operation.command === undefined && !world.paused) {
      world = tickWorld(world)
    } else {
      throw new ContractError('REPLAY_OPERATION', String(ordinal), 'unknown kind or invalid paused tick')
    }
    snapshots.push(world)
  }
  return Object.freeze(snapshots)
}
