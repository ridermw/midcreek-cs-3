import { describe, expect, it } from 'vitest'
import { createWorld, commandWorld } from '../world/simulation'
import { hudState } from './hud'

describe('HUD state projection', () => {
  it('disables all gameplay until ready and exposes Reload only on failure', () => {
    for (const state of ['loading', 'failed'] as const) {
      const view = hudState(createWorld(), state, false)
      expect(view.dispatchDisabled).toBe(true)
      expect(view.pauseDisabled).toBe(true)
      expect(view.restartDisabled).toBe(true)
      expect(view.reloadVisible).toBe(state === 'failed')
    }
  })

  it('shows simulation time, state, message and integer repair ticks without another timer', () => {
    const world = {
      ...createWorld(), clock: { tick: 164, elapsedSeconds: 164 / 30 },
      player: { ...createWorld().player, mode: 'repairing' as const },
      fault: { ...createWorld().fault, status: 'working' as const, progress: 119 / 120 },
    }
    expect(hudState(world, 'ready', false)).toMatchObject({
      tick: '164', repair: '119 / 120', message: world.message, state: 'Repairing',
      pauseLabel: 'Pause', reloadVisible: false,
    })
  })

  it('keeps resume/restart available while paused, but gates hidden gameplay', () => {
    const paused = commandWorld(createWorld(), { type: 'pause' })
    expect(hudState(paused, 'ready', false)).toMatchObject({
      state: 'Paused', pauseLabel: 'Resume', dispatchDisabled: true,
      pauseDisabled: false, restartDisabled: false,
    })
    expect(hudState(createWorld(), 'ready', true)).toMatchObject({
      state: 'Hidden', dispatchDisabled: true, pauseDisabled: true, restartDisabled: true,
    })
  })
})
