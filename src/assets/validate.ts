import { AnimationMixer, Box3, LoopOnce, Object3D, PropertyBinding, Texture } from 'three'
import type { Mesh } from 'three'
import { ASSET_IDS, AssetLoadError, ContractError } from './contracts'
import type {
  AssetCandidate,
  AssetId,
  AssetManifest,
  AssetManifestEntry,
  AssetShape,
  Bounds,
  Placement,
  PlacementClass,
  Vector3,
} from './contracts'
import { createRacks, isWalkable } from '../world/layout'

export const GEOMETRY_TOLERANCE = 2e-4
export const UNIT_TOLERANCE = 1e-6
const AXES = ['x', 'y', 'z'] as const
const PERMITTED: Record<AssetId, Bounds> = {
  'floor-slab': { min: { x: -8.5, y: -0.1, z: -7.5 }, max: { x: 8.5, y: 0, z: 7.5 } },
  'rack-standard': { min: { x: -0.4, y: 0, z: -0.4 }, max: { x: 0.4, y: 2.1, z: 0.4 } },
  'cooling-unit': { min: { x: -0.4, y: 0, z: -0.4 }, max: { x: 0.4, y: 2.1, z: 0.4 } },
  'technician-man': { min: { x: -0.45, y: 0, z: -0.45 }, max: { x: 0.45, y: 1.8, z: 0.45 } },
  'coolant-leak': { min: { x: -0.45, y: 0, z: -0.45 }, max: { x: 0.45, y: 0.02, z: 0.45 } },
}
const SHA256 = /^[a-f0-9]{64}$/
const TECHNICIAN_CLIPS = new Map([
  ['Idle', 2],
  ['Walk', 1],
  ['Repair', 2],
] as const)

function fail(code: string, subject: string, message: string): never {
  throw new ContractError(code, subject, message)
}

function near(a: number, b: number, tolerance = GEOMETRY_TOLERANCE): boolean {
  return Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= tolerance
}

function samePosition(a: Vector3, b: Vector3): boolean {
  return AXES.every((axis) => near(a[axis], b[axis]))
}

function sameBounds(a: Bounds, b: Bounds, tolerance = GEOMETRY_TOLERANCE): boolean {
  return AXES.every((axis) => near(a.min[axis], b.min[axis], tolerance)
    && near(a.max[axis], b.max[axis], tolerance))
}

function unitScale(scale: Vector3, subject: string): void {
  if (!AXES.every((axis) => near(scale[axis], 1, UNIT_TOLERANCE))) {
    fail('UNIT_SCALE', subject, 'positive unit scale required; automatic rescaling is forbidden')
  }
}

export function validateBounds(bounds: Bounds, subject: string): void {
  for (const axis of AXES) {
    if (!Number.isFinite(bounds.min[axis]) || !Number.isFinite(bounds.max[axis])
      || bounds.min[axis] >= bounds.max[axis]) {
      fail('INVALID_BOUNDS', subject, `nonempty finite ${axis} extent required`)
    }
  }
}

function contains(outer: Bounds, inner: Bounds, subject: string): void {
  for (const axis of AXES) {
    if (inner.min[axis] < outer.min[axis] - GEOMETRY_TOLERANCE
      || inner.max[axis] > outer.max[axis] + GEOMETRY_TOLERANCE) {
      fail('ESCAPED_BOUNDS', subject, `${axis} extends beyond the declared envelope`)
    }
  }
}

export function validateShape(asset: AssetShape): void {
  if (!ASSET_IDS.includes(asset.id)) fail('UNKNOWN_ASSET', asset.id, 'not in the required library')
  if (asset.units !== 'meters' || asset.up !== 'Y' || asset.handedness !== 'right'
    || asset.front !== '+Z' || asset.pivot !== 'floor-center') {
    fail('COORDINATES', asset.id, 'meters, Y-up, right-handed, floor-centered, +Z-front required')
  }
  unitScale(asset.rootScale, asset.id)
  if (!AXES.every((axis) => near(asset.rootPosition[axis], 0, UNIT_TOLERANCE))
    || !near(asset.rootYaw, 0, UNIT_TOLERANCE)) {
    fail('ROOT_TRANSFORM', asset.id, 'template root must be identity')
  }
  validateBounds(asset.restBounds, asset.id)
  validateBounds(asset.animatedBounds, asset.id)
  contains(PERMITTED[asset.id], asset.restBounds, asset.id)
  contains(PERMITTED[asset.id], asset.animatedBounds, asset.id)
  contains(asset.animatedBounds, asset.restBounds, asset.id)
  const restHeight = asset.id === 'technician-man' ? 1.73
    : asset.id === 'rack-standard' || asset.id === 'cooling-unit' ? 2.1 : null
  if (restHeight !== null && (!near(asset.restBounds.min.y, 0) || !near(asset.restBounds.max.y, restHeight))) {
    fail('REST_HEIGHT', asset.id, `expected ground-to-top height ${restHeight}`)
  }
  if (asset.id === 'floor-slab' && (!samePosition(asset.restBounds.min, PERMITTED['floor-slab'].min)
    || !samePosition(asset.restBounds.max, PERMITTED['floor-slab'].max))) {
    fail('FLOOR_BOUNDS', asset.id, 'floor must cover the authoritative hall footprint')
  }
}

