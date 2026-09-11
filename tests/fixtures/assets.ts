import {
  AnimationClip,
  BoxGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  NumberKeyframeTrack,
} from 'three'
import type {
  AssetCandidate,
  AssetClipContract,
  AssetId,
  AssetManifest,
  AssetManifestEntry,
  AssetShape,
  Bounds,
  Vector3,
} from '../../src/assets/contracts'

const ROOTS: Record<AssetId, string> = {
  'floor-slab': 'FloorRoot',
  'rack-standard': 'RackRoot',
  'cooling-unit': 'CoolingRoot',
  'technician-man': 'TechnicianRoot',
  'coolant-leak': 'CoolantRoot',
}

const BOUNDS: Record<AssetId, Bounds> = {
  'floor-slab': { min: { x: -8.5, y: -0.1, z: -7.5 }, max: { x: 8.5, y: 0, z: 7.5 } },
  'rack-standard': { min: { x: -0.4, y: 0, z: -0.4 }, max: { x: 0.4, y: 2.1, z: 0.4 } },
  'cooling-unit': { min: { x: -0.4, y: 0, z: -0.4 }, max: { x: 0.4, y: 2.1, z: 0.4 } },
  'technician-man': { min: { x: -0.45, y: 0, z: -0.45 }, max: { x: 0.45, y: 1.73, z: 0.45 } },
  'coolant-leak': { min: { x: -0.45, y: 0, z: -0.45 }, max: { x: 0.45, y: 0.02, z: 0.45 } },
}

function boundsFor(id: AssetId): Bounds {
  const bounds = BOUNDS[id]
  return {
    min: { ...bounds.min },
    max: { ...bounds.max },
  }
}

function shapeFor(id: AssetId): AssetShape {
  const bounds = boundsFor(id)
  const animatedBounds = id === 'technician-man'
    ? { min: { x: -0.45, y: 0, z: -0.45 }, max: { x: 0.45, y: 1.8, z: 0.45 } }
    : boundsFor(id)
  return {
    id,
    units: 'meters',
    up: 'Y',
    handedness: 'right',
    front: '+Z',
    pivot: 'floor-center',
    rootPosition: { x: 0, y: 0, z: 0 },
    rootYaw: 0,
    rootScale: { x: 1, y: 1, z: 1 },
    restBounds: bounds,
    animatedBounds,
  }
}

function clipsFor(id: AssetId): readonly AssetClipContract[] {
  if (id !== 'technician-man') return []
  return [
    { name: 'Idle', duration: 2, rootMotion: false },
    { name: 'Walk', duration: 1, rootMotion: false },
    { name: 'Repair', duration: 2, rootMotion: false },
  ]
}

export function createTestManifest(): AssetManifest {
  const assets = (Object.keys(ROOTS) as AssetId[]).map((id, index): AssetManifestEntry => ({
    id,
    file: `assets/library/${id}.glb`,
    sha256: (index + 1).toString(16).padStart(2, '0').repeat(32),
    rootName: ROOTS[id],
    requiredNodeNames: [ROOTS[id], 'Body'],
    shape: shapeFor(id),
    clips: clipsFor(id),
  }))
  return {
    schema: 1,
    profile: 'cs3-standard-v1',
    libraryDigest: 'a'.repeat(64),
    assets,
  }
}

function geometryFor(bounds: Bounds): { geometry: BoxGeometry; position: Vector3 } {
  const size = {
    x: bounds.max.x - bounds.min.x,
    y: bounds.max.y - bounds.min.y,
    z: bounds.max.z - bounds.min.z,
  }
  return {
    geometry: new BoxGeometry(size.x, size.y, size.z),
    position: {
      x: (bounds.min.x + bounds.max.x) / 2,
      y: (bounds.min.y + bounds.max.y) / 2,
      z: (bounds.min.z + bounds.max.z) / 2,
    },
  }
}

export function createTestCandidate(
  entry: AssetManifestEntry,
  options: { rootMotion?: boolean; release?: () => void } = {},
): AssetCandidate {
  const scene = new Group()
  scene.name = `${entry.id}-scene`
  const root = new Group()
  root.name = entry.rootName
  const bodyGeometry = geometryFor(entry.shape.restBounds)
  const body = new Mesh(
    bodyGeometry.geometry,
    new MeshBasicMaterial({ color: 0xffffff }),
  )
  body.name = 'Body'
  body.position.copy(bodyGeometry.position)
  root.add(body)
  scene.add(root)

  const animations = entry.clips.map((clip) => new AnimationClip(
    clip.name,
    clip.duration,
    [new NumberKeyframeTrack(
      options.rootMotion ? `${entry.rootName}.position` : `${body.name}.position`,
      [0, clip.duration],
      [0, 0, 0, 0, 0, 0],
    )],
  ))

  return {
    id: entry.id,
    sha256: entry.sha256,
    scene,
    animations,
    release: options.release,
  }
}
