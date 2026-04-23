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

import { computeMorningPool, pruneOldCohorts } from '../plan.js';

test('computeMorningPool: N-1 ∪ N-2 intersect unknown', () => {
  const cohorts = {
    '2026-04-21': { cardIds: [1, 2] },
    '2026-04-22': { cardIds: [3, 4] },
    '2026-04-23': { cardIds: [5, 6] }  // today's, excluded
  };
  const progress = {
    1: { status: 'unknown' },
    2: { status: 'known' },
    3: { status: 'unknown' },
    4: { status: 'unknown' },
    5: { status: 'unknown' }
  };
  const ids = computeMorningPool(cohorts, progress, '2026-04-23').map(c => c);
  assert.deepStrictEqual(ids.sort((a, b) => a - b), [1, 3, 4]);
});

test('computeMorningPool: Day 1 (no prior cohorts) → empty', () => {
  const cohorts = { '2026-04-23': { cardIds: [1] } };
  const progress = { 1: { status: 'unknown' } };
  assert.deepStrictEqual(computeMorningPool(cohorts, progress, '2026-04-23'), []);
});

test('computeMorningPool: Day 2 (only N-1 exists)', () => {
  const cohorts = { '2026-04-22': { cardIds: [1, 2] } };
  const progress = { 1: { status: 'unknown' }, 2: { status: 'known' } };
  assert.deepStrictEqual(
    computeMorningPool(cohorts, progress, '2026-04-23'),
    [1]
  );
});

test('pruneOldCohorts: keeps D, D-1, D-2; drops older', () => {
  const cohorts = {
    '2026-04-20': { cardIds: [1] },
    '2026-04-21': { cardIds: [2] },
    '2026-04-22': { cardIds: [3] },
    '2026-04-23': { cardIds: [4] }
  };
  const pruned = pruneOldCohorts(cohorts, '2026-04-23');
  assert.deepStrictEqual(
    Object.keys(pruned).sort(),
    ['2026-04-21', '2026-04-22', '2026-04-23']
  );
});
