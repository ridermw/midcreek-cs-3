import { createServer } from 'node:http'
import { readFile, mkdir, open, rename, unlink, realpath } from 'node:fs/promises'
import { constants } from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'
import { createHash, randomUUID } from 'node:crypto'
import { createCatalog } from './catalog.ts'
import type { MonitorSnapshot } from './catalog.ts'

export function renderHtml(template: string, snapshot: MonitorSnapshot): string {
  if (!template.includes('/* DATA */')) throw new Error('MONITOR_TEMPLATE_PLACEHOLDER')
  return template.replace('/* DATA */', () => JSON.stringify(snapshot).replaceAll('<', '\\u003c'))
}

interface Options {
  repository: string; runDirectory: string; port?: number; intervalMs?: number; stopAt?: Date
}
async function atomicWrite(file: string, content: string) {
  const temporary = `${file}.${randomUUID()}.tmp`
  const handle = await open(temporary, 'wx')
  try { await handle.writeFile(content); await handle.sync() } finally { await handle.close() }
  try { await rename(temporary, file) } catch (error) { await unlink(temporary); throw error }
}

export async function startMonitor(options: Options) {
  if (await realpath(options.repository) !== path.resolve(options.repository) ||
    await realpath(options.runDirectory) !== path.resolve(options.runDirectory)) throw new Error('MONITOR_ROOT_SYMLINK')
  const catalog = createCatalog(options)
  const template = await readFile(new URL('./index.html', import.meta.url), 'utf8')
  const output = path.join(options.runDirectory, 'u5-monitor')
  await mkdir(output, { recursive: true })
  if (await realpath(output) !== output) throw new Error('MONITOR_OUTPUT_SYMLINK')
  const lockPath = path.join(output, 'server.lock')
  const lock = await open(lockPath, 'wx')
  let timer: NodeJS.Timeout | undefined, deadline: NodeJS.Timeout | undefined
  let current: MonitorSnapshot, errorMessage = '', closed = false, url = ''
  let refreshing: Promise<void> | undefined, closing: Promise<void> | undefined
  const snapshotFile = path.join(output, 'index.html')
  const server = createServer(async (request, response) => {
    const send = (status: number, body: string, type = 'text/plain; charset=utf-8') => {
      response.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' })
      response.end(request.method === 'HEAD' ? undefined : body)
    }
    try {
      if (!url || !current) { send(503, 'Catalog starting'); return }
      if (!['GET', 'HEAD'].includes(request.method ?? '')) { send(405, 'Read-only monitor'); return }
      if (request.headers.host !== new URL(url).host ||
        (request.headers.origin && request.headers.origin !== url.slice(0, -1)) ||
        request.headers['sec-fetch-site'] === 'cross-site') { send(403, 'Local same-origin access only'); return }
      const target = new URL(request.url ?? '/', url)
      if (target.pathname === '/') {
        response.setHeader('Content-Security-Policy',
          "default-src 'none'; img-src 'self' data:; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'")
        send(200, renderHtml(template, current), 'text/html; charset=utf-8'); return
      }
      if (target.pathname === '/state.json') {
        if (errorMessage) { send(503, errorMessage); return }
        send(200, JSON.stringify(current), 'application/json; charset=utf-8'); return
      }
      if (target.pathname === '/favicon.ico') { send(204, ''); return }
      const id = /^\/media\/([a-f0-9]{24})$/.exec(target.pathname)?.[1]
      const file = id ? catalog.media(id) : undefined
      if (!file) { send(404, 'Not an indexed monitor image'); return }
      if (await realpath(file) !== file) { send(403, 'Media path changed'); return }
      const handle = await open(file, constants.O_RDONLY | constants.O_NOFOLLOW)
      let bytes: Buffer
      try {
        if (!(await handle.stat()).isFile()) { send(403, 'Not a regular image'); return }
        bytes = await handle.readFile()
      } finally { await handle.close() }
      const digest = createHash('sha256').update(bytes).digest('hex')
      if (target.searchParams.get('v') !== digest) { send(409, 'Image changed; refresh its receipt'); return }
      response.writeHead(200, { 'Content-Type': 'image/png', 'Content-Length': bytes.length,
        'Cache-Control': 'private, max-age=31536000, immutable', 'X-Content-Type-Options': 'nosniff',
        'Referrer-Policy': 'no-referrer' })
      response.end(request.method === 'HEAD' ? undefined : bytes)
    } catch (error) {
      console.error('MONITOR_REQUEST_FAILED', error)
      if (!response.headersSent) send(500, 'Monitor request failed; see local server log')
      else response.destroy()
    }
  })
  async function updateCatalog() {
    try {
      const next = { ...await catalog.refresh(), liveUrl: url }
      if (!current || next.revision !== current.revision) {
        const snapshot = { ...next, images: next.images.map(image => ({
          ...image, mediaUrl: pathToFileURL(catalog.media(image.id)!).href,
        })) }
        await atomicWrite(snapshotFile, renderHtml(template, snapshot))
      }
      current = next
      errorMessage = ''
    } catch (error) {
      errorMessage = `Catalog refresh failed: ${error instanceof Error ? error.message : String(error)}`
      console.error(errorMessage)
      if (!current) throw error
    }
  }
  function refresh(): Promise<void> {
    if (closed) return Promise.resolve()
    refreshing ??= updateCatalog().finally(() => { refreshing = undefined })
    return refreshing
  }
  function close(): Promise<void> {
    if (closing) return closing
    closed = true
    clearInterval(timer)
    clearTimeout(deadline)
    closing = (async () => {
      await new Promise<void>(resolve => {
        if (!server.listening) { resolve(); return }
        server.close(() => resolve())
        server.closeAllConnections()
      })
      try { await refreshing } finally {
        await lock.close()
        await unlink(lockPath)
      }
    })()
    return closing
  }
  try {
    await lock.writeFile(JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }))
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject)
      server.listen(options.port ?? 0, '127.0.0.1', () => resolve())
    })
    const address = server.address()
    if (!address || typeof address === 'string') throw new Error('MONITOR_BIND_FAILED')
    url = `http://127.0.0.1:${address.port}/`
    await refresh()
    await atomicWrite(path.join(output, 'server.json'), JSON.stringify({
      pid: process.pid, url, snapshotFile, startedAt: new Date().toISOString(), stopAt: options.stopAt?.toISOString(),
    }, null, 2))
    timer = setInterval(() => { void refresh() }, options.intervalMs ?? 5000)
    if (options.stopAt) {
      const remaining = options.stopAt.getTime() - Date.now()
      if (!Number.isFinite(remaining) || remaining <= 0 || remaining > 2_147_483_647) throw new Error('MONITOR_DEADLINE')
      deadline = setTimeout(() => { void close().catch(error => { console.error(error); process.exitCode = 1 }) }, remaining)
    }
    return { url, snapshotFile, refresh, close }
  } catch (error) { await close(); throw error }
}

