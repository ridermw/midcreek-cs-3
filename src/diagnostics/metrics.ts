import { NAMED_TARGET, PERFORMANCE_BUDGET as budget, WALK_LOOP } from '../config/performanceBudget.ts'
import type { Cell, WorldSnapshot } from '../world/contracts.ts'
import { commandWorld, createWorld, tickWorld } from '../world/simulation.ts'

export type Status = 'passed' | 'failed' | 'unqualified'
export type ResourceRole = 'html' | 'script' | 'style' | 'font' | 'selection' | 'manifest' | 'asset' | 'other'
export interface RequiredRequest {
  readonly url: string
  readonly role: Exclude<ResourceRole, 'other'>
  readonly sha256?: string
}
export interface ResourceReceipt {
  readonly url: string
  readonly role: ResourceRole
  readonly startTime: number
  readonly responseEnd: number
  readonly transferSize: number
  readonly encodedBodySize: number
  readonly decodedBodySize: number
  readonly cache: 'network' | 'local' | 'revalidated' | 'unknown'
  readonly initiatorType: string
}
export interface StartupInput {
  readonly origin: string
  readonly timeOrigin: number
  readonly readyAt: number
  readonly loadEventEnd: number
  readonly required: readonly RequiredRequest[]
  readonly resources: readonly ResourceReceipt[]
  readonly pending: readonly string[]
  readonly overflow: boolean
}
export interface StartupReceipt extends StartupInput {
  readonly transferBytes: number
  readonly issues: readonly string[]
}
export interface Dimensions {
  readonly viewport: readonly [number, number]
  readonly canvas: readonly [number, number]
  readonly logical: readonly [number, number]
  readonly drawingBuffer: readonly [number, number]
  readonly deviceDpr: number
  readonly applicationDpr: number
}
export interface FrameReceipt {
  readonly renderCount: number
  readonly startedAt: number
  readonly completedAt: number
  readonly trigger: 'startup' | 'raf' | 'resize'
  readonly tick: number
  readonly simulationSeconds: number
  readonly mode: WorldSnapshot['player']['mode']
  readonly cell: Cell
  readonly path: readonly Cell[]
  readonly fault: Pick<WorldSnapshot['fault'], 'status' | 'progress'>
  readonly paused: boolean
  readonly worldSteps: readonly WorldSnapshot[]
  readonly camera: {
    readonly heading: number
    readonly zoom: number
    readonly projection: readonly number[]
    readonly matrixWorld: readonly number[]
  }
  readonly dimensions: Dimensions
  readonly calls: number
  readonly triangles: number
  readonly visible: boolean
  readonly focused: boolean
}
export interface ReadyReceipt {
  readonly generation: number
  readonly timeOrigin: number
  readonly readyAt: number
  readonly interactiveAt: number
  readonly gpuFinishedAt: number
  readonly seed: number
  readonly scenario: string
  readonly identity: {
    readonly selectionSha256: string
    readonly manifestSha256: string
    readonly libraryDigest: string
    readonly profile: string
    readonly profileSha256: string
    readonly recipeSha256: string
    readonly assets: readonly { readonly url: string; readonly sha256: string }[]
  }
  readonly firstFrame: FrameReceipt
  readonly dimensions: Dimensions
}
export interface NamedTarget {
  readonly name: string
  readonly macModel: string
  readonly chip: string
  readonly cpuCores: number
  readonly gpuCores: number
  readonly ramGiB: number
  readonly macOS: string
  readonly display: string
  readonly refreshHz: number
  readonly powerMode: string
  readonly browserVersion: string
  readonly webglVersion: number
  readonly webglRenderer: string
  readonly backend: string
  readonly driver: string
  readonly headed: boolean
  readonly foreground: boolean
  readonly deviceScaleFactor: number
  readonly applicationDpr: number
  readonly coldNavigation: boolean
  readonly cacheDisabled: boolean
  readonly serviceWorker: boolean
  readonly compression: string
  readonly servingMode: string
  readonly applicationCommit: string
  readonly contentSha256: string
  readonly profileSha256: string
  readonly recipeSha256: string
}
export interface NetworkReceipt {
  readonly source: 'cdp'
  readonly complete: boolean
  readonly overflow: boolean
  readonly requests: readonly {
    readonly requestId: string
    readonly url: string
    readonly startTime: number
    readonly responseEnd: number | null
    readonly encodedBodySize: number | null
    readonly transferSize: number | null
    readonly cache: ResourceReceipt['cache']
    readonly failed: boolean
  }[]
}
export type PhaseName = 'first-300' | 'warmup' | 'idle' | 'walking' | 'dispatch-travel'
  | 'dispatch-repair' | 'dispatch-combined' | 'orbit-resize'
