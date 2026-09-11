export const AWAITING = 'Reference gallery awaiting publication approval'
export const CONCEPT_CAPTION = 'Concept reference; not a game capture or an appearance acceptance.'
const repository = 'williamsmat_microsoft/midcreek-concept'
const revision = '870603632c4b6665c513d0fa692a3ee2dae2b683'
const attribution = `Cel Shift concept art - ${repository} at ${revision}`
const terms = 'Approved for CS3 use and release staging only; no broader license inferred.'

export const architecture = [
  ['One authoritative simulation', 'TypeScript owns the 17-by-15-cell hall, 32 racks, one technician and seed-417 coolant-leak scenario. Visual geometry does not decide placement, collision or repair state.'],
  ['Authored asset pipeline', 'Approved references inform owned Blender sources. Export checks bind units, bounds, materials and Idle / Walk / Repair clips to exact asset identities before runtime loading.'],
  ['Readiness before play', 'The playable waits for its complete required library and first interactive render. Missing, changed or failed inputs disable play and expose Reload rather than substituting assets.'],
  ['Independent delivery', 'This showcase is a DOM/CSS entry. The separate Play demo entry owns Three.js and the game. Reference previews are built offline; originals load only after selection.'],
] as const

export const controls = [
  ['Arrow keys / WASD', 'Move on fixed simulation ticks. Moving during repair cancels work.'],
  ['Floor click', 'Route the technician to a floor cell. Arrival alone does not start repair.'],
  ['F / Dispatch / fault marker', 'Travel to the fault and perform the seeded repair.'],
  ['Space', 'Pause or resume. Hidden time does not advance the simulation.'],
  ['Q / E, Home, + / -', 'Orbit, reset the view, or zoom.'],
  ['Restart', 'Reset the seeded scenario without reloading assets or resetting the view.'],
] as const

export const results = [
  ['U5 technical passed', 'The frozen C5 two-run technical checkpoint passed. Numeric and transport agreement are not visual fidelity acceptance.'],
  ['Appearance pending', 'The current development baseline has not received overall appearance acceptance.'],
  ['U7 playable passed locally', 'The first playable passed locally with the hash-bound provisional development selection. The ordinary build does not publish that library.'],
  ['U8 deterministic instrumentation passed', 'Deterministic readiness, request ledgers, completed-render counters and scripted workload evidence passed locally. These are not wall-clock timing qualifications.'],
  ['Named-target timing unqualified', 'The required three headed, foreground, 60 Hz target repetitions have not been qualified.'],
  ['Production/release blocked', 'Production promotion, release-content gates and final appearance/deployment decisions remain outstanding. Build success is not a release approval.'],
] as const

export interface PublicArtwork {
  id: string
  family: string
  title: string
  displayRole: 'concept reference'
  sourceRepository: string
  sourceRevision: string
  sourcePath: string
  sha256: { source: string; thumbnail: string }
  width: number
  height: number
  attribution: string
  terms: string
  caption: string
  mediaUrl: { original: string; thumbnail: string }
}
export interface GalleryIndex {
  schemaVersion: 1
  status: 'awaiting-approval' | 'approved-for-staging'
  items: PublicArtwork[]
}

function requirePublic(condition: unknown, code: string): asserts condition {
  if (!condition) throw new Error(`PUBLIC_${code}: invalid or unapproved gallery data`)
}
function record(value: unknown, keys: readonly string[]): asserts value is Record<string, unknown> {
  requirePublic(typeof value === 'object' && value !== null && !Array.isArray(value), 'SHAPE')
  requirePublic(Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key)), 'FIELDS')
}
const hash = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value)

// This is the public transport schema, not a second reference inventory.
export function parseGalleryIndex(value: unknown): GalleryIndex {
  record(value, ['schemaVersion', 'status', 'items'])
  requirePublic(value.schemaVersion === 1 && ['awaiting-approval', 'approved-for-staging'].includes(String(value.status)), 'STATUS')
  requirePublic(Array.isArray(value.items) && value.items.length <= 49, 'ITEMS')
  const ids = new Set<string>()
  const sources = new Set<string>()
  const items = value.items.map((item): PublicArtwork => {
    record(item, ['id', 'family', 'title', 'displayRole', 'sourceRepository', 'sourceRevision', 'sourcePath',
      'sha256', 'width', 'height', 'attribution', 'terms', 'caption', 'mediaUrl'])
    requirePublic(typeof item.sourcePath === 'string'
      && /^themes\/cel-shift\/masters\/[a-z0-9-]+\/[a-z0-9-]+\.png$/.test(item.sourcePath), 'PATH')
    const relative = item.sourcePath.slice('themes/cel-shift/masters/'.length, -4)
    requirePublic(item.id === `cel-shift/${relative}` && item.family === relative.split('/')[0]
      && item.title === relative.replace('/', ' / ').replaceAll('-', ' '), 'IDENTITY')
    requirePublic(item.sourceRepository === repository && item.sourceRevision === revision
      && item.displayRole === 'concept reference' && item.width === 1536 && item.height === 1024, 'SOURCE')
    requirePublic(item.attribution === attribution && item.terms === terms && item.caption === CONCEPT_CAPTION, 'CREDIT')
    record(item.sha256, ['source', 'thumbnail'])
    requirePublic(hash(item.sha256.source) && hash(item.sha256.thumbnail), 'HASH')
    record(item.mediaUrl, ['original', 'thumbnail'])
    const original = `gallery/originals/${item.sha256.source}.png`
    const thumbnail = `gallery/thumbnails/${item.sha256.thumbnail}.webp`
    requirePublic(item.mediaUrl.original === original && item.mediaUrl.thumbnail === thumbnail, 'URL')
    requirePublic(!ids.has(item.id) && !sources.has(item.sha256.source), 'DUPLICATE')
    ids.add(item.id); sources.add(item.sha256.source)
    return {
      id: item.id, family: item.family, title: item.title,
      displayRole: 'concept reference', sourceRepository: repository, sourceRevision: revision,
      sourcePath: item.sourcePath, sha256: { source: item.sha256.source, thumbnail: item.sha256.thumbnail },
      width: 1536, height: 1024, attribution, terms, caption: CONCEPT_CAPTION,
      mediaUrl: { original, thumbnail },
    }
  })
  const status = value.status === 'awaiting-approval' ? 'awaiting-approval' : 'approved-for-staging'
  requirePublic(status === 'awaiting-approval' ? items.length === 0 : items.length > 0, 'STATUS')
  return { schemaVersion: 1, status, items }
}
