import assert from 'node:assert/strict';
import { crc32, inflateSync } from 'node:zlib';

// The authored library uses non-interlaced RGB/RGBA8 PNGs, not arbitrary PNG formats.
export function rgbaPixels(bytes, width, height) {
  assert.ok(Number.isInteger(width) && width > 0 && Number.isInteger(height) && height > 0 &&
    width * height <= 4_194_304, 'PNG_SIZE');
  assert.equal(bytes.subarray(0, 8).toString('hex'), '89504e470d0a1a0a', 'PNG_SIGNATURE');
  const compressed = [];
  let channels;
  let ended = false;
  let offset = 8;
  while (offset < bytes.length) {
    assert.ok(offset + 12 <= bytes.length, 'PNG_CHUNK');
    const length = bytes.readUInt32BE(offset);
    const end = offset + 12 + length;
    assert.ok(end <= bytes.length, 'PNG_CHUNK');
    const type = bytes.toString('ascii', offset + 4, offset + 8);
    const data = bytes.subarray(offset + 8, end - 4);
    assert.equal(crc32(bytes.subarray(offset + 4, end - 4)), bytes.readUInt32BE(end - 4), 'PNG_CRC');
    if (type === 'IHDR') {
      assert.ok(offset === 8 && length === 13, 'PNG_IHDR');
      assert.equal(data.readUInt32BE(0), width, 'PNG_WIDTH');
      assert.equal(data.readUInt32BE(4), height, 'PNG_HEIGHT');
      assert.ok(data[8] === 8 && [2, 6].includes(data[9]) &&
        data[10] === 0 && data[11] === 0 && data[12] === 0, 'PNG_RGBA8_REQUIRED');
      channels = data[9] === 2 ? 3 : 4;
    } else if (type === 'IDAT') {
      assert.ok(channels, 'PNG_IHDR_REQUIRED');
      compressed.push(data);
    } else if (type === 'IEND') {
      assert.ok(length === 0 && end === bytes.length, 'PNG_IEND');
      ended = true;
    } else {
      assert.ok(type !== 'tRNS' && /^[a-z]/.test(type), 'PNG_UNSUPPORTED_CHUNK');
    }
    offset = end;
  }
  assert.ok(ended && channels && compressed.length > 0, 'PNG_INCOMPLETE');
  const stride = width * channels;
  const filtered = inflateSync(Buffer.concat(compressed), { maxOutputLength: (stride + 1) * height });
  assert.equal(filtered.length, (stride + 1) * height, 'PNG_SCANLINES');
  const decoded = Buffer.alloc(stride * height);
  const rgba = Buffer.alloc(width * height * 4, 255);
  for (let y = 0; y < height; y++) {
    const filter = filtered[y * (stride + 1)];
    assert.ok(filter <= 4, 'PNG_FILTER');
    for (let x = 0; x < stride; x++) {
      const index = y * stride + x;
      const left = x >= channels ? decoded[index - channels] : 0;
      const above = y > 0 ? decoded[index - stride] : 0;
      const upperLeft = y > 0 && x >= channels ? decoded[index - stride - channels] : 0;
      let predictor = 0;
      if (filter === 1) predictor = left;
      if (filter === 2) predictor = above;
      if (filter === 3) predictor = Math.floor((left + above) / 2);
      if (filter === 4) {
        const p = left + above - upperLeft;
        const a = Math.abs(p - left), b = Math.abs(p - above), c = Math.abs(p - upperLeft);
        predictor = a <= b && a <= c ? left : b <= c ? above : upperLeft;
      }
      decoded[index] = (filtered[y * (stride + 1) + 1 + x] + predictor) & 255;
    }
  }
  for (let i = 0; i < width * height; i++) {
    decoded.copy(rgba, i * 4, i * channels, i * channels + channels);
  }
  return rgba;
}
