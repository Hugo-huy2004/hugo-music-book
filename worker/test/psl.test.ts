import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyTau, candidatesFor } from '../src/psl.ts';

// Số liệu đo thật (nguồn lossless): 320k chỉ hơn 256k 0,053 điểm -> bỏ
test('drops tiers below the perceptual gain threshold', () => {
  const mos = { 64: 2.646, 96: 3.445, 128: 4.132, 160: 4.32, 192: 4.513, 256: 4.635, 320: 4.688 };
  assert.deepEqual(applyTau(mos), [64, 96, 128, 160, 192, 256]);
});

test('compares with the last KEPT tier, not the neighbour', () => {
  assert.deepEqual(applyTau({ 64: 3.0, 96: 3.06, 128: 3.12 }), [64, 128]);
});

test('never encodes above the source bitrate', () => {
  assert.deepEqual(candidatesFor(158), [64, 96, 128]);
  assert.deepEqual(candidatesFor(60), []);
});
