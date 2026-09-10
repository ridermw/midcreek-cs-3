import { describe, expect, it } from 'vitest'
import { commandWorld, createWorld, tickWorld } from '../world/simulation'
import { createSession, replaySession } from './session'

function ready() {
  const session = createSession({ identity: 'unit-test-source' })
  session.setReady(true)
  return session
}

describe('ordered fixed-tick session', () => {
  it('does not advance or accept commands before readiness or after disposal', () => {
    const session = createSession({ identity: 'unit-test-source' })
    expect(session.enqueue({ type: 'dispatch' })).toBe(false)
    session.advanceTick()
    expect(session.snapshot().clock.tick).toBe(0)
    session.setReady(true)
    session.advanceTick()
    expect(session.snapshot().clock.tick).toBe(1)
    session.dispose()
    session.advanceTick()
    expect(session.enqueue({ type: 'dispatch' })).toBe(false)
    expect(session.snapshot().clock.tick).toBe(1)
  })

  it('resamples from each current cell during catch-up instead of the initial cell', () => {
    const session = ready()
    session.pump(0)
    session.held.keyDown('ArrowRight', false)
    const ticks = session.pump(250)
    expect(ticks).toHaveLength(7)
    expect(session.snapshot().clock.tick).toBe(7)
    expect(session.snapshot().player.cell).toEqual({ x: 3, z: 7 })
    expect(session.snapshot().player.path).toEqual([{ x: 4, z: 7 }])
    session.pump(350)
    expect(session.snapshot().player.cell).toEqual({ x: 4, z: 7 })
  })

  it('release stops future commands but permits exactly the last committed step', () => {
    const session = ready()
    session.held.keyDown('ArrowRight', false)
    session.advanceTick()
    session.held.keyUp('ArrowRight')
    for (let i = 0; i < 19; i++) session.advanceTick()
    expect(session.snapshot().player.cell).toEqual({ x: 3, z: 7 })
    expect(session.replayLog().operations.filter((op) => op.kind === 'command')).toHaveLength(1)
  })

  it('pointer and dispatch commands clear held input without erasing explicit routes', () => {
    const session = ready()
    session.held.keyDown('ArrowRight', false)
    session.enqueue({ type: 'move', cell: { x: 6, z: 7 } })
    for (let i = 0; i < 20; i++) session.advanceTick()
    expect(session.snapshot().player.cell).toEqual({ x: 6, z: 7 })
    session.held.keyDown('ArrowLeft', false)
    session.enqueue({ type: 'dispatch' })
    session.advanceTick()
    expect(session.snapshot().message).toContain('dispatched')
    expect(session.held.sample(session.snapshot(), 0)).toBeNull()
  })

  it('drains ordered pause/resume at the same tick and discards the paused backlog', () => {
    const session = ready()
    session.pump(0)
    session.held.keyDown('ArrowRight', false)
    session.enqueue({ type: 'pause' })
    session.pump(50)
    session.pump(10_000)
    expect(session.snapshot().clock.tick).toBe(0)
    session.enqueue({ type: 'pause' })
    expect(session.pump(20_000)).toEqual([])
    expect(session.snapshot().paused).toBe(false)
    expect(session.snapshot().clock.tick).toBe(0)
    session.pump(20_100)
    expect(session.snapshot().clock.tick).toBe(3)
    expect(session.snapshot().player.cell).toEqual({ x: 2, z: 7 })
    const commands = session.replayLog().operations.filter((op) => op.kind === 'command')
    expect(commands.map((op) => op.tickBefore)).toEqual([0, 0])
    expect(commands.map((op) => op.ordinal)).toEqual([0, 1])
  })

  it('hiding clears input and returning visible starts with zero backlog', () => {
    const session = ready()
    session.pump(0)
    session.held.keyDown('ArrowRight', false)
    session.setVisible(false)
    session.pump(30_000)
    session.setVisible(true)
    session.pump(60_000)
    expect(session.snapshot().clock.tick).toBe(0)
    session.pump(60_100)
    expect(session.snapshot().clock.tick).toBe(3)
    expect(session.snapshot().player.cell).toEqual({ x: 2, z: 7 })
  })

  it('restart resets seed/ticks/held/queued input, advances epoch and keeps replay ordinals', () => {
    const session = ready()
    session.enqueue({ type: 'move', cell: { x: 5, z: 7 } })
    for (let i = 0; i < 15; i++) session.advanceTick()
    session.held.keyDown('ArrowLeft', false)
    session.enqueue({ type: 'restart' })
    session.enqueue({ type: 'dispatch' })
    session.pump(1000)
    expect(session.snapshot()).toEqual(createWorld())
    const record = session.replayLog()
    expect(record.operations.at(-1)?.command).toEqual({ type: 'restart' })
    session.advanceTick()
    expect(session.replayLog().operations.at(-1)?.epoch).toBe(1)
    expect(session.replayLog().operations.at(-1)?.ordinal).toBe(record.operations.length)
  })

  it('records normalized immutable commands and JSON replay reconstructs every snapshot and hidden intent', () => {
    const session = ready()
    const command = { type: 'move' as const, cell: { x: 3, z: 7 } }
    session.enqueue(command)
    command.cell.x = 15
    session.advanceTick()
    expect(session.snapshot().player.path).toEqual([{ x: 3, z: 7 }])
    session.enqueue({ type: 'dispatch' })
    for (let i = 0; i < 300; i++) session.advanceTick()
    session.enqueue({ type: 'pause' }); session.pump(0)
    session.enqueue({ type: 'pause' }); session.pump(1)
    session.enqueue({ type: 'restart' }); session.pump(2)
    const record = session.replayLog()
    expect(Object.isFrozen(record.operations)).toBe(true)
    expect(Object.isFrozen(record.operations[0]?.command)).toBe(true)
    const replayed = replaySession(JSON.parse(JSON.stringify(record)))
    let expected = createWorld(record.seed)
    for (const [index, op] of record.operations.entries()) {
      expected = op.kind === 'tick' ? tickWorld(expected) : commandWorld(expected, op.command!)
      expect(replayed[index]).toEqual(expected)
    }
    expect(replayed.at(-1)).toEqual(session.snapshot())
    expect(replayed.some((world) => world.player.mode === 'repairing' && world.fault.progress === 0)).toBe(true)
    expect(replayed.some((world) => world.fault.status === 'resolved')).toBe(true)
  })

  it('rejects corrupted replay ordering, epochs, ticks and command shapes', () => {
    const session = ready()
    session.enqueue({ type: 'dispatch' })
    session.advanceTick()
    for (const change of [
      { ordinal: 4 }, { epoch: 2 }, { tickBefore: 2 }, { kind: 'nope' },
      { command: { type: 'stop' } },
    ]) {
      const record = structuredClone(session.replayLog())
      const corrupt = { ...record, operations: [{ ...record.operations[0], ...change }, ...record.operations.slice(1)] }
      expect(() => replaySession(corrupt)).toThrow(/REPLAY/)
    }
    expect(() => createSession({ identity: 'test', scenario: 'thermal' })).toThrow(/SCENARIO/)
    expect(() => ready().pump(Number.NaN)).toThrow(/CLOCK/)
  })

  it('blocked held movement preserves repair, while a valid fresh direction cancels it', () => {
    const session = ready()
    session.enqueue({ type: 'dispatch' })
    for (let i = 0; i < 300 && session.snapshot().player.mode !== 'repairing'; i++) session.advanceTick()
    const rack = session.snapshot().racks.find((rack) => rack.id === session.snapshot().fault.rackId)!
    session.held.keyDown(rack.front === -1 ? 'ArrowUp' : 'ArrowDown', false)
    for (let i = 0; i < 13; i++) session.advanceTick()
    expect(session.snapshot().fault.progress).toBe(13 / 120)
    expect(session.snapshot().player.mode).toBe('repairing')
    session.held.clear('pointer')
    session.held.keyDown('ArrowRight', false)
    session.advanceTick()
    expect(session.snapshot().player.mode).toBe('walking')
    expect(session.snapshot().fault.status).toBe('fault')
    expect(session.snapshot().fault.progress).toBe(0)
  })

  it('captures its source identity rather than retaining mutable caller metadata', () => {
    const options = { identity: 'original-build' }
    const session = createSession(options)
    options.identity = 'different-build'
    expect(session.replayLog().identity).toBe('original-build')
  })
})
