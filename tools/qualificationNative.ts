import type { GameHandle } from '../src/app/game.ts'
import { NAMED_TARGET } from '../src/config/performanceBudget.ts'
import type { Interruption, NamedTarget, NetworkReceipt, WorkloadAction } from '../src/diagnostics/metrics.ts'

export interface DisplayBounds { x: number; y: number; width: number; height: number }
export type NativeTargetMetadata = Partial<Pick<NamedTarget,
  'macModel' | 'chip' | 'cpuCores' | 'gpuCores' | 'ramGiB' | 'macOS' | 'display' | 'refreshHz' | 'powerMode' | 'driver'
>> & { displayBounds?: DisplayBounds }
export interface NativeArguments {
  runId: string
  repeat: number
  windowX: number
  windowY: number
  applicationCommit: string
  timeoutMs: number
  port: number
  targetFile?: string
  targetJson?: string
}

export const NATIVE_USAGE = 'npm run qualify:native -- --run-id <fresh-id> --window-x <external-x> --window-y <external-y> --target <metadata.json> [--application-commit HEAD|0c8760a] [--repeat 1] [--timeout-ms 180000] [--port 4188]'

export function parseNativeArguments(args: readonly string[], env: NodeJS.ProcessEnv = {}): NativeArguments {
  const flags = new Map<string, string>()
  const names = ['run-id', 'repeat', 'window-x', 'window-y', 'target', 'application-commit', 'timeout-ms', 'port']
  for (let i = 0; i < args.length; i += 2) {
    const flag = args[i]!
    const value = args[i + 1]
    if (!names.some((name) => flag === `--${name}`) || value === undefined || value.startsWith('--') || flags.has(flag)) {
      throw new Error(`USAGE: invalid/duplicate argument ${flag}; ${NATIVE_USAGE}`)
    }
    flags.set(flag, value)
  }
  const get = (name: string) => flags.get(`--${name}`) ?? env[`CS3_U8_${name.toUpperCase().replaceAll('-', '_')}`]
  const runId = get('run-id')
  if (!runId || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,95}$/.test(runId)) throw new Error('USAGE: safe --run-id required (1..96 characters)')
  function integer(name: string, fallback?: number, minimum?: number) {
    const raw = get(name) ?? fallback?.toString()
    if (raw === undefined || !/^-?\d+$/.test(raw) || !Number.isSafeInteger(Number(raw))
      || (minimum !== undefined && Number(raw) < minimum)) throw new Error(`USAGE: integer --${name} required`)
    return Number(raw)
  }
  const applicationCommit = get('application-commit') ?? 'HEAD'
  if (applicationCommit !== 'HEAD' && !/^[a-f0-9]{7,40}$/.test(applicationCommit)) throw new Error('USAGE: application commit must be HEAD or a git SHA')
  const repeat = integer('repeat', 1, 1)
  const port = integer('port', 4188, 1)
  if (repeat > 100 || port > 65535) throw new Error('USAGE: repeat must be <=100 and port <=65535')
  return {
    runId, repeat, port, windowX: integer('window-x'), windowY: integer('window-y'),
    applicationCommit, timeoutMs: integer('timeout-ms', 180_000, 1),
    targetFile: get('target'), targetJson: env.CS3_U8_TARGET_JSON,
  }
}

export function nativeRunIds(options: Pick<NativeArguments, 'runId' | 'repeat'>): string[] {
  return Array.from({ length: options.repeat }, (_, i) => options.repeat === 1
    ? options.runId : `${options.runId}-${String(i + 1).padStart(2, '0')}`)
}

export function parseTargetMetadata(value: unknown): NativeTargetMetadata {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('TARGET_METADATA: expected object')
  const strings = ['macModel', 'chip', 'macOS', 'display', 'powerMode', 'driver']
  const numbers = ['cpuCores', 'gpuCores', 'ramGiB', 'refreshHz']
  for (const [key, field] of Object.entries(value)) {
    if (strings.includes(key)) {
      if (typeof field !== 'string' || !field.trim()) throw new Error(`TARGET_METADATA: ${key} must be nonempty text`)
    } else if (numbers.includes(key)) {
      if (typeof field !== 'number' || !Number.isFinite(field) || field <= 0
        || (key !== 'refreshHz' && !Number.isSafeInteger(field))) throw new Error(`TARGET_METADATA: invalid ${key}`)
    } else if (key === 'displayBounds') {
      if (!field || typeof field !== 'object' || Array.isArray(field)
        || Object.keys(field).sort().join(',') !== 'height,width,x,y') throw new Error('TARGET_METADATA: displayBounds requires x/y/width/height')
      for (const [axis, dimension] of Object.entries(field)) {
        if (typeof dimension !== 'number' || !Number.isSafeInteger(dimension) || (['width', 'height'].includes(axis) && dimension <= 0)) {
          throw new Error(`TARGET_METADATA: invalid displayBounds.${axis}`)
        }
      }
    } else throw new Error(`TARGET_METADATA: unsupported ${key}; browser/page evidence cannot be overridden`)
  }
  return structuredClone(value) as NativeTargetMetadata
}