export interface Phase { readonly name: PhaseName; readonly start: number; readonly end: number }
export interface Interruption { readonly at: number; readonly kind: string; readonly detail: string }
export interface WorkloadAction {
  readonly beforeRender: number
  readonly type: 'move' | 'dispatch'
  readonly cell?: Cell
}
export interface QualificationReport {
  readonly schema: 1
  readonly runId: string
  readonly clock: 'native' | 'controlled'
  readonly target: Partial<NamedTarget>
  readonly ready: ReadyReceipt
  readonly startup: StartupReceipt
  readonly frames: readonly FrameReceipt[]
  readonly phases: readonly Phase[]
  readonly actions: readonly WorkloadAction[]
  readonly interruptions: readonly Interruption[]
  readonly network: NetworkReceipt
  readonly boundaries: {
    readonly warmupEnd: number
    readonly dispatchStart: number
    readonly repairStart: number
    readonly orbitStart: number
  }
}
const sha256 = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value)
const positive = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value > 0
const integer = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

export function immutable<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) immutable(child)
    Object.freeze(value)
  }
  return value
}

export function freezeStartup(input: StartupInput): StartupReceipt {
  const issues: string[] = []
  if (!positive(input.timeOrigin) || !positive(input.readyAt) || !positive(input.loadEventEnd)
    || input.loadEventEnd > input.readyAt) issues.push('navigation timing missing or invalid')
  if (input.overflow) issues.push('resource timing buffer overflow')
  if (input.pending.length) issues.push(`pending initial requests: ${input.pending.join(', ')}`)
  const required = new Map(input.required.map((r) => [r.url, r]))
  if (required.size !== input.required.length) issues.push('duplicate required request')
  for (const role of ['html', 'script', 'style', 'selection', 'manifest'] as const) {
    if (!input.required.some((r) => r.role === role)) issues.push(`missing required ${role}`)
  }
  const glbs = input.required.filter((r) => r.role === 'asset')
  if (glbs.length !== 5 || ['floor-slab', 'rack-standard', 'cooling-unit', 'technician-man', 'coolant-leak']
    .some((id) => glbs.filter((r) => r.url.endsWith(`/${id}.glb`)).length !== 1)) issues.push('five required GLB identities missing')
  for (const request of input.required) {
    if (!['html', 'script', 'style', 'font', 'selection', 'manifest', 'asset'].includes(request.role)) issues.push('invalid required role')
    if (['selection', 'manifest', 'asset'].includes(request.role) && !sha256(request.sha256)) issues.push(`missing identity: ${request.url}`)
  }
  const resources = input.resources.filter((r) => {
    // GLB image decode can expose blob/data entries; their bytes belong to the GLB.
    if (/^(blob:|data:)/.test(r.url)) return false
    return !Number.isFinite(r.startTime) || !Number.isFinite(r.responseEnd)
      || r.responseEnd <= input.readyAt || required.has(r.url) || r.startTime <= input.readyAt
  }).map((r) => ({ ...r, role: required.get(r.url)?.role ?? 'other' as const }))
  const seen = new Set<string>()
  let transferBytes = 0
  for (const resource of resources) {
    let sameOrigin = false
    try { sameOrigin = new URL(resource.url).origin === input.origin } catch { /* Report malformed URLs below. */ }
    if (!sameOrigin) issues.push(`unmeasurable foreign URL: ${resource.url}`)
    if (!required.has(resource.url)) issues.push(`unexpected initial request: ${resource.url}`)
    if (seen.has(resource.url)) issues.push(`duplicate response: ${resource.url}`)
    seen.add(resource.url)
    if (!Number.isFinite(resource.startTime) || resource.startTime < 0
      || !positive(resource.responseEnd) || resource.responseEnd < resource.startTime
      || resource.responseEnd > input.readyAt) issues.push(`pending or invalid response: ${resource.url}`)
    if (![resource.transferSize, resource.encodedBodySize, resource.decodedBodySize].every((v) => integer(v) && v > 0)) {
      issues.push(`unmeasurable transfer: ${resource.url}`)
    }
    if (resource.cache === 'network' && resource.transferSize !== resource.encodedBodySize + 300) {
      issues.push(`inconsistent transfer accounting: ${resource.url}`)
    }
    if (resource.cache !== 'network') issues.push(`cold cache prerequisite: ${resource.url}`)
    if (resource.responseEnd <= input.readyAt && integer(resource.transferSize)) transferBytes += resource.transferSize
  }
  for (const request of input.required) if (!seen.has(request.url)) issues.push(`missing response: ${request.url}`)
  if (!Number.isSafeInteger(transferBytes)) issues.push('unmeasurable startup byte sum')
  return immutable(structuredClone({ ...input, resources, transferBytes, issues }))
}

