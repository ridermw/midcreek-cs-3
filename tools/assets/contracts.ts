import { createHash } from 'node:crypto'
import { ASSET_IDS } from '../../src/assets/contracts.ts'
import type { AssetId, AssetManifest, Bounds } from '../../src/assets/contracts.ts'

export class AssetPackagingError extends Error {
  readonly code: string
  readonly subject: string

  constructor(code: string, subject: string, detail: string) {
    super(`${code}: ${subject}: ${detail}`)
    this.name = 'AssetPackagingError'
    this.code = code
    this.subject = subject
  }
}

export function requireAsset(condition: unknown, code: string, subject: string, detail: string): asserts condition {
  if (!condition) throw new AssetPackagingError(code, subject, detail)
}

export const digest = (bytes: string | Uint8Array): string => createHash('sha256').update(bytes).digest('hex')
const compare = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0

function recordKey(value: Record<string, unknown>): string {
  for (const key of ['id', 'name', 'node', 'path']) {
    if (typeof value[key] === 'string') return `${value[key]}\0${typeof value.path === 'string' ? value.path : ''}`
  }
  return ''
}

// Record arrays are sets; scalar arrays (matrices, frame ranges, keys, material slots) are ordered.
export function canonicalJson(value: unknown): string {
  const ancestors = new WeakSet<object>()
  function normalize(input: unknown): unknown {
    if (input === null || typeof input === 'string' || typeof input === 'boolean') return input
    if (typeof input === 'number') {
      requireAsset(Number.isFinite(input), 'NONFINITE', 'JSON', 'finite numbers required')
      return Object.is(input, -0) ? 0 : input
    }
    if (input !== null && typeof input === 'object') {
      requireAsset(!ancestors.has(input), 'JSON_VALUE', 'JSON', 'cyclic data is not JSON')
      ancestors.add(input)
    }
    if (Array.isArray(input)) {
      requireAsset(Object.getPrototypeOf(input) === Array.prototype
        && Reflect.ownKeys(input).length === input.length + 1
        && Object.keys(input).length === input.length
        && Object.keys(input).every((key, index) => key === String(index)
          && 'value' in Object.getOwnPropertyDescriptor(input, key)!),
      'JSON_VALUE', 'array', 'dense JSON data arrays without extra properties required')
      const values = input.map(normalize)
      if (values.length && values.every((v) => v !== null && typeof v === 'object' && !Array.isArray(v))) {
        values.sort((a, b) => {
          const left = a as Record<string, unknown>
          const right = b as Record<string, unknown>
          if (typeof left.time === 'number' && typeof right.time === 'number') return left.time - right.time
          return compare(recordKey(left), recordKey(right)) || compare(JSON.stringify(left), JSON.stringify(right))
        })
      }
      ancestors.delete(input)
      return values
    }
    requireAsset(typeof input === 'object' && input !== null
      && [Object.prototype, null].includes(Object.getPrototypeOf(input)),
    'JSON_VALUE', 'JSON', 'only plain JSON data accepted')
    const keys = Reflect.ownKeys(input)
    requireAsset(keys.every((key) => typeof key === 'string'
      && Object.getOwnPropertyDescriptor(input, key)?.enumerable
      && 'value' in Object.getOwnPropertyDescriptor(input, key)!),
    'JSON_VALUE', 'JSON', 'only enumerable data properties accepted')
    const result = Object.fromEntries(Object.keys(input).sort(compare).map((key) => [
      key, normalize(Reflect.get(input, key)),
    ]))
    ancestors.delete(input)
    return result
  }
  return JSON.stringify(normalize(value))
}

export function parseJson(text: string): unknown {
  let value: unknown
  try { value = JSON.parse(text) } catch (cause) {
    throw new AssetPackagingError('JSON_SYNTAX', 'receipt', String(cause))
  }
  // JSON.parse alone loses duplicate keys, including escaped spellings of the same key.
  const tokens = text.match(/"(?:\\.|[^"\\])*"|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|true|false|null|[{}[\]:,]/g)!
  let index = 0
  function walk(): void {
    const token = tokens[index++]
    if (token === '{') {
      const seen = new Set<string>()
      while (tokens[index] !== '}') {
        const key: string = JSON.parse(tokens[index++]!)
        requireAsset(!seen.has(key), 'DUPLICATE_FIELD', key, 'duplicate JSON member')
        seen.add(key)
        index++
        walk()
        if (tokens[index] !== ',') break
        index++
      }
      index++
    } else if (token === '[') {
      while (tokens[index] !== ']') {
        walk()
        if (tokens[index] !== ',') break
        index++
      }
      index++
    }
  }
  walk()
  return value
}

