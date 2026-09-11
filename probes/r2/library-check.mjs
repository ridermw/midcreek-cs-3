import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { chromium } from 'playwright';
import validator from 'gltf-validator';
import { assertContent, assertVertexAgreement, assertVertexUvAgreement, assertTriangleUvAgreement, decode, encode } from './glb.mjs';

const hash = bytes => createHash('sha256').update(bytes).digest('hex');
function closeEnough(actual, expected, label, tolerance = 2e-4) {
  const a = actual.flat(Infinity), b = expected.flat(Infinity);
  assert.equal(a.length, b.length, label);
  const error = Math.max(...a.map((value, index) => Math.abs(value - b[index])));
  assert.ok(error <= tolerance, `${label}: ${error}`);
  return error;
}
function checkPose(actual, expected, label) {
  let maximum = 0;
  for (const [name, node] of Object.entries(expected)) {
    assert.ok(actual[name], `MISSING_POSE_NODE: ${name}`);
    maximum = Math.max(maximum, closeEnough(actual[name].matrix_world, node.matrix_world, `${label}/${name}/world`));
    maximum = Math.max(maximum, closeEnough(actual[name].matrix_local, node.matrix_local, `${label}/${name}/local`));
    if (node.bounds) maximum = Math.max(maximum, closeEnough(actual[name].bounds, node.bounds, `${label}/${name}/bounds`));
  }
  return maximum;
}

