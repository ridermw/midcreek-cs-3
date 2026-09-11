import { randomUUID } from 'node:crypto'
import type { KeyObject } from 'node:crypto'
import { execFile } from 'node:child_process'
import { createServer } from 'node:http'
import { lstat, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { promisify } from 'node:util'
import { build } from 'vite'
import {
  array, candidateFiles, canonicalJson, choice, digest, object, parseJson, requireAsset, safeRelative, sha256,
  text, unique, validatePackagedManifest,
} from './assets/contracts.ts'
import type { FileIdentity } from './assets/contracts.ts'
import { assertNoSymlink, verifyFileSet } from './assets/store.ts'
import { verifyIgnoredOutputs } from './references/git.ts'
import { parseGalleryIndex } from '../src/site/content.ts'
import {
  deriveGallery, loadPublicationInputs, validateThumbnail,
} from './site/publication.ts'
import { prepareSite } from './site/build.ts'
import { AMENDMENT_PATH, QUALIFICATION_PATH } from './qualify-assets.ts'
import { verifyQualifiedApproval } from './promote-assets.ts'
import type { PromotionRequest } from './promote-assets.ts'

export const RELEASE_BASE = '/midcreek-cs-3/'
const positive = (value: unknown, subject: string): number => {
  requireAsset(typeof value === 'number' && Number.isSafeInteger(value) && value > 0,
    'RELEASE_SIZE', subject, 'positive byte count required')
  return value
}
const identityParser = object({ path: safeRelative, bytes: positive, sha256 })
const bindingParser = object({
  manifestSha256: sha256, libraryDigest: sha256, profile: text, profileSha256: sha256, recipeSha256: sha256,
  sourceCommit: text, sourceSha256: sha256, technicalSha256: sha256,
  appearanceEvidenceSha256: sha256, publicationPolicySha256: sha256, parentAuthorizationSha256: sha256,
})
export type ReleaseLibraryBinding = ReturnType<typeof bindingParser>
interface GalleryInput { root: string; receiptSha256: string }
export interface LibraryInput {
  root: string
  binding: ReleaseLibraryBinding
  technicalPath: string
  trustedPublicKey?: KeyObject
}
interface SourceFile extends FileIdentity { data: Buffer }
export interface ReleaseArtifact {
  root: string
  buildId: string
  mode: 'fixture' | 'staging'
  files: FileIdentity[]
  receiptSha256: string
}
interface Snapshot {
  files: SourceFile[]
  galleryStatus: 'awaiting-approval' | 'approved-for-staging'
  libraryBinding: ReleaseLibraryBinding | null
}

async function optional(path: string): Promise<boolean> {
  await assertNoSymlink(path, true)
  try { await lstat(path); return true } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return false
    throw error
  }
}
async function read(path: string, expected?: string): Promise<Buffer> {
  await assertNoSymlink(path)
  requireAsset((await lstat(path)).isFile(), 'RELEASE_FILE', path, 'ordinary file required')
  const data = await readFile(path)
  requireAsset(!expected || digest(data) === expected, 'RELEASE_HASH', path, 'source/approval bytes changed')
  return data
}
function record(input: unknown, subject: string): Record<string, unknown> {
  requireAsset(input !== null && typeof input === 'object' && !Array.isArray(input),
    'RELEASE_SHAPE', subject, 'record required')
  return input as Record<string, unknown>
}
function equal(actual: unknown, expected: unknown, code: string, subject: string): void {
  requireAsset(canonicalJson(actual) === canonicalJson(expected), code, subject, 'exact reviewed binding required')
}
function source(path: string, data: Buffer): SourceFile {
  return { path, data, bytes: data.length, sha256: digest(data) }
}

export function validatePrerequisites(pkg: unknown, lock: unknown): void {
  requireAsset(!/\b(?:cargo|rustc|rustup|bevy|wasm-pack)\b/i.test(JSON.stringify([pkg, lock])),
    'RELEASE_PREREQUISITE', 'package graph', 'Cargo/Rust/Bevy is not an approved prerequisite')
}