type Parser<T> = (value: unknown, subject: string) => T
type Fields = Record<string, Parser<unknown>>
type Parsed<F extends Fields> = { [K in keyof F]: ReturnType<F[K]> }

export function object<F extends Fields>(fields: F): Parser<Parsed<F>> {
  return (value, subject) => {
    requireAsset(value !== null && typeof value === 'object' && !Array.isArray(value),
      'FIELD_TYPE', subject, 'object required')
    for (const key of Object.keys(value)) {
      requireAsset(Object.hasOwn(fields, key), 'UNKNOWN_FIELD', `${subject}.${key}`, 'unknown member')
    }
    for (const key of Object.keys(fields)) {
      requireAsset(Object.hasOwn(value, key), 'MISSING_FIELD', `${subject}.${key}`, 'required member absent')
    }
    return Object.fromEntries(Object.entries(fields).map(([key, parse]) => [
      key, parse(Reflect.get(value, key), `${subject}.${key}`),
    ])) as Parsed<F>
  }
}

export const text: Parser<string> = (value, subject) => {
  requireAsset(typeof value === 'string' && value.trim() === value && value.length > 0
    && !/[\u0000-\u001f\u007f]/.test(value), 'FIELD_TYPE', subject, 'nonempty text without controls required')
  return value
}
export const sha256: Parser<string> = (value, subject) => {
  const result = text(value, subject)
  requireAsset(/^[a-f0-9]{64}$/.test(result), 'HASH', subject, 'lowercase SHA-256 required')
  return result
}
const commit: Parser<string> = (value, subject) => {
  const result = text(value, subject)
  requireAsset(/^[a-f0-9]{40}$/.test(result), 'SOURCE_IDENTITY', subject, 'exact Git commit required')
  return result
}
const number: Parser<number> = (value, subject) => {
  requireAsset(typeof value === 'number', 'FIELD_TYPE', subject, 'number required')
  requireAsset(Number.isFinite(value), 'NONFINITE', subject, 'finite number required')
  return value
}
const natural: Parser<number> = (value, subject) => {
  const result = number(value, subject)
  requireAsset(Number.isSafeInteger(result) && result >= 0, 'INTEGER', subject, 'nonnegative safe integer required')
  return result
}
const positive: Parser<number> = (value, subject) => {
  const result = natural(value, subject)
  requireAsset(result > 0, 'INTEGER', subject, 'positive integer required')
  return result
}
export const boolean: Parser<boolean> = (value, subject) => {
  requireAsset(typeof value === 'boolean', 'FIELD_TYPE', subject, 'boolean required')
  return value
}
export function choice<const T extends readonly (string | number | boolean)[]>(...choices: T): Parser<T[number]> {
  return (value, subject) => {
    requireAsset(choices.some((candidate) => candidate === value), 'FIELD_VALUE', subject, `expected ${choices.join('|')}`)
    return value as T[number]
  }
}
export function array<T>(parse: Parser<T>): Parser<T[]> {
  return (value, subject) => {
    requireAsset(Array.isArray(value), 'FIELD_TYPE', subject, 'array required')
    return value.map((entry, index) => parse(entry, `${subject}[${index}]`))
  }
}
export const safeRelative: Parser<string> = (value, subject) => {
  const path = text(value, subject)
  requireAsset(/^[A-Za-z0-9_./-]+$/.test(path)
    && path.split('/').every((part) => part !== '' && part !== '.' && part !== '..'
      && !part.endsWith('.') && !/^(con|prn|aux|nul|com\d|lpt\d)(\.|$)/i.test(part)),
  'PATH', subject, 'normalized portable relative path required')
  return path
}
const nullableText: Parser<string | null> = (value, subject) => value === null ? null : text(value, subject)
const vector = object({ x: number, y: number, z: number })
const bounds = object({ min: vector, max: vector })
const transform = object({ node: text, localMatrix: array(number), worldMatrix: array(number) })
const attribution = object({ path: safeRelative, sha256, attribution: text, terms: text })
const coordinates = object({
  units: choice('meters'), up: choice('Y'), handedness: choice('right'), front: choice('+Z'),
  pivot: choice('floor-center'), rootMatrix: array(number),
})
const node = object({
  id: text, parent: nullableText, materials: array(text), mesh: boolean,
  primitives: natural, triangles: natural,
  uvSets: (value, subject) => array(natural)(value, subject).sort((a, b) => a - b),
})
const material = object({
  name: text, classification: choice('portable-pbr'), alphaMode: choice('OPAQUE'),
  baseColor: array(number), roughness: number, metallic: number,
  textures: array(object({ texture: text, role: choice('base-color'), uvSet: natural })),
})
const texture = object({
  name: text, width: positive, height: positive, uvSet: natural, colorSpace: choice('sRGB'),
  role: choice('base-color'), embedded: choice(true), sourcePath: safeRelative, sourceSha256: sha256,
  pixelSha256: sha256, pixelFormat: choice('RGBA8'),
})
const clip = object({
  name: text, frames: array(natural), fps: positive, fpsBase: number, duration: number,
  rootMotion: boolean, loop: choice('duplicate-end'),
  tracks: array(object({
    node: text, path: choice('translation', 'rotation', 'scale'), interpolation: choice('LINEAR'),
    times: array(number),
  })),
  samples: array(object({ time: number, bounds, transforms: array(transform) })),
})
const specFields = {
  id: choice(...ASSET_IDS), scene: text, root: text, nodes: array(node), coordinates,
  geometry: object({ meshes: positive, primitives: positive, triangles: positive }),
  restBounds: bounds, animatedBounds: bounds, materials: array(material), textures: array(texture),
  allowedExtensions: array(text), clips: array(clip), rest: array(transform),
  permissions: object({
    publicAssetApproved: boolean, sources: array(attribution), textures: array(attribution), fonts: array(attribution),
  }),
}
const specification = object({ schema: choice(1), assets: array(object(specFields)) })
const fileFields = { file: safeRelative, sha256, bytes: positive }
const receiptParser = object({
  schema: choice(1), kind: choice('cs3-library-export'), complete: boolean,
  source: object({ path: safeRelative, sha256, bytes: positive, commit }),
  specification, specificationSha256: sha256,
  inputs: array(object({
    path: safeRelative, sha256, bytes: positive, role: choice('specification', 'exporter', 'script', 'texture', 'font'),
  })),
  profile: text, profileSha256: sha256, recipeSha256: sha256,
  tools: object({ node: text, blender: text, blenderBuild: text, gltfExporter: text }),
  exporter: object({ path: safeRelative, sha256, revision: commit, exitCode: natural }),
  assets: array(object({ ...specFields, ...fileFields })),
})
export type ExportReceipt = ReturnType<typeof receiptParser>
export type AssetSpecification = ExportReceipt['specification']['assets'][number]
export type FileIdentity = { path: string; sha256: string; bytes: number }

