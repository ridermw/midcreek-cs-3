import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { open } from 'node:fs/promises'
import { resolve } from 'node:path'
import { ReferenceError, SOURCE_REPOSITORY, requireReference, safeRelative } from './contracts.ts'
import { assertNoSymlink } from './store.ts'
import type { FileIdentity } from './contracts.ts'

interface TreeEntry { mode: string, type: string, object: string }
export interface PinnedSource {
  localPath: string
  revision: string
  entries: Map<string, TreeEntry>
}

export async function eachSerial<T>(items: readonly T[], consume: (item: T) => Promise<void>): Promise<void> {
  for (const item of items) await consume(item)
}

async function gitText(repository: string, args: string[], limit = 4 * 1024 * 1024): Promise<string> {
  const child = spawn('git', ['--no-pager', '-C', repository, ...args], {
    stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, GIT_OPTIONAL_LOCKS: '0', GIT_TERMINAL_PROMPT: '0' },
  })
  const result = new Promise<void>((accept, reject) => {
    child.once('error', () => reject(new ReferenceError('GIT_EXEC', repository, 'cannot launch Git')))
    child.once('close', (code) => code === 0 ? accept() : reject(new ReferenceError('GIT_OBJECT', repository, `pinned Git operation failed (${code})`)))
  })
  // Consume stderr without copying potentially private origin or operational data into diagnostics.
  child.stderr.resume()
  const chunks: Buffer[] = []
  let length = 0
  try {
    for await (const chunk of child.stdout) {
      length += chunk.length
      requireReference(length <= limit, 'GIT_SIZE', repository, 'Git text output exceeds bounded input limit')
      chunks.push(Buffer.from(chunk))
    }
    await result
  } catch (error) {
    child.kill()
    await result.catch(() => {})
    throw error
  }
  return Buffer.concat(chunks).toString('utf8')
}

export function sourceIdentity(origin: string): string {
  const value = origin.trim().replace(/\.git$/, '')
  const githubSsh = /^git@github\.com:([^/]+\/[^/]+)$/.exec(value)
  if (githubSsh) return githubSsh[1]!
  const azureSsh = /^git@ssh\.dev\.azure\.com:v3\/([^/]+)\/[^/]+\/([^/]+)$/.exec(value)
  if (azureSsh) return `${azureSsh[1]}/${azureSsh[2]}`
  let url: URL
  try { url = new URL(value) } catch { throw new ReferenceError('SOURCE_IDENTITY', '<origin>', 'unsupported source origin') }
  requireReference((url.protocol === 'https:' || url.protocol === 'ssh:') && !url.search && !url.hash,
    'SOURCE_IDENTITY', '<origin>', 'unsupported source origin protocol or suffix')
  const parts = url.pathname.split('/').filter(Boolean)
  if (url.hostname === 'github.com' && parts.length === 2) return parts.join('/')
  if (url.hostname === 'dev.azure.com' && parts.length === 4 && parts[2] === '_git') return `${parts[0]}/${parts[3]}`
  if (url.hostname.endsWith('.visualstudio.com') && parts.at(-2) === '_git') return `${url.hostname.split('.')[0]}/${parts.at(-1)}`
  throw new ReferenceError('SOURCE_IDENTITY', '<origin>', 'origin is not a supported reviewed repository identity')
}

export async function openPinnedSource(localPath: string, revision: string): Promise<PinnedSource> {
  requireReference(resolve(localPath) === localPath && /^[a-f0-9]{40}$/.test(revision), 'SOURCE_REVISION', localPath, 'explicit absolute repository and full commit required')
  await assertNoSymlink(localPath)
  const top = (await gitText(localPath, ['rev-parse', '--show-toplevel'])).trim()
  requireReference(top === localPath, 'SOURCE_IDENTITY', localPath, 'repository root differs from reviewed identity')
  const origin = await gitText(localPath, ['config', '--get', 'remote.origin.url'])
  requireReference(sourceIdentity(origin) === SOURCE_REPOSITORY, 'SOURCE_IDENTITY', localPath, 'origin differs from reviewed E6 repository')
  const commit = (await gitText(localPath, ['rev-parse', '--verify', `${revision}^{commit}`])).trim()
  requireReference(commit === revision, 'SOURCE_REVISION', localPath, 'pinned object is not the exact commit')
  const output = await gitText(localPath, ['ls-tree', '-r', '-z', revision])
  const entries = new Map<string, TreeEntry>()
  for (const row of output.split('\0').filter(Boolean)) {
    const match = /^([0-9]{6}) ([a-z]+) ([a-f0-9]{40})\t(.+)$/.exec(row)
    requireReference(match, 'GIT_TREE', localPath, 'malformed pinned tree entry')
    requireReference(!entries.has(match[4]!), 'DUPLICATE_PATH', match[4]!, 'duplicate pinned tree path')
    entries.set(match[4]!, { mode: match[1]!, type: match[2]!, object: match[3]! })
  }
  return { localPath, revision, entries }
}

