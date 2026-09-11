import { createHash } from 'node:crypto'
import { mkdir, readFile, realpath, stat, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path'
import { pathToFileURL } from 'node:url'
import { NAMED_TARGET } from '../src/config/performanceBudget.ts'
import { qualifyRepetitions } from '../src/diagnostics/metrics.ts'
import type { QualificationReport, Status } from '../src/diagnostics/metrics.ts'

type Shape = 'number' | 'string' | 'boolean' | readonly [Shape] | { readonly [key: string]: Shape }
const cell: Shape = { x: 'number', z: 'number' }
const fault: Shape = { status: 'string', progress: 'number' }
const world: Shape = {
  seed: 'number', clock: { tick: 'number', elapsedSeconds: 'number' },
  player: { cell, path: [cell], mode: 'string' },
  racks: [{ id: 'string', cell, front: 'number' }],
  fault: { ...fault, rackId: 'string' }, paused: 'boolean', message: 'string',
}
const dimensions: Shape = {
  viewport: ['number'], canvas: ['number'], logical: ['number'], drawingBuffer: ['number'],
  deviceDpr: 'number', applicationDpr: 'number',
}
const frame: Shape = {
  renderCount: 'number', startedAt: 'number', completedAt: 'number', trigger: 'string',
  tick: 'number', simulationSeconds: 'number', mode: 'string', cell, path: [cell],
  fault, paused: 'boolean', worldSteps: [world],
  camera: { heading: 'number', zoom: 'number', projection: ['number'], matrixWorld: ['number'] },
  dimensions, calls: 'number', triangles: 'number', visible: 'boolean', focused: 'boolean',
}
const resource: Shape = {
  url: 'string', role: 'string', startTime: 'number', responseEnd: 'number',
  transferSize: 'number', encodedBodySize: 'number', decodedBodySize: 'number',
  cache: 'string', initiatorType: 'string',
}
const reportShape: Shape = {
  schema: 'number', runId: 'string', clock: 'string',
  target: {
    'name?': 'string', 'macModel?': 'string', 'chip?': 'string', 'cpuCores?': 'number',
    'gpuCores?': 'number', 'ramGiB?': 'number', 'macOS?': 'string', 'display?': 'string',
    'refreshHz?': 'number', 'powerMode?': 'string', 'browserVersion?': 'string', 'webglVersion?': 'number',
    'webglRenderer?': 'string', 'backend?': 'string', 'driver?': 'string', 'headed?': 'boolean',
    'foreground?': 'boolean', 'deviceScaleFactor?': 'number', 'applicationDpr?': 'number',
    'coldNavigation?': 'boolean', 'cacheDisabled?': 'boolean', 'serviceWorker?': 'boolean',
    'compression?': 'string', 'servingMode?': 'string', 'applicationCommit?': 'string',
    'contentSha256?': 'string', 'profileSha256?': 'string', 'recipeSha256?': 'string',
  },
  ready: {
    generation: 'number', timeOrigin: 'number', readyAt: 'number', interactiveAt: 'number', gpuFinishedAt: 'number',
    seed: 'number', scenario: 'string', firstFrame: frame, dimensions,
    identity: {
      selectionSha256: 'string', manifestSha256: 'string', libraryDigest: 'string',
      profile: 'string', profileSha256: 'string', recipeSha256: 'string',
      assets: [{ url: 'string', sha256: 'string' }],
    },
  },
  startup: {
    origin: 'string', timeOrigin: 'number', readyAt: 'number', loadEventEnd: 'number',
    required: [{ url: 'string', role: 'string', 'sha256?': 'string' }],
    resources: [resource], pending: ['string'], overflow: 'boolean',
    transferBytes: 'number', issues: ['string'],
  },
  frames: [frame], phases: [{ name: 'string', start: 'number', end: 'number' }],
  actions: [{ beforeRender: 'number', type: 'string', 'cell?': cell }],
  interruptions: [{ at: 'number', kind: 'string', detail: 'string' }],
  network: {
    source: 'string', complete: 'boolean', overflow: 'boolean',
    requests: [{
      requestId: 'string', url: 'string', startTime: 'number', 'responseEnd~': 'number',
      'encodedBodySize~': 'number', 'transferSize~': 'number', cache: 'string', failed: 'boolean',
    }],
  },
  boundaries: { warmupEnd: 'number', dispatchStart: 'number', repairStart: 'number', orbitStart: 'number' },
}

function checkShape(value: unknown, shape: Shape, path: string): void {
  if (typeof shape === 'string') {
    if (typeof value !== shape || (shape === 'number' && !Number.isFinite(value))) throw new Error(`REPORT_SHAPE: ${path} expected ${shape}`)
  } else if (Array.isArray(shape)) {
    if (!Array.isArray(value)) throw new Error(`REPORT_SHAPE: ${path} expected array`)
    value.forEach((item, i) => checkShape(item, shape[0]!, `${path}[${i}]`))
  } else {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`REPORT_SHAPE: ${path} expected object`)
    const record: Record<string, unknown> = { ...value }
    for (const [field, child] of Object.entries(shape)) {
      const key = field.replace(/[?~]$/, '')
      if (field.endsWith('?') && record[key] === undefined) continue
      if (field.endsWith('~') && record[key] === null) continue
      checkShape(record[key], child, `${path}.${key}`)
    }
    const allowed = new Set(Object.keys(shape).map((key) => key.replace(/[?~]$/, '')))
    for (const key of Object.keys(record)) if (!allowed.has(key)) throw new Error(`REPORT_SHAPE: ${path}.${key} unexpected field`)
  }
}

