import test from 'node:test';
import assert from 'node:assert/strict';
import { assertContent, decode, encode } from './glb.mjs';

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
