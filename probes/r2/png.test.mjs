import assert from 'node:assert/strict';
import test from 'node:test';
import { crc32, deflateSync } from 'node:zlib';
import { rgbaPixels } from './png.mjs';

function png(rows, colorType = 2) {
  function chunk(type, data) {
    const bytes = Buffer.alloc(data.length + 12);
    bytes.writeUInt32BE(data.length);
    bytes.write(type, 4);
    data.copy(bytes, 8);
    bytes.writeUInt32BE(crc32(bytes.subarray(4, -4)), bytes.length - 4);
    return bytes;
  }
  const header = Buffer.from([0,0,0,2, 0,0,0,2, 8,colorType,0,0,0]);
  return Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), chunk('IHDR', header),
    chunk('IDAT', deflateSync(Buffer.from(rows.flat()))), chunk('IEND', Buffer.alloc(0))]);
}

test('all five PNG filters produce the same top-left RGBA8 pixels', () => {
  const encoded = [
    [[0,10,20,30,60,80,100], [0,20,15,40,90,110,70]],
    [[1,10,20,30,50,60,70], [1,20,15,40,70,95,30]],
    [[2,10,20,30,60,80,100], [2,10,251,10,30,30,226]],
    [[3,10,20,30,55,70,85], [3,15,5,25,50,63,0]],
    [[4,10,20,30,50,60,70], [4,10,251,10,30,30,226]],
  ];
  const expected = Buffer.from([10,20,30,255,60,80,100,255,20,15,40,255,90,110,70,255]);
  for (const rows of encoded) assert.deepEqual(rgbaPixels(png(rows), 2, 2), expected);
});

test('RGBA8 preserves alpha and rejects corrupt, truncated, mismatched or unsupported images', () => {
  const rows = [[0,10,20,30,127,60,80,100,255], [0,20,15,40,0,90,110,70,255]];
  const image = png(rows, 6);
  assert.deepEqual(rgbaPixels(image, 2, 2), Buffer.from(rows.flatMap(row => row.slice(1))));
  assert.throws(() => rgbaPixels(image, 3, 2), /PNG_WIDTH/);
  assert.throws(() => rgbaPixels(image, 2, 3), /PNG_HEIGHT/);
  assert.throws(() => rgbaPixels(image, Infinity, 2), /PNG_SIZE/);
  assert.throws(() => rgbaPixels(image.subarray(0, -1), 2, 2), /PNG_CHUNK/);
  const corrupt = Buffer.from(image);
  corrupt[30] ^= 1;
  assert.throws(() => rgbaPixels(corrupt, 2, 2), /PNG_CRC/);
  assert.throws(() => rgbaPixels(png(rows, 3), 2, 2), /PNG_RGBA8_REQUIRED/);
  assert.throws(() => rgbaPixels(png([[5,...rows[0].slice(1)], rows[1]], 6), 2, 2), /PNG_FILTER/);
  assert.throws(() => rgbaPixels(png([...rows, rows[1]], 6), 2, 2), /larger than/);
});