export function validateRelativeAssetPath(file: string): void {
  if (!file || !/^[A-Za-z0-9_./-]+$/.test(file) || file.startsWith('/')
    || /^[a-z][a-z\d+.-]*:/i.test(file)) {
    fail('PATH', file || 'asset', 'asset files must be relative same-origin paths')
  }
  const parts = file.split('/')
  if (parts.some((part) => part.length === 0 || part === '.' || part === '..')) {
    fail('PATH', file, 'asset files must be normalized relative paths')
  }
}

export function validateManifest(manifest: AssetManifest): void {
  if (manifest.schema !== 1 || typeof manifest.profile !== 'string' || !manifest.profile) {
    fail('MANIFEST_SCHEMA', 'manifest', 'schema 1 and a nonempty rendering profile are required')
  }
  if (!SHA256.test(manifest.libraryDigest)) {
    fail('LIBRARY_DIGEST', 'manifest', 'library digest must be a lowercase SHA-256')
  }
  if (manifest.assets.length !== ASSET_IDS.length) {
    fail('ASSET_COUNT', 'manifest', `exactly ${ASSET_IDS.length} assets are required`)
  }
  const seen = new Set<AssetId>()
  for (const entry of manifest.assets) {
    if (!ASSET_IDS.includes(entry.id)) fail('UNKNOWN_ASSET', entry.id, 'not in the required library')
    if (seen.has(entry.id)) fail('DUPLICATE_ASSET', entry.id, 'one manifest entry per visual ID required')
    seen.add(entry.id)
    if (entry.shape.id !== entry.id) fail('SHAPE_IDENTITY', entry.id, 'shape must identify its manifest entry')
    validateRelativeAssetPath(entry.file)
    if (!SHA256.test(entry.sha256)) fail('HASH', entry.id, 'asset hash must be a lowercase SHA-256')
    if (!entry.rootName || !entry.requiredNodeNames.includes(entry.rootName)) {
      fail('ROOT_NODE', entry.id, 'the declared root must be a required node')
    }
    if (new Set(entry.requiredNodeNames).size !== entry.requiredNodeNames.length) {
      fail('NODE_IDENTITY', entry.id, 'required node names must be unique')
    }
    const clipNames = new Set<string>()
    for (const clip of entry.clips) {
      if (!clip.name || clipNames.has(clip.name)) {
        fail('CLIP_IDENTITY', entry.id, 'clip names must be nonempty and unique')
      }
      if (!Number.isFinite(clip.duration) || clip.duration <= 0 || clip.rootMotion !== false) {
        fail('CLIP_CONTRACT', `${entry.id}/${clip.name}`, 'finite duration and rootMotion=false are required')
      }
      clipNames.add(clip.name)
    }
    if (entry.id === 'technician-man') {
      if (entry.clips.length !== TECHNICIAN_CLIPS.size
        || entry.clips.some((clip) => TECHNICIAN_CLIPS.get(clip.name as 'Idle' | 'Walk' | 'Repair') !== clip.duration)) {
        fail('CLIP_SET', entry.id, 'technician requires exact Idle 2s, Walk 1s and Repair 2s clips')
      }
    } else if (entry.clips.length !== 0) {
      fail('CLIP_SET', entry.id, 'only the technician may declare animation clips')
    }
    validateShape(entry.shape)
  }
  for (const id of ASSET_IDS) {
    if (!seen.has(id)) fail('MISSING_ASSET', id, 'required manifest entry absent')
  }
}

