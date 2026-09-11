import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createLoad } from './lifecycle.mjs';
import { createLibraryLighting, createLibraryPlayback, validateLibrary } from './library-browser.mjs';

const scene = new THREE.Scene();
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.setSize(640, 360);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.AgXToneMapping;
renderer.toneMappingExposure = 2 ** 0.3;
scene.background = new THREE.Color().setRGB(0.06, 0.06, 0.06);
document.body.appendChild(renderer.domElement);
let active;
let currentAsset;
let mixer;
let receipt;
let released = 0;
let attached = 0;
let errors = [];
let libraryPlayback;
let libraryLighting;
const libraryOwners = new WeakMap();
const environmentScene = new THREE.Scene();
environmentScene.background = new THREE.Color().setRGB(0.06, 0.06, 0.06);
const pmrem = new THREE.PMREMGenerator(renderer);
const environment = pmrem.fromScene(environmentScene);
scene.environment = environment.texture;
pmrem.dispose();

function requireThat(condition, message) {
  if (!condition) throw new Error(message);
}

function release(asset) {
  libraryOwners.get(asset)?.dispose();
  libraryOwners.delete(asset);
  asset.scene.removeFromParent();
  const geometries = new Set();
  const materials = new Set();
  const textures = new Set();
  asset.scene.traverse(node => {
    if (node.geometry) geometries.add(node.geometry);
    for (const mat of [node.material].flat().filter(Boolean)) {
      materials.add(mat);
      for (const value of Object.values(mat)) if (value?.isTexture) textures.add(value);
    }
  });
  geometries.forEach(g => g.dispose());
  textures.forEach(t => { t.dispose(); t.source?.data?.close?.(); });
  materials.forEach(m => m.dispose());
  released++;
}

function validate(asset, declared, loadErrors) {
  if (declared.kind === 'cs3-library-asset') return validateLibrary(asset, declared, loadErrors);
  requireThat(loadErrors.length === 0, `TEXTURE_LOAD: ${loadErrors.join(', ')}`);
  for (const [name, expected] of Object.entries(declared.poses[0].objects)) {
    const object = asset.scene.getObjectByName(name);
    requireThat(object, `DECLARED_NODE: ${name}`);
    requireThat(!expected.parent || object.parent.name === expected.parent, `PARENT: ${name}`);
    if (expected.triangles !== undefined) {
      const names = new Set();
      object.traverse(n => {
        for (const mat of [n.material].flat().filter(Boolean)) names.add(mat.name);
      });
      requireThat(JSON.stringify([...names].sort()) === JSON.stringify([...expected.materials].sort()),
        `MATERIAL_BINDINGS: ${name}`);
    }
  }
  requireThat(asset.animations.length === 1, 'CLIP_COUNT');
  requireThat(asset.animations[0].name === declared.animation.name, 'CLIP_NAME');
  requireThat(Math.abs(asset.animations[0].duration - declared.animation.duration) < 1e-5, 'CLIP_DURATION');
  for (const name of ['Brick', 'Carbon']) {
    const node = asset.scene.getObjectByName(name);
    const map = node.material.map;
    requireThat(map && map.image.width === 256 && map.image.height === 256, `TEXTURE_READY: ${name}`);
    requireThat(map.name === `${name}-base`, `TEXTURE_IMAGE: ${name}`);
    requireThat(map.colorSpace === THREE.SRGBColorSpace && map.flipY === false, `TEXTURE_COLORSPACE: ${name}`);
    requireThat(node.geometry.attributes.uv, `UV_MISSING: ${name}`);
  }
}

function sample(time) {
  if (libraryPlayback) return libraryPlayback.sample(null, time);
  // A previous end-pose sample clamps/pauses LoopOnce; each probe sample is independent.
  mixer.clipAction(currentAsset.animations[0]).reset().play();
  mixer.setTime(time);
  currentAsset.scene.updateMatrixWorld(true);
  const result = {};
  for (const name of Object.keys(receipt.poses[0].objects)) {
    const object = currentAsset.scene.getObjectByName(name);
    const entry = { matrix_world: [...object.matrixWorld.elements], matrix_local: [...object.matrix.elements] };
    if (receipt.poses[0].objects[name].triangles !== undefined) {
      const box = new THREE.Box3().setFromObject(object);
      entry.bounds = [box.min.toArray(), box.max.toArray()];
    }
    result[name] = entry;
  }
  return result;
}