export function unique(values: readonly (string | number)[], code: string, subject: string): void {
  requireAsset(new Set(values).size === values.length, code, subject, 'duplicate identity')
}
function sameSet(actual: readonly string[], expected: readonly string[], code: string, subject: string): void {
  requireAsset(canonicalJson([...actual].sort(compare)) === canonicalJson([...expected].sort(compare)),
    code, subject, 'exact declared set required')
}
const axes = ['x', 'y', 'z'] as const
const tolerance = 2e-4
const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]
const limits: Record<AssetId, Bounds> = {
  'floor-slab': { min: { x: -8.5, y: -0.1, z: -7.5 }, max: { x: 8.5, y: 0, z: 7.5 } },
  'rack-standard': { min: { x: -0.4, y: 0, z: -0.4 }, max: { x: 0.4, y: 2.1, z: 0.4 } },
  'cooling-unit': { min: { x: -0.4, y: 0, z: -0.4 }, max: { x: 0.4, y: 2.1, z: 0.4 } },
  'technician-man': { min: { x: -0.45, y: 0, z: -0.45 }, max: { x: 0.45, y: 1.8, z: 0.45 } },
  'coolant-leak': { min: { x: -0.45, y: 0, z: -0.45 }, max: { x: 0.45, y: 0.02, z: 0.45 } },
}
function near(a: number, b: number, epsilon = tolerance): boolean { return Math.abs(a - b) <= epsilon }
function contains(outer: Bounds, inner: Bounds, subject: string): void {
  requireAsset(axes.every((axis) => inner.min[axis] < inner.max[axis]
    && inner.min[axis] >= outer.min[axis] - tolerance
    && inner.max[axis] <= outer.max[axis] + tolerance),
  'BOUNDS', subject, 'nonempty bounds inside the permitted envelope required')
}
function matrix(value: number[], subject: string): void {
  requireAsset(value.length === 16, 'REST_TRANSFORM', subject, '16 matrix components required')
  requireAsset([3, 7, 11].every((i) => near(value[i]!, 0, 1e-6)) && near(value[15]!, 1, 1e-6),
    'REST_TRANSFORM', subject, 'affine matrix required')
  const column = (i: number) => value.slice(i * 4, i * 4 + 3)
  const dot = (a: number[], b: number[]) => a.reduce((sum, n, i) => sum + n * b[i]!, 0)
  const [x, y, z] = [column(0), column(1), column(2)] as const
  const determinant = x[0]! * (y[1]! * z[2]! - y[2]! * z[1]!)
    - y[0]! * (x[1]! * z[2]! - x[2]! * z[1]!) + z[0]! * (x[1]! * y[2]! - x[2]! * y[1]!)
  requireAsset([x, y, z].every((v) => near(dot(v, v), 1, 1e-6))
    && [dot(x, y), dot(x, z), dot(y, z)].every((n) => near(n, 0, 1e-6))
    && near(determinant, 1, 1e-6), 'UNIT_SCALE', subject, 'rigid positive unit transform required')
}
function identityMatrix(value: number[], subject: string): void {
  requireAsset(value.length === 16 && value.every((n, i) => near(n, identity[i]!, 1e-6)),
    'ROOT_TRANSFORM', subject, 'identity template root required')
}
function multiply(left: number[], right: number[]): number[] {
  return identity.map((_, i) => [0, 1, 2, 3].reduce((sum, k) => sum + left[k * 4 + i % 4]! * right[Math.floor(i / 4) * 4 + k]!, 0))
}
function validateTransforms(transforms: AssetSpecification['rest'], asset: AssetSpecification): void {
  unique(transforms.map((t) => t.node), 'DUPLICATE_ID', asset.id)
  sameSet(transforms.map((t) => t.node), asset.nodes.map((n) => n.id), 'REST_TRANSFORM', asset.id)
  const byId = new Map(transforms.map((t) => [t.node, t]))
  for (const entry of transforms) {
    matrix(entry.localMatrix, entry.node)
    matrix(entry.worldMatrix, entry.node)
    const parent = asset.nodes.find((n) => n.id === entry.node)!.parent
    const expected = parent === null ? entry.localMatrix : multiply(byId.get(parent)!.worldMatrix, entry.localMatrix)
    requireAsset(expected.every((n, i) => near(n, entry.worldMatrix[i]!)),
      'REST_TRANSFORM', entry.node, 'local/world matrices disagree with declared parent')
    if (entry.node === asset.root) {
      identityMatrix(entry.localMatrix, entry.node)
      identityMatrix(entry.worldMatrix, entry.node)
    }
  }
}
function validateSpecification(asset: AssetSpecification): void {
  const subject = asset.id
  unique(asset.nodes.map((n) => n.id), 'DUPLICATE_ID', subject)
  const nodes = new Map(asset.nodes.map((n) => [n.id, n]))
  requireAsset(nodes.has(asset.root) && nodes.get(asset.root)!.parent === null
    && asset.nodes.filter((n) => n.parent === null).length === 1,
  'ROOT_NODE', subject, 'one exact scene root required')
  for (const node of asset.nodes) {
    let current = node
    const visited = new Set<string>()
    while (current.parent !== null) {
      requireAsset(nodes.has(current.parent) && !visited.has(current.id), 'NODE_PARENT', node.id, 'missing or cyclic parent')
      visited.add(current.id)
      current = nodes.get(current.parent)!
    }
    requireAsset(current.id === asset.root, 'NODE_PARENT', node.id, 'all nodes must reach the root')
    unique(node.materials, 'DUPLICATE_ID', node.id)
    unique(node.uvSets, 'DUPLICATE_ID', node.id)
    requireAsset(node.mesh ? node.triangles > 0 && node.primitives > 0 && node.materials.length === node.primitives
      : node.triangles === 0 && node.primitives === 0 && node.materials.length === 0 && node.uvSets.length === 0,
    'GEOMETRY', node.id, 'nonempty declared meshes and exact primitive/material counts required')
  }
  requireAsset(asset.geometry.meshes === asset.nodes.filter((n) => n.mesh).length
    && asset.geometry.primitives === asset.nodes.reduce((sum, n) => sum + n.primitives, 0)
    && asset.geometry.triangles === asset.nodes.reduce((sum, n) => sum + n.triangles, 0),
  'GEOMETRY', subject, 'geometry totals disagree')
  identityMatrix(asset.coordinates.rootMatrix, subject)
  contains(limits[asset.id], asset.animatedBounds, subject)
  contains(limits[asset.id], asset.restBounds, subject)
  contains(asset.animatedBounds, asset.restBounds, subject)
  const height = asset.id === 'technician-man' ? 1.73 : ['rack-standard', 'cooling-unit'].includes(asset.id) ? 2.1 : null
  requireAsset(height === null || (near(asset.restBounds.min.y, 0) && near(asset.restBounds.max.y, height)),
    'REST_HEIGHT', subject, 'incorrect rest height')
  requireAsset(asset.id !== 'floor-slab' || axes.every((axis) =>
    near(asset.restBounds.min[axis], limits['floor-slab'].min[axis])
    && near(asset.restBounds.max[axis], limits['floor-slab'].max[axis])),
  'FLOOR_BOUNDS', subject, 'authoritative floor footprint required')
  unique(asset.materials.map((m) => m.name), 'DUPLICATE_ID', subject)
  unique(asset.textures.map((t) => t.name), 'DUPLICATE_ID', subject)
  sameSet([...new Set(asset.nodes.flatMap((n) => n.materials))], asset.materials.map((m) => m.name), 'MATERIAL_BINDING', subject)
  const usedTextures = new Set<string>()
  for (const material of asset.materials) {
    requireAsset(material.baseColor.length === 4
      && [...material.baseColor, material.roughness, material.metallic].every((n) => n >= 0 && n <= 1),
    'MATERIAL', material.name, 'PBR factors must be in [0,1]')
    unique(material.textures.map((binding) => binding.role), 'DUPLICATE_ID', material.name)
    for (const binding of material.textures) {
      const texture = asset.textures.find((t) => t.name === binding.texture)
      requireAsset(texture && texture.uvSet === binding.uvSet && texture.role === binding.role,
        'TEXTURE_BINDING', material.name, 'missing or mismatched texture binding')
      usedTextures.add(texture.name)
      for (const node of asset.nodes.filter((n) => n.materials.includes(material.name))) {
        requireAsset(node.uvSets.includes(binding.uvSet), 'TEXTURE_UV', node.id, 'required UV set absent')
      }
    }
  }
  sameSet([...usedTextures], asset.textures.map((t) => t.name), 'TEXTURE_BINDING', subject)
  requireAsset(asset.allowedExtensions.length === 0, 'EXTENSIONS', subject, 'initial portable profile allows no extensions')
  validateTransforms(asset.rest, asset)
  unique(asset.clips.map((c) => c.name), 'DUPLICATE_ID', subject)
  sameSet(asset.clips.map((c) => c.name), asset.id === 'technician-man' ? ['Idle', 'Walk', 'Repair'] : [], 'CLIP_SET', subject)
  for (const clip of asset.clips) {
    const duration = clip.name === 'Walk' ? 1 : 2
    requireAsset(!clip.rootMotion, 'ROOT_MOTION', clip.name, 'root motion forbidden')
    requireAsset(clip.frames.length === 2 && clip.frames[1]! > clip.frames[0]!
      && clip.fpsBase > 0 && near(clip.duration, duration, 1e-5)
      && near((clip.frames[1]! - clip.frames[0]!) * clip.fpsBase / clip.fps, duration, 1e-5),
    'CLIP_DURATION', clip.name, 'frame range/fps/keyframe duration mismatch')
    requireAsset(clip.tracks.length > 0, 'TRACK_TARGET', clip.name, 'nonempty rigid tracks required')
    unique(clip.tracks.map((t) => `${t.node}/${t.path}`), 'DUPLICATE_ID', clip.name)
    for (const track of clip.tracks) {
      requireAsset(nodes.has(track.node), 'TRACK_TARGET', track.node, 'unknown node')
      requireAsset(track.node !== asset.root, 'ROOT_MOTION', track.node, 'tracks cannot write the root')
      requireAsset(track.times.length >= 2 && near(track.times[0]!, 0, 1e-5)
        && near(track.times.at(-1)!, duration, 1e-5)
        && track.times.every((t, i) => t >= 0 && t <= duration + 1e-5 && (i === 0 || t > track.times[i - 1]!)),
      'TRACK_TIME', clip.name, 'ordered bounded keys including endpoints required')
    }
    const keys = [...new Set(clip.tracks.flatMap((t) => t.times))].sort((a, b) => a - b)
    const times = [...keys, ...keys.slice(1).map((t, i) => (keys[i]! + t) / 2)].sort((a, b) => a - b)
    unique(clip.samples.map((s) => s.time), 'DUPLICATE_ID', clip.name)
    requireAsset(clip.samples.length === times.length
      && times.every((t) => clip.samples.some((s) => near(s.time, t, 1e-5))),
    'POSE_SAMPLES', clip.name, 'every key and interval midpoint must have a pose assertion')
    for (const sample of clip.samples) {
      contains(asset.animatedBounds, sample.bounds, clip.name)
      validateTransforms(sample.transforms, asset)
    }
    const start = clip.samples.find((s) => near(s.time, 0, 1e-5))!
    const end = clip.samples.find((s) => near(s.time, duration, 1e-5))!
    for (const transform of start.transforms) {
      const last = end.transforms.find((t) => t.node === transform.node)!
      requireAsset(transform.localMatrix.every((n, i) => near(n, last.localMatrix[i]!)),
        'CLIP_LOOP', clip.name, 'duplicate-end pose mismatch')
    }
  }
  requireAsset(asset.permissions.sources.length > 0, 'PERMISSIONS', subject, 'source attribution and terms required')
  for (const category of ['sources', 'textures', 'fonts'] as const) {
    unique(asset.permissions[category].map((p) => p.path.toLowerCase()), 'DUPLICATE_PATH', subject)
  }
  sameSet(asset.permissions.textures.map((p) => `${p.path}/${p.sha256}`),
    [...new Set(asset.textures.map((t) => `${t.sourcePath}/${t.sourceSha256}`))], 'PERMISSIONS', subject)
}

