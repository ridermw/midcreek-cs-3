import { createHash } from 'node:crypto'
import { isAbsolute, posix, resolve } from 'node:path'

export const SOURCE_REPOSITORY = 'williamsmat_microsoft/midcreek-concept'
export const SOURCE_REVISION = '870603632c4b6665c513d0fa692a3ee2dae2b683'
export const BLUEPRINT_REVISION = '732ff3936f83a0de87547f567e93789f1f11001d'
export const APPROVAL_REVISION = 'eff76cb3b7db33e09a4403a10fbdabc73b37c6e1'
export const AUTHORIZATION_SHA256 = '1d6bf6ccceb960428296591f41fe0c35271ecf668c5959dd27dd9e503b593624'
export const AUDIT_SHA256 = '5b5c0e65ca8bfbf9de56d1673d2b83f44dcd5bfa42e2f2855477c5a66490769c'
export const BLUEPRINT_SHA256 = '71e31565b4498552c11ca8d8a183aadbdb74c7c4720aee5f3c91dd74cd825811'
export const EVIDENCE_SHA256 = '81a233d6c4cfb4c56fa034e24579fd2107c361cbc5790486a9f6cbd265f08287'
export const INVENTORY_SHA256 = '9cf248787d79aec5b016853c4255d54016f5c63c48b372d2ef68c441a8907ae7'
export const ATTRIBUTION = `Cel Shift concept art - ${SOURCE_REPOSITORY} at ${SOURCE_REVISION}`
export const TERMS = 'Approved for CS3 use and release staging only; no broader license inferred.'
export const PUBLIC_FIELDS = [
  'id', 'family', 'title', 'displayRole', 'sourceRepository', 'sourceRevision', 'sourcePath',
  'sha256', 'width', 'height', 'attribution', 'terms', 'caption', 'mediaUrl',
]
export const REFERENCE_POLICY_FIELDS = ['local_references', 'provenance']
export const GALLERY_POLICY_FIELDS = ['gallery_staging', 'gallery_credit', 'gallery_terms', 'public_fields']
export const SHARED_PATHS = [
  'character-sheet.md', 'floor-sheet.md', 'foundation.json', 'foundation.md',
  'interface-sheet.md', 'rack-sheet.md', 'turnaround.md',
].map((name) => `themes/_shared/${name}`)

export interface FileIdentity { path: string, bytes: number, sha256: string }
export interface SourceIdentity { id: 'E6', repository: string, revision: string, localPath: string }
export interface Approval {
  status: 'approved' | 'denied'
  authority: 'launch-policy-derived'
  scope: 'local-reference' | 'gallery-release-staging'
  authorizationSha256: string
  sourceSha256: string
  inventorySha256: string
  policyFields: string[]
  publicFields: string[]
}
export interface SupportRecord {
  id: string
  kind: 'prompt' | 'shared' | 'art-bible' | 'projection' | 'theme'
  sourceRepository: string
  sourceRevision: string
  sourcePath: string
  destination: string
  bytes: number
  sha256: string
  dependencies: string[]
}
export interface ArtworkRecord {
  id: string
  family: string
  title: string
  role: 'master'
  sourceRepository: string
  sourceRevision: string
  sourcePath: string
  destination: string
  bytes: number
  sha256: string
  width: number
  height: number
  sidecar: {
    originalPath: string
    originalBytes: number
    originalSha256: string
    sanitizedPath: string
    sanitizedSha256: string
    transformation: 'cs3-provenance-allowlist-v1'
  }
  currentPrompts: string[]
  dependencyPaths: string[]
  history: {
    confidence: 'unresolved'
    exactProducingPrompt: string | null
    note: string
    evidence: Array<{ path: string, sha256: string, section: string }>
  }
  attribution: string
  terms: string
  referenceApproval: Approval
  galleryApproval: Approval
}
export interface ReferenceManifest {
  schemaVersion: 1
  packageRevision: 'cs3-reference-v1'
  packageDigest: string
  repositoryRoot: string
  store: string
  activeLink: string
  sources: SourceIdentity[]
  authority: {
    authorizationSha256: string
    blueprintRevision: string
    approvalRevision: string
    inputs: { audit: string, blueprint: string, evidence: string }
  }
  inventorySha256: string
  support: SupportRecord[]
  artworks: ArtworkRecord[]
}