export function inspectReleaseBytes(path: string, bytes: Buffer): void {
  safeRelative(path, 'release member')
  const lowerPath = path.toLowerCase()
  requireAsset(!/(?:\.(?:map|log|txt|md|blend|py|rs|toml|lock|ts)$|(?:^|[./-])(?:cargo|rust-toolchain|prompts?|sidecars?|capture|logs?)(?:[./-]|$))/i.test(lowerPath),
    'RELEASE_FORBIDDEN', path, 'source maps and authoring/operational files are not release members')
  const privateData = /PRIVATE[_ -]SENTINEL|(?:\/Users\/|\/home\/|file:\/\/|[A-Z]:\\[A-Za-z0-9_. -]{2,}\\|\.artifacts\/|references\/midcreek)|rawPrompt|private(?:Path|Photo|Reference)|accountId|deploymentId/i
  const rawText = bytes.toString('utf8')
  const decodedText = rawText
    .replace(/\\\//g, '/')
    .replace(/\\u([0-9a-f]{4})/gi, (_, code: string) => String.fromCharCode(Number.parseInt(code, 16)))
  requireAsset(!privateData.test(path) && !privateData.test(rawText) && !privateData.test(decodedText),
    'RELEASE_PRIVATE', path, 'private sentinel/path/metadata is forbidden')
  if (/\.(?:html|css|js|json)$/.test(lowerPath)) {
    requireAsset(!/[A-Z]:\\\\?/i.test(decodedText),
      'RELEASE_PRIVATE', path, 'private Windows filesystem path')
  }
  if (!lowerPath.endsWith('.glb')) return
  requireAsset(bytes.length >= 28 && bytes.readUInt32LE(0) === 0x46546c67
    && bytes.readUInt32LE(4) === 2 && bytes.readUInt32LE(8) === bytes.length,
  'RELEASE_GLB', path, 'complete GLB 2 container required')
  const length = bytes.readUInt32LE(12)
  requireAsset(length % 4 === 0 && 20 + length <= bytes.length && bytes.readUInt32LE(16) === 0x4e4f534a,
    'RELEASE_GLB', path, 'valid JSON chunk required')
  const json = parseJson(bytes.toString('utf8', 20, 20 + length).trim())
  const walk = (value: unknown): void => {
    if (!value || typeof value !== 'object') return
    for (const [key, child] of Object.entries(value)) {
      requireAsset(key !== 'extras' || canonicalJson(child) === '{}',
        'RELEASE_GLB_EXTRAS', path, 'unreviewed extras are forbidden, even inside nested nodes/materials')
      requireAsset(key !== 'uri', 'RELEASE_GLB_URI', path, 'release GLBs must embed all dependencies')
      walk(child)
    }
  }
  walk(json)
  let offset = 20 + length
  if (offset < bytes.length) {
    requireAsset(offset + 8 <= bytes.length && bytes.readUInt32LE(offset + 4) === 0x004e4942,
      'RELEASE_GLB', path, 'only embedded BIN may follow JSON')
    offset += 8 + bytes.readUInt32LE(offset)
  }
  requireAsset(offset === bytes.length, 'RELEASE_GLB', path, 'truncated or extra GLB chunks')
}

export function viteMembers(input: unknown): string[] {
  const manifest = record(input, 'Vite manifest')
  const files = new Set(['.vite/manifest.json', 'index.html', 'play/index.html'])
  const owners: string[] = []
  const visited = new Set<string>()
  const visit = (key: string) => {
    if (visited.has(key)) return
    requireAsset(Object.hasOwn(manifest, key), 'RELEASE_DEPENDENCY', key, 'missing Vite import')
    visited.add(key)
    const entry = record(manifest[key], key)
    const file = safeRelative(entry.file, key)
    requireAsset(file.startsWith('assets/') && !file.startsWith('assets/library/') && !file.endsWith('.glb'),
      'RELEASE_VITE_PATH', file, 'library records require separate authority')
    inspectReleaseBytes(file, Buffer.alloc(0))
    owners.push(file)
    files.add(file)
    for (const field of ['css', 'assets']) {
      for (const member of array(safeRelative)(entry[field] ?? [], `${key}.${field}`)) {
        inspectReleaseBytes(member, Buffer.alloc(0))
        requireAsset(member.startsWith('assets/') && !member.startsWith('assets/library/') && !member.endsWith('.glb'),
          'RELEASE_VITE_PATH', member, 'runtime/library/gallery records have separate authority')
        files.add(member)
      }
    }
    for (const field of ['imports', 'dynamicImports']) {
      for (const imported of array(text)(entry[field] ?? [], `${key}.${field}`)) visit(imported)
    }
  }
  for (const html of ['index.html', 'play/index.html']) {
    const entry = record(manifest[html], html)
    requireAsset(entry.isEntry === true && entry.src === html, 'RELEASE_ENTRY', html, 'both actual HTML entries required')
    visit(html)
  }
  requireAsset(visited.size === Object.keys(manifest).length, 'RELEASE_VITE_EXTRA', 'manifest', 'unreachable Vite record')
  unique(owners, 'RELEASE_DUPLICATE', 'Vite outputs')
  return [...files].sort()
}

function inspectUrls(files: readonly SourceFile[]): void {
  const allowed = new Set(files.map((file) => file.path))
  for (const file of files) {
    if (!/\.(?:html|css|js)$/.test(file.path)) continue
    const content = file.data.toString('utf8')
    const urls = file.path.endsWith('.html')
      ? [
        ...[...content.matchAll(/\b(?:src|href|poster)\s*=\s*["']([^"']+)["']/gi)].map((m) => m[1]!),
        ...[...content.matchAll(/\bsrcset\s*=\s*["']([^"']+)["']/gi)]
          .flatMap((m) => m[1]!.split(',').map((candidate) => candidate.trim().split(/\s+/)[0]!)),
      ]
      : file.path.endsWith('.css')
        ? [...content.matchAll(/url\(\s*["']?([^"')\s]+)["']?\s*\)/gi)].map((m) => m[1]!)
        : [
          ...[...content.matchAll(/\b(?:fetch|import)\(\s*["'`]([^"'`]+)["'`]/g)].map((m) => m[1]!),
        ]
    for (const url of urls) {
      if (url.startsWith('#') || url === 'data:,' || (file.path.endsWith('.css') && url.startsWith('data:'))) continue
      const absolute = new URL(url, `https://release.invalid/${RELEASE_BASE.slice(1)}${file.path}`)
      requireAsset(absolute.origin === 'https://release.invalid' && absolute.pathname.startsWith(RELEASE_BASE) && !/[\\%]/.test(url),
        'RELEASE_URL', file.path, 'resource/navigation URLs must retain the project prefix')
      const path = absolute.pathname.slice(RELEASE_BASE.length)
      // Runtime bases are not requests. Actual browser requests must still hit exact members.
      if (file.path.endsWith('.js') && [
        RELEASE_BASE, `${RELEASE_BASE}play/`, `${RELEASE_BASE}assets/library/`, `${RELEASE_BASE}gallery/`,
      ].includes(absolute.pathname)) continue
      const member = path === '' || path === 'play/' ? `${path}index.html` : path
      requireAsset(allowed.has(member), 'RELEASE_DEPENDENCY', url, 'URL names a missing/unapproved member')
    }
  }
}

function validateProjection(files: readonly SourceFile[], binding: ReleaseLibraryBinding | null): void {
  const get = (path: string) => {
    const file = files.find((file) => file.path === path)
    requireAsset(file, 'RELEASE_MISSING', path, 'required projected member absent')
    return file
  }
  const allowed = viteMembers(parseJson(get('.vite/manifest.json').data.toString()))
  const gallery = parseGalleryIndex(parseJson(get('gallery/index.json').data.toString()))
  allowed.push('gallery/index.json')
  for (const item of gallery.items) {
    for (const [path, hash] of [[item.mediaUrl.original, item.sha256.source], [item.mediaUrl.thumbnail, item.sha256.thumbnail]]) {
      equal(get(path!).sha256, hash, 'RELEASE_HASH', path!)
      allowed.push(path!)
    }
  }
  if (binding) {
    const file = get('assets/library/manifest.json')
    equal(file.sha256, binding.manifestSha256, 'RELEASE_LIBRARY_BINDING', 'manifest')
    const manifest = validatePackagedManifest(parseJson(file.data.toString()))
    equal(manifest.libraryDigest, binding.libraryDigest, 'RELEASE_LIBRARY_BINDING', 'library')
    allowed.push(file.path)
    for (const asset of manifest.assets) {
      const path = `assets/library/${asset.file}`
      equal(get(path).sha256, asset.sha256, 'RELEASE_HASH', path)
      allowed.push(path)
    }
  }
  unique(allowed.map((path) => path.toLowerCase()), 'RELEASE_DUPLICATE', 'projected allowlist')
  equal(files.map((file) => file.path).sort(), allowed.sort(), 'RELEASE_ALLOWLIST', 'exact projection')
}

async function snapshotGallery(input: GalleryInput, reviewed?: Awaited<ReturnType<typeof loadPublicationInputs>>): Promise<{
  files: SourceFile[]; status: Snapshot['galleryStatus']
}> {
  const receipt = record(parseJson((await read(join(input.root, 'receipt.json'), input.receiptSha256)).toString()), 'gallery receipt')
  requireAsset(receipt.schemaVersion === 1, 'RELEASE_GALLERY_RECEIPT', 'gallery', 'receipt version required')
  const members = array(identityParser)(receipt.members, 'gallery members')
  unique(members.map((member) => member.path.toLowerCase()), 'RELEASE_DUPLICATE', 'gallery')
  const files: SourceFile[] = []
  for (const member of members) {
    const data = await read(join(input.root, member.path), member.sha256)
    requireAsset(data.length === member.bytes, 'RELEASE_HASH', member.path, 'byte count mismatch')
    files.push(source(member.path, data))
  }
  const index = files.find((file) => file.path === 'gallery/index.json')
  requireAsset(index, 'RELEASE_GALLERY_INDEX', 'gallery', 'public index required')
  const gallery = parseGalleryIndex(parseJson(index.data.toString()))
  equal(receipt.status, gallery.status, 'RELEASE_GALLERY_RECEIPT', 'status')
  const expected = ['gallery/index.json']
  for (const item of gallery.items) {
    for (const [path, hash] of [[item.mediaUrl.original, item.sha256.source], [item.mediaUrl.thumbnail, item.sha256.thumbnail]]) {
      expected.push(path!)
      requireAsset(files.some((file) => file.path === path && file.sha256 === hash),
        'RELEASE_GALLERY_APPROVAL', path!, 'exact approved original/thumbnail required')
    }
  }
  unique(expected, 'RELEASE_DUPLICATE', 'gallery URLs')
  equal(members.map((member) => member.path).sort(), expected.sort(), 'RELEASE_GALLERY_ALLOWLIST', 'members')
  if (reviewed !== undefined) {
    const thumbnails = array((value) => value)(receipt.thumbnails, 'thumbnails')
    for (const thumbnail of thumbnails) {
      const value = record(thumbnail, 'thumbnail')
      const file = files.find((member) => member.path === value.file)
      requireAsset(file, 'RELEASE_GALLERY_APPROVAL', 'thumbnail', 'approved output missing')
      validateThumbnail(thumbnail, file.data, text(value.sourceSha256, 'source'))
    }
    const expectedIndex = deriveGallery(reviewed?.manifest ?? null,
      reviewed?.policy ?? { schemaVersion: 1, referenceGrant: null, captures: [] },
      thumbnails as Parameters<typeof deriveGallery>[2])
    equal(gallery, expectedIndex, 'RELEASE_GALLERY_APPROVAL', 'reviewed projection')
  }
  return { files, status: gallery.status }
}

export async function snapshotQualifiedLibrary(input: LibraryInput): Promise<SourceFile[]> {
  const binding = bindingParser(input.binding, 'independently supplied release binding')
  // The qualified pointer is read exactly once. The development selection is never inspected.
  const pointer = object({
    schema: choice(1), kind: choice('cs3-asset-pointer'), qualification: text,
    libraryDigest: sha256, manifest: safeRelative, manifestSha256: sha256,
    receipt: safeRelative, receiptSha256: sha256,
  })(parseJson((await read(join(input.root, 'manifest.json'))).toString()), 'qualified pointer')
  requireAsset(pointer.qualification === 'qualified'
    && pointer.manifest === `packages/${binding.libraryDigest}/manifest.json`
    && pointer.manifestSha256 === binding.manifestSha256 && pointer.libraryDigest === binding.libraryDigest
    && /^receipts\/[a-f0-9]{64}\.json$/.test(pointer.receipt),
  'RELEASE_QUALIFIED_POINTER', 'library', 'exact selected qualified generation required')
  const publication = object({
    schema: choice(1), kind: choice('cs3-asset-publication'), qualification: choice('qualified'),
    libraryDigest: sha256, manifestSha256: sha256, approval: (value: unknown) => value,
  })(parseJson((await read(join(input.root, pointer.receipt), pointer.receiptSha256)).toString()), 'publication')
  equal(publication.libraryDigest, binding.libraryDigest, 'RELEASE_LIBRARY_BINDING', 'publication')
  equal(publication.manifestSha256, binding.manifestSha256, 'RELEASE_LIBRARY_BINDING', 'publication')
  const {
    technicalSha256: _technical, appearanceEvidenceSha256, publicationPolicySha256, parentAuthorizationSha256,
    ...approvalBinding
  } = binding
  let reviewed: ReturnType<typeof verifyQualifiedApproval>
  try {
    reviewed = verifyQualifiedApproval({
      approval: publication.approval as PromotionRequest['approval'],
      trustedParentAuthorizationSha256: parentAuthorizationSha256, trustedPublicKey: input.trustedPublicKey,
    }, approvalBinding)
  } catch (cause) {
    throw new Error('RELEASE_LIBRARY_APPROVAL_BINDING: exact appearance, policy and technical approval required', { cause })
  }
  equal(reviewed.record.appearanceEvidenceSha256, appearanceEvidenceSha256, 'RELEASE_LIBRARY_BINDING', 'appearance evidence')
  equal(reviewed.record.publicationPolicySha256, publicationPolicySha256, 'RELEASE_LIBRARY_BINDING', 'publication policy')
  const technical = record(parseJson((await read(input.technicalPath, binding.technicalSha256)).toString()), 'technical')
  requireAsset(technical.schema === 1 && technical.kind === 'cs3-technical-qualification'
    && technical.qualification === 'technical-only' && technical.technicalQualified === true,
    'RELEASE_TECHNICAL', 'library', 'completed technical evidence required')
  const identity = record(technical.identity, 'technical identity')
  for (const key of ['manifestSha256', 'libraryDigest', 'sourceCommit', 'sourceSha256', 'profile', 'profileSha256', 'recipeSha256'] as const) {
    equal(identity[key], binding[key], 'RELEASE_LIBRARY_BINDING', `technical ${key}`)
  }
  const bytes = await read(join(input.root, pointer.manifest), binding.manifestSha256)
  const value = parseJson(bytes.toString())
  const manifest = validatePackagedManifest(value)
  equal({
    sourceCommit: manifest.exportReceipt.source.commit, sourceSha256: manifest.exportReceipt.source.sha256,
    profileSha256: manifest.exportReceipt.profileSha256, recipeSha256: manifest.exportReceipt.recipeSha256,
  }, {
    sourceCommit: binding.sourceCommit, sourceSha256: binding.sourceSha256,
    profileSha256: binding.profileSha256, recipeSha256: binding.recipeSha256,
  }, 'RELEASE_LIBRARY_BINDING', 'source/profile/recipe')
  requireAsset(manifest.libraryDigest === binding.libraryDigest && manifest.profile === binding.profile,
    'RELEASE_LIBRARY_BINDING', 'manifest', 'selected digest/profile mismatch')
  await verifyFileSet(join(input.root, 'packages', binding.libraryDigest), [
    { path: 'manifest.json', sha256: binding.manifestSha256, bytes: bytes.length },
    ...candidateFiles(manifest),
  ])
  const files = [source('assets/library/manifest.json', bytes)]
  for (const asset of manifest.assets) {
    requireAsset(asset.file.startsWith(`packages/${binding.libraryDigest}/`) && asset.file.endsWith('.glb'),
      'RELEASE_LIBRARY_PATH', asset.id, 'preserve content-addressed package paths')
    files.push(source(`assets/library/${asset.file}`, await read(join(input.root, asset.file), asset.sha256)))
  }
  requireAsset(files.length === 6, 'RELEASE_LIBRARY_SET', 'library', 'manifest plus exactly five GLBs required')
  return files
}

export async function releaseStatus(repository: string, gallery: Snapshot['galleryStatus']) {
  let technical = 'unavailable'
  if (await optional(join(repository, QUALIFICATION_PATH))) {
    const receipt = record(parseJson((await read(join(repository, QUALIFICATION_PATH))).toString()), 'technical receipt')
    requireAsset(receipt.kind === 'cs3-technical-qualification' && receipt.technicalQualified === true,
      'RELEASE_TECHNICAL', 'U5', 'complete technical-only receipt required')
    const amendmentBytes = await read(join(repository, AMENDMENT_PATH))
    const amendment = record(parseJson(amendmentBytes.toString()), 'amendment')
    const baseline = record(amendment.technicalQualification, 'frozen technical baseline')
    equal(receipt.identity, baseline.identity, 'RELEASE_TECHNICAL', 'frozen identity')
    equal(receipt.baselineSha256, digest(canonicalJson(baseline)), 'RELEASE_TECHNICAL', 'frozen baseline')
    equal(receipt.amendment, { path: AMENDMENT_PATH, sha256: digest(amendmentBytes) }, 'RELEASE_TECHNICAL', 'amendment')
    for (const run of array(record)(baseline.runs, 'retained runs')) {
      const pin = identityParser(run.checks, 'checks')
      const checks = record(parseJson((await read(join(repository, text(run.root, 'run'), pin.path), pin.sha256)).toString()), 'checks')
      requireAsset(checks.complete === true && array(record)(checks.checks, 'checks').length === 31
        && array(record)(checks.checks, 'checks').every((check) => check.pass === true),
      'RELEASE_TECHNICAL', 'U5', 'retained all-pass checks required')
    }
    technical = 'passed'
  }
  return {
    technical, appearance: 'pending', playable: 'local-playable', performance: 'unqualified',
    gallery, productionLibrary: 'blocked', release: 'blocked', deployment: 'unauthorized',
    blockers: ['APPEARANCE_PENDING', 'PERFORMANCE_UNQUALIFIED', 'PRODUCTION_LIBRARY_BLOCKED', 'RELEASE_REVIEW_PENDING'],
  }
}

async function assemble(repository: string, viteRoot: string, snapshot: Snapshot, mode: ReleaseArtifact['mode']): Promise<ReleaseArtifact> {
  await verifyIgnoredOutputs(repository, ['dist/index.html', '.artifacts/release/receipt.json'])
  validatePrerequisites(parseJson((await read(join(repository, 'package.json'))).toString()),
    parseJson((await read(join(repository, 'package-lock.json'))).toString()))
  const manifest = parseJson((await read(join(viteRoot, '.vite/manifest.json'))).toString())
  const files: SourceFile[] = []
  for (const path of viteMembers(manifest)) files.push(source(path, await read(join(viteRoot, path))))
  await verifyFileSet(viteRoot, files)
  files.push(...snapshot.files)
  unique(files.map((file) => file.path.toLowerCase()), 'RELEASE_DUPLICATE', 'all release members')
  for (const file of files) inspectReleaseBytes(file.path, file.data)
  inspectUrls(files)
  validateProjection(files, snapshot.libraryBinding)
  const buildId = randomUUID()
  const generation = join(repository, '.artifacts/release', buildId)
  const root = join(generation, 'dist')
  await assertNoSymlink(root, true)
  await mkdir(root, { recursive: true, mode: 0o700 })
  try {
    for (const file of files) {
      const path = join(root, file.path)
      await mkdir(dirname(path), { recursive: true, mode: 0o700 })
      await writeFile(path, file.data, { flag: 'wx', mode: 0o600 })
    }
    const identities = files.map(({ data: _data, ...identity }) => identity)
    await verifyFileSet(root, identities)
    const receipt = canonicalJson({
      schema: 1, complete: true, buildId, mode, files: identities,
      gallery: snapshot.galleryStatus, library: snapshot.libraryBinding,
      status: await releaseStatus(repository, snapshot.galleryStatus),
    }) + '\n'
    await writeFile(join(generation, 'receipt.json'), receipt, { flag: 'wx', mode: 0o600 })
    return { root, buildId, mode, files: identities, receiptSha256: digest(receipt) }
  } catch (error) {
    await rm(generation, { recursive: true })
    throw error
  }
}

export async function stageRelease(input: {
  repository: string; viteRoot: string; gallery: GalleryInput; library: LibraryInput; mode: 'fixture'
}): Promise<ReleaseArtifact> {
  requireAsset(input.mode === 'fixture', 'RELEASE_MODE', 'fixture', 'explicit synthetic mechanics mode required')
  const library = await snapshotQualifiedLibrary(input.library)
  const gallery = await snapshotGallery(input.gallery)
  return assemble(input.repository, input.viteRoot, {
    files: [...gallery.files, ...library], galleryStatus: gallery.status, libraryBinding: input.library.binding,
  }, 'fixture')
}

export async function validateRelease(artifact: ReleaseArtifact) {
  unique(artifact.files.map((file) => file.path.toLowerCase()), 'RELEASE_DUPLICATE', 'artifact')
  const bytes = await read(join(artifact.root, '../receipt.json'))
  requireAsset(digest(bytes) === artifact.receiptSha256, 'RELEASE_RECEIPT', 'artifact', 'missing, stale or modified receipt')
  const receipt = record(parseJson(bytes.toString()), 'release receipt')
  requireAsset(receipt.complete === true && receipt.buildId === artifact.buildId && receipt.mode === artifact.mode,
    'RELEASE_RECEIPT', 'artifact', 'incomplete or different generation')
  equal(receipt.files, artifact.files, 'RELEASE_RECEIPT', 'inventory')
  await verifyFileSet(artifact.root, artifact.files)
  const files: SourceFile[] = []
  for (const file of artifact.files) {
    const data = await read(join(artifact.root, file.path), file.sha256)
    inspectReleaseBytes(file.path, data)
    files.push(source(file.path, data))
  }
  inspectUrls(files)
  validateProjection(files, receipt.library === null ? null : bindingParser(receipt.library, 'library binding'))
  if (artifact.mode === 'staging') {
    const repository = resolve(artifact.root, '../../../..')
    const current = record(parseJson((await read(join(repository, '.artifacts/site/current.json'))).toString()), 'site current')
    const galleryRoot = resolve(text(current.root, 'site root'))
    requireAsset(galleryRoot.startsWith(resolve(repository, '.artifacts/site') + '/'),
      'RELEASE_GALLERY_APPROVAL', 'site root', 'reviewed gallery stage must remain private')
    const galleryReceipt = await read(join(galleryRoot, 'receipt.json'))
    const reviewed = await loadPublicationInputs(repository)
    const authoritative = await snapshotGallery({
      root: galleryRoot, receiptSha256: digest(galleryReceipt),
    }, reviewed)
    const stagedGallery = files.filter((file) => file.path.startsWith('gallery/'))
      .map((file) => ({ path: file.path, bytes: file.bytes, sha256: file.sha256 }))
    const approvedGallery = authoritative.files
      .map((file) => ({ path: file.path, bytes: file.bytes, sha256: file.sha256 }))
    equal(stagedGallery, approvedGallery, 'RELEASE_GALLERY_APPROVAL', 'staging gallery provenance')
  }
  // The receipt is a local integrity record, not authority to change the pending gates.
  return {
    ...await releaseStatus(resolve(artifact.root, '../../../..'),
      choice('awaiting-approval', 'approved-for-staging')(receipt.gallery, 'gallery')),
    mode: artifact.mode, mechanics: receipt.library === null ? 'staging-only' : 'passed',
  }
}

export function validateBuildAttempt(artifact: ReleaseArtifact, input: unknown): void {
  const state = record(input, 'build attempt')
  requireAsset(state.schema === 1 && state.complete === true && state.buildId === artifact.buildId,
    'RELEASE_STALE', 'build attempt', 'latest build is incomplete or belongs to a different artifact')
}

export async function buildReleaseVite(
  repository: string, outDir: string, binding: ReleaseLibraryBinding | null, gallery: Snapshot['galleryStatus'],
) {
  await build({
    configFile: join(repository, 'vite.config.ts'), publicDir: false,
    define: { 'import.meta.env.CS3_RELEASE_BINDING': JSON.stringify(binding && {
      manifestSha256: binding.manifestSha256, libraryDigest: binding.libraryDigest, profile: binding.profile,
      profileSha256: binding.profileSha256, recipeSha256: binding.recipeSha256,
    }) },
    build: { outDir, emptyOutDir: true, sourcemap: false, manifest: true },
    plugins: [{
      name: 'cs3-release-staging-status',
      transformIndexHtml(html, context) {
        return context.path === '/index.html'
          ? html.replace('data-publication="awaiting-approval"', `data-publication="${gallery}"`) : html
      },
    }],
  })
}

async function buildSnapshot(repository: string, authority: Omit<LibraryInput, 'root'> | undefined, requireGallery: boolean) {
  // Only an independently supplied binding selects production content. The current
  // amendment supplies none; the default build never consults development/selection.
  const library = authority ? await snapshotQualifiedLibrary({
    ...authority, root: join(repository, 'assets/library'),
  }) : []
  const reviewed = await loadPublicationInputs(repository)
  const stage = await prepareSite(repository, requireGallery, reviewed)
  const gallery = await snapshotGallery({
    root: stage.root, receiptSha256: digest(await read(join(stage.root, 'receipt.json'))),
  }, reviewed)
  const viteRoot = join(repository, '.artifacts/release-vite', randomUUID())
  await buildReleaseVite(repository, viteRoot, authority?.binding ?? null, gallery.status)
  const artifact = await assemble(repository, viteRoot, {
    files: [...gallery.files, ...library], galleryStatus: gallery.status, libraryBinding: authority?.binding ?? null,
  }, 'staging')
  await validateRelease(artifact)
  const pending = join(repository, '.artifacts/release', `output-${artifact.buildId}`)
  await mkdir(pending)
  for (const file of artifact.files) {
    await mkdir(dirname(join(pending, file.path)), { recursive: true })
    await writeFile(join(pending, file.path), await read(join(artifact.root, file.path), file.sha256), { flag: 'wx' })
  }
  await verifyFileSet(pending, artifact.files)
  // Never merge into a stale dist, nor select an incompletely copied directory.
  const dist = join(repository, 'dist')
  await assertNoSymlink(dist, true)
  if (await optional(dist)) await rename(dist, join(repository, '.artifacts/release', `prior-${artifact.buildId}`))
  await rename(pending, dist)
  await verifyFileSet(dist, artifact.files)
  const current = join(repository, '.artifacts/release/current.json')
  const temporary = join(repository, '.artifacts/release', `current-${artifact.buildId}.json`)
  await writeFile(temporary, canonicalJson(artifact) + '\n', { flag: 'wx', mode: 0o600 })
  await assertNoSymlink(current, true)
  await rename(temporary, current)
  await rm(viteRoot, { recursive: true })
  console.log(JSON.stringify(await validateRelease(artifact), null, 2))
  return artifact
}

export async function buildRelease(repository = resolve('.'), authority?: Omit<LibraryInput, 'root'>, requireGallery = false) {
  const root = join(repository, '.artifacts/release')
  await verifyIgnoredOutputs(repository, ['dist/index.html', '.artifacts/release/receipt.json'])
  await assertNoSymlink(root, true)
  await mkdir(root, { recursive: true, mode: 0o700 })
  const lock = join(root, 'build.lock')
  await writeFile(lock, String(process.pid), { flag: 'wx', mode: 0o600 })
  const state = join(root, 'build-state.json')
  try {
    await assertNoSymlink(state, true)
    await writeFile(state, canonicalJson({ schema: 1, complete: false, buildId: randomUUID() }) + '\n')
    await promisify(execFile)(process.execPath, [join(repository, 'node_modules/typescript/bin/tsc'), '--noEmit'], {
      cwd: repository, maxBuffer: 16 * 1024 * 1024,
    })
    const artifact = await buildSnapshot(repository, authority, requireGallery)
    const temporary = join(root, `state-${artifact.buildId}.json`)
    await writeFile(temporary, canonicalJson({ schema: 1, complete: true, buildId: artifact.buildId }) + '\n', { flag: 'wx' })
    await rename(temporary, state)
    return artifact
  } finally {
    await rm(lock)
  }
}

export async function serveRelease(artifact: ReleaseArtifact) {
  await validateRelease(artifact)
  const allowed = new Map(artifact.files.map((file) => [file.path, file]))
  const requests: { path: string; allowed: boolean; status: number }[] = []
  const server = createServer((request, response) => {
    void (async () => {
      const raw = request.url ?? '/'
      const path = raw.split('?')[0]!
      const local = path.startsWith(RELEASE_BASE) ? path.slice(RELEASE_BASE.length) : null
      const member = local === '' || local === 'play/' ? `${local}index.html` : local
      const identity = member !== null && !/[\\%]/.test(path) ? allowed.get(member) : undefined
      let data: Buffer | null = null
      let status = 404
      if (identity && (request.method === 'GET' || request.method === 'HEAD')) {
        try { data = await read(join(artifact.root, identity.path), identity.sha256); status = 200 } catch (error) {
          if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) {
            console.error('RELEASE_SERVER_INTEGRITY', error); status = 500
          }
        }
      }
      requests.push({ path, allowed: Boolean(identity), status })
      const content = data ?? Buffer.from(status === 404 ? 'Not found' : 'Integrity failure')
      const types: Record<string, string> = {
        html: 'text/html', js: 'text/javascript', css: 'text/css', json: 'application/json',
        glb: 'model/gltf-binary', png: 'image/png', webp: 'image/webp',
      }
      response.writeHead(status, {
        'Content-Type': data ? types[identity!.path.split('.').at(-1)!] ?? 'application/octet-stream' : 'text/plain',
        'Content-Length': content.length, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
      })
      response.end(request.method === 'HEAD' ? undefined : content)
    })().catch((error: unknown) => {
      console.error('RELEASE_SERVER', error)
      response.writeHead(500, { 'Content-Type': 'text/plain' }); response.end('Server failure')
    })
  })
  await new Promise<void>((done, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', done) })
  const address = server.address()
  requireAsset(address && typeof address !== 'string', 'RELEASE_SERVER', 'loopback', 'TCP address required')
  return {
    url: `http://127.0.0.1:${address.port}${RELEASE_BASE}`, requests,
    close: async () => {
      server.closeAllConnections()
      await new Promise<void>((done, reject) => server.close((error) => error ? reject(error) : done()))
    },
  }
}

async function main() {
  const args = process.argv.slice(2)
  requireAsset(args.length === 1 && ['--build', '--validate', '--expect-blocked'].includes(args[0]!),
    'RELEASE_ARGUMENT', 'CLI', 'use --build, --validate or --expect-blocked')
  if (args[0] === '--build') { await buildRelease(); return }
  try {
    const artifact: ReleaseArtifact = JSON.parse((await read(resolve('.artifacts/release/current.json'))).toString())
    requireAsset(artifact.mode === 'staging' && artifact.root === resolve('.artifacts/release', artifact.buildId, 'dist'),
      'RELEASE_RECEIPT', 'current', 'fixture or foreign artifacts cannot become the real staging selection')
    validateBuildAttempt(artifact, parseJson((await read(resolve('.artifacts/release/build-state.json'))).toString()))
    requireAsset(!await optional(resolve('.artifacts/release/build.lock')), 'RELEASE_STALE', 'build', 'build still in progress')
    await verifyFileSet(resolve('dist'), artifact.files)
    const report = await validateRelease(artifact)
    console.log(JSON.stringify(report, null, 2))
    if (args[0] !== '--expect-blocked') process.exitCode = 1
    else requireAsset(report.release === 'blocked' && report.blockers.length >= 4,
      'RELEASE_EXPECTATION', 'CI', 'expected every real prerequisite to remain blocked')
  } catch (error) {
    let status
    try {
      status = await releaseStatus(resolve('.'), 'awaiting-approval')
    } catch (statusError) {
      status = {
        technical: 'invalid', appearance: 'pending', playable: 'local-playable',
        performance: 'unqualified', gallery: 'awaiting-approval', productionLibrary: 'blocked',
        release: 'blocked', deployment: 'unauthorized',
        blockers: ['TECHNICAL_EVIDENCE_INVALID', 'APPEARANCE_PENDING', 'PERFORMANCE_UNQUALIFIED',
          'PRODUCTION_LIBRARY_BLOCKED', 'RELEASE_REVIEW_PENDING'],
        statusError: statusError instanceof Error ? statusError.message : String(statusError),
      }
    }
    console.log(JSON.stringify({
      ...status, artifact: 'rejected',
      error: error instanceof Error ? error.message : String(error),
    }, null, 2))
    process.exitCode = 2
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
}
