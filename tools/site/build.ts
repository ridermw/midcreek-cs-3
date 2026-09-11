import { randomUUID } from 'node:crypto'
import { readFile, rename, rm, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import {
  AWAITING, deriveGallery, loadPublicationInputs, validateThumbnail, verifySource,
} from './publication.ts'
import type { ThumbnailRecord } from './publication.ts'
import { createThumbnailRenderer } from './thumbnails.mjs'
import { canonicalJson, digest, requireReference } from '../references/contracts.ts'
import type { FileIdentity } from '../references/contracts.ts'
import { assertNoSymlink, ensureDirectory, verifyFileSet } from '../references/store.ts'
import { verifyIgnoredOutputs } from '../references/git.ts'

export async function prepareSite(
  repository = resolve('.'), requireGallery = false,
  resolvedSource?: Awaited<ReturnType<typeof loadPublicationInputs>>,
) {
  const source = resolvedSource === undefined ? await loadPublicationInputs(repository) : resolvedSource
  requireReference(!requireGallery || source, 'PUBLICATION_REQUIRED', 'gallery', 'explicitly requested populated gallery has no provable approval')
  const root = join(repository, '.artifacts/site', randomUUID())
  await verifyIgnoredOutputs(repository, ['.artifacts/site/receipt.json', 'dist/index.html'])
  await ensureDirectory(root)
  const thumbnails: ThumbnailRecord[] = []
  const files: FileIdentity[] = []
  const write = async (path: string, bytes: Buffer | string) => {
    const file = join(root, path)
    await ensureDirectory(dirname(file))
    await writeFile(file, bytes, { flag: 'wx', mode: 0o600 })
    files.push({ path, bytes: Buffer.byteLength(bytes), sha256: digest(bytes) })
  }
  try {
    if (source) {
      const renderer = await createThumbnailRenderer()
      try {
        for (const art of source.manifest.artworks) {
          const path = join(source.packageRoot, art.destination)
          await assertNoSymlink(path)
          const original = await readFile(path)
          verifySource(art, original)
          const thumbnail = await renderer.render(original, { sha256: art.sha256, width: art.width, height: art.height })
          validateThumbnail(thumbnail.record, thumbnail.bytes, art.sha256)
          thumbnails.push(thumbnail.record)
          await write(thumbnail.record.file, thumbnail.bytes)
          await write(`gallery/originals/${art.sha256}.png`, original)
        }
      } finally { await renderer.close() }
    }
    const policy = source?.policy ?? { schemaVersion: 1 as const, referenceGrant: null, captures: [] }
    const index = deriveGallery(source?.manifest ?? null, policy, thumbnails)
    await write('gallery/index.json', canonicalJson(index) + '\n')
    const members = [...files]
    await write('receipt.json', canonicalJson({
      schemaVersion: 1, status: index.status, policySha256: digest(await readFile(join(repository, 'config/publication-allowlist.json'))),
      authorizationSha256: source?.manifest.authority.authorizationSha256 ?? null,
      inventorySha256: source?.manifest.inventorySha256 ?? null,
      packageDigest: source?.manifest.packageDigest ?? null, thumbnails, members,
      appearance: 'pending', productionRelease: 'blocked', liveDeployment: false,
    }) + '\n')
    await verifyFileSet(root, files)
    const temporary = join(repository, '.artifacts/site', `current-${randomUUID()}.json`)
    const current = join(repository, '.artifacts/site/current.json')
    await assertNoSymlink(current, true)
    await writeFile(temporary, canonicalJson({ root }) + '\n', { flag: 'wx', mode: 0o600 })
    await rename(temporary, current)
    console.log(index.status === 'approved-for-staging'
      ? `U9: ${index.items.length} exact-hash references approved for local release staging; captures excluded; no release/deployment approval.`
      : AWAITING)
    return { root, files: members, status: index.status }
  } catch (error) {
    // Only this invocation's fresh UUID directory is owned; prior generations stay intact.
    await rm(root, { recursive: true })
    throw error
  }
}

export async function buildShowcase(repository = resolve('.'), requireGallery = false) {
  const { buildRelease } = await import('../release.ts')
  return buildRelease(repository, undefined, requireGallery)
}
async function main() {
  const args = process.argv.slice(2)
  requireReference(args.every((arg) => ['--prepare-only', '--require-gallery'].includes(arg))
    && new Set(args).size === args.length, 'SITE_ARGUMENT', 'build', 'only --prepare-only and --require-gallery are supported')
  if (args.includes('--prepare-only')) await prepareSite(resolve('.'), args.includes('--require-gallery'))
  else await buildShowcase(resolve('.'), args.includes('--require-gallery'))
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
}
