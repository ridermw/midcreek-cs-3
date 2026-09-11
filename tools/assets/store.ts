import { constants } from 'node:fs'
import { lstat, mkdir, open, readdir, realpath, rename, rm } from 'node:fs/promises'
import { createHash, randomUUID } from 'node:crypto'
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import {
  AssetPackagingError, candidateFiles, canonicalJson, choice, digest, object, parseJson,
  requireAsset, safeRelative, sha256, unique, validatePackagedManifest,
} from './contracts.ts'
import type { FileIdentity, PackagedManifest } from './contracts.ts'

function hasCode(error: unknown, code: string): boolean {
  return error instanceof Error && 'code' in error && error.code === code
}

export class AssetPublicationError extends AssetPackagingError {
  readonly activated = true
  readonly libraryDigest: string
  readonly pointerPath: string

  constructor(libraryDigest: string, pointerPath: string, cause: unknown) {
    super('ACTIVATED_WITH_ERRORS', pointerPath, 'generation activated but durability or cleanup failed')
    this.name = 'AssetPublicationError'
    this.libraryDigest = libraryDigest
    this.pointerPath = pointerPath
    this.cause = cause
  }
}

async function filesystemIdentity(path: string): Promise<string> {
  const suffix: string[] = []
  let current = path
  while (true) {
    try {
      return join(await realpath(current), ...suffix.reverse())
    } catch (error) {
      if (!hasCode(error, 'ENOENT') || dirname(current) === current) throw error
      suffix.push(basename(current))
      current = dirname(current)
    }
  }
}

function containsPath(parent: string, child: string): boolean {
  const local = relative(parent, child)
  return local === '' || (!local.startsWith(`..${sep}`) && local !== '..' && !isAbsolute(local))
}

export async function assertNoSymlink(path: string, allowMissing = false): Promise<void> {
  requireAsset(isAbsolute(path) && resolve(path) === path, 'PATH', path, 'canonical absolute filesystem root required')
  let current: string = sep
  for (const part of path.split(sep).filter(Boolean)) {
    current = join(current, part)
    try {
      requireAsset(!(await lstat(current)).isSymbolicLink(), 'SYMLINK', current, 'symlink or symlink ancestor forbidden')
    } catch (error) {
      if (allowMissing && hasCode(error, 'ENOENT')) return
      throw error
    }
  }
}

async function exists(path: string): Promise<boolean> {
  try { await lstat(path); return true } catch (error) {
    if (hasCode(error, 'ENOENT')) return false
    throw error
  }
}

async function ensureDirectory(path: string): Promise<void> {
  await assertNoSymlink(path, true)
  await mkdir(path, { recursive: true, mode: 0o700 })
  await assertNoSymlink(path)
  requireAsset((await lstat(path)).isDirectory(), 'DIRECTORY', path, 'directory required')
}

async function syncDirectory(path: string): Promise<void> {
  const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW)
  try { await file.sync() } finally { await file.close() }
}

async function writeFlushed(path: string, bytes: string): Promise<void> {
  await assertNoSymlink(path, true)
  const file = await open(path, 'wx', 0o600)
  try { await file.writeFile(bytes, 'utf8'); await file.sync() } finally { await file.close() }
}

async function readSafe(path: string): Promise<Buffer> {
  await assertNoSymlink(path)
  const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW)
  try {
    requireAsset((await file.stat()).isFile(), 'FILE_TYPE', path, 'ordinary file required')
    return await file.readFile()
  } finally { await file.close() }
}

async function readOptional(path: string): Promise<Buffer | null> {
  await assertNoSymlink(path, true)
  return await exists(path) ? readSafe(path) : null
}