export interface FrameStatistics {
  readonly frames: number
  readonly intervals: number
  readonly elapsedMs: number
  readonly meanFps: number | null
  readonly p95Ms: number | null
  readonly peakCalls: number
  readonly meanCalls: number | null
  readonly peakTriangles: number
  readonly meanTriangles: number | null
}
export function frameStatistics(frames: readonly FrameReceipt[], previous?: FrameReceipt): FrameStatistics {
  const intervals = frames.flatMap((frame, i) => {
    const before = i === 0 ? previous : frames[i - 1]
    return before ? [frame.completedAt - before.completedAt] : []
  })
  const elapsedMs = intervals.reduce((total, ms) => total + ms, 0)
  const sorted = [...intervals].sort((a, b) => a - b)
  return {
    frames: frames.length, intervals: intervals.length, elapsedMs,
    meanFps: intervals.length && elapsedMs > 0 ? intervals.length * 1000 / elapsedMs : null,
    p95Ms: sorted.length ? sorted[Math.ceil(sorted.length * 0.95) - 1]! : null,
    peakCalls: frames.reduce((peak, f) => Math.max(peak, f.calls), 0),
    meanCalls: frames.length ? frames.reduce((n, f) => n + f.calls, 0) / frames.length : null,
    peakTriangles: frames.reduce((peak, f) => Math.max(peak, f.triangles), 0),
    meanTriangles: frames.length ? frames.reduce((n, f) => n + f.triangles, 0) / frames.length : null,
  }
}

export function workloadPhases(frames: readonly FrameReceipt[]): Phase[] {
  const phases: Phase[] = []
  if (frames.length >= budget.firstFrames) phases.push({ name: 'first-300', start: 0, end: budget.firstFrames })
  const warmup = frames.findIndex((f, i) => i >= budget.firstFrames - 1 && f.simulationSeconds >= budget.warmupSeconds) + 1
  if (!warmup) return phases
  phases.push({ name: 'warmup', start: 0, end: warmup })
  const idleEnd = warmup + budget.windowFrames
  const walkingEnd = idleEnd + budget.windowFrames
  if (frames.length >= idleEnd) phases.push({ name: 'idle', start: warmup, end: idleEnd })
  if (frames.length < walkingEnd) return phases
  phases.push({ name: 'walking', start: idleEnd, end: walkingEnd })
  const repair = frames.findIndex((f, i) => i >= walkingEnd && f.mode === 'repairing')
  if (repair < 0) return phases
  phases.push({ name: 'dispatch-travel', start: walkingEnd, end: repair })
  const resolved = frames.findIndex((f, i) => i >= repair && f.fault.status === 'resolved')
  if (resolved < 0) return phases
  phases.push({ name: 'dispatch-repair', start: repair, end: resolved })
  phases.push({ name: 'dispatch-combined', start: walkingEnd, end: resolved + 1 })
  if (frames.length >= resolved + 301) phases.push({ name: 'orbit-resize', start: resolved + 1, end: resolved + 301 })
  return phases
}