export async function readPinnedDocument(repository: string, revision: string, path: string): Promise<string> {
  safeRelative(path)
  await assertNoSymlink(repository)
  requireReference(/^[a-f0-9]{40}$/.test(revision), 'SOURCE_REVISION', path, 'full pinned revision required')
  return gitText(repository, ['show', `${revision}:${path}`])
}

export async function verifyIgnoredOutputs(repository: string, outputs: string[] = []): Promise<void> {
  const paths = [...new Set([
    '.artifacts/references/packages/probe/midcreek/reference-manifest.json',
    '.artifacts/references/candidates/probe.json', '.artifacts/references/index/probe/index.html',
    '.artifacts/references/receipts/probe.json', '.artifacts/references/managed-link.json',
    '.artifacts/references/.import.lock', 'references/midcreek', ...outputs,
  ])]
  for (const path of paths) {
    requireReference(/^[A-Za-z0-9._/-]+$/.test(path) && !path.startsWith('/') && !path.split('/').includes('..'),
      'OUTPUT_PATH', path, 'canonical repository-relative output path required')
  }
  let ignored: string
  try { ignored = await gitText(repository, ['check-ignore', '--no-index', '--', ...paths]) } catch (error) {
    if (error instanceof ReferenceError && error.code === 'GIT_OBJECT') {
      throw new ReferenceError('OUTPUT_NOT_IGNORED', '.artifacts/references', 'Git did not confirm exclusion; integration owner must configure ignored local outputs')
    }
    throw error
  }
  const confirmed = new Set(ignored.split('\n').filter(Boolean))
  for (const path of paths) requireReference(confirmed.has(path), 'OUTPUT_NOT_IGNORED', path, 'integration owner must ignore every local reference output before import')
  const tracked = await gitText(repository, ['ls-files', '--', '.artifacts/references', 'references/midcreek'])
  requireReference(tracked.trim() === '', 'OUTPUT_TRACKED', '.artifacts/references', 'local references cannot enter public Git; tracked output paths already exist')
}

export async function inspectBlob(
  source: PinnedSource, path: string,
  options: { destination?: string, collect?: boolean, maxBytes?: number } = {},
): Promise<FileIdentity & { header: Buffer, text?: string }> {
  safeRelative(path)
  const entry = source.entries.get(path)
  requireReference(entry, 'MISSING_FILE', path, 'required pinned E6 blob absent; no mirror downgrade')
  requireReference(entry.type === 'blob' && entry.mode === '100644', entry.mode === '120000' ? 'SYMLINK' : 'GIT_MODE', path, 'only ordinary pinned files are accepted')
  const output = options.destination ? await open(options.destination, 'wx', 0o600) : undefined
  const child = spawn('git', ['--no-pager', '-C', source.localPath, 'cat-file', 'blob', entry.object], {
    stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, GIT_OPTIONAL_LOCKS: '0', GIT_TERMINAL_PROMPT: '0' },
  })
  const result = new Promise<void>((accept, reject) => {
    child.once('error', () => reject(new ReferenceError('GIT_EXEC', path, 'cannot read pinned blob')))
    child.once('close', (code) => code === 0 ? accept() : reject(new ReferenceError('GIT_OBJECT', path, `blob read failed (${code})`)))
  })
  child.stderr.resume()
  const hash = createHash('sha256')
  const chunks: Buffer[] = []
  let header = Buffer.alloc(0)
  let bytes = 0
  try {
    for await (const value of child.stdout) {
      const chunk = Buffer.from(value)
      bytes += chunk.length
      requireReference(bytes <= (options.maxBytes ?? (options.collect ? 2 * 1024 * 1024 : 16 * 1024 * 1024)), 'SOURCE_SIZE', path, 'blob exceeds bounded file budget')
      hash.update(chunk)
      if (header.length < 33) header = Buffer.concat([header, chunk.subarray(0, 33 - header.length)])
      if (options.collect) chunks.push(chunk)
      if (output) await output.writeFile(chunk)
    }
    await result
    if (output) await output.sync()
  } catch (error) {
    child.kill()
    await result.catch(() => {})
    throw error
  } finally {
    await output?.close()
  }
  return { path, bytes, sha256: hash.digest('hex'), header, ...(options.collect ? { text: Buffer.concat(chunks).toString('utf8') } : {}) }
}
