import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { crc32, deflateSync } from 'node:zlib';
import { assertContent, assertVertexAgreement, decode, encode } from './glb.mjs';

function pngFixture(color = [31, 97, 193]) {
  function chunk(type, data) {
    const name = Buffer.from(type);
    const result = Buffer.alloc(data.length + 12);
    result.writeUInt32BE(data.length);
    name.copy(result, 4);
    data.copy(result, 8);
    result.writeUInt32BE(crc32(Buffer.concat([name, data])), data.length + 8);
    return result;
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(2);
  header.writeUInt32BE(2, 4);
  header[8] = 8;
  header[9] = 2;
  const rgba = Buffer.from([...color, 255, ...color, 255, ...color, 255, ...color, 255]);
  return {
    png: Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), chunk('IHDR', header),
      chunk('IDAT', deflateSync(Buffer.from([0, ...color, ...color, 0, ...color, ...color]))),
      chunk('IEND', Buffer.alloc(0))]),
    pixelSha256: createHash('sha256').update(rgba).digest('hex'),
  };
}

function fixture() {
  const document = {
    nodes: [{ name: 'Brick', mesh: 0 }, { name: 'Carbon', mesh: 1 }],
    meshes: [0, 1].map(material => ({
      primitives: [{ indices: 0, material, attributes: { TEXCOORD_0: 1 } }],
    })),
    accessors: [{ count: 3 }],
    materials: ['BrickMaterial', 'CarbonMaterial'].map((name, index) => ({
      name, pbrMetallicRoughness: { baseColorTexture: { index } },
    })),
    animations: [{ name: 'Probe' }],
    images: [{ name: 'Brick-base' }, { name: 'Carbon-base' }],
    textures: [{ source: 0 }, { source: 1 }],
  };
  const receipt = {
    poses: [{ objects: Object.fromEntries(['Brick', 'Carbon'].map(name =>
      [name, { triangles: 1, materials: [`${name}Material`] }])) }],
    animation: { name: 'Probe' },
    portable_materials: Object.fromEntries(['BrickMaterial', 'CarbonMaterial'].map(name =>
      [name, { metallic: 1, roughness: 1, clearcoat: 0, base_color: null }])),
  };
  return { document, receipt };
}

test('GLB encoding roundtrip validates header and binary chunk', () => {
  const document = { asset: { version: '2.0' } };
  const binary = Buffer.from([1, 2, 3, 4]);
  assert.deepEqual(decode(encode(document, binary)), { document, binary });
});

test('corrupt or truncated GLBs are rejected', () => {
  assert.throws(() => decode(Buffer.from('invalid')), /GLB_HEADER/);
  const bytes = encode({}, Buffer.alloc(4));
  bytes.writeUInt32LE(0, 0);
  assert.throws(() => decode(bytes), /GLB_MAGIC/);
  const truncated = encode({}, Buffer.alloc(4)).subarray(0, 28);
  assert.throws(() => decode(truncated), /GLB_LENGTH/);
});

test('declared content rejects missing node, mesh, material binding, UV, texture and clip', () => {
  const mutations = [
    d => { d.nodes[0].name = 'Wrong'; },
    d => { delete d.nodes[0].mesh; },
    d => { d.materials[0].name = 'Wrong'; },
    d => { delete d.meshes[0].primitives[0].attributes.TEXCOORD_0; },
    d => { delete d.materials[0].pbrMetallicRoughness.baseColorTexture; },
    d => { d.animations[0].name = 'Wrong'; },
    d => { d.textures[0].source = 1; },
  ];
  const good = fixture();
  assert.doesNotThrow(() => assertContent(good.document, good.receipt));
  for (const mutate of mutations) {
    const { document, receipt } = fixture();
    mutate(document);
    assert.throws(() => assertContent(document, receipt));
  }
});

function libraryFixture() {
  const image = pngFixture();
  const chunks = [Buffer.concat([image.png, Buffer.alloc((4 - image.png.length % 4) % 4)])];
  const document = {
    scene: 0, scenes: [{ nodes: [0] }],
    nodes: [{ name: 'Root', children: [1] }, { name: 'Limb', mesh: 0 }],
    meshes: [{ primitives: [{ indices: 0, material: 0, attributes: { POSITION: 1, TEXCOORD_0: 2 } }] }],
    accessors: [{ count: 3 }, { count: 3 }, { count: 3 }],
    bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: image.png.length }],
    buffers: [{}],
    materials: [{ name: 'Palette', pbrMetallicRoughness: {
      baseColorTexture: { index: 0 }, metallicFactor: 0, roughnessFactor: 0.8,
    } }],
    textures: [{ source: 0 }], images: [{ name: 'CS3-Palette', bufferView: 0, mimeType: 'image/png' }],
    animations: [],
  };
  const receipt = {
    kind: 'cs3-library-asset', rootNode: 0, sceneIndex: 0, allowedExtensions: [],
    nodes: [{ id: 'Root', index: 0, parent: null, materials: [] },
      { id: 'Limb', index: 1, parent: 0, materials: ['Palette'], triangles: 1 }],
    geometry: { meshes: 1, primitives: 1, triangles: 1 },
    materials: { Palette: { metallic: 0, roughness: 0.8 } },
    textures: [{ name: 'CS3-Palette', width: 2, height: 2, pixelSha256: image.pixelSha256 }], clips: [],
    rest: Object.fromEntries(['Root', 'Limb'].map(name => [name, {
      matrix_local: [1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1],
    }])),
  };
  function accessor(values, type, size) {
    const bytes = Buffer.alloc(values.length * 4);
    values.forEach((value, index) => bytes.writeFloatLE(value, index * 4));
    const view = document.bufferViews.length;
    document.bufferViews.push({ buffer: 0, byteOffset: chunks.reduce((sum, b) => sum + b.length, 0),
      byteLength: bytes.length });
    chunks.push(bytes);
    document.accessors.push({ type, componentType: 5126, count: values.length / size, bufferView: view });
    return document.accessors.length - 1;
  }
  for (const [name, frames] of [['Idle', 61], ['Walk', 31], ['Repair', 61]]) {
    const input = accessor(Array.from({ length: frames }, (_, i) => i / 30), 'SCALAR', 1);
    const output = accessor(Array.from({ length: frames }, (_, i) =>
      [Math.sin(i / (frames - 1) * Math.PI * 2), 0, 0]).flat(), 'VEC3', 3);
    document.animations.push({ name, samplers: [{ input, output, interpolation: 'LINEAR' }],
      channels: [{ sampler: 0, target: { node: 1, path: 'translation' } }] });
    receipt.clips.push({ name, frames: [1, frames], fps: 30, duration: (frames - 1) / 30,
      tracks: [{ node: 1, path: 'translation' }] });
  }
  return { document, receipt, binary: Buffer.concat(chunks) };
}

