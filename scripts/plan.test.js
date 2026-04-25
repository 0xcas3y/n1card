import { test } from 'node:test';
import assert from 'node:assert';
import { computeQuota, computeLearnQueue } from '../plan.js';

test('computeQuota default base 30: 0–9 days → 30 (1 group)', () => {
  for (const t of [0, 1, 5, 9]) assert.strictEqual(computeQuota(t), 30);
});

test('computeQuota default base 30: 10–19 days → 60 (2 groups)', () => {
  for (const t of [10, 15, 19]) assert.strictEqual(computeQuota(t), 60);
});

test('computeQuota default base 30: 20+ days → 90 (cap, 3 groups)', () => {
  for (const t of [20, 50, 1000]) assert.strictEqual(computeQuota(t), 90);
});

test('computeQuota base 60 (洗脑): 60 / 120 / 180 cap', () => {
  assert.strictEqual(computeQuota(0, 60), 60);
  assert.strictEqual(computeQuota(9, 60), 60);
  assert.strictEqual(computeQuota(10, 60), 120);
  assert.strictEqual(computeQuota(19, 60), 120);
  assert.strictEqual(computeQuota(20, 60), 180);
  assert.strictEqual(computeQuota(1000, 60), 180);
});

test('computeQuota: 0 or negative → 1 group (graceful)', () => {
  assert.strictEqual(computeQuota(0), 30);
  assert.strictEqual(computeQuota(-5), 30);
  assert.strictEqual(computeQuota(-5, 60), 60);
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

import { computeWeeklyDue } from '../plan.js';

test('computeWeeklyDue: known card ≥7 days past masteredAt is due', () => {
  const now = Date.parse('2026-04-23T00:00:00');
  const weekAgo = now - 8 * 24 * 3600 * 1000;
  const progress = {
    1: { status: 'known', masteredAt: weekAgo },
    2: { status: 'known', masteredAt: now - 3 * 86400000 },  // 3 days, not due
    3: { status: 'unknown', masteredAt: weekAgo },            // not known
  };
  assert.deepStrictEqual(computeWeeklyDue(progress, now), [1]);
});

test('computeWeeklyDue: lastWeeklyReviewAt takes precedence over masteredAt', () => {
  const now = Date.now();
  const progress = {
    1: {
      status: 'known',
      masteredAt: now - 30 * 86400000,
      lastWeeklyReviewAt: now - 3 * 86400000  // reviewed 3 days ago → not due
    }
  };
  assert.deepStrictEqual(computeWeeklyDue(progress, now), []);
});

test('computeWeeklyDue: known without masteredAt → not due (awaits backfill)', () => {
  const progress = { 1: { status: 'known' } };
  assert.deepStrictEqual(computeWeeklyDue(progress, Date.now()), []);
});

import { pickDistractors } from '../plan.js';

test('pickDistractors: returns 3 unique kanas, none equal to correct', () => {
  const pool = [
    { id: 1, kana: 'あいうえお' },
    { id: 2, kana: 'かきくけこ' },
    { id: 3, kana: 'さしすせそ' },
    { id: 4, kana: 'たちつてと' },
    { id: 5, kana: 'なにぬねの' }
  ];
  const result = pickDistractors('あいうえお', pool, 3);
  assert.strictEqual(result.length, 3);
  assert.ok(!result.includes('あいうえお'));
  assert.strictEqual(new Set(result).size, 3);
});

test('pickDistractors: skips kana equal to correct', () => {
  const pool = [
    { kana: 'X' }, { kana: 'X' }, { kana: 'Y' }, { kana: 'Z' }
  ];
  const result = pickDistractors('X', pool, 2);
  assert.ok(!result.includes('X'));
  assert.strictEqual(result.length, 2);
});

test('pickDistractors: pool smaller than count → returns what it has', () => {
  const pool = [{ kana: 'A' }, { kana: 'B' }];
  const result = pickDistractors('X', pool, 3);
  assert.strictEqual(result.length, 2);
});

import { aggregateCheckIns } from '../plan.js';

test('aggregateCheckIns: both morning+evening → gold', () => {
  const checkIns = { '2026-04-23': { morning: true, evening: true } };
  assert.strictEqual(aggregateCheckIns(checkIns, '2026-04-23'), 'gold');
});

test('aggregateCheckIns: only morning → half', () => {
  const checkIns = { '2026-04-23': { morning: true } };
  assert.strictEqual(aggregateCheckIns(checkIns, '2026-04-23'), 'half');
});

test('aggregateCheckIns: only evening → half', () => {
  const checkIns = { '2026-04-23': { evening: true } };
  assert.strictEqual(aggregateCheckIns(checkIns, '2026-04-23'), 'half');
});

test('aggregateCheckIns: none → none', () => {
  assert.strictEqual(aggregateCheckIns({}, '2026-04-23'), 'none');
  assert.strictEqual(aggregateCheckIns({ '2026-04-23': {} }, '2026-04-23'), 'none');
});
