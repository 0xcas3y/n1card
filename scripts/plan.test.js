import { test } from 'node:test';
import assert from 'node:assert';
import { computeQuota, computeLearnQueue } from '../plan.js';

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

test('computeLearnQueue: picks next N unseen by id order', () => {
  const cards = [
    { id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }, { id: 5 }
  ];
  const progress = {
    1: { status: 'known' },
    2: { status: 'unknown' }
  };
  assert.deepStrictEqual(
    computeLearnQueue(cards, progress, 2).map(c => c.id),
    [3, 4]
  );
});

test('computeLearnQueue: status null counts as unseen', () => {
  const cards = [{ id: 1 }, { id: 2 }, { id: 3 }];
  const progress = { 1: { status: null } };
  assert.deepStrictEqual(
    computeLearnQueue(cards, progress, 10).map(c => c.id),
    [1, 2, 3]
  );
});

test('computeLearnQueue: returns empty when no unseen', () => {
  const cards = [{ id: 1 }];
  const progress = { 1: { status: 'known' } };
  assert.deepStrictEqual(computeLearnQueue(cards, progress, 5), []);
});

test('computeLearnQueue: quota exceeds available → returns what is available', () => {
  const cards = [{ id: 1 }, { id: 2 }];
  const progress = {};
  assert.strictEqual(computeLearnQueue(cards, progress, 100).length, 2);
});