test('parameterized library content validates three clips without changing the R2 single-clip case', () => {
  const { document, receipt, binary } = libraryFixture();
  assert.doesNotThrow(() => assertContent(document, receipt, binary));
  for (const change of [
    d => { d.scenes.push({ nodes: [0] }); },
    d => { d.nodes[1].name = 'Missing'; },
    d => { d.nodes[0].children = []; },
    d => { d.nodes[0].scale = [0.01, 0.01, 0.01]; },
    d => { d.meshes[0].primitives = []; },
    d => { delete d.meshes[0].primitives[0].attributes.TEXCOORD_0; },
    d => { d.materials[0].name = 'Wrong'; },
    d => { d.images[0].uri = 'missing.png'; },
    d => { d.extensionsRequired = ['UNREVIEWED_extension']; },
    d => { d.skins = [{}]; },
    d => { d.animations.pop(); },
    d => { d.animations[0].name = 'Untitled'; },
    d => { d.animations[0].channels[0].target.node = 0; },
    d => { d.animations[0].samplers[0].interpolation = 'CUBICSPLINE'; },
  ]) {
    const changed = structuredClone(document);
    change(changed);
    assert.throws(() => assertContent(changed, receipt, binary));
  }
});

test('library animation reads actual binary times, values and duplicate end keys', () => {
  const { document, receipt, binary } = libraryFixture();
  const time = document.accessors[document.animations[0].samplers[0].input];
  const offset = document.bufferViews[time.bufferView].byteOffset;
  const invalidTime = Buffer.from(binary);
  invalidTime.writeFloatLE(5, offset + (time.count - 1) * 4);
  assert.throws(() => assertContent(document, receipt, invalidTime), /CLIP_TIME/);
  const output = document.accessors[document.animations[0].samplers[0].output];
  const valueOffset = document.bufferViews[output.bufferView].byteOffset;
  const invalidEnd = Buffer.from(binary);
  invalidEnd.writeFloatLE(0.5, valueOffset + (output.count - 1) * 12);
  assert.throws(() => assertContent(document, receipt, invalidEnd), /LOOP_END_POSE/);
  const nonfinite = Buffer.from(binary);
  nonfinite.writeFloatLE(NaN, valueOffset);
  assert.throws(() => assertContent(document, receipt, nonfinite), /ANIMATION_FINITE/);
});

test('library content rejects missing rest offsets before an animation can conceal them', () => {
  const { document, receipt, binary } = libraryFixture();
  receipt.rest.Limb.matrix_local[13] = -0.425;
  assert.throws(() => assertContent(document, receipt, binary), /REST_TRANSFORM/);
  document.nodes[1].translation = [0, -0.425, 0];
  assert.doesNotThrow(() => assertContent(document, receipt, binary));
  document.nodes[0].translation = [4, 0, 0];
  assert.throws(() => assertContent(document, receipt, binary), /REST_TRANSFORM/);
});

test('library rejects a different embedded image with the same name and dimensions', () => {
  const { document, receipt, binary } = libraryFixture();
  const wrong = pngFixture([255, 0, 255]).png;
  document.images[0].bufferView = document.bufferViews.length;
  document.bufferViews.push({ buffer: 0, byteOffset: binary.length, byteLength: wrong.length });
  assert.throws(() => assertContent(document, receipt, Buffer.concat([binary, wrong])), /TEXTURE_PIXELS/);
});

test('evaluated vertex agreement allows export duplication/order, not missing or displaced positions', () => {
  const source = [[0, 0, 0], [1, 2, 3], [-1, 0, 1]];
  assert.equal(assertVertexAgreement([source[2], source[0], source[1], source[0]], source), 0);
  assert.throws(() => assertVertexAgreement(source.slice(1), source), /VERTEX_AGREEMENT/);
  assert.throws(() => assertVertexAgreement([[0.01, 0, 0], ...source.slice(1)], source), /VERTEX_AGREEMENT/);
  assert.throws(() => assertVertexAgreement([[NaN, 0, 0]], source), /FINITE_VERTEX/);
  assert.throws(() => assertVertexAgreement([], source), /EMPTY_VERTEX_SET/);
});