export async function verifyFileSet(root: string, files: readonly FileIdentity[]): Promise<void> {
  await assertNoSymlink(root)
  requireAsset((await lstat(root)).isDirectory(), 'DIRECTORY', root, 'candidate directory required')
  unique(files.map((f) => f.path.toLowerCase()), 'DUPLICATE_PATH', root)
  const wanted = new Map(files.map((f) => [safeRelative(f.path, 'file'), f]))
  const directories = new Set<string>()
  for (const file of wanted.keys()) {
    let parent = dirname(file)
    while (parent !== '.') { directories.add(parent); parent = dirname(parent) }
  }
  const found = new Set<string>()
  async function walk(directory: string): Promise<void> {
    await assertNoSymlink(directory)
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name)
      const local = relative(root, path)
      requireAsset(!entry.isSymbolicLink(), 'SYMLINK', local, 'candidate/staged symlink forbidden')
      if (entry.isDirectory()) {
        requireAsset(directories.has(local), 'EXTRA_FILE', local, 'unexpected directory')
        await walk(path)
      } else {
        requireAsset(entry.isFile(), 'FILE_TYPE', local, 'only ordinary files accepted')
        const identity = wanted.get(local)
        requireAsset(identity, 'EXTRA_FILE', local, 'not in exact file inventory')
        await assertNoSymlink(path)
        const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW)
        try {
          const before = await file.stat()
          requireAsset(before.isFile() && before.size === identity.bytes, 'CANDIDATE_HASH', local, 'byte count mismatch')
          const hash = createHash('sha256')
          for await (const chunk of file.createReadStream({ autoClose: false })) hash.update(chunk)
          const after = await file.stat()
          requireAsset(hash.digest('hex') === identity.sha256 && before.size === after.size
            && before.mtimeMs === after.mtimeMs && before.ctimeMs === after.ctimeMs,
          'CANDIDATE_HASH', local, 'bytes changed or hash mismatch')
          found.add(local)
        } finally { await file.close() }
      }
    }
  }
  await walk(root)
  for (const path of wanted.keys()) requireAsset(found.has(path), 'MISSING_FILE', path, 'declared member absent')
}

async function copyFiles(source: string, stage: string, files: FileIdentity[]): Promise<void> {
  for (const identity of files) {
    const sourcePath = join(source, identity.path)
    const target = join(stage, identity.path)
    await assertNoSymlink(sourcePath)
    await ensureDirectory(dirname(target))
    const input = await open(sourcePath, constants.O_RDONLY | constants.O_NOFOLLOW)
    try {
      requireAsset((await input.stat()).isFile(), 'FILE_TYPE', sourcePath, 'ordinary file required')
      const output = await open(target, 'wx', 0o600)
      try {
        for await (const chunk of input.createReadStream({ autoClose: false })) await output.writeFile(chunk)
        await output.sync()
      } finally { await output.close() }
    } finally { await input.close() }
  }
}

async function syncTree(root: string): Promise<void> {
  await assertNoSymlink(root)
  for (const entry of await readdir(root, { withFileTypes: true })) {
    if (entry.isDirectory()) await syncTree(join(root, entry.name))
  }
  await syncDirectory(root)
}

const pointerParser = object({
  schema: choice(1), kind: choice('cs3-asset-pointer'), qualification: choice('qualified', 'provisional-development'),
  libraryDigest: sha256, manifest: safeRelative, manifestSha256: sha256,
  receipt: safeRelative, receiptSha256: sha256,
})
export type AssetPointer = ReturnType<typeof pointerParser>
export type TransactionPhase = 'after-staging' | 'before-pointer-replace' | 'after-pointer-replace'
export interface TransactionPaths { packageRoot: string; pointerPath: string }
export type PhaseObserver = (phase: TransactionPhase, paths: TransactionPaths) => Promise<void>
export interface PublicationResult {
  libraryDigest: string
  manifestSha256: string
  packageRoot: string
  pointerPath: string
  previousLibraryDigest: string | null
}

function packageFiles(manifest: PackagedManifest): FileIdentity[] {
  const bytes = canonicalJson(manifest) + '\n'
  return [...candidateFiles(manifest), { path: 'manifest.json', sha256: digest(bytes), bytes: Buffer.byteLength(bytes) }]
}

