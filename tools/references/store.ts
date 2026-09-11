import { constants, createReadStream } from 'node:fs'
import {
  lstat, mkdir, open, readFile, readlink, readdir, rename, rm, symlink,
} from 'node:fs/promises'
import { createHash, randomUUID } from 'node:crypto'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { canonicalJson, ReferenceError, requireReference, safeRelative, unique } from './contracts.ts'
import type { FileIdentity } from './contracts.ts'

function hasCode(error: unknown, code: string): boolean {
  return error instanceof Error && 'code' in error && error.code === code
}
async function exists(path: string): Promise<boolean> {
  try { await lstat(path); return true } catch (error) {
    if (hasCode(error, 'ENOENT')) return false
    throw error
  }
}

export async function assertNoSymlink(path: string, allowMissing = false): Promise<void> {
  requireReference(isAbsolute(path) && resolve(path) === path, 'PATH', path, 'canonical absolute filesystem identity required')
  let current: string = sep
  for (const part of path.split(sep).filter(Boolean)) {
    current = join(current, part)
    try {
      const info = await lstat(current)
      requireReference(!info.isSymbolicLink(), 'SYMLINK', current, 'symlink input/ancestor rejected')
    } catch (error) {
      if (allowMissing && hasCode(error, 'ENOENT')) return
      throw error
    }
  }
}
export async function ensureDirectory(path: string): Promise<void> {
  await assertNoSymlink(path, true)
  await mkdir(path, { recursive: true, mode: 0o700 })
  await assertNoSymlink(path)
  requireReference((await lstat(path)).isDirectory(), 'DIRECTORY', path, 'directory required')
}
export async function writeFlushed(path: string, content: string): Promise<void> {
  await assertNoSymlink(path, true)
  const file = await open(path, 'wx', 0o600)
  try { await file.writeFile(content, 'utf8'); await file.sync() } finally { await file.close() }
}
async function syncDirectory(path: string): Promise<void> {
  const file = await open(path, 'r')
  try { await file.sync() } finally { await file.close() }
}
async function flushTree(root: string): Promise<void> {
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const path = join(root, entry.name)
    requireReference(!entry.isSymbolicLink(), 'SYMLINK', path, 'staged symlinks are forbidden')
    if (entry.isDirectory()) await flushTree(path)
    else {
      requireReference(entry.isFile(), 'FILE_TYPE', path, 'only ordinary files are accepted')
      const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW)
      try { await file.sync() } finally { await file.close() }
    }
  }
  await syncDirectory(root)
}

export async function verifyFileSet(root: string, expected: FileIdentity[]): Promise<void> {
  await assertNoSymlink(root)
  unique(expected.map((file) => file.path), 'DUPLICATE_PATH')
  const wanted = new Map(expected.map((file) => [safeRelative(file.path), file]))
  const directories = new Set<string>()
  for (const file of wanted.keys()) {
    let parent = dirname(file)
    while (parent !== '.') { directories.add(parent); parent = dirname(parent) }
  }
  const found = new Set<string>()
  async function walk(directory: string) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name)
      const local = relative(root, path)
      requireReference(!entry.isSymbolicLink(), 'SYMLINK', path, 'package inputs cannot be symlinks')
      if (entry.isDirectory()) {
        requireReference(directories.has(local), 'EXTRA_FILE', local, 'unexpected package directory')
        await walk(path)
      } else {
        requireReference(entry.isFile(), 'FILE_TYPE', local, 'expected ordinary file')
        const identity = wanted.get(local)
        requireReference(identity, 'EXTRA_FILE', local, 'file is not in the exact package manifest')
        const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW)
        try {
          const info = await file.stat()
          requireReference(info.size === identity.bytes, 'BYTES', local, `expected ${identity.bytes}, received ${info.size}`)
          const hash = createHash('sha256')
          for await (const chunk of createReadStream(path, { fd: file.fd, autoClose: false })) hash.update(chunk)
          requireReference(hash.digest('hex') === identity.sha256, 'HASH', local, 'SHA-256 does not match the manifest')
          found.add(local)
        } finally { await file.close() }
      }
    }
  }
  await walk(root)
  for (const path of wanted.keys()) requireReference(found.has(path), 'MISSING_FILE', path, 'required package member absent')
}