export function validateAssetCandidate(
  candidate: AssetCandidate,
  entry: AssetManifestEntry,
): void {
  if (candidate.id !== entry.id) {
    throw new AssetLoadError('ASSET_IDENTITY', entry.id, `loader returned ${candidate.id}`, entry.id)
  }
  if (candidate.sha256 !== entry.sha256) {
    throw new AssetLoadError('HASH', entry.id, 'loaded bytes do not match the manifest', entry.id)
  }
  if (candidate.scene.children.length !== 1 || candidate.scene.children[0]!.name !== entry.rootName) {
    throw new AssetLoadError('SCENE_ROOT', entry.id, 'exactly one declared root child is required', entry.id)
  }
  const names = new Map<string, number>()
  candidate.scene.traverse((object) => {
    names.set(object.name, (names.get(object.name) ?? 0) + 1)
    const mesh = object as Mesh
    if ('isSkinnedMesh' in object || (mesh.isMesh && Object.keys(mesh.geometry.morphAttributes).length)) {
      throw new AssetLoadError('RIGID_ANIMATION', entry.id, 'skins and morphs are not supported', entry.id)
    }
    if (![...object.position, ...object.quaternion, ...object.scale].every(Number.isFinite)
      || !AXES.every((axis) => object.scale[axis] > 0)
      || !near(object.quaternion.lengthSq(), 1, UNIT_TOLERANCE)) {
      throw new AssetLoadError('RIGID_ANIMATION', entry.id, 'finite transforms, normalized rotation and positive scale are required', entry.id)
    }
    if (mesh.isMesh) {
      for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
        for (const value of Object.values(material)) {
          if (!(value instanceof Texture)) continue
          const uv = mesh.geometry.getAttribute(value.channel === 0 ? 'uv' : `uv${value.channel}`)
          if (!uv || uv.itemSize !== 2 || uv.count !== mesh.geometry.getAttribute('position')?.count
            || !uv.array.every(Number.isFinite)) {
            throw new AssetLoadError('TEXTURE_UV', entry.id, 'required texture coordinates are missing or invalid', entry.id)
          }
        }
      }
    }
  })
  for (const name of entry.requiredNodeNames) {
    if (names.get(name) !== 1) {
      throw new AssetLoadError('DECLARED_NODE', `${entry.id}/${name}`, 'required node is missing or duplicated', entry.id)
    }
  }
  const root = candidate.scene.children[0]!
  if (root.position.length() > UNIT_TOLERANCE || root.rotation.x !== 0
    || root.rotation.y !== 0 || root.rotation.z !== 0
    || !AXES.every((axis) => near(root.scale[axis], 1, UNIT_TOLERANCE))) {
    throw new AssetLoadError('ROOT_TRANSFORM', entry.id, 'asset root must have an identity transform', entry.id)
  }
  candidate.scene.updateMatrixWorld(true)
  const box = new Box3().setFromObject(root)
  const observed: Bounds = {
    min: { x: box.min.x, y: box.min.y, z: box.min.z },
    max: { x: box.max.x, y: box.max.y, z: box.max.z },
  }
  if (![box.min.x, box.min.y, box.min.z, box.max.x, box.max.y, box.max.z].every(Number.isFinite)
    || !sameBounds(observed, entry.shape.restBounds)) {
    throw new AssetLoadError('BOUNDS', entry.id, 'loaded geometry disagrees with the declared rest envelope', entry.id)
  }
  const expectedClips = new Map(entry.clips.map((clip) => [clip.name, clip]))
  if (candidate.animations.length !== expectedClips.size) {
    throw new AssetLoadError('CLIP_COUNT', entry.id, 'loaded clips do not match the manifest', entry.id)
  }
  const loadedClips = new Set<string>()
  for (const clip of candidate.animations) {
    if (loadedClips.has(clip.name)) {
      throw new AssetLoadError('CLIP_IDENTITY', entry.id, 'loaded clip names must be unique', entry.id)
    }
    loadedClips.add(clip.name)
    const expected = expectedClips.get(clip.name)
    if (!expected || !Number.isFinite(clip.duration) || Math.abs(clip.duration - expected.duration) > 1e-5) {
      throw new AssetLoadError('CLIP_CONTRACT', `${entry.id}/${clip.name}`, 'clip name or duration differs from the manifest', entry.id)
    }
    if (clip.tracks.some((track) => !track.values.every(Number.isFinite))) {
      throw new AssetLoadError('TRACK_FINITE', `${entry.id}/${clip.name}`, 'animation tracks must contain finite values', entry.id)
    }
    for (const track of clip.tracks) {
      const binding = PropertyBinding.parseTrackName(track.name)
      const target = PropertyBinding.findNode(candidate.scene, binding.nodeName)
      if (!(target instanceof Object3D) || (target.name && names.get(target.name) !== 1)) {
        throw new AssetLoadError('TRACK_TARGET', entry.id, 'animation target is missing or ambiguous', entry.id)
      }
      if (target === root || target === candidate.scene) {
        throw new AssetLoadError('ROOT_MOTION', entry.id, 'animation may only write descendants', entry.id)
      }
      const size = binding.propertyName === 'quaternion' ? 4 : 3
      if (binding.objectName || binding.propertyIndex !== undefined
        || !['position', 'quaternion', 'scale'].includes(binding.propertyName)
        || track.getValueSize() !== size
        || (binding.propertyName === 'scale' && !track.values.every((value, i) =>
          value > 0 && near(value, target.scale.getComponent(i % 3), UNIT_TOLERANCE)))) {
        throw new AssetLoadError('RIGID_ANIMATION', entry.id, 'only rigid transforms with unchanged positive scale are supported', entry.id)
      }
      if (binding.propertyName === 'quaternion') {
        for (let i = 0; i < track.values.length; i += 4) {
          const lengthSq = track.values[i]! * track.values[i]!
            + track.values[i + 1]! * track.values[i + 1]!
            + track.values[i + 2]! * track.values[i + 2]!
            + track.values[i + 3]! * track.values[i + 3]!
          if (!near(lengthSq, 1, UNIT_TOLERANCE)) {
            throw new AssetLoadError('RIGID_ANIMATION', entry.id, 'rotation keys must be normalized quaternions', entry.id)
          }
        }
      }
      if (!track.times.length || !track.times.every((time, i) =>
        Number.isFinite(time) && time >= 0 && time <= clip.duration
        && (i === 0 || time > track.times[i - 1]!))) {
        throw new AssetLoadError('TRACK_TIME', entry.id, 'keys must have finite, ordered times inside the clip', entry.id)
      }
    }
  }
  validateAnimatedPoses(candidate, entry)
}