export async function checkLibrary({ receipt, run, tag, code, result, check, ownBrowser, ownServer, captureDirectory }) {
  const sourceViews = path.resolve(captureDirectory ?? path.join(run, 'source-views'));
  const captureBytes = await fs.readFile(path.join(sourceViews, 'captures.json'));
  const source = JSON.parse(captureBytes);
  assert.ok(receipt.complete && source.complete, 'COMPLETE_SOURCE_REQUIRED');
  assert.equal(source.sourceSha256, receipt.sourceSha256, 'CAPTURE_SOURCE_IDENTITY');
  assert.equal(source.authoringReceiptSha256, receipt.authoringReceiptSha256, 'CAPTURE_AUTHORING_IDENTITY');
  assert.equal(source.builderSha256, receipt.inputs['blender/build_library.py'], 'CAPTURE_BUILDER_IDENTITY');
  assert.equal(source.exportSha256, hash(await fs.readFile(path.join(path.dirname(sourceViews), 'export.json'))),
    'CAPTURE_EXPORT_IDENTITY');
  result.kind = 'cs3-library-checks';
  result.source = receipt.sourceSha256;
  result.exportReceiptSha256 = hash(await fs.readFile(path.join(run, 'export.json')));
  result.captureReceiptSha256 = hash(captureBytes);
  result.profile = source.profile;
  result.lighting = source.lighting;
  result.versions.blender = receipt.blender;
  result.versions.blenderBuild = receipt.blenderBuild;
  result.code = {};
  for (const file of ['check.mjs', 'library-check.mjs', 'browser.mjs', 'library-browser.mjs',
    'glb.mjs', 'png.mjs', 'lifecycle.mjs', 'package.json', 'package-lock.json']) {
    result.code[file] = hash(await fs.readFile(path.join(code, file)));
  }
  const files = new Map([
    ['/', path.join(code, 'probe.html')],
    ...['browser.mjs', 'library-browser.mjs', 'lifecycle.mjs'].map(file => [`/${file}`, path.join(code, file)]),
  ]);
  const payloads = new Map();
  const assets = new Map();
  for (const asset of receipt.assets) {
    assert.equal(path.basename(asset.file), asset.file, 'ASSET_PATH');
    const bytes = await fs.readFile(path.join(run, asset.file));
    assert.equal(hash(bytes), asset.sha256, `ASSET_HASH: ${asset.id}`);
    assert.equal(bytes.length, asset.bytes, `ASSET_BYTES: ${asset.id}`);
    const decoded = decode(bytes);
    assets.set(asset.id, decoded);
    payloads.set(`/assets/${asset.file}`, bytes);
    await check(`${asset.id}: declared nodes, rest, materials, embedded texture and actual binary animation`, () =>
      assertContent(decoded.document, asset, decoded.binary));
    await check(`${asset.id}: Khronos zero errors`, async () => {
      const report = await validator.validateBytes(new Uint8Array(bytes), { uri: asset.file });
      await fs.writeFile(path.join(run, `${tag}-validator-${asset.id}.json`), JSON.stringify(report, null, 2), { flag: 'wx' });
      assert.equal(report.issues.numErrors, 0, JSON.stringify(report.issues));
      return report.issues;
    });
  }
  for (const capture of source.captures) {
    assert.equal(path.basename(capture.file), capture.file, 'CAPTURE_PATH');
    const file = path.join(sourceViews, capture.file);
    assert.equal(hash(await fs.readFile(file)), capture.sha256, 'CAPTURE_HASH');
    files.set(`/capture/${capture.file}`, file);
  }
  const network = [];
  const server = http.createServer(async (request, response) => {
    const pathname = new URL(request.url, 'http://127.0.0.1').pathname;
    network.push(pathname);
    const payload = payloads.get(pathname);
    if (payload) { response.setHeader('Content-Type', 'model/gltf-binary'); response.end(payload); return; }
    let file = files.get(pathname);
    if (pathname.startsWith('/three/')) {
      const module = pathname.slice('/three/'.length);
      if (!module.split('/').includes('..') && /^(build|examples\/jsm)\//.test(module)) {
        file = path.join(code, 'node_modules/three', module);
      }
    }
    if (!file) { response.writeHead(404); response.end('MISSING_ASSET'); return; }
    try {
      const bytes = await fs.readFile(file);
      response.setHeader('Content-Type', file.endsWith('.html') ? 'text/html' :
        file.endsWith('.png') ? 'image/png' : 'text/javascript');
      response.end(bytes);
    } catch (error) { response.writeHead(500); response.end(`SERVER_READ_FAILED: ${error.code}`); }
  });
  ownServer(server);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  assert.equal((await fetch(origin)).status, 200, 'SERVER_READINESS');
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  ownBrowser(browser);
  result.versions.browser = browser.version();
  const page = await browser.newPage({ viewport: { width: 640, height: 360 }, deviceScaleFactor: 1 });
  const external = [], warnings = [];
  await page.route('**/*', route => {
    const url = route.request().url();
    if (url.startsWith(`${origin}/`) || url.startsWith('blob:') || url.startsWith('data:')) return route.continue();
    external.push(url);
    return route.abort('blockedbyclient');
  });
  page.on('pageerror', error => warnings.push(`PAGE_ERROR: ${error.message}`));
  page.on('console', message => { if (['error', 'warning'].includes(message.type())) warnings.push(message.text()); });
  await page.goto(origin);
  await page.waitForFunction(() => window.r2);
  result.renderer = await page.evaluate(() => window.r2.metadata());
  for (const asset of receipt.assets) {
    const captures = source.captures.filter(c => c.asset === asset.id);
    const declared = { ...asset, captures: { portable: captures }, lighting: source.lighting };
    await check(`${asset.id}: real GLTFLoader readiness and texture color roles`, async () => {
      const state = await page.evaluate(({ declared, url }) => window.r2.load(url, declared),
        { declared, url: `/assets/${asset.file}` });
      assert.equal(state.state, 'ready', JSON.stringify(state));
      assert.ok(state.firstFrame.calls > 0 && state.firstFrame.triangles > 0, 'FIRST_FRAME');
      result.renderer = await page.evaluate(() => window.r2.metadata());
      return state;
    });
    await check(`${asset.id}: converted evaluated source vertices, UV pairing and rest matrices`, async () => {
      const observed = await page.evaluate(() => ({ geometry: window.r2.geometry(),
        vertexUvs: window.r2.vertexUvs(), triangleUvs: window.r2.triangleUvs(),
        rest: window.r2.sampleClip(null, 0) }));
      const restError = checkPose(observed.rest, asset.rest, 'rest');
      const vertices = {}, vertexUvs = {}, triangleUvs = {};
      assert.ok(asset.geometry.vertexUvs, 'SOURCE_VERTEX_UV_DECLARATION');
      assert.ok(asset.geometry.triangleUvs, 'SOURCE_TRIANGLE_UV_DECLARATION');
      for (const [name, positions] of Object.entries(asset.geometry.vertices)) {
        vertices[name] = assertVertexAgreement(observed.geometry[name], positions);
        vertexUvs[name] = assertVertexUvAgreement(observed.vertexUvs[name], asset.geometry.vertexUvs[name]);
        triangleUvs[name] = assertTriangleUvAgreement(observed.triangleUvs[name], asset.geometry.triangleUvs[name]);
      }
      return { restError, vertices, vertexUvs, triangleUvs };
    });
    for (const clip of asset.clips) {
      await check(`${asset.id}/${clip.name}: every key and midpoint agrees with actual source action`, async () => {
        const poses = await page.evaluate(({ name, times }) => times.map(time => window.r2.sampleClip(name, time)),
          { name: clip.name, times: clip.samples.map(s => s.time) });
        let maximum = 0;
        clip.samples.forEach((sample, index) => { maximum = Math.max(maximum,
          checkPose(poses[index], sample.objects, `${clip.name}/${sample.frame}`)); });
        const loop = await page.evaluate(({ name, duration }) => [
          window.r2.sampleClip(name, duration - 1 / 60, true),
          window.r2.sampleClip(name, duration + 1 / 60, true),
        ], { name: clip.name, duration: clip.duration });
        for (const [index, time] of [clip.duration - 1 / 60, 1 / 60].entries()) {
          const expected = clip.samples.find(s => Math.abs(s.time - time) < 1e-6);
          assert.ok(expected, 'LOOP_SOURCE_SAMPLE');
          maximum = Math.max(maximum, checkPose(loop[index], expected.objects, `${clip.name}/loop`));
        }
        return { samples: clip.samples.length, maximumError: maximum, loopBoundaryChecked: true };
      });
    }
    await check(`${asset.id}: matched Blender/GLB captures`, async () => {
      for (const capture of captures) {
        const info = await page.evaluate(({ capture, lighting }) => window.r2.view(capture, lighting),
          { capture, lighting: source.lighting });
        closeEnough(info.camera, capture.camera.matrix_world, 'MATCHED_CAMERA', 1e-7);
        assert.deepEqual(info.renderer, [640, 360]);
        const expected = capture.clip === null ? asset.rest :
          asset.clips.find(c => c.name === capture.clip).samples.find(s => Math.abs(s.time - capture.sourceTime) < 1e-6)?.objects;
        assert.ok(expected, 'CAPTURE_SOURCE_POSE');
        checkPose(info.pose, expected, capture.label);
        const file = `${tag}-${asset.id}-${capture.label}.png`;
        await page.locator('canvas').screenshot({ path: path.join(run, file) });
        files.set(`/capture/${file}`, path.join(run, file));
        const compared = await page.evaluate(({ urls, labels }) => window.r2.compare(urls, labels), {
          urls: [`/capture/${capture.file}`, `/capture/${file}`],
          labels: ['Authored portable PBR / Blender', 'Exported GLB / Three.js'],
        });
        const contact = `${tag}-comparison-${asset.id}-${capture.label}.png`;
        await fs.writeFile(path.join(run, contact), Buffer.from(compared.contact.split(',')[1], 'base64'), { flag: 'wx' });
        delete compared.contact;
        result.captures.push({ file, sha256: hash(await fs.readFile(path.join(run, file))),
          contact, contactSha256: hash(await fs.readFile(path.join(run, contact))),
          source: capture.file, clip: capture.clip, time: capture.time, profile: capture.profile,
          camera: info.camera, viewport: info.renderer,
          renderer: { ...result.renderer, toneMapping: info.toneMapping, exposure: info.exposure },
          lighting: source.lighting, comparison: compared });
      }
      return { views: captures.length, appearanceAcceptance: 'not decided by numeric comparison' };
    });
  }
  const actor = receipt.assets.find(a => a.id === 'technician-man');
  const decoded = assets.get(actor.id);
  for (const [label, mutate] of [
    ['missing-rest', d => { delete d.nodes[actor.nodes.find(n => n.id === 'FootL').index].translation; }],
    ['missing-uv', d => { delete d.meshes[0].primitives[0].attributes.TEXCOORD_0; }],
    ['missing-clip', d => { d.animations.pop(); }],
  ]) {
    const changed = structuredClone(decoded.document);
    mutate(changed);
    payloads.set(`/bad/${label}.glb`, encode(changed, decoded.binary));
    await check(`real loader rejects ${label} without attachment`, async () => {
      const before = await page.evaluate(() => window.r2.status());
      const state = await page.evaluate(({ actor, url, captures, lighting }) =>
        window.r2.load(url, { ...actor, captures: { portable: captures }, lighting }), {
        actor, url: `/bad/${label}.glb`, captures: source.captures.filter(c => c.asset === actor.id), lighting: source.lighting,
      });
      assert.equal(state.state, 'failed', JSON.stringify(state));
      assert.ok(state.error);
      assert.equal(state.attached, before.attached, 'FAILED_LOAD_ATTACHED');
      return state;
    });
  }
  assert.deepEqual(external, [], 'EXTERNAL_REQUEST');
  assert.ok(!warnings.some(w => w.startsWith('PAGE_ERROR')), 'UNCAUGHT_BROWSER_ERROR');
  result.network = network;
  result.blockedExternal = external;
  result.browserWarnings = warnings;
  await page.evaluate(() => window.r2.dispose());
  result.complete = true;
}