export function workloadDirective(phase: 'walking' | 'orbit-resize', frameIndex: number, routeIndex: number) {
  if (!integer(frameIndex) || !integer(routeIndex)) throw new Error('WORKLOAD: nonnegative integer indices required')
  return phase === 'walking'
    ? { type: 'move' as const, cell: WALK_LOOP[routeIndex % WALK_LOOP.length]! }
    : { type: 'view' as const, heading: Math.floor(frameIndex / 60) % 4,
      viewport: frameIndex >= 120 && frameIndex < 180 ? [1024, 768] as const : [1280, 720] as const }
}

export function validateTarget(target: Partial<NamedTarget>): string[] {
  const issues: string[] = []
  for (const key of ['macModel', 'macOS', 'display', 'powerMode', 'webglRenderer', 'driver', 'compression', 'servingMode'] as const) {
    if (typeof target[key] !== 'string' || !target[key]!.trim() || /^(unknown|pending|n\/a)$/i.test(target[key]!)) issues.push(`target.${key} missing`)
  }
  for (const key of ['cpuCores', 'gpuCores', 'ramGiB'] as const) {
    if (!positive(target[key]) || !integer(target[key])) issues.push(`target.${key} missing`)
  }
  const exact: Partial<NamedTarget> = {
    name: NAMED_TARGET, chip: 'Apple M4 Pro', refreshHz: 60, browserVersion: '153.0.8010.37',
    webglVersion: 2, backend: 'ANGLE Metal', headed: true, foreground: true,
    deviceScaleFactor: 1, applicationDpr: 1, coldNavigation: true, cacheDisabled: true, serviceWorker: false,
  }
  for (const key of Object.keys(exact) as (keyof NamedTarget)[]) {
    if (target[key] !== exact[key]) issues.push(`target.${key} prerequisite`)
  }
  if (!/ANGLE/i.test(target.webglRenderer ?? '') || !/Apple M4 Pro/i.test(target.webglRenderer ?? '')
    || !/Metal/i.test(target.webglRenderer ?? '')
    || /SwiftShader|software/i.test(target.webglRenderer ?? '')) issues.push('hardware WebGL renderer prerequisite')
  if (!/^[a-f0-9]{40}$/.test(target.applicationCommit ?? '')) issues.push('application commit missing')
  for (const key of ['contentSha256', 'profileSha256', 'recipeSha256'] as const) {
    if (!sha256(target[key])) issues.push(`target.${key} missing`)
  }
  return issues
}

export function reconcileStartupNetwork(startup: StartupReceipt, network: NetworkReceipt): string[] {
  const issues: string[] = []
  if (network.source !== 'cdp' || network.complete !== true || network.overflow !== false) issues.push('independent network ledger missing or incomplete')
  const initial = network.requests.filter((r) => !/^(blob:|data:)/.test(r.url)
    && (r.startTime <= startup.readyAt || (r.responseEnd !== null && r.responseEnd <= startup.readyAt)))
  const ids = new Set<string>()
  for (const request of initial) {
    if (!request.requestId || ids.has(request.requestId)) issues.push('duplicate/missing network request identity')
    ids.add(request.requestId)
    const resource = startup.resources.filter((r) => r.url === request.url && Math.abs(r.startTime - request.startTime) <= 5)
    if (resource.length !== 1 || request.failed || !Number.isFinite(request.startTime)
      || request.responseEnd === null || !Number.isFinite(request.responseEnd) || request.responseEnd > startup.readyAt
      || request.responseEnd < request.startTime || Math.abs((resource[0]?.responseEnd ?? NaN) - request.responseEnd) > 5
      || request.cache !== 'network' || !positive(request.transferSize)
      || !positive(request.encodedBodySize) || request.transferSize < request.encodedBodySize
      || resource[0]?.encodedBodySize !== request.encodedBodySize) {
      issues.push(`network mismatch/pending/unmeasurable: ${request.url}`)
    }
  }
  if (initial.length !== startup.resources.length) issues.push('network/resource ledger cardinality mismatch')
  for (const resource of startup.resources) {
    if (!initial.some((r) => r.url === resource.url && Math.abs(r.startTime - resource.startTime) <= 5)) issues.push(`network response missing: ${resource.url}`)
  }
  return issues
}