interface Ownership { schemaVersion: 1, store: string, activeLink: string }
async function ownership(store: string, activeLink: string): Promise<void> {
  const path = join(store, 'managed-link.json')
  await assertNoSymlink(path)
  let record: unknown
  try { record = JSON.parse(await readFile(path, 'utf8')) } catch {
    throw new ReferenceError('UNMANAGED', activeLink, 'managed ownership record is unreadable')
  }
  requireReference(canonicalJson(record) === canonicalJson({ schemaVersion: 1, store, activeLink }),
    'UNMANAGED', activeLink, 'managed ownership record does not match this explicit store/link')
}
async function validateGeneration(store: string, activeLink: string, target: string): Promise<string> {
  const prefix = join(store, 'packages') + sep
  requireReference(target.startsWith(prefix), 'UNMANAGED', activeLink, 'pointer is not inside the approved package store')
  const rest = target.slice(prefix.length)
  requireReference(/^[a-f0-9]{64}\/midcreek$/.test(rest), 'UNMANAGED', activeLink, 'pointer is not a canonical immutable generation')
  await assertNoSymlink(target)
  const packageDigest = rest.split('/')[0]!
  const receiptPath = join(store, 'receipts', `${packageDigest}.json`)
  await assertNoSymlink(receiptPath)
  const receipt: unknown = JSON.parse(await readFile(receiptPath, 'utf8'))
  requireReference(typeof receipt === 'object' && receipt !== null
    && Reflect.get(receipt, 'schemaVersion') === 1 && Reflect.get(receipt, 'status') === 'validated-generation'
    && Reflect.get(receipt, 'packageDigest') === packageDigest && Reflect.get(receipt, 'store') === store
    && Reflect.get(receipt, 'activeLink') === activeLink, 'UNMANAGED', activeLink, 'missing matching validated-generation receipt')
  return target
}

// Resolve the managed link once. Consumers keep this immutable path for their entire operation.
export async function resolveActive(store: string, activeLink: string): Promise<string> {
  await assertNoSymlink(store)
  await assertNoSymlink(dirname(activeLink))
  await ownership(store, activeLink)
  requireReference((await lstat(activeLink)).isSymbolicLink(), 'UNMANAGED', activeLink, 'active destination is not a managed symlink')
  const target = await readlink(activeLink)
  return validateGeneration(store, activeLink, target)
}

export type TransactionPhase = 'after-build' | 'before-package-rename' | 'before-pointer-rename' | 'after-pointer-rename'
export interface GenerationRequest {
  store: string
  activeLink: string
  packageDigest: string
  preflight?: () => Promise<void>
  build: (packageRoot: string, indexRoot: string) => Promise<void>
  verify: (packageRoot: string, indexRoot: string) => Promise<void>
  onPhase?: (phase: TransactionPhase) => Promise<void>
}
export interface GenerationResult { store: string, packageRoot: string, indexRoot: string, previousPackage: string | null }

