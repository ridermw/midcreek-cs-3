import { execFile } from 'node:child_process'
import { constants } from 'node:fs'
import { link, mkdir, open, readFile, rm } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { dirname, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { promisify } from 'node:util'
import {
  array, canonicalJson, choice, createManifestFromExport, digest, object, parseJson,
  requireAsset, safeRelative, sha256, text, unique,
} from './assets/contracts.ts'
import type { FileIdentity, PackagedManifest } from './assets/contracts.ts'
import { assertNoSymlink } from './assets/store.ts'
import { selectProvisionalAssetLibrary, validateAssetLibrary } from './promote-assets.ts'
import type { DevelopmentUse, ProvisionalAmendment } from './promote-assets.ts'

export const AMENDMENT_PATH = 'docs/architecture/cs3-provisional-development-use-2026-09-11.json'
export const QUALIFICATION_PATH = '.artifacts/assets/u5-c5/technical-qualification-2026-09-11.json'
const PARENT_SHA256 = '1d6bf6ccceb960428296591f41fe0c35271ecf668c5959dd27dd9e503b593624'

const natural = (value: unknown, subject: string): number => {
  requireAsset(typeof value === 'number' && Number.isSafeInteger(value) && value >= 0,
    'QUALIFICATION_FIELD', subject, 'nonnegative safe integer required')
  return value
}
const gitCommit = (value: unknown, subject: string): string => {
  const result = text(value, subject)
  requireAsset(/^[a-f0-9]{40}$/.test(result), 'QUALIFICATION_IDENTITY', subject, 'full Git revision required')
  return result
}
const fileIdentity = object({ path: safeRelative, sha256, bytes: natural })
const identityParser = object({
  sourceCommit: gitCommit, sourceSha256: sha256, exporterRevision: gitCommit, exporterSha256: sha256,
  specificationSha256: sha256, profile: text, profileSha256: sha256, recipeSha256: sha256,
  exportReceiptSha256: sha256, manifestSha256: sha256, libraryDigest: sha256, technicalSha256: sha256,
})
const baselineParser = object({
  repository: choice('ridermw/midcreek-cs-3'), branch: choice('main'),
  parentAuthorization: fileIdentity, sourceRoot: safeRelative,
  identity: identityParser, checkerCodeSha256: sha256,
  runs: array(object({
    id: safeRelative, root: safeRelative, checks: fileIdentity, captures: fileIdentity,
    jobs: object({ export: fileIdentity, capture: fileIdentity, check: fileIdentity }),
  })),
  regression: object({
    root: safeRelative, sourceSha256: sha256, export: fileIdentity, checks: fileIdentity, job: fileIdentity,
  }),
})
export type QualificationBaseline = ReturnType<typeof baselineParser>
type JsonRecord = Record<string, unknown>

function record(value: unknown, subject: string): JsonRecord {
  requireAsset(value !== null && typeof value === 'object' && !Array.isArray(value),
    'QUALIFICATION_FIELD', subject, 'object required')
  return value as JsonRecord
}
function records(value: unknown, subject: string): JsonRecord[] {
  return array(record)(value, subject)
}
function equal(actual: unknown, expected: unknown, subject: string): void {
  requireAsset(actual !== undefined && expected !== undefined,
    'QUALIFICATION_IDENTITY', subject, 'required frozen identity missing')
  requireAsset(canonicalJson(actual) === canonicalJson(expected),
    'QUALIFICATION_IDENTITY', subject, 'does not match the frozen evidence')
}
function complete(value: JsonRecord, subject: string): void {
  requireAsset(value.complete === true, 'QUALIFICATION_INCOMPLETE', subject, 'completed evidence required')
}

class Evidence {
  readonly inputs = new Map<string, FileIdentity>()
  readonly root: string

  constructor(root: string) { this.root = root }

  remember(path: string, bytes: Buffer, expected?: { sha256: string; bytes?: number }): Buffer {
    const identity = { path, sha256: digest(bytes), bytes: bytes.length }
    if (expected) {
      equal(identity.sha256, sha256(expected.sha256, path), `${path} SHA-256`)
      if (expected.bytes !== undefined) equal(identity.bytes, expected.bytes, `${path} bytes`)
    }
    const before = this.inputs.get(path)
    if (before) equal(identity, before, `${path} changed during qualification`)
    this.inputs.set(path, identity)
    return bytes
  }

  async read(path: string, expected?: { sha256: string; bytes?: number }): Promise<Buffer> {
    const absolute = join(this.root, safeRelative(path, 'input path'))
    await assertNoSymlink(absolute)
    const file = await open(absolute, constants.O_RDONLY | constants.O_NOFOLLOW)
    try {
      const before = await file.stat()
      requireAsset(before.isFile(), 'QUALIFICATION_FILE', path, 'ordinary file required')
      const bytes = await file.readFile()
      const after = await file.stat()
      requireAsset(before.size === after.size && before.mtimeMs === after.mtimeMs && before.ctimeMs === after.ctimeMs,
        'QUALIFICATION_CHANGED', path, 'input changed while reading')
      return this.remember(path, bytes, expected)
    } finally { await file.close() }
  }

  async json(path: string, expected?: { sha256: string; bytes?: number }): Promise<JsonRecord> {
    return record(parseJson((await this.read(path, expected)).toString('utf8')), path)
  }

  async git(revision: string, input: { path: string; sha256: string; bytes?: number }): Promise<void> {
    const path = safeRelative(input.path, 'Git input')
    const name = `git/${revision}/${path}`
    const known = this.inputs.get(name)
    if (known) {
      equal(known.sha256, input.sha256, `${name} SHA-256`)
      if (input.bytes !== undefined) equal(known.bytes, input.bytes, `${name} bytes`)
      return
    }
    const { stdout } = await promisify(execFile)('git', ['show', `${revision}:${path}`], {
      cwd: this.root, encoding: 'buffer', maxBuffer: 32 * 1024 * 1024,
    })
    this.remember(name, stdout, input)
  }
}

function inventory(checker: JsonRecord, checkCount: number, captureCount: number, subject: string): JsonRecord[] {
  complete(checker, subject)
  const checks = records(checker.checks, `${subject}.checks`)
  equal(checks.length, checkCount, `${subject} check count`)
  unique(checks.map((item) => text(item.name, 'check name')), 'QUALIFICATION_DUPLICATE', subject)
  requireAsset(checks.every((item) => item.pass === true), 'QUALIFICATION_FAILED', subject, 'all checks must pass')
  const captures = records(checker.captures, `${subject}.captures`)
  equal(captures.length, captureCount, `${subject} capture count`)
  unique(captures.map((item) => safeRelative(item.file, 'capture file')), 'QUALIFICATION_DUPLICATE', subject)
  equal(checker.blockedExternal, [], `${subject} external requests`)
  const warnings = array(text)(checker.browserWarnings, `${subject}.browserWarnings`)
  requireAsset(!warnings.some((warning) => warning.startsWith('PAGE_ERROR')),
    'QUALIFICATION_FAILED', subject, 'uncaught browser error')
  return captures
}

async function job(evidence: Evidence, pin: FileIdentity, command: string[], parent: string): Promise<{ start: number; end: number }> {
  const value = await evidence.json(pin.path, pin)
  complete(value, pin.path)
  equal(value.exit_code, 0, `${pin.path} exit`)
  equal(value.authorization_sha256, parent, `${pin.path} authorization`)
  equal(value.command, command, `${pin.path} command`)
  const start = Date.parse(text(value.started_utc, `${pin.path} started_utc`))
  const seconds = value.seconds
  const timeout = value.job_timeout_seconds
  requireAsset(Number.isFinite(start) && typeof seconds === 'number' && Number.isFinite(seconds) && seconds >= 0
    && typeof timeout === 'number' && Number.isFinite(timeout) && timeout > 0 && seconds <= timeout
    && start + seconds * 1000 <= Date.now(),
  'QUALIFICATION_JOB', pin.path, 'completed, nonfuture, bounded job required')
  requireAsset(pin.path.endsWith('.job.json'), 'QUALIFICATION_JOB', pin.path, 'guard job path required')
  await evidence.read(pin.path.replace(/\.job\.json$/, '.log'), { sha256: sha256(value.log_sha256, 'job log') })
  return { start, end: start + seconds * 1000 }
}

async function image(evidence: Evidence, root: string, capture: JsonRecord): Promise<void> {
  await evidence.read(join(root, safeRelative(capture.file, 'capture.file')), {
    sha256: sha256(capture.sha256, 'capture.sha256'),
  })
}

async function sidecar(evidence: Evidence, root: string, renderer: string, sourceSha256: string, capture: JsonRecord) {
  const path = join(root, `${safeRelative(capture.file, 'capture.file')}.capture.json`)
  equal(await evidence.json(path), { schema: 1, kind: 'cs3-image-capture', renderer, sourceSha256, capture }, path)
}

export interface TechnicalQualificationReceipt {
  schema: 1
  kind: 'cs3-technical-qualification'
  qualification: 'technical-only'
  technicalQualified: true
  repository: string
  branch: string
  parentAuthorizationSha256: string
  baselineSha256: string
  identity: QualificationBaseline['identity']
  runs: { id: string; root: string; checkCount: number; captureCount: number }[]
  regression: { root: string; checkCount: number; captureCount: number }
  inputs: FileIdentity[]
  amendment?: { path: string; sha256: string }
  gates: {
    technical: { status: 'passed'; scope: string; remaining: string[] }
    appearance: { accepted: false; status: 'pending' }
    performance: { qualified: false; status: 'pending' }
    publication: { approved: false; status: 'blocked' }
    release: { approved: false; status: 'blocked' }
    qualifiedProductionPointer: { activated: false; status: 'blocked' }
  }
}

export async function qualifyAssetRuns(repositoryRoot: string, input: QualificationBaseline): Promise<TechnicalQualificationReceipt> {
  const baseline = baselineParser(parseJson(canonicalJson(input)), 'baseline')
  equal(baseline.runs.length, 2, 'exactly two strict runs')
  unique(baseline.runs.map((run) => run.id), 'QUALIFICATION_DUPLICATE', 'run ids')
  unique([...baseline.runs.map((run) => run.root), baseline.regression.root], 'QUALIFICATION_DUPLICATE', 'run roots')
  unique([...baseline.runs.flatMap((run) => Object.values(run.jobs).map((pin) => pin.path)),
    baseline.regression.job.path], 'QUALIFICATION_DUPLICATE', 'job receipts')
  await assertNoSymlink(repositoryRoot)
  const evidence = new Evidence(repositoryRoot)
  await evidence.read(baseline.parentAuthorization.path, baseline.parentAuthorization)
  const expected = baseline.identity
  const common = new Map<string, Buffer>()
  let previousExportStart: number | undefined
  let checkerCode: JsonRecord | undefined
  const runs: TechnicalQualificationReceipt['runs'] = []
  for (const run of baseline.runs) {
    await assertNoSymlink(join(repositoryRoot, run.root))
    const exported = await evidence.read(join(run.root, 'export.json'), { sha256: expected.exportReceiptSha256 })
    const manifest = createManifestFromExport(exported.toString('utf8'))
    const receipt = manifest.exportReceipt
    const manifestBytes = await evidence.read(join(run.root, 'manifest.json'), { sha256: expected.manifestSha256 })
    equal(exported.toString('utf8'), canonicalJson(receipt) + '\n', 'canonical export')
    equal(manifestBytes.toString('utf8'), canonicalJson(manifest) + '\n', 'strict canonical manifest')
    equal({
      sourceCommit: receipt.source.commit, sourceSha256: receipt.source.sha256,
      exporterRevision: receipt.exporter.revision, exporterSha256: receipt.exporter.sha256,
      specificationSha256: receipt.specificationSha256, profile: receipt.profile,
      profileSha256: receipt.profileSha256, recipeSha256: receipt.recipeSha256,
      libraryDigest: manifest.libraryDigest, manifestSha256: digest(manifestBytes),
      exportReceiptSha256: manifest.exportReceiptSha256,
      technicalSha256: receipt.inputs.find((item) => item.path === 'technical.json')?.sha256,
    }, expected, `${run.id} frozen identity`)
    await validateAssetLibrary({
      candidateRoot: join(repositoryRoot, run.root, 'candidate'), manifest,
      expected: {
        sourceCommit: expected.sourceCommit, sourceSha256: expected.sourceSha256,
        specificationSha256: expected.specificationSha256, exporterSha256: expected.exporterSha256,
        profile: expected.profile, profileSha256: expected.profileSha256, recipeSha256: expected.recipeSha256,
        exportReceiptSha256: expected.exportReceiptSha256,
      },
    })
    for (const name of ['technical.json', 'process.json', 'export.pending.json']) {
      requireAsset(receipt.inputs.some((item) => item.path === name && item.role === 'script'),
        'QUALIFICATION_INPUT', name, 'hash-bound strict exporter evidence required')
    }
    requireAsset(receipt.source.path.startsWith('source/'), 'QUALIFICATION_INPUT', 'source', 'source alias required')
    await evidence.read(join(baseline.sourceRoot, receipt.source.path.slice(7)), receipt.source)
    for (const item of receipt.inputs) {
      if (item.path.startsWith('source/')) await evidence.read(join(baseline.sourceRoot, item.path.slice(7)), item)
      else if (['technical.json', 'process.json', 'export.pending.json'].includes(item.path)) {
        await evidence.read(join(run.root, item.path), item)
      } else await evidence.git(expected.exporterRevision, item)
    }
    const technical = await evidence.json(join(run.root, 'technical.json'), { sha256: expected.technicalSha256 })
    complete(technical, 'technical.json')
    equal(technical.kind, 'cs3-library-export', 'technical kind')
    equal(technical.sourceSha256, expected.sourceSha256, 'technical source')
    equal(technical.strictSpecificationSha256, expected.specificationSha256, 'technical specification')
    equal(technical.profile, expected.profile, 'technical profile')
    const technicalAssets = records(technical.assets, 'technical.assets')
    equal(technicalAssets.map(({ id, file, bytes, sha256 }) => ({ id, file, bytes, sha256 })),
      receipt.assets.map(({ id, file, bytes, sha256 }) => ({ id, file, bytes, sha256 })), 'technical assets')
    equal(await evidence.json(join(run.root, 'process.json')), {
      schema: 1, kind: 'cs3-export-process', exitCode: 0, sourceCommit: expected.sourceCommit,
      sourceSha256: expected.sourceSha256, exporterRevision: expected.exporterRevision,
    }, 'export supervisor')
    equal((await evidence.json(join(run.root, 'export.pending.json'))).kind, 'cs3-export-pending', 'pending receipt')
    // Compare actual bytes as well as independently pinned digests, including all five GLBs.
    for (const file of ['export.json', 'manifest.json', 'technical.json', 'process.json', 'export.pending.json',
      ...receipt.assets.map((asset) => `candidate/${asset.file}`)]) {
      const asset = receipt.assets.find((item) => `candidate/${item.file}` === file)
      const bytes = await evidence.read(join(run.root, file), asset)
      const previous = common.get(file)
      if (previous) requireAsset(previous.equals(bytes), 'QUALIFICATION_REPEAT', file, 'repetition bytes differ')
      else common.set(file, bytes)
    }
    const captureReceipt = await evidence.json(join(run.root, run.captures.path), run.captures)
    complete(captureReceipt, 'source captures')
    equal(captureReceipt.kind, 'cs3-library-source-captures', 'source capture kind')
    equal(captureReceipt.sourceSha256, expected.sourceSha256, 'capture source')
    equal(captureReceipt.exportSha256, expected.exportReceiptSha256, 'capture export')
    equal(captureReceipt.authoringReceiptSha256, technical.authoringReceiptSha256, 'capture authoring')
    equal(captureReceipt.profile, expected.profile, 'capture profile')
    const sourceCaptures = records(captureReceipt.captures, 'source captures')
    equal(sourceCaptures.length, 30, 'source capture count')
    unique(sourceCaptures.map((capture) => safeRelative(capture.file, 'source capture')),
      'QUALIFICATION_DUPLICATE', 'source captures')
    const sourceViews = join(run.root, dirname(run.captures.path))
    for (const capture of sourceCaptures) {
      equal(capture.profile, expected.profile, 'source view profile')
      await image(evidence, sourceViews, capture)
      await sidecar(evidence, sourceViews, 'source', expected.sourceSha256, capture)
    }
    const checks = await evidence.json(join(run.root, run.checks.path), run.checks)
    equal(checks.kind, 'cs3-library-checks', 'checker kind')
    equal(checks.source, expected.sourceSha256, 'checker source')
    equal(checks.exportReceiptSha256, expected.exportReceiptSha256, 'checker export')
    equal(checks.captureReceiptSha256, run.captures.sha256, 'checker captures')
    equal(checks.profile, expected.profile, 'checker profile')
    checkerCode = record(checks.code, 'checker code')
    requireAsset(Object.keys(checkerCode).length > 0, 'QUALIFICATION_INPUT', 'checker code', 'code inventory required')
    equal(digest(canonicalJson(checkerCode)), baseline.checkerCodeSha256, 'checker code identity')
    for (const [path, value] of Object.entries(checkerCode)) {
      safeRelative(path, 'checker code path')
      const hash = sha256(value, 'checker code hash')
      if (path.startsWith('source/')) await evidence.read(join(baseline.sourceRoot, path.slice(7)), { sha256: hash })
      else await evidence.git(expected.exporterRevision, {
        path: path.includes('/') ? path : `probes/r2/${path}`, sha256: hash,
      })
    }
    const captures = inventory(checks, 31, 30, run.id)
    unique(captures.map((capture) => text(capture.source, 'browser source')), 'QUALIFICATION_DUPLICATE', 'matched sources')
    unique(captures.map((capture) => text(capture.contact, 'contact')), 'QUALIFICATION_DUPLICATE', 'matched contacts')
    for (const capture of captures) {
      const source = sourceCaptures.find((item) => item.file === capture.source)
      requireAsset(source, 'QUALIFICATION_CAPTURE', run.id, 'browser capture lacks matching source')
      equal(capture.profile, source.profile, 'matched profile')
      equal(capture.clip, source.clip, 'matched clip')
      equal(capture.time, source.time, 'matched time')
      equal(capture.camera, record(source.camera, 'source camera').matrix_world, 'matched camera')
      await image(evidence, run.root, capture)
      await image(evidence, run.root, { file: capture.contact, sha256: capture.contactSha256 })
      await sidecar(evidence, run.root, 'browser', expected.sourceSha256, {
        ...source, file: capture.file, sha256: capture.sha256, camera: capture.camera,
      })
      await sidecar(evidence, run.root, 'comparison', expected.sourceSha256, {
        ...source, file: capture.contact, sha256: capture.contactSha256, camera: capture.camera,
      })
    }
    const sourcePath = join(baseline.sourceRoot, receipt.source.path.slice(7))
    const exportJob = await job(evidence, run.jobs.export, [
      'python3', '-B', 'blender/export_library.py', '--source', sourcePath, '--sha256', expected.sourceSha256,
      '--output', run.root, '--source-commit', expected.sourceCommit, '--exporter-revision', expected.exporterRevision,
      '--node', 'node', '--blender', 'blender',
    ], baseline.parentAuthorization.sha256)
    const captureJob = await job(evidence, run.jobs.capture, [
      'blender', '--background', '--factory-startup', '--disable-autoexec', '--python-exit-code', '1',
      '--python', 'blender/capture_library.py', '--', '--export', join(run.root, 'export.json'),
      '--output', sourceViews,
    ], baseline.parentAuthorization.sha256)
    const checkJob = await job(evidence, run.jobs.check, [
      'node', 'probes/r2/check.mjs', run.root, run.checks.path.replace(/\.json$/, ''),
    ], baseline.parentAuthorization.sha256)
    requireAsset(exportJob.end <= captureJob.start && captureJob.end <= checkJob.start
      && previousExportStart !== exportJob.start,
    'QUALIFICATION_JOB', run.id, 'independent exports followed by complete capture/check jobs required')
    previousExportStart = exportJob.start
    runs.push({ id: run.id, root: run.root, checkCount: 31, captureCount: 30 })
  }
  const regression = baseline.regression
  const regressionExport = await evidence.json(join(regression.root, regression.export.path), regression.export)
  complete(regressionExport, 'R2 export')
  equal(regressionExport.source_sha256, regression.sourceSha256, 'R2 source')
  for (const [path, value] of Object.entries(record(regressionExport.artifacts, 'R2 artifacts'))) {
    const artifact = object({ bytes: natural, sha256 })(value, path)
    await evidence.read(join(regression.root, safeRelative(path, 'R2 artifact')), artifact)
  }
  const regressionChecks = await evidence.json(join(regression.root, regression.checks.path), regression.checks)
  equal(regressionChecks.source, regression.sourceSha256, 'R2 checker source')
  equal(regressionChecks.exportScript, regressionExport.script_sha256, 'R2 export script')
  const regressionCode = record(regressionChecks.code, 'R2 checker code')
  requireAsset(Object.keys(regressionCode).length > 0, 'QUALIFICATION_INPUT', 'R2 code', 'checker code required')
  for (const [path, value] of Object.entries(regressionCode)) equal(value, checkerCode?.[path], `R2 checker ${path}`)
  const regressionCaptures = inventory(regressionChecks, 16, 10, 'R2 regression')
  requireAsset(records(regressionChecks.checks, 'R2 checks').some((check) =>
    check.detail !== null && typeof check.detail === 'object' && Reflect.get(check.detail, 'nodes') === 8),
  'QUALIFICATION_REGRESSION', 'R2', 'original eight-node regression required')
  for (const capture of regressionCaptures) await image(evidence, regression.root, capture)
  await job(evidence, regression.job, ['node', 'probes/r2/check.mjs', regression.root,
    regression.checks.path.replace(/\.json$/, '')], baseline.parentAuthorization.sha256)
  return {
    schema: 1, kind: 'cs3-technical-qualification', qualification: 'technical-only', technicalQualified: true,
    repository: baseline.repository, branch: baseline.branch, parentAuthorizationSha256: baseline.parentAuthorization.sha256,
    baselineSha256: digest(canonicalJson(baseline)), identity: expected, runs,
    regression: { root: regression.root, checkCount: 16, captureCount: 10 },
    inputs: [...evidence.inputs.values()].sort((a, b) => a.path.localeCompare(b.path, 'en')),
    gates: {
      technical: { status: 'passed', scope: 'U5 frozen two-run export/loader transport and retained R2 regression only',
        remaining: ['U7 playable integration and pose/occlusion checks', 'U8 named-target performance qualification',
          'U9/U10 staging and release-content controls', 'Rerun affected claims after asset/material/shader/recipe changes'] },
      appearance: { accepted: false, status: 'pending' },
      performance: { qualified: false, status: 'pending' },
      publication: { approved: false, status: 'blocked' },
      release: { approved: false, status: 'blocked' },
      qualifiedProductionPointer: { activated: false, status: 'blocked' },
    },
  }
}

const developmentUse = choice('local-playable', 'local-showcase', 'local-validation')
const amendmentParser = object({
  kind: choice('cs3-provisional-amendment'), id: text, issuedAt: text, authority: text,
  parentAuthorizationSha256: sha256,
  binding: object({
    manifestSha256: sha256, libraryDigest: sha256, sourceCommit: gitCommit, sourceSha256: sha256,
    profile: text, profileSha256: sha256, recipeSha256: sha256,
  }),
  allowedUses: array(developmentUse),
})
export async function loadQualificationAmendment(repositoryRoot: string): Promise<{
  technicalQualification: QualificationBaseline; selectionAmendment: ProvisionalAmendment; sha256: string
}> {
  const evidence = new Evidence(repositoryRoot)
  const bytes = await evidence.read(AMENDMENT_PATH)
  const document = record(parseJson(bytes.toString('utf8')), 'amendment')
  equal(document.schema, 1, 'amendment schema')
  equal(document.kind, 'cs3-provisional-development-use-record', 'amendment kind')
  equal(document.repository, 'ridermw/midcreek-cs-3', 'amendment repository')
  equal(document.branch, 'main', 'amendment branch')
  const authority = record(document.authority, 'authority')
  equal(authority.actor, 'user', 'authority actor')
  equal(authority.objectivePath, AMENDMENT_PATH.replace('cs3-provisional-development-use-2026-09-11.json',
    'cs3-continuation-goal.md'), 'authority objective')
  equal(authority.parentAuthorizationSha256, PARENT_SHA256, 'authority parent')
  equal(authority.parentAuthorizationPath,
    '.artifacts/implementation/20260910T232859Z/authorization.json', 'authority parent path')
  requireAsset(typeof authority.actualUserInstruction === 'string'
    && authority.actualUserInstruction.includes('explicit /autopilot objective'),
  'QUALIFICATION_AUTHORITY', 'authority', 'actual user objective selection required')
  const instructionDate = new Date(text(authority.instructionReceivedAt, 'instructionReceivedAt'))
  requireAsset(instructionDate.toISOString() === authority.instructionReceivedAt
    && instructionDate.getTime() === Date.parse('2026-09-11T17:55:52.629Z'),
  'QUALIFICATION_AUTHORITY', 'instructionReceivedAt', 'actual autopilot launch timestamp required')
  const technicalQualification = baselineParser(document.technicalQualification, 'technicalQualification')
  const selectionAmendment = amendmentParser(document.selectionAmendment, 'selectionAmendment')
  const outerUses = array(developmentUse)(document.allowedUses, 'allowedUses')
  equal([...outerUses].sort(), [...selectionAmendment.allowedUses].sort(), 'outer development uses')
  const checkpoint = record(document.checkpointState, 'checkpointState')
  for (const field of ['productionLibraryPromoted', 'appearanceAccepted', 'performanceQualified',
    'publicationApproved', 'releaseApproved', 'pagesAuthorized']) {
    equal(checkpoint[field], false, `checkpoint ${field}`)
  }
  const gates = record(document.remainingGates, 'remainingGates')
  for (const [name, status] of [['appearance', 'pending'], ['performance', 'pending'],
    ['publication', 'blocked'], ['release', 'blocked']] as const) {
    const gate = record(gates[name], `remainingGates.${name}`)
    equal(gate.status, status, `${name} gate status`)
    equal(gate[name === 'appearance' ? 'accepted' : name === 'performance' ? 'qualified' : 'approved'],
      false, `${name} gate decision`)
  }
  text(document.invalidation, 'invalidation')
  equal(technicalQualification.parentAuthorization.sha256, PARENT_SHA256, 'independently trusted parent')
  equal(selectionAmendment.parentAuthorizationSha256, PARENT_SHA256, 'selection parent')
  const { manifestSha256, libraryDigest, sourceCommit, sourceSha256, profile, profileSha256, recipeSha256 } =
    technicalQualification.identity
  equal(selectionAmendment.binding, { manifestSha256, libraryDigest, sourceCommit, sourceSha256,
    profile, profileSha256, recipeSha256 }, 'selection binding')
  equal([...selectionAmendment.allowedUses].sort(), ['local-playable', 'local-showcase', 'local-validation'],
    'development uses')
  const date = new Date(selectionAmendment.issuedAt)
  requireAsset(Number.isFinite(date.getTime()) && date.toISOString() === selectionAmendment.issuedAt
    && date.getTime() <= Date.now(), 'QUALIFICATION_DATE', 'amendment', 'actual nonfuture UTC date required')
  return { technicalQualification, selectionAmendment, sha256: digest(bytes) }
}

async function writeReceipt(path: string, bytes: string): Promise<void> {
  await assertNoSymlink(path, true)
  await mkdir(dirname(path), { recursive: true, mode: 0o700 })
  await assertNoSymlink(dirname(path))
  const temporary = `${path}.${randomUUID()}.tmp`
  const file = await open(temporary, 'wx', 0o600)
  try {
    try {
      await file.writeFile(bytes)
      await file.sync()
    } finally { await file.close() }
    try { await link(temporary, path) } catch (error) {
      if (!(error instanceof Error && 'code' in error && error.code === 'EEXIST')) throw error
      await assertNoSymlink(path)
      equal(await readFile(path, 'utf8'), bytes, 'existing qualification receipt; refusing replacement')
    }
    const directory = await open(dirname(path), constants.O_RDONLY)
    try { await directory.sync() } finally { await directory.close() }
  } finally { await rm(temporary) }
}

export async function qualifyAndWriteReceipt(
  repositoryRoot: string, baseline: QualificationBaseline, amendmentSha256?: string,
): Promise<{ receiptPath: string; qualification: TechnicalQualificationReceipt }> {
  const qualification = await qualifyAssetRuns(repositoryRoot, baseline)
  if (amendmentSha256 !== undefined) {
    const evidence = new Evidence(repositoryRoot)
    await evidence.read(AMENDMENT_PATH, { sha256: amendmentSha256 })
    qualification.amendment = { path: AMENDMENT_PATH, sha256: amendmentSha256 }
    qualification.inputs.push(...evidence.inputs.values())
    qualification.inputs.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0)
  }
  const receiptPath = join(repositoryRoot, QUALIFICATION_PATH)
  await writeReceipt(receiptPath, canonicalJson(qualification) + '\n')
  return { receiptPath, qualification }
}