export class ReferenceError extends Error {
  readonly code: string
  readonly path: string
  constructor(code: string, path: string, detail: string) {
    super(`${code}: ${path}: ${detail}`)
    this.name = 'ReferenceError'
    this.code = code
    this.path = path
  }
}
export function requireReference(condition: unknown, code: string, path: string, detail: string): asserts condition {
  if (!condition) throw new ReferenceError(code, path, detail)
}
export function digest(data: string | Uint8Array): string {
  return createHash('sha256').update(data).digest('hex')
}
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value)
  if (typeof value === 'number' && Number.isFinite(value)) return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  if (typeof value === 'object' && value !== null) {
    return `{${Object.entries(value).sort(([a], [b]) => compare(a, b)).map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(',')}}`
  }
  throw new ReferenceError('JSON_VALUE', '<json>', 'only finite JSON values are accepted')
}
export function compare(a: string, b: string): number { return a < b ? -1 : a > b ? 1 : 0 }
export function packageDigest(manifest: ReferenceManifest): string {
  const specification = {
    schemaVersion: manifest.schemaVersion,
    packageRevision: manifest.packageRevision,
    sources: manifest.sources.map(({ id, repository, revision }) => ({ id, repository, revision }))
      .sort((a, b) => compare(a.id, b.id)),
    authority: manifest.authority,
    inventorySha256: manifest.inventorySha256,
    support: [...manifest.support].sort((a, b) => compare(a.id, b.id)),
    artworks: [...manifest.artworks].sort((a, b) => compare(a.id, b.id)),
  }
  const files = [
    ...manifest.support.map((file) => ({ path: file.destination, sha256: file.sha256 })),
    ...manifest.artworks.flatMap((art) => [
      { path: art.destination, sha256: art.sha256 },
      { path: art.sidecar.sanitizedPath, sha256: art.sidecar.sanitizedSha256 },
    ]),
  ].sort((a, b) => compare(a.path, b.path))
  return digest(canonicalJson({ specification, files }))
}
export function referenceInventory(manifest: Pick<ReferenceManifest, 'support' | 'artworks'>): FileIdentity[] {
  return [
    ...manifest.support.map((f) => ({ path: f.sourcePath, bytes: f.bytes, sha256: f.sha256 })),
    ...manifest.artworks.flatMap((art) => [
      { path: art.sourcePath, bytes: art.bytes, sha256: art.sha256 },
      { path: art.sidecar.originalPath, bytes: art.sidecar.originalBytes, sha256: art.sidecar.originalSha256 },
    ]),
  ].sort((a, b) => compare(a.path, b.path))
}
export function inventoryDigest(files: FileIdentity[]): string {
  return digest(canonicalJson([...files].sort((a, b) => compare(a.path, b.path))))
}
export function safeRelative(path: string): string {
  requireReference(/^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(path) && !isAbsolute(path)
    && path.split('/').every((part) => part !== '' && part !== '.' && part !== '..'),
  'PATH', path, 'expected a canonical relative path without traversal or encoded separators')
  return path
}
export function unique(values: string[], code: string): void {
  const seen = new Set<string>()
  for (const value of values) {
    requireReference(!seen.has(value), code, value, 'duplicate identity')
    seen.add(value)
  }
}
function hash(value: string, path: string) {
  requireReference(/^[a-f0-9]{64}$/.test(value), 'HASH_FORMAT', path, 'expected a lowercase SHA-256')
}
function bytes(value: number, path: string) {
  requireReference(Number.isSafeInteger(value) && value > 0, 'BYTES', path, 'expected a positive safe integer')
}
function sameSet(a: string[], b: string[]) {
  return canonicalJson([...a].sort(compare)) === canonicalJson([...b].sort(compare))
}

