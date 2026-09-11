import type { Cell } from '../src/world/contracts.ts'
import type { FrameReceipt, WorkloadAction } from '../src/diagnostics/metrics.ts'

export interface NativeRecipe {
  readonly firstFrames: number
  readonly warmupSeconds: number
  readonly windowFrames: number
  readonly walkLoop: readonly Cell[]
}
export type NativeDirective =
  | WorkloadAction
  | { readonly type: 'view'; readonly beforeRender: number; readonly heading: number; readonly viewport: readonly [number, number] }
  | { readonly type: 'stop'; readonly beforeRender: number }

// Self-contained so the very same state machine can run in the page and portable tests.
export function createNativeWorkload(recipe: NativeRecipe) {
  let warmupEnd = -1
  let orbitStart = -1
  let route = 0
  let previous = 0
  return {
    observe(frame: FrameReceipt): NativeDirective[] {
      const count = frame.renderCount
      if (count !== previous + 1) throw new Error(`WORKLOAD_SEQUENCE: expected ${previous + 1}, got ${count}`)
      previous = count
      if (warmupEnd < 0 && count >= recipe.firstFrames && frame.simulationSeconds >= recipe.warmupSeconds) warmupEnd = count
      if (warmupEnd < 0) return []
      const walkingStart = warmupEnd + recipe.windowFrames
      const dispatchStart = walkingStart + recipe.windowFrames
      if (count >= walkingStart && count < dispatchStart && !frame.path.length) {
        return [{ type: 'move', beforeRender: count + 1, cell: recipe.walkLoop[route++ % recipe.walkLoop.length]! }]
      }
      if (count === dispatchStart) return [{ type: 'dispatch', beforeRender: count + 1 }]
      if (count > dispatchStart && orbitStart < 0 && frame.fault.status === 'resolved') orbitStart = count
      if (orbitStart < 0) return []
      const offset = count - orbitStart
      if (offset === recipe.windowFrames) return [{ type: 'stop', beforeRender: count + 1 }]
      if (offset < recipe.windowFrames && offset % 60 === 0) return [{
        type: 'view', beforeRender: count + 1, heading: Math.floor(offset / 60) % 4,
        viewport: offset >= 120 && offset < 180 ? [1024, 768] : [1280, 720],
      }]
      return []
    },
  }
}
