import * as THREE from 'three';

function requireThat(condition, message) {
  if (!condition) throw new Error(message);
}

function nodesFor(asset, declared) {
  const nodes = new Map();
  asset.scene.traverse(object => {
    const index = asset.parser.associations.get(object)?.nodes;
    if (index === undefined) return;
    requireThat(!nodes.has(index), `DUPLICATE_NODE_INDEX: ${index}`);
    nodes.set(index, object);
  });
  requireThat(nodes.size === declared.nodes.length, 'DECLARED_NODE_COUNT');
  for (const expected of declared.nodes) {
    const object = nodes.get(expected.index);
    requireThat(object?.name === expected.id, `DECLARED_NODE: ${expected.id}`);
    const parent = asset.parser.associations.get(object.parent)?.nodes ?? null;
    requireThat(parent === expected.parent, `PARENT: ${expected.id}`);
  }
  return nodes;
}

export function validateLibrary(asset, declared, errors) {
  requireThat(errors.length === 0, `TEXTURE_LOAD: ${errors.join(', ')}`);
  requireThat(asset.scenes.length === 1 && asset.scene === asset.scenes[0], 'SCENE_COUNT');
  const nodes = nodesFor(asset, declared);
  requireThat(asset.scene.children.length === 1 && asset.scene.children[0] === nodes.get(declared.rootNode),
    'SCENE_ROOT');
  asset.scene.updateMatrixWorld(true);
  for (const expected of declared.nodes) {
    const node = nodes.get(expected.index);
    requireThat(node.scale.toArray().every(v => Math.abs(v - 1) <= 1e-6), `UNIT_SCALE: ${expected.id}`);
    const observed = node.matrix.elements;
    requireThat(observed.every((v, i) => Number.isFinite(v) &&
      Math.abs(v - declared.rest[expected.id].matrix_local[i]) <= 2e-4), `REST_TRANSFORM: ${expected.id}`);
    if (expected.triangles === undefined) continue;
    requireThat(node.isMesh && node.geometry.attributes.position?.count > 0, `DECLARED_MESH: ${expected.id}`);
    requireThat(node.geometry.attributes.uv, `UV_MISSING: ${expected.id}`);
    const materials = [node.material].flat();
    requireThat(JSON.stringify(materials.map(m => m.name).sort()) === JSON.stringify([...expected.materials].sort()),
      `MATERIAL_BINDINGS: ${expected.id}`);
    for (const material of materials) {
      requireThat(material.isMeshStandardMaterial && !material.transparent, `PORTABLE_PBR: ${expected.id}`);
      const map = material.map;
      const texture = declared.textures[0];
      requireThat(map?.image?.width === texture.width && map?.image?.height === texture.height,
        `TEXTURE_READY: ${expected.id}`);
      requireThat(map.name === texture.name, `TEXTURE_IMAGE: ${expected.id}`);
      requireThat(map.colorSpace === THREE.SRGBColorSpace && map.flipY === false, `TEXTURE_COLORSPACE: ${expected.id}`);
    }
  }
  requireThat(asset.animations.length === declared.clips.length, 'CLIP_COUNT');
  const property = { translation: 'position', rotation: 'quaternion', scale: 'scale' };
  for (const expected of declared.clips) {
    const clip = asset.animations.find(c => c.name === expected.name);
    requireThat(clip && Math.abs(clip.duration - expected.duration) <= 1e-5, `CLIP_DURATION: ${expected.name}`);
    const tracks = expected.tracks.map(t => `${nodes.get(t.node).name}.${property[t.path]}`).sort();
    requireThat(JSON.stringify(clip.tracks.map(t => t.name).sort()) === JSON.stringify(tracks),
      `CLIP_TRACKS: ${expected.name}`);
    for (const track of clip.tracks) {
      requireThat([...track.values].every(Number.isFinite), `TRACK_FINITE: ${track.name}`);
      if (track.name.endsWith('.scale')) {
        requireThat([...track.values].every(v => Math.abs(v - 1) <= 1e-6), `ANIMATED_SCALE: ${track.name}`);
      }
    }
  }
}

