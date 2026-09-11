import {
  AnimationMixer,
  LoopRepeat,
  Object3D,
} from 'three'
import type { AnimationClip } from 'three'
import type { AssetLease } from './library'
import type { Vector3 } from './contracts'

export type AssetMode = 'idle' | 'walking' | 'repairing'
type PresentationMode = AssetMode | 'Idle' | 'Walk' | 'Repair'

const CLIP_NAMES: Record<AssetMode, string> = {
  idle: 'Idle',
  walking: 'Walk',
  repairing: 'Repair',
}

interface RestTransform {
  readonly position: Object3D['position']
  readonly quaternion: Object3D['quaternion']
  readonly scale: Object3D['scale']
}

export class AssetInstance {
  readonly instanceId: string
  readonly assetId: AssetLease['template']['id']
  readonly root: Object3D
  readonly model: Object3D
  private readonly lease: AssetLease
  private readonly mixer: AnimationMixer
  private readonly clips: ReadonlyMap<string, AnimationClip>
  private readonly rest = new Map<Object3D, RestTransform>()
  private clipName: string | null = null
  private elapsed = 0
  private disposed = false

  constructor(instanceId: string, lease: AssetLease) {
    this.instanceId = instanceId
    this.assetId = lease.template.id
    this.lease = lease
    this.root = new Object3D()
    this.root.name = instanceId
    this.model = lease.template.scene.clone(true)
    this.root.add(this.model)
    this.mixer = new AnimationMixer(this.model)
    this.clips = new Map(lease.template.animations.map((clip) => [clip.name, clip]))
    this.model.traverse((object) => {
      this.rest.set(object, {
        position: object.position.clone(),
        quaternion: object.quaternion.clone(),
        scale: object.scale.clone(),
      })
    })
  }

  get currentClip(): string | null {
    return this.clipName
  }

  get animationTime(): number {
    return this.elapsed
  }

  setPlacement(position: Vector3, yaw: number): void {
    if (this.disposed) return
    this.root.position.set(position.x, position.y, position.z)
    this.root.rotation.set(0, yaw, 0)
  }

  present(mode: PresentationMode | null): void {
    if (this.disposed) return
    const nextClip = mode === null
      ? null
      : mode === 'Idle' || mode === 'Walk' || mode === 'Repair'
        ? mode
        : CLIP_NAMES[mode]
    if (nextClip === this.clipName) return
    this.mixer.stopAllAction()
    for (const [object, transform] of this.rest) {
      object.position.copy(transform.position)
      object.quaternion.copy(transform.quaternion)
      object.scale.copy(transform.scale)
      object.updateMatrix()
    }
    this.clipName = nextClip
    this.elapsed = 0
    if (nextClip === null) return
    const clip = this.clips.get(nextClip)
    if (!clip) {
      throw new Error(`Missing declared animation clip ${nextClip} for ${this.assetId}.`)
    }
    this.mixer.clipAction(clip).reset().setLoop(LoopRepeat, Infinity).play()
    this.mixer.update(0)
  }

  advanceTick(): void {
    if (this.disposed || this.clipName === null) return
    this.mixer.update(1 / 30)
    this.elapsed += 1 / 30
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.mixer.stopAllAction()
    this.mixer.uncacheRoot(this.model)
    this.root.remove(this.model)
    this.lease.release()
  }
}

export function createAssetInstance(instanceId: string, lease: AssetLease): AssetInstance {
  if (!instanceId) throw new Error('Asset instance IDs must be nonempty.')
  return new AssetInstance(instanceId, lease)
}