function checkDimensions(d: Dimensions, viewport: readonly number[]): boolean {
  return same(d.viewport, viewport) && same(d.logical, d.canvas)
    && same(d.canvas, [viewport[0], viewport[1]! - 120])
    && same(d.drawingBuffer, d.logical) && d.deviceDpr === 1 && d.applicationDpr === 1
}

function followsWalkingLoop(frames: readonly FrameReceipt[], phase: Phase, actions: readonly WorkloadAction[]): boolean {
  let cell = frames[phase.start - 1]!.cell
  let path: Cell[] = []
  const moves = new Map(actions.map((action) => [action.beforeRender, action.cell]))
  for (let i = phase.start; i < phase.end; i++) {
    const sample = frames[i]!
    const target = moves.get(i + 1)
    if (target) {
      if (path.length || !integer(cell.x) || !integer(cell.z) || cell.x < 2 || cell.x > 8 || cell.z < 7 || cell.z > 8
        || (cell.x !== target.x && cell.z !== target.z)) return false
      const dx = Math.sign(target.x - cell.x), dz = Math.sign(target.z - cell.z)
      const distance = Math.abs(target.x - cell.x) + Math.abs(target.z - cell.z)
      if (!distance) return false
      path = Array.from({ length: distance }, (_, n) => ({ x: cell.x + dx * (n + 1), z: cell.z + dz * (n + 1) }))
    }
    const steps = Math.min(path.length, Math.floor(sample.tick / 5) - Math.floor(frames[i - 1]!.tick / 5))
    if (steps > 0) { cell = path[steps - 1]!; path = path.slice(steps) }
    if (!same(sample.cell, cell) || !same(sample.path, path)
      || sample.mode !== (path.length ? 'walking' : 'idle') || sample.fault.progress !== 0) return false
  }
  return true
}

