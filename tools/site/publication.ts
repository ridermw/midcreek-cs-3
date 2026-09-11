import { readFile, lstat } from 'node:fs/promises'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  ATTRIBUTION, AUTHORIZATION_SHA256, INVENTORY_SHA256, PUBLIC_FIELDS, TERMS,
  canonicalJson, digest, packageFiles, parseManifest, requireReference, validateManifest, validatePngHeader,
} from '../references/contracts.ts'
import type { ArtworkRecord, ReferenceManifest } from '../references/contracts.ts'
import { readAuthorization } from '../references/authorization.ts'
import { assertNoSymlink, resolveActive, verifyFileSet } from '../references/store.ts'
import { AWAITING, CONCEPT_CAPTION, parseGalleryIndex } from '../../src/site/content.ts'
import type { GalleryIndex } from '../../src/site/content.ts'

export { AWAITING }
export const THUMBNAIL_RECIPE = Object.freeze({
  version: 'cs3-canvas-contain-webp-v1', width: 384, height: 256,
  quality: 0.8, maxBytes: 60_000, fit: 'contain', mime: 'image/webp',
})
const referenceGrant = {
  authorizationSha256: AUTHORIZATION_SHA256, inventorySha256: INVENTORY_SHA256,
  uses: ['original-on-selection', 'build-only-thumbnail'], thumbnail: THUMBNAIL_RECIPE,
  publicFields: PUBLIC_FIELDS, attribution: ATTRIBUTION, terms: TERMS,
}
export interface PublicationPolicy {
  schemaVersion: 1
  referenceGrant: typeof referenceGrant | null
  captures: never[]
}
export interface ThumbnailRecord {
  sourceSha256: string
  outputSha256: string
  sourceWidth: number
  sourceHeight: number
  width: number
  height: number
  bytes: number
  file: string
  recipe: typeof THUMBNAIL_RECIPE
  browserVersion: string
  playwrightVersion: string
  encoderSha256: string
}
const verifiedThumbnails = new WeakMap<ThumbnailRecord, string>()
function assertPolicy(value: unknown): asserts value is PublicationPolicy {
  const text = canonicalJson(value)
  requireReference(text === canonicalJson({ schemaVersion: 1, referenceGrant: null, captures: [] })
    || text === canonicalJson({ schemaVersion: 1, referenceGrant, captures: [] }),
  'PUBLICATION_POLICY', 'allowlist', 'unknown fields, uses, inputs, credit, recipe or unqualified captures')
}
export function parsePolicy(text: string): PublicationPolicy {
  const value: unknown = JSON.parse(text)
  assertPolicy(value)
  return value
}
function approvedManifest(manifest: ReferenceManifest): void {
  validateManifest(manifest)
  // The reviewed 155-record digest binds every source path, byte count and SHA-256.
  // A self-consistent candidate digest alone is not an authorization.
  requireReference(manifest.inventorySha256 === INVENTORY_SHA256, 'PUBLICATION_INPUT', 'manifest', 'not the exact launch input set')
  for (const art of manifest.artworks) {
    requireReference(art.galleryApproval.status === 'approved', 'PUBLICATION_DENIED', art.id, 'gallery use denied')
    const relative = art.sourcePath.slice('themes/cel-shift/masters/'.length, -4)
    requireReference(art.title === relative.replace('/', ' / ').replaceAll('-', ' '),
      'PUBLICATION_TITLE', art.id, 'only the canonical U4 title derivation is public')
  }
}
export function verifySource(art: ArtworkRecord, bytes: Buffer): void {
  requireReference(bytes.length === art.bytes && digest(bytes) === art.sha256,
    'SOURCE_HASH', art.id, 'source changed or missing; never rewrite or substitute an original')
  validatePngHeader(bytes.subarray(0, 33), art.sourcePath, art.width, art.height)
}