function validateAnimatedPoses(candidate: AssetCandidate, entry: AssetManifestEntry): void {
  const rest = new Map<Object3D, {
    position: Object3D['position']; quaternion: Object3D['quaternion']; scale: Object3D['scale']
  }>()
  candidate.scene.traverse((object) => rest.set(object, {
    position: object.position.clone(), quaternion: object.quaternion.clone(), scale: object.scale.clone(),
  }))
  const restore = () => {
    for (const [object, pose] of rest) {
      object.position.copy(pose.position)
      object.quaternion.copy(pose.quaternion)
      object.scale.copy(pose.scale)
      object.updateMatrix()
    }
    candidate.scene.updateMatrixWorld(true)
  }
  const mixer = new AnimationMixer(candidate.scene)
  try {
    for (const clip of candidate.animations) {
      const keys = [...new Set([0, clip.duration, ...clip.tracks.flatMap((track) => [...track.times])])].sort((a, b) => a - b)
      // Keys + interval midpoints validate the declared swept envelope, not all continuous time.
      const samples = [...keys, ...keys.slice(1).map((time, i) => (keys[i]! + time) / 2)]
      for (const time of samples) {
        mixer.stopAllAction()
        restore()
        const action = mixer.clipAction(clip).reset().setLoop(LoopOnce, 1)
        action.clampWhenFinished = true
        action.play()
        mixer.setTime(time)
        candidate.scene.updateMatrixWorld(true)
        const box = new Box3().setFromObject(candidate.scene.children[0]!, true)
        const bounds = entry.shape.animatedBounds
        if (!AXES.every((axis) => Number.isFinite(box.min[axis]) && Number.isFinite(box.max[axis])
          && box.min[axis] >= bounds.min[axis] - GEOMETRY_TOLERANCE
          && box.max[axis] <= bounds.max[axis] + GEOMETRY_TOLERANCE)) {
          throw new AssetLoadError('ANIMATED_BOUNDS', `${entry.id}/${clip.name}`, `pose at ${time} escapes the animated envelope`, entry.id)
        }
      }
    }
  } finally {
    mixer.stopAllAction()
    mixer.uncacheRoot(candidate.scene)
    restore()
  }
}

interface PlacementRule {
  assetId: AssetId
  kind: PlacementClass
  owner: string
  position?: Vector3
  yaw?: number
}