async function inspectPointer(root: string, bytes: Buffer, qualification: AssetPointer['qualification']): Promise<AssetPointer> {
  let pointer: AssetPointer
  try { pointer = pointerParser(parseJson(bytes.toString('utf8')), 'pointer') } catch (cause) {
    throw new AssetPackagingError('UNMANAGED_POINTER', 'pointer', String(cause))
  }
  requireAsset(pointer.qualification === qualification
    && pointer.manifest === `packages/${pointer.libraryDigest}/manifest.json`
    && /^receipts\/[a-f0-9]{64}\.json$/.test(pointer.receipt),
  'UNMANAGED_POINTER', 'pointer', 'not a managed immutable generation')
  const manifestBytes = await readSafe(join(root, pointer.manifest))
  requireAsset(digest(manifestBytes) === pointer.manifestSha256, 'UNMANAGED_POINTER', 'manifest', 'pointer manifest hash mismatch')
  const manifest = validatePackagedManifest(parseJson(manifestBytes.toString('utf8')))
  requireAsset(manifest.libraryDigest === pointer.libraryDigest, 'UNMANAGED_POINTER', 'manifest', 'library digest mismatch')
  await verifyFileSet(join(root, 'packages', pointer.libraryDigest), packageFiles(manifest))
  const receipt = await readSafe(join(root, pointer.receipt))
  requireAsset(digest(receipt) === pointer.receiptSha256, 'UNMANAGED_POINTER', 'receipt', 'publication receipt hash mismatch')
  const record = parseJson(receipt.toString('utf8'))
  requireAsset(record !== null && typeof record === 'object'
    && Reflect.get(record, 'kind') === 'cs3-asset-publication'
    && Reflect.get(record, 'qualification') === qualification
    && Reflect.get(record, 'manifestSha256') === pointer.manifestSha256
    && Reflect.get(record, 'libraryDigest') === pointer.libraryDigest,
  'UNMANAGED_POINTER', 'receipt', 'publication receipt does not bind the selected generation')
  return pointer
}

export interface TransactionRequest {
  candidateRoot: string
  destinationRoot: string
  manifest: PackagedManifest
  qualification: AssetPointer['qualification']
  approval: unknown
  onPhase?: PhaseObserver
}