export function draw(capture, lighting, studyRender) {
  const pose = libraryPlayback ? libraryPlayback.sample(capture.clip, capture.time, capture.repeat) : sample(capture.time);
  const standard = capture.profile === 'standard' || capture.profile === 'cs3-standard-v1';
  renderer.toneMapping = standard ? THREE.NoToneMapping : THREE.AgXToneMapping;
  renderer.toneMappingExposure = standard ? 1 : 2 ** 0.3;
  currentAsset.scene.traverse(node => {
    if (node.isMesh) node.visible = capture.visible.includes(node.name) ||
      capture.visible.includes(node.parent?.name);
  });
  for (const light of [...scene.children].filter(n => n.isLight)) scene.remove(light);
  if (libraryPlayback) {
    libraryLighting ??= createLibraryLighting(scene, renderer, lighting);
    libraryLighting.view(capture, { scene: currentAsset.scene, id: receipt.id });
  } else {
    libraryLighting?.hide();
    renderer.shadowMap.enabled = false;
    scene.environment = environment.texture;
    scene.background = new THREE.Color().setRGB(0.06, 0.06, 0.06);
    const sun = new THREE.DirectionalLight(0xffffff, lighting.sun_energy);
    sun.position.fromArray(lighting.sun_direction).multiplyScalar(-1);
    scene.add(sun);
  }
  const c = capture.camera;
  const width = c.ortho_width;
  const camera = new THREE.OrthographicCamera(-width / 2, width / 2,
    width * 360 / 640 / 2, -width * 360 / 640 / 2, c.near, c.far);
  camera.matrixAutoUpdate = false;
  camera.matrix.fromArray(c.matrix_world);
  camera.updateMatrixWorld(true);
  document.getElementById('status').hidden = true;
  if (studyRender === undefined) renderer.render(scene, camera);
  else studyRender({ scene, camera, renderer, asset: currentAsset });
  return { calls: renderer.info.render.calls, triangles: renderer.info.render.triangles, pose,
    toneMapping: renderer.toneMapping, exposure: renderer.toneMappingExposure,
    camera: camera.matrixWorld.elements, renderer: renderer.getSize(new THREE.Vector2()).toArray() };
}