export function parseExportReceipt(input: unknown): ExportReceipt {
  const parsed = typeof input === 'string' ? parseJson(input) : input
  const receipt = receiptParser(parseJson(canonicalJson(parsed)), 'export')
  requireAsset(receipt.complete, 'INCOMPLETE_EXPORT', 'export', 'complete export required')
  requireAsset(receipt.exporter.exitCode === 0, 'EXPORTER_FAILED', 'exporter', 'successful exporter exit required')
  for (const [tool, version] of Object.entries(receipt.tools)) {
    requireAsset(tool === 'blenderBuild' ? /^[a-f0-9]{12,40}$/.test(version)
      : /^\d+\.\d+\.\d+(?:[ .+-][A-Za-z0-9 .+-]+)?$/.test(version),
    'TOOL_IDENTITY', tool, 'actual version/build identity required')
  }
  const source = receipt.source
  requireAsset(source.path.endsWith('.blend'), 'SOURCE_IDENTITY', source.path, 'owned .blend identity required')
  for (const assets of [receipt.assets, receipt.specification.assets]) {
    unique(assets.map((a) => a.id), 'DUPLICATE_ID', 'assets')
    sameSet(assets.map((a) => a.id), [...ASSET_IDS], 'ASSET_SET', 'assets')
    for (const asset of assets) validateSpecification(asset)
  }
  requireAsset(digest(canonicalJson(receipt.specification)) === receipt.specificationSha256,
    'SPECIFICATION_HASH', 'specification', 'canonical specification identity mismatch')
  unique(receipt.inputs.map((i) => i.path.toLowerCase()), 'DUPLICATE_PATH', 'inputs')
  requireAsset(receipt.inputs.filter((i) => i.role === 'specification').length === 1
    && receipt.inputs.some((i) => i.role === 'script')
    && receipt.inputs.filter((i) => i.role === 'exporter').length === 1
    && receipt.inputs.some((i) => i.role === 'exporter' && i.path === receipt.exporter.path && i.sha256 === receipt.exporter.sha256),
  'INPUT_IDENTITY', 'inputs', 'specification, builder and exact exporter inputs required')
  unique(receipt.assets.map((a) => a.file.toLowerCase()), 'DUPLICATE_PATH', 'files')
  const paths = receipt.assets.map((a) => a.file.toLowerCase())
  requireAsset(paths.every((path) => !paths.some((other) => path.startsWith(other + '/'))),
    'PATH_CONFLICT', 'files', 'a file cannot also be an ancestor directory')
  for (const asset of receipt.assets) {
    requireAsset(asset.file.endsWith('.glb') && !asset.file.startsWith('packages/')
      && asset.file.split('/')[0]!.toLowerCase() !== 'manifest.json',
      'PATH', asset.file, 'candidate-relative GLB path required')
    const { file: _file, sha256: _hash, bytes: _bytes, ...declaration } = asset
    requireAsset(canonicalJson(declaration) === canonicalJson(receipt.specification.assets.find((a) => a.id === asset.id)),
      'DECLARED_CONTENT', asset.id, 'export omitted or changed approved specification content')
    requireAsset(asset.permissions.sources.some((p) => p.path === source.path && p.sha256 === source.sha256),
      'SOURCE_IDENTITY', asset.id, 'source permissions must bind the exported blend')
    for (const texture of asset.textures) {
      requireAsset(receipt.inputs.some((i) => i.role === 'texture' && i.path === texture.sourcePath && i.sha256 === texture.sourceSha256),
        'INPUT_IDENTITY', texture.name, 'source texture input identity missing')
    }
    for (const font of asset.permissions.fonts) {
      requireAsset(receipt.inputs.some((i) => i.role === 'font' && i.path === font.path && i.sha256 === font.sha256),
        'INPUT_IDENTITY', font.path, 'font input identity missing')
    }
  }
  return receipt
}