async function main() {
  const { values } = parseArgs({ options: { authorization: { type: 'string' }, port: { type: 'string' } } })
  if (!values.authorization) throw new Error('Pass --authorization with the existing run authorization')
  const authorizationFile = path.resolve(values.authorization)
  const authorization: unknown = JSON.parse(await readFile(authorizationFile, 'utf8'))
  if (typeof authorization !== 'object' || authorization === null || !('owned_roots' in authorization) ||
    !('resources' in authorization)) throw new Error('MONITOR_AUTHORIZATION')
  const owned = authorization.owned_roots, resources = authorization.resources
  if (typeof owned !== 'object' || owned === null || !('repository' in owned) || typeof owned.repository !== 'string' ||
    path.resolve(owned.repository) !== path.resolve(process.cwd()) || typeof resources !== 'object' ||
    resources === null || !('closeout_deadline_utc' in resources) || typeof resources.closeout_deadline_utc !== 'string') {
    throw new Error('MONITOR_AUTHORIZATION_SCOPE')
  }
  const stopAt = new Date(resources.closeout_deadline_utc)
  if (!Number.isFinite(stopAt.getTime()) || stopAt.getTime() <= Date.now()) throw new Error('MONITOR_DEADLINE_EXPIRED')
  const port = values.port ? Number(values.port) : 0
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('MONITOR_PORT')
  const monitor = await startMonitor({ repository: owned.repository, runDirectory: path.dirname(authorizationFile), port, stopAt })
  for (const signal of ['SIGINT', 'SIGTERM'] as const) process.once(signal, () => {
    void monitor.close().catch(error => { console.error(error); process.exitCode = 1 })
  })
  console.log(JSON.stringify({ ...monitor, close: undefined, refresh: undefined, stopAt: stopAt.toISOString() }))
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(error); process.exitCode = 1 })
}