function assertReport(value: unknown): asserts value is QualificationReport {
  checkShape(value, reportShape, 'report')
}

export function evaluateRawReports(raw: readonly unknown[]) {
  const reports: QualificationReport[] = []
  const issues: string[] = []
  for (const [index, input] of raw.entries()) {
    try {
      assertReport(input)
      reports.push(input)
    } catch (error) {
      issues.push(`report ${index + 1}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
  const result = qualifyRepetitions(reports)
  return { ...result, status: issues.length ? 'unqualified' as const : result.status, issues: [...issues, ...result.issues] }
}

function inside(root: string, path: string): boolean {
  const rel = relative(root, path)
  return rel !== '' && !isAbsolute(rel) && rel !== '..' && !rel.startsWith(`..${sep}`)
}
export async function qualificationRoot(): Promise<string> {
  const repository = await realpath(process.cwd())
  const artifacts = resolve(repository, '.artifacts')
  await mkdir(artifacts, { recursive: true })
  if (await realpath(artifacts) !== artifacts) throw new Error('OUTPUT_SCOPE: artifacts root must be canonical and private')
  const root = resolve(artifacts, 'qualification')
  await mkdir(root, { recursive: true })
  const actual = await realpath(root)
  if (actual !== root) throw new Error('OUTPUT_SCOPE: qualification root must be canonical and private')
  return actual
}
export async function writeQualification(raw: readonly unknown[], output: string, evidence?: unknown) {
  const root = await qualificationRoot()
  const destination = resolve(output)
  if (!inside(root, destination)) throw new Error('OUTPUT_SCOPE: raw and sanitized output must remain under .artifacts/qualification')
  let ancestor = dirname(destination)
  for (;;) {
    try {
      const actual = await realpath(ancestor)
      if (actual !== root && !inside(root, actual)) throw new Error('OUTPUT_SCOPE: symlink escape')
      break
    } catch (error) {
      if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error
      ancestor = dirname(ancestor)
    }
  }
  await mkdir(dirname(destination), { recursive: true })
  try { await mkdir(destination) } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'EEXIST') throw new Error('EXISTING_OUTPUT: preserve previous evidence')
    throw error
  }
  const result = evaluateRawReports(raw)
  const checksums: Record<string, string> = {}
  const save = async (path: string, value: unknown) => {
    const bytes = `${JSON.stringify(value, null, 2)}\n`
    await mkdir(dirname(resolve(destination, path)), { recursive: true })
    await writeFile(resolve(destination, path), bytes, { flag: 'wx' })
    checksums[path] = createHash('sha256').update(bytes).digest('hex')
  }
  for (const [index, input] of raw.entries()) {
    const prefix = `runs/${index + 1}`
    await save(`${prefix}/report.json`, input)
    try { assertReport(input) } catch { continue } // The result retains the explicit schema rejection.
    await save(`${prefix}/target.json`, input.target)
    await save(`${prefix}/startup.json`, input.startup)
    await save(`${prefix}/frames.json`, input.frames)
    await save(`${prefix}/phases.json`, input.phases)
    await save(`${prefix}/network.json`, input.network)
    await save(`${prefix}/ready.json`, input.ready)
  }
  if (evidence !== undefined) await save('evidence.json', evidence)
  await save('result.json', result)
  await save('sanitized/result.json', {
    schema: 1, target: NAMED_TARGET, status: result.status,
    repetitions: result.results.map((run) => ({ status: run.status })),
  })
  await writeFile(resolve(destination, 'checksums.json'), `${JSON.stringify(checksums, null, 2)}\n`, { flag: 'wx' })
  return result
}

async function main(args: readonly string[]) {
  const inputs: string[] = []
  let output: string | undefined
  for (let i = 0; i < args.length; i += 2) {
    const flag = args[i], value = args[i + 1]
    if (!value || !['--input', '--output'].includes(flag!)) {
      throw new Error('USAGE: node --experimental-strip-types tools/qualification.ts --input <raw-report.json> [--input ...] --output <fresh .artifacts/qualification/directory>. This command never launches browsers.')
    }
    if (flag === '--input') inputs.push(value)
    else {
      if (output) throw new Error('USAGE: only one --output')
      output = value
    }
  }
  if (!inputs.length || !output) throw new Error('USAGE: --input and --output required; no browser launch is implicit')
  const root = await qualificationRoot()
  const reports: unknown[] = []
  for (const input of inputs) {
    const path = await realpath(input)
    if (!inside(root, path)) throw new Error('INPUT_SCOPE: retained raw reports must be under .artifacts/qualification')
    if ((await stat(path)).size > 128 * 1024 * 1024) throw new Error('INPUT_SIZE: report exceeds 128 MiB')
    reports.push(JSON.parse(await readFile(path, 'utf8')))
  }
  const result = await writeQualification(reports, output)
  console.log(JSON.stringify(result))
  const codes: Record<Status, number> = { passed: 0, failed: 1, unqualified: 2 }
  process.exitCode = codes[result.status]
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main(process.argv.slice(2)).catch((error: unknown) => {
    console.error(JSON.stringify({ status: 'unqualified', issues: [error instanceof Error ? error.message : String(error)] }))
    process.exitCode = 2
  })
}