// Verified stage -> immutable generation -> verified receipt -> atomic small-pointer rename.
// A crash can leave an orphan or lock, never a partly populated active generation.
export async function publishGeneration(request: TransactionRequest): Promise<PublicationResult> {
  const { candidateRoot, destinationRoot, manifest, qualification } = request
  requireAsset(process.platform !== 'win32', 'PLATFORM', destinationRoot, 'POSIX filesystem transaction required')
  await assertNoSymlink(candidateRoot)
  await assertNoSymlink(destinationRoot, true)
  const candidateIdentity = await filesystemIdentity(candidateRoot)
  const destinationIdentity = await filesystemIdentity(destinationRoot)
  requireAsset(!containsPath(candidateIdentity, destinationIdentity)
    && !containsPath(destinationIdentity, candidateIdentity),
  'PATH_OVERLAP', destinationRoot, 'candidate and store must be disjoint')
  await verifyFileSet(candidateRoot, candidateFiles(manifest))
  await ensureDirectory(destinationRoot)
  const lockPath = join(destinationRoot, '.promotion.lock')
  await assertNoSymlink(lockPath, true)
  let lock
  try { lock = await open(lockPath, 'wx', 0o600) } catch (error) {
    if (hasCode(error, 'EEXIST')) throw new AssetPackagingError('LOCKED', lockPath, 'existing transaction lock; never auto-steal')
    throw error
  }
  const token = randomUUID()
  const stage = join(destinationRoot, 'packages', `.stage-${token}`)
  const packageRoot = join(destinationRoot, 'packages', manifest.libraryDigest)
  const pointerPath = join(destinationRoot, qualification === 'qualified' ? 'manifest.json' : 'development/selection.json')
  const pointerTemp = join(dirname(pointerPath), `.pointer-${token}.json`)
  const receiptTemp = join(destinationRoot, 'receipts', `.receipt-${token}.json`)
  const manifestBytes = canonicalJson(manifest) + '\n'
  const manifestSha256 = digest(manifestBytes)
  let activated = false
  let result: PublicationResult | undefined
  let operationError: unknown
  const cleanupErrors: unknown[] = []
  try {
    await lock.writeFile(canonicalJson({ pid: process.pid, token, libraryDigest: manifest.libraryDigest }) + '\n')
    await lock.sync()
    await syncDirectory(destinationRoot)
    const previousBytes = await readOptional(pointerPath)
    const previous = previousBytes === null ? null : await inspectPointer(destinationRoot, previousBytes, qualification)
    for (const directory of [join(destinationRoot, 'packages'), join(destinationRoot, 'receipts'), dirname(pointerPath)]) {
      await ensureDirectory(directory)
    }
    await assertNoSymlink(packageRoot, true)
    if (!(await exists(packageRoot))) {
      await ensureDirectory(stage)
      await copyFiles(candidateRoot, stage, candidateFiles(manifest))
      await writeFlushed(join(stage, 'manifest.json'), manifestBytes)
      await request.onPhase?.('after-staging', { packageRoot: stage, pointerPath })
      await verifyFileSet(stage, packageFiles(manifest))
      await syncTree(stage)
      await assertNoSymlink(packageRoot, true)
      requireAsset(!(await exists(packageRoot)), 'GENERATION_EXISTS', packageRoot, 'generation appeared outside the lock')
      await rename(stage, packageRoot)
      await syncDirectory(join(destinationRoot, 'packages'))
    }
    await verifyFileSet(packageRoot, packageFiles(manifest))
    const receiptBytes = canonicalJson({
      schema: 1, kind: 'cs3-asset-publication', qualification, libraryDigest: manifest.libraryDigest,
      manifestSha256, approval: request.approval,
    }) + '\n'
    const receiptSha256 = digest(receiptBytes)
    const receiptRelative = `receipts/${receiptSha256}.json`
    const receiptPath = join(destinationRoot, receiptRelative)
    const existingReceipt = await readOptional(receiptPath)
    if (existingReceipt === null) {
      await writeFlushed(receiptTemp, receiptBytes)
      await rename(receiptTemp, receiptPath)
      await syncDirectory(dirname(receiptPath))
    } else {
      requireAsset(existingReceipt.equals(Buffer.from(receiptBytes)), 'RECEIPT_HASH', receiptPath, 'immutable receipt differs')
    }
    const pointer: AssetPointer = {
      schema: 1, kind: 'cs3-asset-pointer', qualification, libraryDigest: manifest.libraryDigest,
      manifest: `packages/${manifest.libraryDigest}/manifest.json`, manifestSha256,
      receipt: receiptRelative, receiptSha256,
    }
    const pointerBytes = canonicalJson(pointer) + '\n'
    await writeFlushed(pointerTemp, pointerBytes)
    await syncDirectory(dirname(pointerPath))
    await request.onPhase?.('before-pointer-replace', { packageRoot, pointerPath })
    const stillPrevious = await readOptional(pointerPath)
    requireAsset(previousBytes === null ? stillPrevious === null : stillPrevious !== null && previousBytes.equals(stillPrevious),
      'POINTER_CHANGED', pointerPath, 'pointer changed outside the exclusive transaction')
    await verifyFileSet(packageRoot, packageFiles(manifest))
    requireAsset((await readSafe(receiptPath)).equals(Buffer.from(receiptBytes)),
      'RECEIPT_HASH', receiptPath, 'publication receipt changed before activation')
    requireAsset((await readSafe(pointerTemp)).equals(Buffer.from(pointerBytes)),
      'POINTER_CHANGED', pointerTemp, 'staged pointer changed before activation')
    await assertNoSymlink(pointerPath, true)
    await rename(pointerTemp, pointerPath)
    activated = true
    await syncDirectory(dirname(pointerPath))
    await request.onPhase?.('after-pointer-replace', { packageRoot, pointerPath })
    result = {
      libraryDigest: manifest.libraryDigest, manifestSha256, packageRoot, pointerPath,
      previousLibraryDigest: previous?.libraryDigest ?? null,
    }
  } catch (cause) {
    operationError = cause
  } finally {
    // Remove only transaction-owned temporary paths. Never remove a published generation.
    for (const action of [
      () => rm(pointerTemp, { force: true }),
      () => rm(receiptTemp, { force: true }),
      () => rm(stage, { recursive: true, force: true }),
      () => lock.close(),
      () => rm(lockPath),
      () => syncDirectory(destinationRoot),
    ]) {
      try { await action() } catch (cause) { cleanupErrors.push(cause) }
    }
  }
  const errors = [operationError, ...cleanupErrors].filter((error) => error !== undefined)
  if (activated && errors.length) {
    throw new AssetPublicationError(manifest.libraryDigest, pointerPath, new AggregateError(errors))
  }
  if (operationError !== undefined) {
    if (cleanupErrors.length && operationError instanceof Error) {
      operationError.cause = new AggregateError(cleanupErrors, 'Asset publication cleanup failed')
    }
    throw operationError
  }
  if (cleanupErrors.length) {
    const error = new AssetPackagingError('CLEANUP', destinationRoot, 'asset publication cleanup failed')
    error.cause = new AggregateError(cleanupErrors)
    throw error
  }
  return result!
}
