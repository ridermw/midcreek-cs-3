import test from 'node:test';
import assert from 'node:assert/strict';
import { createLoad } from './lifecycle.mjs';

test('late real-resource equivalent is released after disposal, never attached', async () => {
  let resolve;
  let released = 0;
  let attached = 0;
  const resource = {};
  const load = createLoad({
    fetchAsset: () => new Promise(r => { resolve = r; }),
    validate: () => {},
    attach: () => { attached++; },
    release: r => { assert.equal(r, resource); released++; },
    timeoutMs: 1000,
  });
  load.dispose();
  resolve(resource);
  await load.finished;
  assert.equal(load.state, 'disposed');
  assert.equal(released, 1);
  assert.equal(attached, 0);
});

test('contract failure is explicit and releases invalid asset', async () => {
  let released = 0;
  const load = createLoad({
    fetchAsset: async () => ({}),
    validate: () => { throw new Error('DECLARED_NODE: Sign'); },
    attach: () => assert.fail('must not attach'),
    release: () => { released++; },
    timeoutMs: 1000,
  });
  await load.finished;
  assert.equal(load.state, 'failed');
  assert.match(load.error, /DECLARED_NODE/);
  assert.equal(released, 1);
});

test('timeout cannot become ready on late completion', async () => {
  let resolve;
  let released = 0;
  const load = createLoad({
    fetchAsset: () => new Promise(r => { resolve = r; }),
    validate: () => assert.fail('late validation'),
    attach: () => assert.fail('late attachment'),
    release: () => { released++; },
    timeoutMs: 5,
  });
  await new Promise(r => setTimeout(r, 15));
  assert.equal(load.state, 'failed');
  assert.match(load.error, /LOAD_TIMEOUT/);
  resolve({});
  await load.finished;
  assert.equal(load.state, 'failed');
  assert.equal(released, 1);
});

test('first-frame attachment failure remains failed and releases the candidate', async () => {
  let released = 0;
  const load = createLoad({
    fetchAsset: async () => ({}),
    validate: () => {},
    attach: () => { throw new Error('FIRST_FRAME_FAILED'); },
    release: () => { released++; },
    timeoutMs: 1000,
  });
  await load.finished;
  assert.equal(load.state, 'failed');
  assert.match(load.error, /FIRST_FRAME_FAILED/);
  assert.equal(released, 1);
});