export interface PackagedManifest extends AssetManifest {
  kind: 'cs3-asset-library'
  appearanceAccepted: false
  exportReceiptSha256: string
  exportReceipt: ExportReceipt
  assets: Array<AssetManifest['assets'][number] & {
    bytes: number; sourceSha256: string; exporterRevision: string; exportReceiptSha256: string
  }>
}

export function createManifestFromExport(input: unknown): PackagedManifest {
  const receipt = parseExportReceipt(input)
  const { assets, ...specificationRecords } = receipt
  const files = assets.map((a) => ({
    id: a.id, path: a.file, sha256: a.sha256, bytes: a.bytes,
  })).sort((a, b) => compare(a.id, b.id))
  const records = assets.map(({ file: _file, sha256: _hash, ...record }) => record)
  const libraryDigest = digest(canonicalJson({ specificationRecords, records, files }))
  const exportReceiptSha256 = digest(canonicalJson(receipt) + '\n')
  const manifest: PackagedManifest = {
    schema: 1, kind: 'cs3-asset-library', profile: receipt.profile, libraryDigest, appearanceAccepted: false,
    exportReceiptSha256, exportReceipt: receipt,
    assets: ASSET_IDS.map((id) => {
      const asset = receipt.assets.find((a) => a.id === id)!
      return {
        id, file: `packages/${libraryDigest}/${asset.file}`, sha256: asset.sha256, bytes: asset.bytes,
        sourceSha256: receipt.source.sha256, exporterRevision: receipt.exporter.revision, exportReceiptSha256,
        rootName: asset.root, requiredNodeNames: asset.nodes.map((n) => n.id).sort(compare),
        shape: {
          id, units: 'meters', up: 'Y', handedness: 'right', front: '+Z', pivot: 'floor-center',
          rootPosition: { x: 0, y: 0, z: 0 }, rootYaw: 0, rootScale: { x: 1, y: 1, z: 1 },
          restBounds: asset.restBounds, animatedBounds: asset.animatedBounds,
        },
        clips: asset.clips.map((c) => ({
          name: c.name, duration: c.name === 'Walk' ? 1 : 2, rootMotion: false,
        })),
      }
    }),
  }
  return manifest
}

export function validatePackagedManifest(input: unknown): PackagedManifest {
  requireAsset(input !== null && typeof input === 'object', 'MANIFEST', 'manifest', 'object required')
  const expected = createManifestFromExport(Reflect.get(input, 'exportReceipt'))
  requireAsset(canonicalJson(input) === canonicalJson(expected), 'MANIFEST', 'manifest', 'completed manifest was altered')
  return expected
}

export function candidateFiles(manifest: PackagedManifest): FileIdentity[] {
  return manifest.exportReceipt.assets.map((asset) => ({ path: asset.file, sha256: asset.sha256, bytes: asset.bytes }))
}
