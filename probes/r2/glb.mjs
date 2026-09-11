import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { Matrix4, Quaternion, Vector3 } from 'three';
import { rgbaPixels } from './png.mjs';

export function decode(bytes) {
  assert.ok(bytes.length >= 28, 'GLB_HEADER: too short');
  assert.equal(bytes.readUInt32LE(0), 0x46546c67, 'GLB_MAGIC');
  assert.equal(bytes.readUInt32LE(4), 2, 'GLB_VERSION');
  assert.equal(bytes.readUInt32LE(8), bytes.length, 'GLB_LENGTH');
  const length = bytes.readUInt32LE(12);
  assert.equal(bytes.readUInt32LE(16), 0x4e4f534a, 'GLB_JSON');
  const document = JSON.parse(bytes.subarray(20, 20 + length));
  const offset = 20 + length;
  assert.equal(bytes.readUInt32LE(offset + 4), 0x004e4942, 'GLB_BIN');
  const binary = bytes.subarray(offset + 8);
  assert.equal(binary.length, bytes.readUInt32LE(offset), 'GLB_BIN_LENGTH');
  return { document, binary };
}

export function encode(document, binary) {
  let text = Buffer.from(JSON.stringify(document));
  text = Buffer.concat([text, Buffer.alloc((4 - text.length % 4) % 4, 32)]);
  const header = Buffer.alloc(20);
  header.writeUInt32LE(0x46546c67, 0);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(28 + text.length + binary.length, 8);
  header.writeUInt32LE(text.length, 12);
  header.writeUInt32LE(0x4e4f534a, 16);
  const chunk = Buffer.alloc(8);
  chunk.writeUInt32LE(binary.length, 0);
  chunk.writeUInt32LE(0x004e4942, 4);
  return Buffer.concat([header, text, chunk, binary]);
}

export function assertContent(document, receipt, binary) {
  if (receipt.kind === 'cs3-library-asset') return assertLibraryContent(document, receipt, binary);
  const nodes = new Map(document.nodes.map(n => [n.name, n]));
  const expected = receipt.poses[0].objects;
  assert.equal(nodes.size, Object.keys(expected).length, 'DECLARED_NODE_COUNT');
  for (const [name, object] of Object.entries(expected)) {
    assert.ok(nodes.has(name), `DECLARED_NODE: ${name}`);
    const node = nodes.get(name);
    if (object.triangles !== undefined) {
      assert.ok(Number.isInteger(node.mesh), `DECLARED_MESH: ${name}`);
      const primitives = document.meshes[node.mesh].primitives;
      const triangles = primitives.reduce((sum, p) => sum + document.accessors[p.indices].count / 3, 0);
      assert.equal(triangles, object.triangles, `TRIANGLES: ${name}`);
      const bindings = [...new Set(primitives.map(p => document.materials[p.material].name))].sort();
      assert.deepEqual(bindings, [...object.materials].sort(), `MATERIAL_BINDINGS: ${name}`);
    }

    if (object.parent) {
      assert.ok(nodes.get(object.parent).children.includes(document.nodes.indexOf(node)),
        `PARENT: ${name}`);
    }
  }
  assert.equal(document.animations.length, 1, 'CLIP_COUNT');
  assert.equal(document.animations[0].name, receipt.animation.name, 'CLIP_NAME');
  assert.equal(document.images.length, 2, 'TEXTURE_COUNT');
  for (const material of document.materials) {
    const expected = receipt.portable_materials[material.name];
    assert.ok(expected, `UNDECLARED_MATERIAL: ${material.name}`);
    const pbr = material.pbrMetallicRoughness;
    for (const [actual, target, property] of [
      [pbr.metallicFactor ?? 1, expected.metallic, 'metallic'],
      [pbr.roughnessFactor ?? 1, expected.roughness, 'roughness'],
      [material.extensions?.KHR_materials_clearcoat?.clearcoatFactor ?? 0, expected.clearcoat, 'clearcoat'],
    ]) assert.ok(Math.abs(actual - target) < 1e-6, `MATERIAL_${property}: ${material.name}`);
    const target = expected.base_color ?? [1, 1, 1, 1];
    const actual = pbr.baseColorFactor ?? [1, 1, 1, 1];
    assert.ok(actual.every((value, i) => Math.abs(value - target[i]) < 1e-6), `MATERIAL_COLOR: ${material.name}`);
  }
  for (const role of ['Brick', 'Carbon']) {
    const mesh = document.meshes[nodes.get(role).mesh];
    for (const primitive of mesh.primitives) {
      const material = document.materials[primitive.material];
      assert.ok(material.pbrMetallicRoughness.baseColorTexture, `TEXTURE_BINDING: ${role}`);
      const texture = document.textures[material.pbrMetallicRoughness.baseColorTexture.index];
      assert.equal(document.images[texture.source].name, `${role}-base`, `TEXTURE_IMAGE: ${role}`);
      assert.ok('TEXCOORD_0' in primitive.attributes, `UV_MISSING: ${role}`);
    }
  }
}