export interface QualificationResult {
  readonly status: Status
  readonly issues: readonly string[]
  readonly failures: readonly string[]
  readonly startupBytes: number
  readonly windows: readonly { readonly name: string; readonly start: number; readonly end: number; readonly stats: FrameStatistics; readonly status: Status }[]
}
export function qualify(report: QualificationReport): QualificationResult {
  const issues = validateTarget(report.target)
  const failures: string[] = []
  const startup = freezeStartup(report.startup)
  issues.push(...startup.issues, ...reconcileStartupNetwork(startup, report.network))
  if (!same(startup, report.startup)) issues.push('startup ledger was modified after freeze')
  if (report.schema !== 1 || !report.runId || report.clock !== 'native') issues.push('native report prerequisite')
  if (report.interruptions.length) issues.push('interrupted run')
  const { ready, frames } = report
  if (ready.timeOrigin !== startup.timeOrigin || ready.readyAt !== startup.readyAt
    || !integer(ready.generation) || ready.generation === 0
    || ready.interactiveAt !== ready.readyAt || !positive(ready.gpuFinishedAt)
    || ready.firstFrame.completedAt > ready.gpuFinishedAt || ready.gpuFinishedAt > ready.interactiveAt
    || !same(ready.firstFrame, frames[0]) || ready.seed !== 417 || ready.scenario !== 'coolant-leak') issues.push('ready receipt prerequisite')
  if (!checkDimensions(ready.dimensions, [1280, 720]) || !same(ready.dimensions, ready.firstFrame.dimensions)) {
    issues.push('ready comparison dimensions mismatch')
  }
  if (startup.resources.some((resource) => resource.role !== 'other'
    && resource.responseEnd > ready.firstFrame.startedAt)) {
    issues.push('required response completed after first render')
  }
  const identity = ready.identity
  if (![identity.selectionSha256, identity.manifestSha256, identity.libraryDigest, identity.profileSha256, identity.recipeSha256].every(sha256)
    || identity.profile !== 'cs3-standard-v1' || report.target.profileSha256 !== identity.profileSha256
    || report.target.recipeSha256 !== identity.recipeSha256) issues.push('content/profile/recipe identity mismatch')
  for (const [role, digest] of [['selection', identity.selectionSha256], ['manifest', identity.manifestSha256]] as const) {
    if (startup.required.filter((r) => r.role === role && r.sha256 === digest).length !== 1) issues.push(`${role} binding mismatch`)
  }
  const assets = startup.required.filter((r) => r.role === 'asset').map((r) => ({ url: r.url, sha256: r.sha256 }))
  if (!same(assets, identity.assets)) issues.push('asset identity mismatch')
  const expectedPhases = workloadPhases(frames)
  if (!same(report.phases, expectedPhases) || expectedPhases.length !== 8) issues.push('incomplete or modified workload boundaries')
  let replay = createWorld(ready.seed)
  const actionsByFrame = new Map(report.actions.map((action) => [action.beforeRender, action]))
  let replayMismatch = false
  const mismatch = (detail: string) => {
    if (!replayMismatch) issues.push(detail)
    replayMismatch = true
  }
  const sameCell = (left: Cell, right: Cell) => left.x === right.x && left.z === right.z
  const samePath = (left: readonly Cell[], right: readonly Cell[]) =>
    left.length === right.length && left.every((cell, index) => sameCell(cell, right[index]!))
  const sameWorld = (actual: WorldSnapshot, expected: WorldSnapshot) =>
    actual.seed === expected.seed && actual.clock.tick === expected.clock.tick
    && actual.clock.elapsedSeconds === expected.clock.elapsedSeconds
    && actual.player.mode === expected.player.mode && sameCell(actual.player.cell, expected.player.cell)
    && samePath(actual.player.path, expected.player.path)
    && actual.fault.rackId === expected.fault.rackId
    && actual.fault.status === expected.fault.status && actual.fault.progress === expected.fault.progress
    && actual.paused === expected.paused && actual.message === expected.message
  for (const [index, sample] of frames.entries()) {
    const action = actionsByFrame.get(index + 1)
    if (action) {
      replay = commandWorld(replay, action.type === 'dispatch'
        ? { type: 'dispatch' }
        : { type: 'move', cell: action.cell! })
    }
    for (const step of sample.worldSteps) {
      replay = tickWorld(replay)
      if (!sameWorld(step, replay)) mismatch(`world replay mismatch at frame ${index + 1}`)
    }
    if (sample.tick !== replay.clock.tick || sample.mode !== replay.player.mode
      || !sameCell(sample.cell, replay.player.cell) || !samePath(sample.path, replay.player.path)
      || sample.fault.status !== replay.fault.status || sample.fault.progress !== replay.fault.progress) {
      mismatch(`rendered world mismatch at frame ${index + 1}`)
    }
  }
  for (const [i, f] of frames.entries()) {
    const previous = frames[i - 1]
    if (f.renderCount !== i + 1 || !Number.isFinite(f.startedAt) || f.startedAt < 0
      || !Number.isFinite(f.completedAt) || f.completedAt < f.startedAt
      || (previous && (f.completedAt <= previous.completedAt || f.startedAt < previous.completedAt))
      || !integer(f.calls) || !integer(f.triangles) || f.calls === 0 || f.triangles === 0
      || (i === 0 ? f.trigger !== 'startup' : !['raf', 'resize'].includes(f.trigger))
      || !integer(f.tick) || !Number.isFinite(f.simulationSeconds) || f.simulationSeconds < 0
      || Math.abs(f.simulationSeconds - f.tick / 30) > 1e-8
      || (previous && f.tick < previous.tick) || !f.visible || !f.focused || f.paused
      || !['idle', 'walking', 'repairing'].includes(f.mode)
      || !['fault', 'working', 'resolved'].includes(f.fault.status)
      || !Number.isFinite(f.fault.progress) || f.fault.progress < 0 || f.fault.progress > 1
      || f.camera.zoom !== 1 || !integer(f.camera.heading) || f.camera.heading > 3
      || ![f.camera.projection, f.camera.matrixWorld].every((m) => m.length === 16 && m.every(Number.isFinite))) {
      issues.push(`invalid/dropped/interrupted frame ${i + 1}`)
    }
    if (f.calls > budget.calls) failures.push(`frame ${i + 1}: calls`)
    if (f.triangles > budget.triangles) failures.push(`frame ${i + 1}: triangles`)
    if (previous) {
      const steps = f.worldSteps
      const last = steps.at(-1)
      if (steps.length !== f.tick - previous.tick || steps.some((step, j) =>
        step.clock.tick !== previous.tick + j + 1 || step.seed !== ready.seed || step.paused
        || Math.abs(step.clock.elapsedSeconds - step.clock.tick / 30) > 1e-8)
        || (last && (last.player.mode !== f.mode || last.fault.status !== f.fault.status
          || last.fault.progress !== f.fault.progress || !same(last.player.cell, f.cell) || !same(last.player.path, f.path)))) {
        issues.push(`missing/inconsistent simulation steps at render ${i + 1}`)
      }
    } else if (f.tick !== 0 || f.mode !== 'idle' || f.fault.status !== 'fault' || f.fault.progress !== 0) {
      issues.push('time-zero first render required')
    }
  }
  if (startup.transferBytes > budget.gameBytes) failures.push('startup transfer')
  const phase = (name: PhaseName) => expectedPhases.find((p) => p.name === name)
  const idle = phase('idle'), walking = phase('walking'), travel = phase('dispatch-travel')
  const repair = phase('dispatch-repair'), dispatch = phase('dispatch-combined'), orbit = phase('orbit-resize')
  if (report.boundaries.warmupEnd !== phase('warmup')?.end || report.boundaries.dispatchStart !== travel?.start
    || report.boundaries.repairStart !== repair?.start || report.boundaries.orbitStart !== orbit?.start) issues.push('declared boundary mismatch')
  for (const [i, action] of report.actions.entries()) {
    if (!integer(action.beforeRender) || action.beforeRender <= (report.actions[i - 1]?.beforeRender ?? 0)
      || !['move', 'dispatch'].includes(action.type)
      || (action.type === 'move' && (!walking || action.beforeRender <= walking.start || action.beforeRender > walking.end))
      || (action.type === 'dispatch' && (!travel || action.beforeRender !== travel.start + 1))) issues.push('invalid or out-of-order workload action')
  }
  if (report.actions.filter((a) => a.type === 'dispatch').length !== 1) issues.push('one dispatch required')
  if (idle && frames.slice(0, idle.end).some((f) => f.mode !== 'idle' || f.fault.status !== 'fault'
    || f.fault.progress !== 0 || f.path.length || !same(f.cell, { x: 2, z: 7 }))) issues.push('idle/warmup workload mismatch')
  if (walking) {
    const moves = report.actions.filter((a) => a.type === 'move' && a.beforeRender > walking.start && a.beforeRender <= walking.end)
    if (moves[0]?.beforeRender !== walking.start + 1 || !moves.every((a, i) => same(a.cell, WALK_LOOP[i % WALK_LOOP.length]))
      || !followsWalkingLoop(frames, walking, moves)
      || !frames.slice(walking.start, walking.end).some((f) => f.mode === 'walking')
      || frames.slice(walking.start, walking.end).some((f) => f.mode === 'repairing' || f.fault.status !== 'fault')) issues.push('scripted walking workload mismatch')
  }
  if (travel && (!report.actions.some((a) => a.type === 'dispatch' && a.beforeRender === travel.start + 1)
    || travel.end <= travel.start || frames.slice(travel.start, travel.end).some((f) => f.mode !== 'walking'))) issues.push('dispatch travel mismatch')
  if (repair && dispatch) {
    const samples = frames.slice(repair.start, repair.end)
    const states = frames.slice(repair.start, dispatch.end).flatMap((f) => [
      ...f.worldSteps.map((s) => ({ tick: s.clock.tick, mode: s.player.mode, fault: s.fault })),
      { tick: f.tick, mode: f.mode, fault: f.fault },
    ])
    const arrival = states.find((s) => s.mode === 'repairing' && s.fault.status === 'working')
    const resolved = states.find((s) => s.fault.status === 'resolved')
    const repairing = states.filter((s) => s.mode === 'repairing')
    if (!arrival || arrival.fault.progress !== 0 || samples.some((f) => f.mode !== 'repairing' || f.fault.status !== 'working')
      || !resolved || resolved.fault.progress !== 1 || resolved.tick - arrival.tick !== 120
      || repairing.some((s) => s.fault.status !== 'working' || Math.abs(s.fault.progress - (s.tick - arrival.tick) / 120) > 1e-8)
      || !repairing.some((s) => Math.abs(s.fault.progress - 119 / 120) < 1e-8)) issues.push('arrival/120-tick repair/resolved mismatch')
  }
  if (orbit) {
    frames.forEach((f, i) => {
      const offset = i - orbit.start
      const inOrbit = offset >= 0 && i < orbit.end
      const directive = workloadDirective('orbit-resize', Math.max(0, offset), 0)
      if (!checkDimensions(f.dimensions, inOrbit ? directive.viewport! : [1280, 720])
        || f.camera.heading !== (inOrbit ? directive.heading : 0)
        || (inOrbit && (f.mode !== 'idle' || f.fault.status !== 'resolved'))) issues.push(`camera/viewport workload mismatch ${i + 1}`)
    })
    if (frames.length !== orbit.end) issues.push('unbounded tail after qualification')
  }
  const windows: QualificationResult['windows'][number][] = expectedPhases.filter((p) => p.name !== 'warmup').map((p) => {
    const stats = frameStatistics(frames.slice(p.start, p.end), p.start ? frames[p.start - 1] : undefined)
    const timingFailed = p.name !== 'first-300' && (stats.meanFps === null || stats.meanFps < budget.meanFps
      || stats.p95Ms === null || stats.p95Ms > budget.p95Ms)
    const failed = timingFailed || stats.peakCalls > budget.calls || stats.peakTriangles > budget.triangles
    if (failed) failures.push(`${p.name}: frame budget`)
    return { ...p, stats, status: (issues.length ? 'unqualified' : failed ? 'failed' : 'passed') as Status }
  })
  if (orbit) for (const [name, start, end] of [
    ['orbit-fixed-before', orbit.start, orbit.start + 120],
    ['orbit-resized', orbit.start + 120, orbit.start + 180],
    ['orbit-fixed-restored', orbit.start + 180, orbit.end],
  ] as const) {
    const stats = frameStatistics(frames.slice(start, end), frames[start - 1])
    const failed = stats.meanFps === null || stats.meanFps < budget.meanFps || stats.p95Ms === null
      || stats.p95Ms > budget.p95Ms || stats.peakCalls > budget.calls || stats.peakTriangles > budget.triangles
    if (failed) failures.push(`${name}: frame budget`)
    windows.push({ name, start, end, stats, status: issues.length ? 'unqualified' : failed ? 'failed' : 'passed' })
  }
  return immutable({
    status: issues.length ? 'unqualified' : failures.length ? 'failed' : 'passed',
    issues: [...new Set(issues)], failures, startupBytes: startup.transferBytes, windows,
  })
}

export function qualifyRepetitions(reports: readonly QualificationReport[]) {
  const results = reports.map(qualify)
  const issues: string[] = []
  if (reports.length !== 3 || new Set(reports.map((r) => r.runId)).size !== 3
    || new Set(reports.map((r) => r.ready.timeOrigin)).size !== 3) issues.push('three fresh distinct repetitions required')
  if (reports.some((r) => !same(r.ready.identity, reports[0]?.ready.identity)
    || !same(r.target, reports[0]?.target))) issues.push('repetitions must have identical content and target configuration')
  return immutable({
    status: (issues.length || results.some((r) => r.status === 'unqualified') ? 'unqualified'
      : results.some((r) => r.status === 'failed') ? 'failed' : 'passed') as Status,
    issues, results,
  })
}