function assertThumbnail(value: unknown): asserts value is ThumbnailRecord {
  requireReference(typeof value === 'object' && value !== null && !Array.isArray(value), 'THUMBNAIL_SHAPE', 'thumbnail', 'record required')
  const keys = ['sourceSha256', 'outputSha256', 'sourceWidth', 'sourceHeight', 'width', 'height', 'bytes',
    'file', 'recipe', 'browserVersion', 'playwrightVersion', 'encoderSha256']
  requireReference(Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key)),
    'THUMBNAIL_FIELDS', 'thumbnail', 'unknown/private or missing fields')
  for (const key of ['sourceSha256', 'outputSha256', 'encoderSha256']) {
    requireReference(typeof Reflect.get(value, key) === 'string' && /^[a-f0-9]{64}$/.test(Reflect.get(value, key)),
      'THUMBNAIL_HASH', key, 'SHA-256 required')
  }
  requireReference(Reflect.get(value, 'width') === 384 && Reflect.get(value, 'height') === 256
    && Number.isSafeInteger(Reflect.get(value, 'sourceWidth')) && Reflect.get(value, 'sourceWidth') > 0
    && Number.isSafeInteger(Reflect.get(value, 'sourceHeight')) && Reflect.get(value, 'sourceHeight') > 0
    && Number.isSafeInteger(Reflect.get(value, 'bytes')) && Reflect.get(value, 'bytes') > 0 && Reflect.get(value, 'bytes') <= 60000,
  'THUMBNAIL_DIMENSIONS_SIZE', 'thumbnail', 'exact dimensions and byte ceiling required')
  requireReference(canonicalJson(Reflect.get(value, 'recipe')) === canonicalJson(THUMBNAIL_RECIPE)
    && Reflect.get(value, 'playwrightVersion') === '1.62.1'
    && typeof Reflect.get(value, 'browserVersion') === 'string' && /^\d+\.\d+\.\d+\.\d+$/.test(Reflect.get(value, 'browserVersion')),
  'THUMBNAIL_RECIPE', 'thumbnail', 'recipe and actual pinned-tool/browser identities required')
  requireReference(Reflect.get(value, 'file') === `gallery/thumbnails/${Reflect.get(value, 'outputSha256')}.webp`,
    'THUMBNAIL_PATH', 'thumbnail', 'only hash-addressed output URLs allowed')
}
function webpDimensions(bytes: Buffer): [number, number] {
  requireReference(bytes.length >= 30 && bytes.toString('ascii', 0, 4) === 'RIFF'
    && bytes.readUInt32LE(4) === bytes.length - 8 && bytes.toString('ascii', 8, 12) === 'WEBP',
  'THUMBNAIL_WEBP', 'thumbnail', 'complete WebP container required')
  const kind = bytes.toString('ascii', 12, 16)
  if (kind === 'VP8X') return [bytes.readUIntLE(24, 3) + 1, bytes.readUIntLE(27, 3) + 1]
  if (kind === 'VP8 ' && bytes.subarray(23, 26).equals(Buffer.from([0x9d, 0x01, 0x2a]))) {
    return [bytes.readUInt16LE(26) & 0x3fff, bytes.readUInt16LE(28) & 0x3fff]
  }
  if (kind === 'VP8L' && bytes[20] === 0x2f) {
    const bits = bytes.readUInt32LE(21)
    return [(bits & 0x3fff) + 1, ((bits >>> 14) & 0x3fff) + 1]
  }
  throw new Error('THUMBNAIL_WEBP: unsupported image bitstream')
}
export function validateThumbnail(value: unknown, bytes: Buffer, sourceSha256: string): asserts value is ThumbnailRecord {
  assertThumbnail(value)
  requireReference(value.encoderSha256 === digest(readFileSync(new URL('./thumbnails.mjs', import.meta.url))),
    'THUMBNAIL_ENCODER', value.file, 'record must identify this exact encoder implementation')
  requireReference(value.sourceSha256 === sourceSha256 && value.outputSha256 === digest(bytes),
    'THUMBNAIL_HASH', value.file, 'source/output identities differ')
  requireReference(value.bytes === bytes.length && bytes.length <= 60000, 'THUMBNAIL_SIZE', value.file, 'byte count or ceiling failed')
  requireReference(canonicalJson(webpDimensions(bytes)) === '[384,256]', 'THUMBNAIL_DIMENSIONS', value.file, 'encoded image must be 384 x 256')
  verifiedThumbnails.set(value, canonicalJson(value))
}
export function deriveGallery(manifest: ReferenceManifest | null, policy: PublicationPolicy, thumbnails: readonly ThumbnailRecord[]): GalleryIndex {
  assertPolicy(policy)
  if (!policy.referenceGrant || !manifest) {
    requireReference(thumbnails.length === 0, 'UNAPPROVED_THUMBNAIL', 'gallery', 'no outputs allowed without source approval')
    return { schemaVersion: 1, status: 'awaiting-approval', items: [] }
  }
  approvedManifest(manifest)
  const records = new Map<string, ThumbnailRecord>()
  for (const record of thumbnails) {
    assertThumbnail(record)
    requireReference(verifiedThumbnails.get(record) === canonicalJson(record),
      'UNAPPROVED_THUMBNAIL', record.file, 'output bytes must be validated in this operation; receipt claims alone are not approval')
    requireReference(!records.has(record.sourceSha256) && manifest.artworks.some((art) => art.sha256 === record.sourceSha256),
      'UNAPPROVED_THUMBNAIL', record.file, 'duplicate or unknown source')
    records.set(record.sourceSha256, record)
  }
  const items = manifest.artworks.map((art) => {
    const thumb = records.get(art.sha256)
    requireReference(thumb, 'MISSING_THUMBNAIL', art.id, 'every requested gallery member needs a verified thumbnail')
    requireReference(thumb.sourceWidth === art.width && thumb.sourceHeight === art.height,
      'THUMBNAIL_SOURCE_DIMENSIONS', art.id, 'decoded source differs')
    return {
      id: art.id, family: art.family, title: art.title, displayRole: 'concept reference',
      sourceRepository: art.sourceRepository, sourceRevision: art.sourceRevision, sourcePath: art.sourcePath,
      sha256: { source: art.sha256, thumbnail: thumb.outputSha256 }, width: art.width, height: art.height,
      attribution: art.attribution, terms: art.terms, caption: CONCEPT_CAPTION,
      mediaUrl: { original: `gallery/originals/${art.sha256}.png`, thumbnail: thumb.file },
    }
  })
  const result = parseGalleryIndex({ schemaVersion: 1, status: 'approved-for-staging', items })
  requireReference(Buffer.byteLength(JSON.stringify(result)) <= 100_000, 'PUBLIC_INDEX_SIZE', 'gallery/index.json', 'small index ceiling exceeded')
  return result
}
async function present(path: string): Promise<boolean> {
  try { await lstat(path); return true } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return false
    throw error
  }
}
export async function loadPublicationInputs(repository: string) {
  const policyPath = join(repository, 'config/publication-allowlist.json')
  await assertNoSymlink(policyPath)
  const policy = parsePolicy(await readFile(policyPath, 'utf8'))
  if (!policy.referenceGrant) return null
  const authorization = join(repository, '.artifacts/implementation/20260910T232859Z/authorization.json')
  const active = join(repository, 'references/midcreek')
  if (!await present(authorization) || !await present(active)) {
    console.warn(`${AWAITING}: reviewed local authorization or canonical package unavailable.`)
    return null
  }
  await readAuthorization(authorization, repository)
  const packageRoot = await resolveActive(join(repository, '.artifacts/references'), active)
  const manifest = parseManifest(await readFile(join(packageRoot, 'reference-manifest.json'), 'utf8'))
  requireReference(manifest.repositoryRoot === repository && packageRoot === join(manifest.store, 'packages', manifest.packageDigest, 'midcreek'),
    'PUBLICATION_PACKAGE', 'manifest', 'canonical managed generation differs')
  approvedManifest(manifest)
  await verifyFileSet(packageRoot, packageFiles(manifest))
  return { policy, manifest, packageRoot }
}