export function accessorValues(document, binary, index) {
  const accessor = document.accessors[index];
  const size = { SCALAR: 1, VEC3: 3, VEC4: 4 }[accessor?.type];
  assert.ok(size && accessor.componentType === 5126 && !accessor.sparse, 'ANIMATION_ACCESSOR');
  const view = document.bufferViews[accessor.bufferView];
  assert.equal(view.buffer ?? 0, 0, 'ANIMATION_BUFFER');
  const offset = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
  const stride = view.byteStride ?? size * 4;
  assert.ok(Number.isInteger(accessor.count) && accessor.count > 0 && stride >= size * 4, 'ANIMATION_COUNT');
  assert.ok(offset >= 0 && offset + (accessor.count - 1) * stride + size * 4 <= binary.length,
    'ANIMATION_BUFFER_BOUNDS');
  return Array.from({ length: accessor.count }, (_, i) =>
    Array.from({ length: size }, (_, j) => {
      const value = binary.readFloatLE(offset + i * stride + j * 4);
      assert.ok(Number.isFinite(value), 'ANIMATION_FINITE');
      return value;
    }));
}

function assertLibraryContent(document, receipt, binary) {
  assert.equal(document.scenes.length, 1, 'SCENE_COUNT');
  assert.equal(document.scene ?? 0, receipt.sceneIndex, 'DEFAULT_SCENE');
  assert.deepEqual(document.scenes[receipt.sceneIndex].nodes, [receipt.rootNode], 'SCENE_ROOT');
  assert.equal(document.nodes.length, receipt.nodes.length, 'DECLARED_NODE_COUNT');
  assert.equal(new Set(document.nodes.map(n => n.name)).size, document.nodes.length, 'DUPLICATE_NODE');
  assert.equal(document.skins?.length ?? 0, 0, 'SKINS_UNSUPPORTED');
  assert.equal(document.cameras?.length ?? 0, 0, 'CAMERAS_UNSUPPORTED');
  for (const extension of document.extensionsRequired ?? []) {
    assert.ok(receipt.allowedExtensions.includes(extension), `REQUIRED_EXTENSION: ${extension}`);
  }
  for (const extension of document.extensionsUsed ?? []) {
    assert.ok(receipt.allowedExtensions.includes(extension), `MATERIAL_EXTENSION: ${extension}`);
  }
  const parents = new Map();
  document.nodes.forEach((node, index) => {
    for (const child of node.children ?? []) {
      assert.ok(!parents.has(child), 'MULTIPLE_PARENTS');
      parents.set(child, index);
    }
    assert.ok((node.scale ?? [1, 1, 1]).every(v => Number.isFinite(v) && Math.abs(v - 1) <= 1e-6),
      `UNIT_SCALE: ${node.name}`);
    assert.ok(!node.weights && node.skin === undefined, 'MORPH_OR_SKIN');
  });
  let triangles = 0;
  for (const expected of receipt.nodes) {
    const node = document.nodes[expected.index];
    assert.equal(node?.name, expected.id, `DECLARED_NODE: ${expected.id}`);
    assert.equal(parents.get(expected.index) ?? null, expected.parent, `PARENT: ${expected.id}`);
    const translation = node.translation ?? [0, 0, 0];
    const rotation = node.rotation ?? [0, 0, 0, 1];
    const scale = node.scale ?? [1, 1, 1];
    assert.ok(translation.length === 3 && rotation.length === 4 && scale.length === 3 &&
      [...translation, ...rotation, ...scale].every(Number.isFinite), `FINITE_TRANSFORM: ${expected.id}`);
    assert.ok(Math.abs(Math.hypot(...rotation) - 1) <= 1e-6, `UNIT_QUATERNION: ${expected.id}`);
    assert.ok(!node.matrix || (!node.translation && !node.rotation && !node.scale), 'MATRIX_WITH_TRS');
    const matrix = node.matrix ?? new Matrix4().compose(new Vector3(...translation),
      new Quaternion(...rotation), new Vector3(...scale)).elements;
    const rest = receipt.rest[expected.id]?.matrix_local;
    assert.ok(rest?.length === 16 && matrix.length === 16 && matrix.every((value, index) =>
      Number.isFinite(value) && Math.abs(value - rest[index]) <= 2e-4), `REST_TRANSFORM: ${expected.id}`);
    if (expected.triangles === undefined) {
      assert.equal(node.mesh, undefined, `UNDECLARED_MESH: ${expected.id}`);
      continue;
    }
    assert.ok(Number.isInteger(node.mesh), `DECLARED_MESH: ${expected.id}`);
    const primitives = document.meshes[node.mesh].primitives;
    assert.ok(primitives.length > 0, `EMPTY_MESH: ${expected.id}`);
    const count = primitives.reduce((sum, p) => {
      assert.equal(p.mode ?? 4, 4, 'TRIANGLE_MODE');
      assert.ok(Number.isInteger(p.indices) && document.accessors[p.indices].count > 0, 'EMPTY_INDICES');
      assert.ok(Number.isInteger(p.attributes.POSITION), 'POSITION_MISSING');
      assert.ok(Number.isInteger(p.attributes.TEXCOORD_0), `UV_MISSING: ${expected.id}`);
      assert.equal(p.targets?.length ?? 0, 0, 'MORPH_UNSUPPORTED');
      return sum + document.accessors[p.indices].count / 3;
    }, 0);
    assert.equal(count, expected.triangles, `TRIANGLES: ${expected.id}`);
    triangles += count;
    assert.deepEqual([...new Set(primitives.map(p => document.materials[p.material].name))].sort(),
      [...expected.materials].sort(), `MATERIAL_BINDINGS: ${expected.id}`);
  }
  assert.equal(document.meshes.length, receipt.geometry.meshes, 'MESH_COUNT');
  assert.equal(document.meshes.reduce((sum, m) => sum + m.primitives.length, 0),
    receipt.geometry.primitives, 'PRIMITIVE_COUNT');
  assert.equal(triangles, receipt.geometry.triangles, 'TRIANGLE_TOTAL');
  assert.equal(document.materials.length, Object.keys(receipt.materials).length, 'MATERIAL_COUNT');
  for (const material of document.materials) {
    const expected = receipt.materials[material.name];
    assert.ok(expected, `UNDECLARED_MATERIAL: ${material.name}`);
    assert.equal(material.alphaMode ?? 'OPAQUE', 'OPAQUE', 'OPAQUE_MATERIAL');
    const pbr = material.pbrMetallicRoughness;
    assert.ok(pbr.baseColorTexture, 'TEXTURE_BINDING');
    assert.equal(pbr.baseColorTexture.texCoord ?? 0, 0, 'TEXTURE_UV_SET');
    const texture = document.textures[pbr.baseColorTexture.index];
    assert.equal(document.images[texture.source].name, receipt.textures[0].name, 'TEXTURE_IMAGE');
    assert.ok((pbr.baseColorFactor ?? [1, 1, 1, 1]).every((value, index) =>
      Math.abs(value - (expected.base_color ?? [1, 1, 1, 1])[index]) <= 1e-6), `MATERIAL_COLOR: ${material.name}`);
    for (const [actual, target] of [[pbr.roughnessFactor ?? 1, expected.roughness],
      [pbr.metallicFactor ?? 1, expected.metallic]]) {
      assert.ok(Math.abs(actual - target) <= 1e-6, `MATERIAL_FACTOR: ${material.name}`);
    }
  }
  assert.equal(document.images.length, receipt.textures.length, 'TEXTURE_COUNT');
  for (const image of document.images) {
    assert.ok(Number.isInteger(image.bufferView) && !image.uri, 'EMBEDDED_IMAGE_REQUIRED');
    assert.equal(image.mimeType, 'image/png', 'IMAGE_TYPE');
    const texture = receipt.textures.find(t => t.name === image.name);
    assert.match(texture?.pixelSha256 ?? '', /^[a-f0-9]{64}$/, 'TEXTURE_PIXEL_IDENTITY');
    const view = document.bufferViews[image.bufferView];
    const offset = view.byteOffset ?? 0;
    assert.ok((view.buffer ?? 0) === 0 && Number.isInteger(offset) && offset >= 0 &&
      Number.isInteger(view.byteLength) && view.byteLength > 0 &&
      offset + view.byteLength <= binary.length, 'IMAGE_BUFFER_BOUNDS');
    const pixels = rgbaPixels(binary.subarray(offset, offset + view.byteLength), texture.width, texture.height);
    assert.equal(createHash('sha256').update(pixels).digest('hex'), texture.pixelSha256, 'TEXTURE_PIXELS');
  }
  assert.ok(document.buffers.every(b => !b.uri), 'EXTERNAL_BUFFER');
  const animations = document.animations ?? [];
  assert.deepEqual(animations.map(a => a.name).sort(), receipt.clips.map(c => c.name).sort(), 'CLIP_NAMES');
  for (const clip of receipt.clips) {
    const animation = animations.find(a => a.name === clip.name);
    const tracks = animation.channels.map(c => ({ node: c.target.node, path: c.target.path }));
    const key = t => `${t.node}/${t.path}`;
    assert.deepEqual(tracks.map(key).sort(), clip.tracks.map(key).sort(), `CLIP_TRACKS: ${clip.name}`);
    assert.equal(new Set(tracks.map(key)).size, tracks.length, 'DUPLICATE_TRACK');
    for (const channel of animation.channels) {
      assert.notEqual(channel.target.node, receipt.rootNode, 'ROOT_MOTION');
      assert.ok(['translation', 'rotation', 'scale'].includes(channel.target.path), 'TRACK_PATH');
      const sampler = animation.samplers[channel.sampler];
      assert.equal(sampler.interpolation ?? 'LINEAR', 'LINEAR', 'TRACK_INTERPOLATION');
      const times = accessorValues(document, binary, sampler.input).flat();
      const values = accessorValues(document, binary, sampler.output);
      assert.equal(times.length, clip.frames[1] - clip.frames[0] + 1, 'KEYFRAME_COUNT');
      assert.equal(values.length, times.length, 'TRACK_VALUE_COUNT');
      times.forEach((t, index) => assert.ok(Math.abs(t - index / clip.fps) <= 1e-5, 'CLIP_TIME'));
      assert.ok(Math.abs(times.at(-1) - clip.duration) <= 1e-5, 'CLIP_DURATION');
      if (channel.target.path === 'scale') {
        assert.ok(values.flat().every(v => Math.abs(v - 1) <= 1e-6), 'ANIMATED_SCALE');
      }
      assert.ok(values[0].every((v, i) => Math.abs(v - values.at(-1)[i]) <= 1e-6), 'LOOP_END_POSE');
    }
  }
}

export function assertVertexAgreement(actual, expected, tolerance = 2e-4) {
  assert.ok(actual.length && expected.length, 'EMPTY_VERTEX_SET');
  const compare = (from, to) => {
    let maximum = 0;
    for (const point of from) {
      assert.ok(point.length === 3 && point.every(Number.isFinite), 'FINITE_VERTEX');
      let nearest = Infinity;
      for (const target of to) {
        const error = Math.max(...point.map((v, i) => Math.abs(v - target[i])));
        if (error < nearest) nearest = error;
        if (nearest === 0) break;
      }
      assert.ok(nearest <= tolerance, `VERTEX_AGREEMENT: ${nearest}`);
      maximum = Math.max(maximum, nearest);
    }
    return maximum;
  };
  return Math.max(compare(actual, expected), compare(expected, actual));
}
