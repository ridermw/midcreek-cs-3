import { readdir, readFile, realpath, lstat, stat } from 'node:fs/promises'
import path from 'node:path'
import { createHash } from 'node:crypto'

type Row = Record<string, unknown>
export type ImageKind = 'source' | 'browser' | 'comparison' | 'study' | 'hall' | 'reference' | 'texture' | 'unverified'
export interface MonitorImage {
  id: string; path: string; mediaUrl: string; kind: ImageKind; candidate: string
  asset: string; label: string; clip: string | null; time: number | null; heading: number | null
  profile: string; sourceSha256: string; receipt: string; batchComplete: boolean
  integrity: 'matched' | 'mismatch' | 'unverified'; note: string
  width: number | null; height: number | null; modifiedAt: string
}
export interface Candidate {
  id: string; sourceSha256: string; authored: boolean; appearance: string
  technical: { complete: boolean; passed: number; failed: number; receipt: string } | null
}
export interface MonitorSnapshot {
  schema: 1; generatedAt: string; revision: string; status: Row | null
  candidates: Candidate[]; images: MonitorImage[]; jobs: Row[]; issues: string[]
  liveUrl?: string
}
interface Options { repository: string; runDirectory: string }
interface Label {
  kind: ImageKind; source: string; capture: Row; receipt: string
  complete: boolean; hash: string; note?: string
}
const hash = (data: string | Buffer) => createHash('sha256').update(data).digest('hex')
const object = (value: unknown): value is Row => typeof value === 'object' && value !== null && !Array.isArray(value)
const row = (value: unknown): Row => object(value) ? value : {}
const text = (value: unknown, fallback = '') => typeof value === 'string' ? value : fallback
const list = (value: unknown): unknown[] => Array.isArray(value) ? value : []
const number = (value: unknown) => typeof value === 'number' && Number.isFinite(value) ? value : null
const missing = (error: unknown) => object(error) && error.code === 'ENOENT'
const within = (root: string, file: string) => file === root || file.startsWith(`${root}${path.sep}`)
const heavyFields = new Set(['samples', 'rest', 'vertices', 'vertexUvs', 'triangleUvs', 'templatePose', 'result'])

