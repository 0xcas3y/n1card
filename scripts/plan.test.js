import { test } from 'node:test';
import assert from 'node:assert';
import { computeQuota } from '../plan.js';

test('computeQuota: 1–6 days → 30', () => {
  for (let s = 1; s <= 6; s++) assert.strictEqual(computeQuota(s), 30);
});

test('computeQuota: 7–13 days → 60', () => {
  for (let s = 7; s <= 13; s++) assert.strictEqual(computeQuota(s), 60);
});

test('computeQuota: 14+ days → 90', () => {
  for (const s of [14, 20, 100, 10000]) assert.strictEqual(computeQuota(s), 90);
});

test('computeQuota: 0 or negative → 30 (graceful)', () => {
  assert.strictEqual(computeQuota(0), 30);
  assert.strictEqual(computeQuota(-5), 30);
});
