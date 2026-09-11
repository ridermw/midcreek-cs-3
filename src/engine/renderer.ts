import {
  Color, DirectionalLight, HemisphereLight, Mesh, NoToneMapping, PCFShadowMap,
  Plane, Raycaster, Scene, SRGBColorSpace, Vector2, Vector3, WebGLRenderer,
} from 'three'
import { cameraHeading, createCamera, frameCamera, orbitCamera, zoomCamera } from '../camera/controller'
import { worldToCell } from '../world/layout'
import { normalRendering } from '../../blender/render_profile.json'

export function createRenderer(canvas: HTMLCanvasElement) {
  const renderer = new WebGLRenderer({ canvas, antialias: true })
  renderer.info.autoReset = false
  renderer.outputColorSpace = SRGBColorSpace
  renderer.toneMapping = NoToneMapping
  renderer.toneMappingExposure = 1
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = PCFShadowMap
  const scene = new Scene()
  scene.background = new Color(normalRendering.lighting.background)
  const camera = createCamera(1, 1)
  const key = new DirectionalLight(0xffffff, 2)
  key.position.set(8, 12, 4)
  key.target.position.set(8, 0, 7)
  key.castShadow = true
  key.shadow.mapSize.set(1024, 1024)
  key.shadow.bias = normalRendering.shadows.bias
  key.shadow.normalBias = normalRendering.shadows.normalBias
  Object.assign(key.shadow.camera, { left: -13, right: 13, top: 13, bottom: -13, near: 0.1, far: 40 })
  key.shadow.camera.updateProjectionMatrix()
  scene.add(key, key.target, new HemisphereLight('#9FD0F0', '#DEE6EB', 1))
  const raycaster = new Raycaster()
  const floor = new Plane(new Vector3(0, 1, 0), 0)
  let width = 1
  let height = 1
  let pixelRatio = 1
  let disposed = false
  let renderCount = 0
  let frameOpen = false

  function resize(w: number, h: number, dpr: number) {
    const nextWidth = Math.max(1, w)
    const nextHeight = Math.max(1, h)
    const dimensionsChanged = nextWidth !== width || nextHeight !== height
    const ratioChanged = dpr !== pixelRatio
    if (!dimensionsChanged && !ratioChanged) return
    width = nextWidth
    height = nextHeight
    if (ratioChanged) {
      pixelRatio = dpr
      renderer.setPixelRatio(pixelRatio)
    }
    if (dimensionsChanged) {
      renderer.setSize(width, height, false)
      frameCamera(camera, width, height)
    }
  }
  function project(position: Vector3) {
    const point = position.clone().project(camera)
    return { x: (point.x + 1) * width / 2, y: (1 - point.y) * height / 2 }
  }
  function setRay(x: number, y: number) {
    raycaster.setFromCamera(new Vector2(x / width * 2 - 1, 1 - y / height * 2), camera)
  }
  function beginFrame() {
    if (frameOpen || disposed) throw new Error('RENDER_FRAME: invalid begin')
    frameOpen = true
    renderer.info.reset()
    return performance.now()
  }
  function endFrame(startedAt: number) {
    if (!frameOpen) throw new Error('RENDER_FRAME: missing begin')
    frameOpen = false
    if (renderer.info.render.calls <= 0 || renderer.info.render.triangles <= 0) {
      throw new Error('RENDER_EMPTY: no geometry submitted; no completed-frame receipt')
    }
    return {
      calls: renderer.info.render.calls, triangles: renderer.info.render.triangles,
      renderCount: ++renderCount, startedAt, completedAt: performance.now(),
    }
  }
  function render() {
    const startedAt = beginFrame()
    // Keep info alive across shadow and main passes; end only after real submission.
    try {
      renderer.render(scene, camera)
    } catch (error) {
      frameOpen = false
      throw error
    }
    return endFrame(startedAt)
  }
  return {
    scene, camera, resize, render, project,
    orbit: (step: -1 | 1) => orbitCamera(camera, step),
    zoom: (delta: number) => zoomCamera(camera, delta),
    resetView() {
      while (cameraHeading(camera) !== 0) orbitCamera(camera, 1)
      zoomCamera(camera, 1 - camera.zoom)
    },
    pick(x: number, y: number) {
      setRay(x, y)
      const point = raycaster.ray.intersectPlane(floor, new Vector3())
      return point ? worldToCell(point) : null
    },
    hits(x: number, y: number) {
      scene.updateMatrixWorld(true)
      setRay(x, y)
      return raycaster.intersectObjects(scene.children, true).filter((hit) => {
        for (let node = hit.object; node; ) {
          if (!node.visible) return false
          if (!node.parent) break
          node = node.parent
        }
        return true
      })
    },
    finishGpu: () => renderer.getContext().finish(),
    isContextLost: () => renderer.getContext().isContextLost(),
    frameView() {
      return {
        camera: {
          heading: cameraHeading(camera), zoom: camera.zoom,
          projection: camera.projectionMatrix.toArray(), matrixWorld: camera.matrixWorld.toArray(),
        },
        logical: [width, height] as const, applicationDpr: renderer.getPixelRatio(),
      }
    },
    inspect() {
      let nativeDepth = true
      scene.traverse((node) => {
        if (!(node instanceof Mesh)) return
        for (const material of Array.isArray(node.material) ? node.material : [node.material]) {
          nativeDepth &&= material.depthTest && material.depthWrite && material.opacity === 1
        }
      })
      return {
        profile: 'cs3-standard-v1', lighting: 'cs3-lighting-v1',
        heading: cameraHeading(camera), zoom: camera.zoom, width, height,
        projection: camera.projectionMatrix.toArray(), matrixWorld: camera.matrixWorld.toArray(),
        nativeDepth, shadows: renderer.shadowMap.enabled, shadowSize: key.shadow.mapSize.toArray(),
        background: scene.background instanceof Color ? `#${scene.background.getHexString()}` : null,
        shadowBias: key.shadow.bias, shadowNormalBias: key.shadow.normalBias,
      }
    },
    dispose() {
      if (disposed) return
      disposed = true
      key.shadow.dispose()
      scene.clear()
      renderer.dispose()
    },
  }
}

export type GameRenderer = ReturnType<typeof createRenderer>