type Shape = 'string' | 'number' | 'nullable-string' | readonly [Shape] | { [key: string]: Shape }
const approvalShape: Shape = {
  status: 'string', authority: 'string', scope: 'string', authorizationSha256: 'string',
  sourceSha256: 'string', inventorySha256: 'string', policyFields: ['string'], publicFields: ['string'],
}
const sourceFields = { sourceRepository: 'string', sourceRevision: 'string', sourcePath: 'string', destination: 'string', bytes: 'number', sha256: 'string' } as const
const manifestShape: Shape = {
  schemaVersion: 'number', packageRevision: 'string', packageDigest: 'string',
  repositoryRoot: 'string', store: 'string', activeLink: 'string', inventorySha256: 'string',
  sources: [{ id: 'string', repository: 'string', revision: 'string', localPath: 'string' }],
  authority: {
    authorizationSha256: 'string', blueprintRevision: 'string', approvalRevision: 'string',
    inputs: { audit: 'string', blueprint: 'string', evidence: 'string' },
  },
  support: [{ ...sourceFields, id: 'string', kind: 'string', dependencies: ['string'] }],
  artworks: [{
    ...sourceFields, id: 'string', family: 'string', title: 'string', role: 'string', width: 'number', height: 'number',
    sidecar: { originalPath: 'string', originalBytes: 'number', originalSha256: 'string', sanitizedPath: 'string', sanitizedSha256: 'string', transformation: 'string' },
    currentPrompts: ['string'], dependencyPaths: ['string'],
    history: { confidence: 'string', exactProducingPrompt: 'nullable-string', note: 'string', evidence: [{ path: 'string', sha256: 'string', section: 'string' }] },
    attribution: 'string', terms: 'string', referenceApproval: approvalShape, galleryApproval: approvalShape,
  }],
}
function checkShape(value: unknown, shape: Shape, path: string): void {
  if (typeof shape === 'string') {
    requireReference(shape === 'nullable-string' ? value === null || typeof value === 'string' : typeof value === shape,
      'FIELD_TYPE', path, `expected ${shape}`)
  } else if (Array.isArray(shape)) {
    requireReference(Array.isArray(value), 'FIELD_TYPE', path, 'expected array')
    value.forEach((item, index) => checkShape(item, shape[0], `${path}[${index}]`))
  } else {
    requireReference(typeof value === 'object' && value !== null && !Array.isArray(value), 'FIELD_TYPE', path, 'expected object')
    const fields = Object.entries(shape)
    for (const key of Object.keys(value)) {
      requireReference(fields.some(([name]) => name === key), 'UNKNOWN_FIELD', `${path}.${key}`, 'field is not allowlisted')
    }
    for (const [key, child] of fields) {
      requireReference(Object.hasOwn(value, key), 'MISSING_FIELD', `${path}.${key}`, 'required field')
      checkShape(Reflect.get(value, key), child, `${path}.${key}`)
    }
  }
}
function assertManifest(value: unknown): asserts value is ReferenceManifest { checkShape(value, manifestShape, 'manifest') }
export function parseManifest(text: string): ReferenceManifest {
  let value: unknown
  try { value = JSON.parse(text) } catch { throw new ReferenceError('JSON', 'manifest', 'invalid JSON') }
  assertManifest(value)
  validateManifest(value)
  return value
}

export function sanitizedSidecar(art: ArtworkRecord): string {
  return canonicalJson({
    schemaVersion: 1, id: art.id, sourceRepository: art.sourceRepository,
    sourceRevision: art.sourceRevision, sourcePath: art.sourcePath, sha256: art.sha256,
    originalSidecarPath: art.sidecar.originalPath, originalSidecarSha256: art.sidecar.originalSha256,
    transformation: art.sidecar.transformation, currentPrompts: art.currentPrompts,
    dependencyPaths: art.dependencyPaths, history: art.history, attribution: art.attribution, terms: art.terms,
    referenceApproval: art.referenceApproval,
  }) + '\n'
}
export function packageFiles(manifest: ReferenceManifest): FileIdentity[] {
  const manifestBytes = canonicalJson(manifest) + '\n'
  return [
    { path: 'reference-manifest.json', bytes: Buffer.byteLength(manifestBytes), sha256: digest(manifestBytes) },
    ...manifest.support.map((f) => ({ path: f.destination, bytes: f.bytes, sha256: f.sha256 })),
    ...manifest.artworks.flatMap((art) => [
      { path: art.destination, bytes: art.bytes, sha256: art.sha256 },
      { path: art.sidecar.sanitizedPath, bytes: Buffer.byteLength(sanitizedSidecar(art)), sha256: art.sidecar.sanitizedSha256 },
    ]),
  ]
}

