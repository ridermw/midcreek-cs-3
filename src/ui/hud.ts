import type { ApplicationState } from '../app/lifecycle'
import type { WorldCommand, WorldSnapshot } from '../world/contracts'
import { REPAIR_TICKS } from '../world/simulation'

export function hudState(world: WorldSnapshot, load: ApplicationState, hidden: boolean) {
  const disabled = load !== 'ready' || hidden
  const repairTicks = Math.round(world.fault.progress * REPAIR_TICKS)
  return {
    state: load !== 'ready' ? load === 'failed' ? 'Load failed' : 'Loading'
      : hidden ? 'Hidden' : world.paused ? 'Paused'
        : world.fault.status === 'resolved' ? 'Resolved'
          : world.player.mode === 'repairing' ? 'Repairing'
            : world.player.mode === 'walking' ? 'Travelling' : 'Awaiting dispatch',
    message: world.message,
    tick: String(world.clock.tick),
    repair: `${repairTicks} / ${REPAIR_TICKS}`,
    repairTicks,
    pauseLabel: world.paused ? 'Resume' : 'Pause',
    dispatchDisabled: disabled || world.paused || world.fault.status === 'resolved',
    pauseDisabled: disabled,
    restartDisabled: disabled,
    reloadVisible: load === 'failed',
  }
}

export function createHud(
  container: HTMLElement,
  onCommand: (command: WorldCommand) => void,
  readyMessage = 'Ready - local provisional assets; appearance pending.',
) {
  container.innerHTML = `
    <p id="load-status" role="status">Loading required assets...</p>
    <div class="readouts">
      <div><span>Shift</span><strong id="shift-state"></strong></div>
      <div><span>Simulation tick</span><strong id="tick"></strong></div>
      <div><span>Repair ticks</span><strong id="repair"></strong></div>
    </div>
    <p id="message" role="status" aria-live="polite"></p>
    <progress id="repair-progress" max="${REPAIR_TICKS}" value="0" aria-label="Repair progress"></progress>
    <div class="controls">
      <button id="dispatch" type="button" disabled>Dispatch technician</button>
      <button id="pause" type="button" disabled>Pause</button>
      <button id="restart" type="button" disabled>Restart seed 417</button>
      <button id="reload" type="button" hidden>Reload</button>
    </div>`
  function element<T extends HTMLElement>(id: string): T {
    const found = container.querySelector<T>(`#${id}`)
    if (!found) throw new Error(`HUD_DOM: missing ${id}`)
    return found
  }
  const state = element('shift-state')
  const tick = element('tick')
  const repair = element('repair')
  const message = element('message')
  const status = element('load-status')
  const progress = element<HTMLProgressElement>('repair-progress')
  const dispatch = element<HTMLButtonElement>('dispatch')
  const pause = element<HTMLButtonElement>('pause')
  const restart = element<HTMLButtonElement>('restart')
  const reload = element<HTMLButtonElement>('reload')
  const events = new AbortController()
  for (const [button, type] of [[dispatch, 'dispatch'], [pause, 'pause'], [restart, 'restart']] as const) {
    button.addEventListener('click', () => onCommand({ type }), { signal: events.signal })
  }
  let reloadAction: (() => void) | undefined
  reload.addEventListener('click', () => reloadAction?.(), { signal: events.signal })
  const text = (node: HTMLElement, value: string) => { if (node.textContent !== value) node.textContent = value }
  return {
    render(world: WorldSnapshot, load: ApplicationState, hidden: boolean) {
      const view = hudState(world, load, hidden)
      text(state, view.state)
      text(tick, view.tick)
      text(repair, view.repair)
      text(message, view.message)
      text(pause, view.pauseLabel)
      text(restart, `Restart seed ${world.seed}`)
      progress.value = view.repairTicks
      dispatch.disabled = view.dispatchDisabled
      pause.disabled = view.pauseDisabled
      restart.disabled = view.restartDisabled
      reload.hidden = !view.reloadVisible
    },
    loading() { text(status, 'Loading required assets...') },
    ready() { text(status, readyMessage) },
    failure(code: string, action: () => void) {
      text(status, `Unable to start (${code}). Reload to try again.`)
      reloadAction = action
    },
    dispose() { events.abort(); reloadAction = undefined },
  }
}