export interface NativePageEvidence {
  visible: boolean
  focused: boolean
  deviceDpr: number
  viewport: readonly [number, number]
  screen: { width: number; height: number; availWidth: number; availHeight: number; colorDepth: number }
  position: { x: number; y: number; width: number; height: number }
  userAgent: string
  webglVersion: number
  webglRenderer: string
  webglVendor: string
  glVersion: string
  serviceWorker: boolean
}

export function readNativePageEvidence(): NativePageEvidence {
  const gl = document.querySelector('canvas')?.getContext('webgl2')
  const debug = gl?.getExtension('WEBGL_debug_renderer_info')
  return {
    visible: document.visibilityState === 'visible', focused: document.hasFocus(),
    deviceDpr: window.devicePixelRatio, viewport: [innerWidth, innerHeight],
    screen: { width: screen.width, height: screen.height, availWidth: screen.availWidth, availHeight: screen.availHeight, colorDepth: screen.colorDepth },
    position: { x: screenX, y: screenY, width: outerWidth, height: outerHeight },
    userAgent: navigator.userAgent,
    webglVersion: gl ? 2 : 0,
    webglRenderer: gl ? String(gl.getParameter(debug?.UNMASKED_RENDERER_WEBGL ?? gl.RENDERER)) : '',
    webglVendor: gl ? String(gl.getParameter(debug?.UNMASKED_VENDOR_WEBGL ?? gl.VENDOR)) : '',
    glVersion: gl ? String(gl.getParameter(gl.VERSION)) : '',
    serviceWorker: Boolean(navigator.serviceWorker?.controller),
  }
}

export function nativePlacementIssues(
  bounds: { left?: number; top?: number; width?: number; height?: number; windowState?: string },
  metadata: NativeTargetMetadata, options: Pick<NativeArguments, 'windowX' | 'windowY'>,
): string[] {
  const issues: string[] = []
  const display = metadata.displayBounds
  if (!display) issues.push('explicit displayBounds missing; physical display placement unverified')
  if (bounds.windowState !== 'normal' || bounds.left !== options.windowX || bounds.top !== options.windowY) {
    issues.push('Chrome window does not match explicit normal external-display position')
  }
  if (![bounds.left, bounds.top, bounds.width, bounds.height].every((n) => typeof n === 'number' && Number.isFinite(n))) {
    issues.push('CDP window bounds incomplete')
  } else if (display && (bounds.left! < display.x || bounds.top! < display.y
    || bounds.left! + bounds.width! > display.x + display.width
    || bounds.top! + bounds.height! > display.y + display.height)) {
    issues.push('Chrome window is not wholly contained in the declared display')
  }
  return issues
}

export type NativeSnapshot = ReturnType<GameHandle['diagnostics']['snapshot']>

export function nativeTarget(
  metadata: NativeTargetMetadata, observed: NativePageEvidence | undefined,
  browserVersion: string | undefined, applicationCommit: string,
  captured: NativeSnapshot | undefined, contentSha256: string | undefined,
): Partial<NamedTarget> {
  const { displayBounds: _bounds, ...declared } = metadata
  return {
    ...declared, name: NAMED_TARGET, browserVersion, applicationCommit, contentSha256,
    headed: true, coldNavigation: true, cacheDisabled: true,
    compression: 'none (identity)', servingMode: 'loopback production build, no-store, provisional development selection',
    foreground: observed ? observed.visible && observed.focused : false,
    deviceScaleFactor: observed?.deviceDpr, applicationDpr: captured?.ready?.dimensions.applicationDpr,
    serviceWorker: observed?.serviceWorker, webglVersion: observed?.webglVersion, webglRenderer: observed?.webglRenderer,
    backend: /ANGLE.*Metal/i.test(observed?.webglRenderer ?? '') ? 'ANGLE Metal' : 'unverified',
    profileSha256: captured?.ready?.identity.profileSha256, recipeSha256: captured?.ready?.identity.recipeSha256,
  }
}

export function makeNativeReport(input: {
  runId: string
  target: Partial<NamedTarget>
  captured?: NativeSnapshot
  network: NetworkReceipt
  actions: readonly WorkloadAction[]
  interruptions: readonly Interruption[]
}) {
  const captured = input.captured
  const phases = captured?.phases ?? []
  return {
    schema: 1 as const, clock: 'native' as const, runId: input.runId, target: input.target,
    ready: captured?.ready ?? null, startup: captured?.startup ?? null,
    frames: captured?.frames ?? [], phases, network: input.network, actions: input.actions,
    interruptions: [...(captured?.interruptions ?? []), ...input.interruptions],
    boundaries: {
      warmupEnd: phases.find((p) => p.name === 'warmup')?.end ?? -1,
      dispatchStart: phases.find((p) => p.name === 'dispatch-travel')?.start ?? -1,
      repairStart: phases.find((p) => p.name === 'dispatch-repair')?.start ?? -1,
      orbitStart: phases.find((p) => p.name === 'orbit-resize')?.start ?? -1,
    },
  }
}