export function createLibraryPlayback(asset, declared) {
  const nodes = nodesFor(asset, declared);
  const rest = new Map([...nodes].map(([index, node]) => [index,
    { position: node.position.clone(), quaternion: node.quaternion.clone(), scale: node.scale.clone() }]));
  const mixer = new THREE.AnimationMixer(asset.scene);
  function pose() {
    asset.scene.updateMatrixWorld(true);
    return Object.fromEntries(declared.nodes.map(expected => {
      const node = nodes.get(expected.index);
      const entry = { matrix_world: [...node.matrixWorld.elements], matrix_local: [...node.matrix.elements] };
      if (expected.triangles !== undefined) {
        const box = new THREE.Box3().setFromObject(node);
        entry.bounds = [box.min.toArray(), box.max.toArray()];
      }
      return [expected.id, entry];
    }));
  }
  function vertexUvs() {
    return Object.fromEntries(declared.nodes.filter(n => n.triangles !== undefined).map(expected => {
      const geometry = nodes.get(expected.index).geometry;
      const positions = geometry.attributes.position, uv = geometry.attributes.uv;
      requireThat(uv?.count === positions.count, `UV_COUNT: ${expected.id}`);
      return [expected.id, Array.from({ length: positions.count }, (_, i) =>
        [positions.getX(i), positions.getY(i), positions.getZ(i), uv.getX(i), uv.getY(i)])];
    }));
  }
  return {
    sample(clipName, time, repeat = false) {
      mixer.stopAllAction();
      for (const [index, initial] of rest) {
        const node = nodes.get(index);
        node.position.copy(initial.position);
        node.quaternion.copy(initial.quaternion);
        node.scale.copy(initial.scale);
        node.updateMatrix();
      }
      if (clipName !== null) {
        const clip = asset.animations.find(c => c.name === clipName);
        requireThat(clip, `CLIP_NAME: ${clipName}`);
        const action = mixer.clipAction(clip);
        action.reset().setLoop(repeat ? THREE.LoopRepeat : THREE.LoopOnce, repeat ? Infinity : 1);
        action.clampWhenFinished = !repeat;
        action.play();
        mixer.setTime(time);
      }
      return pose();
    },
    geometry() {
      return Object.fromEntries(declared.nodes.filter(n => n.triangles !== undefined).map(expected => {
        const positions = nodes.get(expected.index).geometry.attributes.position;
        return [expected.id, Array.from({ length: positions.count }, (_, i) =>
          [positions.getX(i), positions.getY(i), positions.getZ(i)])];
      }));
    },
    vertexUvs,
    triangleUvs() {
      const vertices = vertexUvs();
      return Object.fromEntries(declared.nodes.filter(n => n.triangles !== undefined).map(expected => {
        const index = nodes.get(expected.index).geometry.index;
        const points = vertices[expected.id], count = index?.count ?? points.length;
        requireThat(count % 3 === 0, `TRIANGLE_INDEX_COUNT: ${expected.id}`);
        return [expected.id, Array.from({ length: count/3 }, (_, triangle) =>
          Array.from({ length: 3 }, (_, corner) => {
            const position = index ? index.getX(triangle*3+corner) : triangle*3+corner;
            requireThat(Number.isInteger(position) && position >= 0 && position < points.length,
              `TRIANGLE_INDEX_RANGE: ${expected.id}`);
            return points[position];
          }))];
      }));
    },
    dispose() { mixer.stopAllAction(); mixer.uncacheRoot(asset.scene); },
  };
}

export function createLibraryLighting(scene, renderer, profile) {
  requireThat(profile.profile === 'cs3-lighting-v1/asset-centered', 'LIGHTING_PROFILE');
  const group = new THREE.Group();
  const sun = new THREE.DirectionalLight(profile.keyColor, profile.keyIntensity);
  sun.position.fromArray(profile.keyPosition);
  sun.target.position.fromArray(profile.keyTarget);
  sun.castShadow = true;
  sun.shadow.mapSize.set(...profile.shadowMap);
  Object.assign(sun.shadow.camera, { left: -12, right: 12, top: 12, bottom: -12, near: 0.1, far: 60 });
  sun.shadow.bias = -0.0001;
  sun.shadow.normalBias = 0.01;
  const fill = new THREE.HemisphereLight(profile.sky, profile.ground, profile.hemisphereIntensity);
  const stage = new THREE.Mesh(new THREE.PlaneGeometry(100, 100),
    new THREE.MeshStandardMaterial({ color: profile.stageColor, roughness: 0.85 }));
  stage.rotation.x = -Math.PI / 2;
  stage.position.y = profile.stageHeight;
  stage.receiveShadow = true;
  group.add(sun, sun.target, fill, stage);
  scene.add(group);
  return {
    view(capture, asset) {
      group.visible = true;
      stage.visible = capture.stage;
      scene.environment = null;
      scene.background = new THREE.Color(profile.background);
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFShadowMap;
      asset.scene.traverse(node => {
        if (node.isMesh) {
          node.castShadow = asset.id !== 'coolant-leak';
          node.receiveShadow = true;
        }
      });
    },
    hide() { group.visible = false; },
    dispose() {
      sun.shadow.map?.dispose();
      stage.geometry.dispose();
      stage.material.dispose();
      group.removeFromParent();
    },
  };
}