export async function promoteGeneration(request: GenerationRequest): Promise<GenerationResult> {
  const { store, activeLink, packageDigest } = request
  requireReference(process.platform !== 'win32', 'PLATFORM', store, 'POSIX transaction only; Windows is not qualified')
  requireReference(/^[a-f0-9]{64}$/.test(packageDigest), 'PACKAGE_DIGEST', packageDigest, 'invalid generation digest')
  requireReference(isAbsolute(store) && isAbsolute(activeLink) && !activeLink.startsWith(store + sep),
    'PATH', activeLink, 'explicit store and separate active link required')
  await assertNoSymlink(store, true)
  await assertNoSymlink(dirname(activeLink), true)
  await ensureDirectory(store)
  const lockPath = join(store, '.import.lock')
  await assertNoSymlink(lockPath, true)
  let lock
  try { lock = await open(lockPath, 'wx', 0o600) } catch (error) {
    if (hasCode(error, 'EEXIST')) throw new ReferenceError('LOCKED', lockPath, 'another importer owns the lock; never automatically steal it')
    throw error
  }
  const token = randomUUID()
  const stage = join(store, 'packages', `.stage-${token}`)
  const indexStage = join(store, 'index', `.stage-${token}`)
  const temporaryLink = join(dirname(activeLink), `.midcreek-${token}`)
  const packageDirectory = join(store, 'packages', packageDigest)
  const packageRoot = join(packageDirectory, 'midcreek')
  const indexRoot = join(store, 'index', packageDigest)
  let previousPackage: string | null = null
  try {
    await lock.writeFile(canonicalJson({ pid: process.pid, token, packageDigest }) + '\n')
    await lock.sync()
    const ownerPath = join(store, 'managed-link.json')
    const hasOwner = await exists(ownerPath)
    const hasLink = await exists(activeLink)
    requireReference(!hasLink || hasOwner, 'UNMANAGED', activeLink, 'preexisting destination has no importer ownership record')
    if (hasOwner) await ownership(store, activeLink)
    if (hasLink) previousPackage = await resolveActive(store, activeLink)
    await request.preflight?.()
    if (!hasOwner) {
      const record: Ownership = { schemaVersion: 1, store, activeLink }
      await writeFlushed(ownerPath, canonicalJson(record) + '\n')
      await syncDirectory(store)
    }
    for (const directory of [join(store, 'packages'), join(store, 'index'), join(store, 'receipts'), dirname(activeLink)]) {
      await ensureDirectory(directory)
    }
    await assertNoSymlink(packageDirectory, true)
    await assertNoSymlink(indexRoot, true)
    if (await exists(packageDirectory)) {
      requireReference(await exists(indexRoot), 'INCOMPLETE_GENERATION', indexRoot, 'existing package has no complete index; preserve and inspect it')
      await request.verify(packageRoot, indexRoot)
    } else {
      await ensureDirectory(join(stage, 'midcreek'))
      await ensureDirectory(indexStage)
      await request.build(join(stage, 'midcreek'), indexStage)
      await request.onPhase?.('after-build')
      await request.verify(join(stage, 'midcreek'), indexStage)
      await flushTree(stage)
      await flushTree(indexStage)
      await request.onPhase?.('before-package-rename')
      // Install the index first; a crash can leave an ignored orphan, never an active partial package.
      if (await exists(indexRoot)) {
        await request.verify(join(stage, 'midcreek'), indexRoot)
      } else {
        await rename(indexStage, indexRoot)
        await syncDirectory(join(store, 'index'))
      }
      await rename(stage, packageDirectory)
      await syncDirectory(join(store, 'packages'))
    }
    const receiptPath = join(store, 'receipts', `${packageDigest}.json`)
    if (!(await exists(receiptPath))) {
      await writeFlushed(receiptPath, canonicalJson({
        schemaVersion: 1, status: 'validated-generation', packageDigest, store, activeLink,
        previousPackage, preparedAt: new Date().toISOString(), activation: 'read-managed-link',
      }) + '\n')
      await syncDirectory(join(store, 'receipts'))
    }
    await validateGeneration(store, activeLink, packageRoot)
    await symlink(packageRoot, temporaryLink)
    await syncDirectory(dirname(activeLink))
    await request.onPhase?.('before-pointer-rename')
    await ownership(store, activeLink)
    const stillPrevious = await exists(activeLink) ? await resolveActive(store, activeLink) : null
    requireReference(stillPrevious === previousPackage, 'POINTER_CHANGED', activeLink, 'active link changed during exclusive transaction')
    await rename(temporaryLink, activeLink)
    await syncDirectory(dirname(activeLink))
    await request.onPhase?.('after-pointer-rename')
    return { store, packageRoot, indexRoot, previousPackage }
  } finally {
    // Only these individually named, transaction-owned paths are removable; old generations survive.
    for (const path of [temporaryLink, stage, indexStage]) {
      await rm(path, { recursive: path !== temporaryLink, force: true })
    }
    await lock.close()
    await rm(lockPath)
    await syncDirectory(store)
  }
}
