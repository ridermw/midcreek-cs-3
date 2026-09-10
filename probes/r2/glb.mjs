import assert from 'node:assert/strict';

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

export function assertContent(document, receipt) {
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
