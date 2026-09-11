import { BoxGeometry } from 'three'
import type { AssetManifestEntry } from '../../../src/assets/contracts'

interface SyntheticGlbOptions {
  readonly image?: string
  readonly invalidAnimationAccessor?: boolean
  readonly missingUv?: boolean
  readonly parserFault?: 'invalid-accessor' | 'unsupported-mode'
}

// Tiny owned boxes, not exported artwork or a production qualification fixture.
export function syntheticGlb(
  entry: AssetManifestEntry,
  options: SyntheticGlbOptions = {},
): ArrayBuffer {
  const {
    image = 'embedded',
    invalidAnimationAccessor = false,
    missingUv = false,
    parserFault,
  } = options
  const chunks: Uint8Array[] = []
  const bufferViews: { buffer: number; byteOffset: number; byteLength: number }[] = []
  const accessors: object[] = []
  let length = 0
  const append = (bytes: Uint8Array) => {
    const index = bufferViews.length
    bufferViews.push({ buffer: 0, byteOffset: length, byteLength: bytes.length })
    const padded = new Uint8Array(Math.ceil(bytes.length / 4) * 4)
    padded.set(bytes)
    chunks.push(padded)
    length += padded.length
    return index
  }
  const floats = (values: number[], type: string, size: number, extrema?: object) => {
    const data = new Float32Array(values)
    const index = accessors.length
    accessors.push({ bufferView: append(new Uint8Array(data.buffer)), componentType: 5126, count: values.length / size, type, ...extrema })
    return index
  }
  const bounds = entry.shape.restBounds
  const size = [bounds.max.x - bounds.min.x, bounds.max.y - bounds.min.y, bounds.max.z - bounds.min.z]
  const geometry = new BoxGeometry(size[0], size[1], size[2]).toNonIndexed()
  const position = floats([...geometry.getAttribute('position').array], 'VEC3', 3, {
    min: size.map((value) => -value / 2), max: size.map((value) => value / 2),
  })
  const normal = floats([...geometry.getAttribute('normal').array], 'VEC3', 3)
  const uv = floats([...geometry.getAttribute('uv').array], 'VEC2', 2)
  geometry.dispose()
  const y = (bounds.min.y + bounds.max.y) / 2
  const animations = entry.clips.map((clip) => {
    const offset = clip.name === 'Repair' ? 0.04 : 0
    const input = floats([0, clip.duration / 2, clip.duration], 'SCALAR', 1, { min: [0], max: [clip.duration] })
    const output = floats([0, y + offset, 0, 0, y + 0.06, 0, 0, y + offset, 0], 'VEC3', 3)
    return {
      name: clip.name,
      samplers: [{ input, output, interpolation: 'LINEAR' }],
      channels: [{ sampler: 0, target: { node: 1, path: 'translation' } }],
    }
  })
  if (invalidAnimationAccessor) animations[0]!.samplers[0]!.output = 999
  const png = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR4nGP4DwQACfsD/fteaysAAAAASUVORK5CYII='), (value) => value.charCodeAt(0))
  const images = image === 'embedded'
    ? [{ bufferView: append(png), mimeType: 'image/png' }]
    : [{ uri: image }]
  const primitive = {
    attributes: { POSITION: position, NORMAL: normal, ...(!missingUv && { TEXCOORD_0: uv }) },
    material: 0,
  }
  const primitives = parserFault === 'invalid-accessor'
    ? [primitive, { attributes: { POSITION: 999 }, material: 0 }]
    : parserFault === 'unsupported-mode'
      ? [primitive, { ...primitive, mode: 99 }]
      : [primitive]
  const json = {
    asset: { version: '2.0' }, scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ name: entry.rootName, children: [1] }, { name: 'Body', mesh: 0, translation: [0, y, 0] }],
    meshes: [{ primitives }],
    materials: [{ pbrMetallicRoughness: { baseColorTexture: { index: 0 }, baseColorFactor: entry.id === 'technician-man' ? [1, 0.3, 0.05, 1] : [0.4, 0.55, 0.65, 1] }, extensions: { KHR_materials_unlit: {} } }],
    extensionsUsed: ['KHR_materials_unlit'],
    textures: [{ source: 0 }], images,
    animations, accessors, bufferViews, buffers: [{ byteLength: length }],
  }
  const encoded = new TextEncoder().encode(JSON.stringify(json))
  const jsonLength = Math.ceil(encoded.length / 4) * 4
  const bytes = new ArrayBuffer(12 + 8 + jsonLength + 8 + length)
  const view = new DataView(bytes)
  view.setUint32(0, 0x46546c67, true)
  view.setUint32(4, 2, true)
  view.setUint32(8, bytes.byteLength, true)
  view.setUint32(12, jsonLength, true)
  view.setUint32(16, 0x4e4f534a, true)
  const output = new Uint8Array(bytes)
  output.fill(32, 20, 20 + jsonLength)
  output.set(encoded, 20)
  view.setUint32(20 + jsonLength, length, true)
  view.setUint32(24 + jsonLength, 0x004e4942, true)
  let offset = 28 + jsonLength
  for (const chunk of chunks) { output.set(chunk, offset); offset += chunk.length }
  return bytes
}