function expectedPlacements(): Map<string, PlacementRule> {
  const expected = new Map<string, PlacementRule>()
  expected.set('hall/floor', { assetId: 'floor-slab', kind: 'floor', owner: 'hall', position: { x: 8, y: 0, z: 7 }, yaw: 0 })
  for (const rack of createRacks()) {
    expected.set(`rack/${rack.id}`, {
      assetId: 'rack-standard', kind: 'blocking-rack', owner: rack.id,
      position: { x: rack.cell.x, y: 0, z: rack.cell.z }, yaw: rack.front === 1 ? Math.PI : 0,
    })
  }
  expected.set('plant/west-01', { assetId: 'cooling-unit', kind: 'outside-hall-decoration', owner: 'plant', position: { x: -1.5, y: 0, z: 7 }, yaw: 0 })
  expected.set('plant/east-01', { assetId: 'cooling-unit', kind: 'outside-hall-decoration', owner: 'plant', position: { x: 17.5, y: 0, z: 7 }, yaw: 0 })
  expected.set('actor/technician', { assetId: 'technician-man', kind: 'actor', owner: 'technician' })
  expected.set('fault/coolant', { assetId: 'coolant-leak', kind: 'nonblocking-fault-visual', owner: 'fault-rack', yaw: 0 })
  return expected
}

export function validateJoin(placements: readonly Placement[], library: readonly AssetShape[]): void {
  const assets = new Map<AssetId, AssetShape>()
  for (const asset of library) {
    if (assets.has(asset.id)) fail('DUPLICATE_ASSET', asset.id, 'one template per visual ID required')
    validateShape(asset)
    assets.set(asset.id, asset)
  }
  for (const id of ASSET_IDS) {
    if (!assets.has(id)) fail('MISSING_ASSET', id, 'required visual template absent')
  }
  const expected = expectedPlacements()
  const seen = new Set<string>()
  for (const p of placements) {
    if (seen.has(p.instanceId)) fail('DUPLICATE_INSTANCE', p.instanceId, 'logical IDs must bind exactly once')
    seen.add(p.instanceId)
    const declaration = expected.get(p.instanceId)
    if (!declaration) fail('UNKNOWN_INSTANCE', p.instanceId, 'no logical placement owner')
    if (p.assetId !== declaration.assetId || p.placementClass !== declaration.kind) {
      fail('PLACEMENT_BINDING', p.instanceId, 'wrong asset or placement class')
    }
    unitScale(p.scale, p.instanceId)
    if (!AXES.every((axis) => Number.isFinite(p.position[axis])) || !Number.isFinite(p.yaw)) {
      fail('PLACEMENT_TRANSFORM', p.instanceId, 'finite transform required')
    }
    if ((declaration.position && !samePosition(p.position, declaration.position))
      || (declaration.yaw !== undefined && !near(p.yaw, declaration.yaw, UNIT_TOLERANCE))) {
      fail('PLACEMENT_TRANSFORM', p.instanceId, 'transform disagrees with the logical layout')
    }
    if (declaration.owner !== 'fault-rack' && p.logicalOwner !== declaration.owner) {
      fail('PLACEMENT_OWNER', p.instanceId, 'wrong logical owner')
    }
    if (p.placementClass === 'actor' || p.placementClass === 'nonblocking-fault-visual') {
      if (!near(p.position.y, 0) || !isWalkable({ x: p.position.x, z: p.position.z })) {
        fail('PLACEMENT_FLOOR', p.instanceId, 'must occupy a walkable ground cell')
      }
    }
    if (p.placementClass === 'nonblocking-fault-visual') {
      const rack = createRacks().find((rack) => rack.id === p.logicalOwner)
      if (!rack || !samePosition(p.position, { x: rack.cell.x, y: 0, z: rack.cell.z - rack.front })) {
        fail('FAULT_PLACEMENT', p.instanceId, 'floor visual must align with its rack service cell')
      }
    }
    if (p.placementClass === 'outside-hall-decoration') {
      const bounds = assets.get(p.assetId)!.animatedBounds
      if (!(p.position.x + bounds.max.x < -0.5 || p.position.x + bounds.min.x > 16.5
        || p.position.z + bounds.max.z < -0.5 || p.position.z + bounds.min.z > 14.5)) {
        fail('DECORATION_BOUNDS', p.instanceId, 'decoration must remain wholly outside the hall')
      }
    }
  }
  for (const id of expected.keys()) {
    if (!seen.has(id)) fail('MISSING_INSTANCE', id, 'required logical instance absent')
  }
}