export function validateManifest(manifest: ReferenceManifest): void {
  assertManifest(manifest)
  requireReference(manifest.schemaVersion === 1 && manifest.packageRevision === 'cs3-reference-v1', 'SCHEMA', 'manifest', 'unsupported schema/package revision')
  requireReference(manifest.artworks.length >= 49, 'MISSING_MASTER', 'artworks', 'exactly 49 masters required')
  requireReference(manifest.artworks.length <= 49, 'EXTRA_MASTER', 'artworks', 'exactly 49 masters required')
  requireReference(manifest.support.length === 57
    && manifest.support.filter((f) => f.kind === 'prompt').length === 47
    && manifest.support.filter((f) => f.kind === 'shared').length === 7,
  'SUPPORT_COUNT', 'support', '47 prompts, seven shared inputs, three other support files required')
  unique([...manifest.artworks, ...manifest.support].map((f) => f.id), 'DUPLICATE_ID')
  unique(manifest.artworks.map((f) => f.sha256), 'DUPLICATE_HASH')
  unique(packageFiles(manifest).map((f) => f.path), 'DUPLICATE_PATH')
  const inventory = referenceInventory(manifest)
  unique(inventory.map((f) => f.path), 'DUPLICATE_PATH')
  unique(inventory.map((f) => f.sha256), 'DUPLICATE_HASH')
  requireReference(manifest.sources.length === 1 && manifest.sources[0]!.id === 'E6'
    && manifest.sources[0]!.repository === SOURCE_REPOSITORY && manifest.sources[0]!.revision === SOURCE_REVISION,
  'SOURCE_REVISION', 'sources', 'only the reviewed E6 pin is supported; no implicit mirror fallback')
  for (const path of [manifest.repositoryRoot, manifest.store, manifest.activeLink, manifest.sources[0]!.localPath]) {
    requireReference(isAbsolute(path) && resolve(path) === path, 'PATH', path, 'expected a canonical explicit absolute local identity')
  }
  requireReference(manifest.store === resolve(manifest.repositoryRoot, '.artifacts/references')
    && manifest.activeLink === resolve(manifest.repositoryRoot, 'references/midcreek'),
  'PATH', manifest.activeLink, 'store and managed-link identities must match the reviewed repository layout')
  requireReference(manifest.authority.authorizationSha256 === AUTHORIZATION_SHA256
    && manifest.authority.blueprintRevision === BLUEPRINT_REVISION
    && manifest.authority.approvalRevision === APPROVAL_REVISION
    && manifest.authority.inputs.audit === AUDIT_SHA256
    && manifest.authority.inputs.blueprint === BLUEPRINT_SHA256
    && manifest.authority.inputs.evidence === EVIDENCE_SHA256, 'AUTHORITY', 'manifest', 'reviewed input binding mismatch')
  const support = new Map(manifest.support.map((file) => [file.sourcePath, file]))
  requireReference(sameSet(manifest.support.filter((f) => f.kind === 'shared').map((f) => f.sourcePath), SHARED_PATHS),
    'SUPPORT_COUNT', 'shared', 'six exact prose bases and foundation JSON required')
  for (const [path, kind] of [['ART-BIBLE.md', 'art-bible'], ['docs/decisions/projection.md', 'projection'], ['themes/cel-shift/theme.yaml', 'theme']] as const) {
    requireReference(support.get(path)?.kind === kind, 'SUPPORT_COUNT', path, `missing ${kind}`)
  }
  for (const file of [...manifest.support, ...manifest.artworks]) {
    safeRelative(file.sourcePath)
    safeRelative(file.destination)
    requireReference(file.sourcePath === file.destination && !file.sourcePath.includes('-720p'), 'SOURCE_PATH', file.sourcePath, 'original relative hierarchy required; previews excluded')
    requireReference(file.sourceRepository === SOURCE_REPOSITORY && file.sourceRevision === SOURCE_REVISION,
      'SOURCE_REVISION', file.sourcePath, 'source repository/revision mismatch')
    hash(file.sha256, file.sourcePath)
    bytes(file.bytes, file.sourcePath)
  }
  for (const file of manifest.support) {
    requireReference(file.id === file.sourcePath, 'SUPPORT_ID', file.id, 'support ID must be its canonical source path')
    if (file.kind === 'prompt') {
      requireReference(/^themes\/cel-shift\/prompts\/[a-z0-9-]+\.mock\.md$/.test(file.sourcePath)
        && file.dependencies.length === 1 && SHARED_PATHS.includes(file.dependencies[0]!)
        && file.dependencies[0]!.endsWith('.md'), 'DEPENDENCY', file.sourcePath, 'one existing prose base required')
    } else {
      requireReference(file.dependencies.length === 0, 'DEPENDENCY', file.sourcePath, 'non-prompt dependencies are not inferred')
    }
  }
  const usedPrompts = new Set<string>()
  for (const art of manifest.artworks) {
    const relative = art.sourcePath.replace(/^themes\/cel-shift\/masters\//, '')
    requireReference(art.role === 'master' && /^[a-z0-9-]+\/[a-z0-9-]+\.png$/.test(relative)
      && art.id === `cel-shift/${relative.slice(0, -4)}` && art.family === relative.split('/')[0]
      && art.title.trim().length > 0, 'ARTWORK_ID', art.id, 'stable family/stem master identity required')
    requireReference(art.width === 1536 && art.height === 1024, 'DIMENSIONS', art.sourcePath, 'originals must be 1536 x 1024')
    requireReference(art.sidecar.originalPath === `${art.sourcePath}.metadata.json`
      && art.sidecar.sanitizedPath === `${art.destination}.provenance.json`
      && art.sidecar.transformation === 'cs3-provenance-allowlist-v1', 'SIDECAR', art.sourcePath, 'original and sanitized identities must remain distinct and associated')
    hash(art.sidecar.originalSha256, art.sidecar.originalPath)
    bytes(art.sidecar.originalBytes, art.sidecar.originalPath)
    requireReference(art.currentPrompts.length > 0, 'CURRENT_PROMPT', art.id, 'current association required, not an exact generation claim')
    unique(art.currentPrompts, 'DUPLICATE_PATH')
    const dependencies = new Set<string>()
    for (const path of art.currentPrompts) {
      requireReference(support.get(path)?.kind === 'prompt', 'CURRENT_PROMPT', path, 'missing current prompt')
      usedPrompts.add(path)
      support.get(path)!.dependencies.forEach((base) => dependencies.add(base))
    }
    requireReference(sameSet(art.dependencyPaths, [...dependencies]), 'DEPENDENCY', art.id, 'dependencies must agree with associated current prompts')
    requireReference(art.history.confidence === 'unresolved' && art.history.exactProducingPrompt === null
      && art.history.note.trim().length > 0 && art.history.evidence.length > 0
      && art.history.evidence.every((e) => e.path === 'docs/research/cel-shift-source-audit.md'
        && e.sha256 === AUDIT_SHA256 && e.section === 'Historical provenance is not a current visual specification'),
    'HISTORY', art.id, 'evidence-backed unresolved historical association required; no fabricated exact producing prompt')
    requireReference(art.attribution === ATTRIBUTION, 'ATTRIBUTION', art.id, 'required source credit cannot be removed or changed')
    requireReference(art.terms === TERMS, 'RIGHTS', art.id, 'CS3-only use; no catalog-wide license inferred')
    for (const [approval, scope] of [[art.referenceApproval, 'local-reference'], [art.galleryApproval, 'gallery-release-staging']] as const) {
      requireReference((approval.status === 'approved' || (scope === 'gallery-release-staging' && approval.status === 'denied'))
        && approval.authority === 'launch-policy-derived' && approval.scope === scope
        && approval.authorizationSha256 === manifest.authority.authorizationSha256
        && approval.sourceSha256 === art.sha256 && approval.inventorySha256 === manifest.inventorySha256
        && sameSet(approval.policyFields, scope === 'local-reference' ? REFERENCE_POLICY_FIELDS : GALLERY_POLICY_FIELDS)
        && sameSet(approval.publicFields, scope === 'local-reference' ? [] : PUBLIC_FIELDS),
      'APPROVAL', art.id, `${scope} approval must bind exact source bytes, inventory and parent authorization`)
    }
    requireReference(digest(sanitizedSidecar(art)) === art.sidecar.sanitizedSha256, 'SIDECAR_DIGEST', art.sidecar.sanitizedPath, 'reviewed transformation digest mismatch')
  }
  requireReference(usedPrompts.size === 47, 'CURRENT_PROMPT', 'artworks', 'all 47 current prompts must be associated')
  requireReference(inventoryDigest(inventory) === manifest.inventorySha256, 'INVENTORY_DIGEST', 'manifest', 'complete 155-record source inventory mismatch')
  requireReference(packageDigest(manifest) === manifest.packageDigest, 'PACKAGE_DIGEST', 'manifest', 'canonical package digest mismatch')
}

export function validatePrompt(path: string, text: string, allowed: Set<string>): string {
  const frontmatter = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(text)
  requireReference(frontmatter, 'DEPENDENCY', path, 'frontmatter required')
  const plans = [...frontmatter[1]!.matchAll(/^plan:[ \t]*(\S+)[ \t]*$/gm)]
  requireReference(plans.length === 1, 'DEPENDENCY', path, 'exactly one plan base required')
  const raw = plans[0]![1]!
  requireReference(/^\.\.\/\.\.\/_shared\/[a-z-]+\.md$/.test(raw), 'DEPENDENCY', path, 'only the original relative prose-base hierarchy is permitted')
  const base = posix.normalize(posix.join(posix.dirname(path), raw))
  requireReference(allowed.has(base) && SHARED_PATHS.includes(base), 'DEPENDENCY', path, `missing or escaping base ${base}`)
  return base
}

export function validateProfile(contents: Map<string, string>): void {
  const get = (path: string) => {
    const value = contents.get(path)
    requireReference(value, 'PROFILE', path, 'required prose/JSON absent')
    return value
  }
  const path = 'themes/_shared/foundation.json'
  let json: unknown
  try { json = JSON.parse(get(path)) } catch (error) {
    if (error instanceof ReferenceError) throw error
    throw new ReferenceError('PROFILE', path, 'invalid JSON')
  }
  const record = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)
  requireReference(record(json), 'PROFILE', path, 'expected object')
  const camera = json.camera
  const geometry = json.geometry
  requireReference(record(camera) && record(geometry) && camera.elevation_degrees === 35 && camera.azimuth_degrees === 45
    && camera.projection === 'orthographic' && camera.orbit_steps === 4 && camera.orbit_step_degrees === 90
    && geometry.rack_height_m === 2.1 && geometry.technician_man_height_m === 1.73 && geometry.technician_woman_height_m === 1.58,
  'PROFILE', path, 'corrected 35-degree diamond and 2.10/1.73/1.58 m dimensions required')
  for (const prose of ['themes/_shared/foundation.md', 'themes/_shared/character-sheet.md']) {
    requireReference(['1.73 m', '1.58 m', '2.10 m'].every((value) => get(prose).includes(value)), 'PROFILE', prose, 'corrected heights must also occur in both prose bases')
  }
  requireReference(get('themes/_shared/foundation.md').includes('35 degrees down from horizontal')
    && /orthographic/i.test(get('themes/_shared/foundation.md')) && /diamond/i.test(get('themes/_shared/foundation.md')),
  'PROFILE', 'themes/_shared/foundation.md', 'corrected projection required')
  requireReference(/35 degrees/.test(get('ART-BIBLE.md')) && /diamond/i.test(get('ART-BIBLE.md'))
    && /orthographic/i.test(get('ART-BIBLE.md')), 'PROFILE', 'ART-BIBLE.md', 'corrected art bible required')
  requireReference(/Status:\s*ACCEPTED/.test(get('docs/decisions/projection.md'))
    && /rotated isometric \(diamond\)/.test(get('docs/decisions/projection.md')),
  'PROFILE', 'docs/decisions/projection.md', 'accepted diamond decision required')
}