export async function runQualificationCli(repositoryRoot: string, args: string[]): Promise<{
  receiptPath: string; selected: DevelopmentUse | null; pointerPath: string | null
}> {
  requireAsset(args.length === 0 || (args.length === 2 && args[0] === '--select'),
    'ARGUMENTS', 'qualify-assets', 'usage: node --experimental-strip-types tools/qualify-assets.ts [--select local-playable|local-showcase|local-validation]')
  const use = args.length ? developmentUse(args[1], '--select') : null
  const amendment = await loadQualificationAmendment(repositoryRoot)
  const { qualification, receiptPath } = await qualifyAndWriteReceipt(
    repositoryRoot, amendment.technicalQualification, amendment.sha256,
  )
  if (!use) return { receiptPath, selected: null, pointerPath: null }
  const baseline = amendment.technicalQualification
  const candidateRoot = join(repositoryRoot, baseline.runs[1]!.root, 'candidate')
  const exported = await new Evidence(repositoryRoot).read(join(baseline.runs[1]!.root, 'export.json'),
    { sha256: qualification.identity.exportReceiptSha256 })
  const manifest: PackagedManifest = createManifestFromExport(exported.toString('utf8'))
  const selection = await selectProvisionalAssetLibrary({
    candidateRoot, destinationRoot: join(repositoryRoot, 'assets/library'), manifest, use,
    parentAuthorizationSha256: PARENT_SHA256, trustedParentAuthorizationSha256: PARENT_SHA256,
    amendment: amendment.selectionAmendment,
  })
  return { receiptPath, selected: use, pointerPath: selection.pointerPath }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const result = await runQualificationCli(resolve(import.meta.dirname, '..'), process.argv.slice(2))
  console.log(canonicalJson(result))
}