window.r2 = {
  async load(url, declared, options = {}) {
    active?.dispose();
    currentAsset = null;
    libraryPlayback = null;
    receipt = declared;
    const loadErrors = [];
    errors = loadErrors;
    const manager = new THREE.LoadingManager();
    manager.onError = url => loadErrors.push(url);
    const loader = new GLTFLoader(manager);
    let firstFrame = null;
    const load = createLoad({
      fetchAsset: () => loader.loadAsync(url),
      validate: asset => validate(asset, declared, loadErrors),
      attach(asset) {
        currentAsset = asset;
        scene.add(asset.scene);
        if (declared.kind === 'cs3-library-asset') {
          libraryPlayback = createLibraryPlayback(asset, declared);
          libraryOwners.set(asset, libraryPlayback);
        } else {
          mixer = new THREE.AnimationMixer(asset.scene);
          const action = mixer.clipAction(asset.animations[0]);
          action.setLoop(THREE.LoopOnce, 1);
          action.clampWhenFinished = true;
          action.play();
        }
        firstFrame = draw(declared.captures.portable[0], declared.lighting);
        requireThat(firstFrame.calls > 0 && firstFrame.triangles > 0, 'FIRST_FRAME_EMPTY');
        renderer.getContext().finish();
        attached++;
      },
      release,
      timeoutMs: options.timeoutMs ?? 10000,
    });
    active = load;
    if (options.disposeAfterMs !== undefined) setTimeout(() => load.dispose(), options.disposeAfterMs);
    await load.finished;
    if (active === load) document.getElementById('status').textContent = `${load.state}: ${load.error ?? url}`;
    return { state: load.state, error: load.error, released, attached, errors: [...loadErrors],
      firstFrame: firstFrame ? { calls: firstFrame.calls, triangles: firstFrame.triangles } : null };
  },
  status() {
    return { state: active?.state, error: active?.error, released, attached, errors: [...errors] };
  },
  sample,
  sampleClip(name, time, repeat = false) {
    requireThat(libraryPlayback, 'LIBRARY_NOT_READY');
    return libraryPlayback.sample(name, time, repeat);
  },
  geometry() {
    requireThat(libraryPlayback, 'LIBRARY_NOT_READY');
    return libraryPlayback.geometry();
  },
  view(capture, lighting) {
    requireThat(active.state === 'ready', 'NOT_READY');
    return draw(capture, lighting);
  },
  metadata() {
    const gl = renderer.getContext();
    const extension = gl.getExtension('WEBGL_debug_renderer_info');
    return {
      three: THREE.REVISION, userAgent: navigator.userAgent, dpr: devicePixelRatio,
      outputColorSpace: renderer.outputColorSpace, toneMapping: renderer.toneMapping,
      exposure: renderer.toneMappingExposure,
      renderer: extension ? gl.getParameter(extension.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
      version: gl.getParameter(gl.VERSION),
    };
  },
  async compare(urls, labels = ['Source material / Blender', 'Adapted material / Blender', 'Adapted GLB / Three.js']) {
    requireThat((urls.length === 2 || urls.length === 3) && labels.length === urls.length, 'COMPARE_COLUMNS');
    const images = await Promise.all(urls.map(async url => {
      const image = new Image();
      image.src = url;
      await image.decode();
      requireThat(image.width === 640 && image.height === 360, 'COMPARE_SIZE');
      return image;
    }));
    const canvas = document.createElement('canvas');
    canvas.width = 640;
    canvas.height = 360;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    const arrays = images.map(image => {
      context.clearRect(0, 0, 640, 360);
      context.drawImage(image, 0, 0);
      return context.getImageData(0, 0, 640, 360).data;
    });
    const foreground = arrays.map(data => {
      const mask = new Uint8Array(640 * 360);
      for (let p = 0; p < mask.length; p++) {
        mask[p] = Math.max(...[0, 1, 2].map(c => Math.abs(data[p * 4 + c] - data[c]))) > 10 ? 1 : 0;
      }
      return mask;
    });
    const pairs = (urls.length === 2 ? [[0, 1]] : [[0, 1], [1, 2], [0, 2]]).map(([a, b]) => {
      let absolute = 0;
      let foregroundAbsolute = 0;
      let intersection = 0;
      let union = 0;
      for (let p = 0; p < 640 * 360; p++) {
        const difference = [0, 1, 2].reduce((sum, c) =>
          sum + Math.abs(arrays[a][p * 4 + c] - arrays[b][p * 4 + c]), 0);
        absolute += difference;
        if (foreground[a][p] || foreground[b][p]) {
          union++;
          foregroundAbsolute += difference;
        }
        if (foreground[a][p] && foreground[b][p]) intersection++;
      }
      return { pair: [a, b], meanAbsoluteRgb: absolute / (640 * 360 * 3),
        foregroundMeanAbsoluteRgb: union ? foregroundAbsolute / (union * 3) : null,
        silhouetteIoU: union ? intersection / union : null };
    });
    const counts = foreground.map(mask => mask.reduce((sum, n) => sum + n, 0));
    requireThat(counts.every(n => n >= 100), `BLANK_CAPTURE: ${counts}`);
    canvas.width = 640 * images.length;
    canvas.height = 390;
    context.fillStyle = '#171717';
    context.fillRect(0, 0, canvas.width, 390);
    context.fillStyle = '#ffffff';
    context.font = '16px sans-serif';
    labels.forEach((text, i) => {
      context.fillText(text, i * 640 + 10, 21);
      context.drawImage(images[i], i * 640, 30);
    });
    return { pairs, foregroundPixels: counts, contact: canvas.toDataURL('image/png') };
  },
  dispose() { active?.dispose(); libraryLighting?.dispose(); environment.dispose(); renderer.dispose(); },
};