export function validatePngHeader(header: Buffer, path: string, width: number, height: number): void {
  requireReference(header.length >= 33 && header.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))
    && header.readUInt32BE(8) === 13 && header.toString('ascii', 12, 16) === 'IHDR',
  'PNG_HEADER', path, 'PNG signature and complete IHDR required')
  requireReference(header.readUInt32BE(16) === width && header.readUInt32BE(20) === height, 'DIMENSIONS', path, `expected ${width} x ${height}`)
  let crc = 0xffffffff
  for (const byte of header.subarray(12, 29)) {
    crc ^= byte
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0)
  }
  requireReference(header.readUInt32BE(29) === ((crc ^ 0xffffffff) >>> 0), 'PNG_HEADER', path, 'IHDR CRC mismatch')
  const depths: Record<number, number[]> = { 0: [1, 2, 4, 8, 16], 2: [8, 16], 3: [1, 2, 4, 8], 4: [8, 16], 6: [8, 16] }
  requireReference(depths[header[25]!]?.includes(header[24]!), 'PNG_HEADER', path, 'invalid PNG bit-depth/color-type combination')
  requireReference(header[26] === 0 && header[27] === 0 && (header[28] === 0 || header[28] === 1), 'PNG_HEADER', path, 'invalid PNG encoding methods')
}