export function createCatalog(options: Options) {
  const repository = path.resolve(options.repository), run = path.resolve(options.runDirectory)
  if (!within(repository, run)) throw new Error('MONITOR_ROOT_ESCAPE')
  const cache = new Map<string, { stamp: string; data: Row }>()
  const imageCache = new Map<string, { stamp: string; digest: string; width: number | null; height: number | null }>()
  let media = new Map<string, string>()
  async function json(file: string): Promise<Row> {
    const info = await stat(file), stamp = `${info.size}:${info.mtimeMs}:${info.ctimeMs}`
    const cached = cache.get(file)
    if (cached?.stamp === stamp) return cached.data
    const value: unknown = JSON.parse(await readFile(file, 'utf8'),
      (key, item: unknown) => heavyFields.has(key) ? undefined : item)
    if (!object(value)) throw new Error('JSON_OBJECT_REQUIRED')
    cache.set(file, { stamp, data: value })
    return value
  }
  return {
    media(id: string) { return media.get(id) },
    async refresh(): Promise<MonitorSnapshot> {
      if (await realpath(repository) !== repository || await realpath(run) !== run) throw new Error('MONITOR_ROOT_SYMLINK')
      const issues: string[] = [], files: string[] = [], records: { file: string; data: Row; modified: number }[] = []
      const candidates: Candidate[] = [], labels = new Map<string, Label>(), jobs: Row[] = []
      const relative = (file: string) => path.relative(repository, file).split(path.sep).join('/')
      const issue = (file: string, error: unknown) => issues.push(`${relative(file)}: ${error instanceof Error ? error.message : String(error)}`)
      async function walk(directory: string, depth: number) {
        let entries
        try { entries = await readdir(directory, { withFileTypes: true }) }
        catch (error) { if (missing(error)) return; throw error }
        for (const entry of entries) {
          if (entry.isSymbolicLink()) continue
          const file = path.join(directory, entry.name)
          if (entry.isDirectory() && depth > 0 && !entry.name.startsWith('.')) await walk(file, depth - 1)
          if (entry.isFile() && (entry.name.endsWith('.png') ||
            /^(?:authoring|export|captures|study)\.json$|^checks.*\.json$|\.capture\.json$|\.job\.json$/.test(entry.name))) files.push(file)
        }
      }
      const assetsRoot = path.join(repository, '.artifacts/assets')
      try {
        for (const entry of await readdir(assetsRoot, { withFileTypes: true })) {
          if (entry.isDirectory() && /^u5-[a-zA-Z0-9_-]+$/.test(entry.name) && entry.name !== 'u5-r2-regression') {
            await walk(path.join(assetsRoot, entry.name), 3)
          }
        }
      } catch (error) { if (!missing(error)) issue(assetsRoot, error) }
      try {
        for (const entry of await readdir(run, { withFileTypes: true })) {
          const file = path.join(run, entry.name)
          if (entry.isDirectory() && entry.name.startsWith('u5-') && !entry.name.startsWith('u5-monitor')) await walk(file, 1)
          if (entry.isFile() && (entry.name.endsWith('.png') || /^u5-.*\.job\.json$/.test(entry.name))) files.push(file)
        }
      } catch (error) { if (!missing(error)) issue(run, error) }
      for (const file of files.filter(file => file.endsWith('.json'))) {
        try { records.push({ file, data: await json(file), modified: (await stat(file)).mtimeMs }) }
        catch (error) { issue(file, error) }
      }
      records.sort((a, b) => a.modified - b.modified)
      for (const { file, data } of records) {
        if (path.basename(file) === 'authoring.json') candidates.push({
          id: path.basename(path.dirname(file)), sourceSha256: text(data.sourceSha256),
          authored: data.complete === true, appearance: 'Not accepted by this monitor', technical: null,
        })
        if (file.endsWith('.job.json')) {
          const command = list(data.command).filter((value): value is string => typeof value === 'string').join(' ')
          jobs.push({ id: path.basename(file, '.job.json'), complete: data.complete === true,
            startedAt: text(data.started_utc), seconds: number(data.seconds), error: text(data.error),
            candidate: command.match(/(?:\/|^)assets\/(u5-[a-zA-Z0-9_-]+)\//)?.[1] ?? '',
            receipt: relative(file) })
        }
      }
      function candidateFor(source: string) {
        const found = candidates.filter(candidate => source && candidate.sourceSha256 === source)
        return found.length === 1 ? found[0]!.id : 'Unmatched source'
      }
      function register(directory: string, filename: unknown, label: Label, allowNested = false) {
        if (typeof filename !== 'string' || !filename.endsWith('.png') || path.isAbsolute(filename) ||
          filename.split(/[\\/]/).some(part => part === '..' || part === '') ||
          (!allowNested && path.basename(filename) !== filename)) {
          issues.push(`${relative(directory)}: CAPTURE_PATH rejected`); return
        }
        const target = path.resolve(directory, filename)
        if (!within(directory, target)) { issues.push('CAPTURE_PATH escape rejected'); return }
        const old = labels.get(target)
        if (!old || label.complete || !old.complete) labels.set(target, label)
      }
      const sourceCaptures = new Map<string, Row>()
      for (const { file, data } of records) {
        if (path.basename(file) === 'authoring.json') {
          for (const [name, digest] of Object.entries(row(data.inputs))) if (name.endsWith('.png')) {
            register(path.dirname(file), name, { kind: 'texture', source: text(data.sourceSha256),
              capture: { asset: 'Shared image input', label: name, profile: 'Authored image input' },
              receipt: relative(file), complete: data.complete === true, hash: text(digest),
              note: 'Authored texture/image input, not a rendered model or appearance acceptance.' })
          }
        }
        if (data.kind === 'cs3-library-source-captures') {
          for (const value of list(data.captures)) {
            const capture = row(value), source = text(data.sourceSha256)
            sourceCaptures.set(`${source}/${text(capture.file)}`, capture)
            register(path.dirname(file), capture.file, { kind: 'source', source, capture,
              receipt: relative(file), complete: data.complete === true, hash: text(capture.sha256) })
          }
        }
        if (data.kind === 'cs3-image-capture') {
          const capture = row(data.capture), kind = text(data.renderer)
          if (!['source', 'browser', 'comparison', 'study', 'hall'].includes(kind)) {
            issue(file, new Error('CAPTURE_RENDERER_UNKNOWN')); continue
          }
          register(path.dirname(file), capture.file, { kind: kind as ImageKind, source: text(data.sourceSha256),
            capture, receipt: relative(file), complete: false, hash: text(capture.sha256),
            note: kind === 'comparison' ? 'Left: Blender source. Right: Three.js browser.' :
              kind === 'hall' ? 'Static asset-composition study; not gameplay or performance qualification.' : undefined })
        }
      }
      for (const { file, data } of records) {
        if (data.kind === 'cs3-library-checks') {
          const candidate = candidates.find(candidate => candidate.sourceSha256 === data.source)
          if (candidate) candidate.technical = { complete: data.complete === true,
            passed: list(data.checks).filter(check => row(check).pass === true).length,
            failed: list(data.checks).filter(check => row(check).pass !== true).length, receipt: relative(file) }
          for (const value of list(data.captures)) {
            const capture = row(value), source = text(data.source)
            const original = sourceCaptures.get(`${source}/${text(capture.source)}`) ?? {}
            const metadata = { ...original, ...capture }
            if (capture.file) register(path.dirname(file), capture.file, { kind: 'browser', source,
              capture: metadata, receipt: relative(file), complete: data.complete === true, hash: text(capture.sha256) })
            if (capture.contact) register(path.dirname(file), capture.contact, { kind: 'comparison', source,
              capture: metadata, receipt: relative(file), complete: data.complete === true, hash: text(capture.contactSha256),
              note: 'Left: Blender source. Right: Three.js browser.' })
          }
        }
        if (path.basename(file) === 'study.json') for (const value of list(data.captures)) {
          const capture = row(value), detail = row(capture.detail)
          const hall = Array.isArray(capture.roots)
          const source = text(capture.sourceSha256, text(data.source))
          const metadata = hall ? { ...capture, asset: 'Hall', label: `Static hall: ${text(capture.state, 'unknown')}`,
            profile: capture.profileId } : { ...row(detail.capture), ...capture, asset: capture.id }
          register(path.dirname(file), capture.file, { kind: hall ? 'hall' : 'study', source,
            capture: metadata, receipt: relative(file), complete: data.complete === true, hash: text(capture.sha256),
            note: hall ? 'Static asset-composition study; not gameplay or performance qualification.' :
              'Experimental browser rendering; not appearance acceptance or a selected production recipe.' })
        }
      }
      let referenceRoot: string | undefined
      try {
        referenceRoot = await realpath(path.join(repository, 'references/midcreek'))
        if (!within(repository, referenceRoot)) throw new Error('REFERENCE_ROOT_ESCAPE')
        const manifestFile = path.join(referenceRoot, 'reference-manifest.json')
        const manifest = await json(manifestFile)
        for (const value of list(manifest.artworks)) {
          const artwork = row(value)
          if (row(artwork.referenceApproval).status !== 'approved') continue
          register(referenceRoot, artwork.destination, { kind: 'reference', source: text(artwork.sha256),
            capture: { asset: text(artwork.family, 'Reference'), label: text(artwork.title), profile: 'Original Cel Shift artwork' },
            receipt: relative(manifestFile), complete: true, hash: text(artwork.sha256),
            note: `${text(artwork.attribution)}. Reference artwork, not a CS3 model render.` }, true)
        }
      } catch (error) { if (!missing(error)) issue(path.join(repository, 'references/midcreek'), error) }
      const paths = new Set([...files.filter(file => file.endsWith('.png')), ...labels.keys()])
      const nextMedia = new Map<string, string>(), images: MonitorImage[] = []
      for (const file of paths) {
        try {
          const info = await lstat(file)
          if (!info.isFile() || info.isSymbolicLink()) continue
          const resolved = await realpath(file)
          if (resolved !== file || !within(repository, resolved)) { issue(file, new Error('MEDIA_SYMLINK_ESCAPE')); continue }
          const stamp = `${info.size}:${info.mtimeMs}:${info.ctimeMs}`
          let bytes = imageCache.get(file)
          if (!bytes || bytes.stamp !== stamp) {
            const data = await readFile(file)
            const png = data.length >= 24 && data.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))
            bytes = { stamp, digest: hash(data), width: png ? data.readUInt32BE(16) : null,
              height: png ? data.readUInt32BE(20) : null }
            imageCache.set(file, bytes)
          }
          const label = labels.get(file), capture = label?.capture ?? {}, rel = relative(file), id = hash(rel).slice(0, 24)
          const matrix = list(row(capture.camera).matrix_world ?? row(capture.camera).world ?? capture.camera)
          const x = number(matrix[8]), z = number(matrix[10])
          const heading = number(capture.heading) ?? (x !== null && z !== null ?
            Math.round(((Math.atan2(x, z) * 180 / Math.PI + 360) % 360) * 10) / 10 : null)
          images.push({ id, path: rel, mediaUrl: `/media/${id}?v=${bytes.digest}`, kind: label?.kind ?? 'unverified',
            candidate: label?.kind === 'reference' ? 'Reference' : candidateFor(label?.source ?? ''),
            asset: text(capture.asset, 'Unclassified'), label: text(capture.label, 'Awaiting a capture receipt'),
            clip: text(capture.clip) || null, time: number(capture.time), heading,
            profile: text(capture.profile, 'Unknown / not yet recorded'), sourceSha256: label?.source ?? '',
            receipt: label?.receipt ?? '', batchComplete: label?.complete ?? false,
            integrity: label?.hash ? bytes.digest === label.hash ? 'matched' : 'mismatch' : 'unverified',
            note: label?.note ?? (label ? 'Receipt matching is not an appearance approval.' :
              'New or unreceipted output. Renderer, pose and candidate are not inferred from its filename.'),
            width: bytes.width, height: bytes.height, modifiedAt: info.mtime.toISOString() })
          nextMedia.set(id, file)
        } catch (error) { if (!missing(error)) issue(file, error) }
      }
      media = nextMedia
      images.sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt) || a.path.localeCompare(b.path))
      candidates.sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }))
      let status: Row | null = null
      const statusFile = path.join(run, 'u5-monitor-status.json')
      try {
        const value = await json(statusFile)
        if (value.schema !== 1 || typeof value.updatedAt !== 'string' ||
          !Number.isFinite(Date.parse(value.updatedAt)) || !Array.isArray(value.workstreams) ||
          !value.workstreams.every(stream => object(stream) &&
            ['title', 'status', 'state', 'detail'].every(key => typeof stream[key] === 'string') &&
            ['pass', 'active', 'pending', 'failed'].includes(text(stream.state)))) throw new Error('STATUS_SCHEMA')
        status = value
      } catch (error) { issue(statusFile, error) }
      const data = { status, candidates, images, jobs: jobs.reverse(), issues }
      return { schema: 1, generatedAt: new Date().toISOString(), revision: hash(JSON.stringify(data)), ...data }
    },
  }
}
