import { readFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import {
  canonicalJson, digest, packageFiles, parseManifest, requireReference, sanitizedSidecar, validateManifest,
  validatePngHeader, validateProfile, validatePrompt,
} from './contracts.ts'
import type { ReferenceManifest } from './contracts.ts'
import { checkRunBudget, readAuthorization, verifyCandidate } from './authorization.ts'
import { eachSerial, inspectBlob, openPinnedSource, verifyIgnoredOutputs } from './git.ts'
import type { PinnedSource } from './git.ts'
import { buildIndex, indexFiles } from './index.ts'
import { prepareCandidate } from './prepare.ts'
import {
  assertNoSymlink, ensureDirectory, promoteGeneration, verifyFileSet, writeFlushed,
} from './store.ts'
import { cliArguments, reportCliError } from './cli.ts'

export interface ImportOptions {
  manifest: ReferenceManifest
  sourceRevision: string
  store: string
  authorization: string
}
export async function importReferences(options: ImportOptions) {
  const { manifest } = options
  validateManifest(manifest)
  requireReference(options.sourceRevision === manifest.sources[0]!.revision, 'SOURCE_REVISION', options.sourceRevision, 'explicit revision differs from reviewed manifest')
  requireReference(options.store === manifest.store, 'STORE_IDENTITY', options.store, 'explicit store differs from reviewed manifest')
  const auth = await readAuthorization(options.authorization, manifest.repositoryRoot)
  const files = packageFiles(manifest)
  const additionalBytes = files.reduce((total, file) => total + file.bytes, 0) + Buffer.byteLength(buildIndex(manifest)) + 1024 * 1024
  let source: PinnedSource | undefined
  await verifyIgnoredOutputs(manifest.repositoryRoot, [
    ...files.map((file) => `.artifacts/references/packages/${manifest.packageDigest}/midcreek/${file.path}`),
    `.artifacts/references/index/${manifest.packageDigest}/index.html`,
    `.artifacts/references/receipts/${manifest.packageDigest}.json`,
  ])
  return promoteGeneration({
    store: options.store, activeLink: manifest.activeLink, packageDigest: manifest.packageDigest,
    preflight: async () => {
      const expected = await prepareCandidate({
        repository: manifest.repositoryRoot, sourceRepository: manifest.sources[0]!.localPath,
        sourceRevision: options.sourceRevision, authorization: options.authorization,
      })
      verifyCandidate(manifest, expected)
      await checkRunBudget(auth, additionalBytes)
      source = await openPinnedSource(manifest.sources[0]!.localPath, options.sourceRevision)
    },
    build: async (packageRoot, indexRoot) => {
      requireReference(source, 'SOURCE_PREFLIGHT', 'source', 'pinned source preflight did not complete')
      const pinnedSource = source
      await eachSerial([...manifest.support, ...manifest.artworks], async (file) => {
        const destination = join(packageRoot, file.destination)
        await ensureDirectory(dirname(destination))
        const blob = await inspectBlob(pinnedSource, file.sourcePath, { destination })
        requireReference(blob.bytes === file.bytes && blob.sha256 === file.sha256, 'SOURCE_MISMATCH', file.sourcePath, 'copied pinned blob differs from manifest')
        if ('width' in file) validatePngHeader(blob.header, file.sourcePath, file.width, file.height)
      })
      for (const art of manifest.artworks) {
        await writeFlushed(join(packageRoot, art.sidecar.sanitizedPath), sanitizedSidecar(art))
      }
      await writeFlushed(join(packageRoot, 'reference-manifest.json'), canonicalJson(manifest) + '\n')
      await writeFlushed(join(indexRoot, 'index.html'), buildIndex(manifest))
    },
    verify: async (packageRoot, indexRoot) => {
      await verifyFileSet(packageRoot, files)
      await verifyFileSet(indexRoot, indexFiles(manifest))
      const contents = new Map<string, string>()
      for (const file of manifest.support) contents.set(file.sourcePath, await readFile(join(packageRoot, file.destination), 'utf8'))
      validateProfile(contents)
      const supportPaths = new Set(manifest.support.map((file) => file.sourcePath))
      for (const prompt of manifest.support.filter((file) => file.kind === 'prompt')) {
        const base = validatePrompt(prompt.sourcePath, contents.get(prompt.sourcePath)!, supportPaths)
        requireReference(prompt.dependencies[0] === base, 'DEPENDENCY', prompt.sourcePath, 'copied prompt disagrees with manifest dependency')
      }
      for (const art of manifest.artworks) {
        const text = await readFile(join(packageRoot, art.sidecar.sanitizedPath), 'utf8')
        requireReference(text === sanitizedSidecar(art) && digest(text) === art.sidecar.sanitizedSha256,
          'SIDECAR_DIGEST', art.sidecar.sanitizedPath, 'sanitized bytes do not match the reviewed transformation')
      }
    },
    onPhase: async (phase) => {
      if (phase === 'before-pointer-rename') await checkRunBudget(auth, 0)
    },
  })
}

async function main() {
  const args = cliArguments(['manifest', 'source-revision', 'store', 'authorization'])
  await assertNoSymlink(args.manifest!)
  const manifest = parseManifest(await readFile(args.manifest!, 'utf8'))
  const result = await importReferences({
    manifest, sourceRevision: args['source-revision']!, store: args.store!, authorization: args.authorization!,
  })
  console.log(canonicalJson({ status: 'local-reference-package-active', packageDigest: manifest.packageDigest, ...result, published: false, staged: false }))
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(reportCliError)
}
