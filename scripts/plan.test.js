import { test } from 'node:test';
import assert from 'node:assert';
import {
  computeQuota, computeLearnQueue, computeBatchesAllowed, isLearnWindowOpen, computeGeneralReviewPool,
  INTERVAL_LADDER_DAYS, advanceIntervalStage, computeNextReviewAt, applySwipeResult, computeDueIds, migrateOldStatus
} from '../plan.js';

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

test('computeBatchesAllowed: 0-9 days → 1', () => {
  for (const t of [0, 1, 5, 9]) assert.strictEqual(computeBatchesAllowed(t), 1);
});

test('computeBatchesAllowed: 10-19 days → 2', () => {
  for (const t of [10, 15, 19]) assert.strictEqual(computeBatchesAllowed(t), 2);
});

test('computeBatchesAllowed: 20+ days → 3 (cap)', () => {
  for (const t of [20, 50, 1000]) assert.strictEqual(computeBatchesAllowed(t), 3);
});

test('computeBatchesAllowed: negative → 1 (graceful)', () => {
  assert.strictEqual(computeBatchesAllowed(-5), 1);
});

test('isLearnWindowOpen: 19:59 → false', () => {
  assert.strictEqual(isLearnWindowOpen(new Date(2026, 0, 1, 19, 59)), false);
});

test('isLearnWindowOpen: 20:00 → true', () => {
  assert.strictEqual(isLearnWindowOpen(new Date(2026, 0, 1, 20, 0)), true);
});

test('isLearnWindowOpen: 23:59 → true', () => {
  assert.strictEqual(isLearnWindowOpen(new Date(2026, 0, 1, 23, 59)), true);
});

test('isLearnWindowOpen: 00:00 → true', () => {
  assert.strictEqual(isLearnWindowOpen(new Date(2026, 0, 1, 0, 0)), true);
});

test('isLearnWindowOpen: 00:59 → true', () => {
  assert.strictEqual(isLearnWindowOpen(new Date(2026, 0, 1, 0, 59)), true);
});

test('isLearnWindowOpen: 01:00 → false', () => {
  assert.strictEqual(isLearnWindowOpen(new Date(2026, 0, 1, 1, 0)), false);
});

test('isLearnWindowOpen: 01:01 → false', () => {
  assert.strictEqual(isLearnWindowOpen(new Date(2026, 0, 1, 1, 1)), false);
});

test('isLearnWindowOpen: 无参数用当前时间也能跑（不报错）', () => {
  assert.strictEqual(typeof isLearnWindowOpen(), 'boolean');
});

test('computeGeneralReviewPool: 排除从没学过的词', () => {
  const cards = [{ id: 1 }, { id: 2 }];
  const progress = { 1: { status: 'known', masteredAt: Date.now() } };
  const pool = computeGeneralReviewPool(cards, progress, Date.now(), 10);
  assert.deepStrictEqual(pool.map(c => c.id), [1]);
});

test('computeGeneralReviewPool: 不超过 size，也不超过可选池大小，且不重复', () => {
  const cards = [{ id: 1 }, { id: 2 }, { id: 3 }];
  const progress = { 1: { status: 'unknown' }, 2: { status: 'unknown' }, 3: { status: 'unknown' } };
  const pool = computeGeneralReviewPool(cards, progress, Date.now(), 2);
  assert.strictEqual(pool.length, 2);
  assert.strictEqual(new Set(pool.map(c => c.id)).size, 2);
});

test('computeGeneralReviewPool: 不熟词的抽中概率明显高于刚复习过的已掌握词', () => {
  const cards = [];
  for (let i = 1; i <= 20; i++) cards.push({ id: i });
  const now = Date.now();
  const progress = {};
  for (let i = 1; i <= 10; i++) progress[i] = { status: 'unknown' };
  for (let i = 11; i <= 20; i++) progress[i] = { status: 'known', masteredAt: now, lastSeen: now };

  let unknownPicks = 0, knownPicks = 0;
  for (let t = 0; t < 500; t++) {
    const pool = computeGeneralReviewPool(cards, progress, now, 5);
    for (const c of pool) { if (c.id <= 10) unknownPicks++; else knownPicks++; }
  }
  assert.ok(unknownPicks > knownPicks * 2, `expected unknown to dominate, got unknown=${unknownPicks} known=${knownPicks}`);
});

test('computeGeneralReviewPool: 很久没复习的已掌握词，抽中概率明显高于刚复习过的', () => {
  const cards = [{ id: 1 }, { id: 2 }];
  const now = Date.now();
  const progress = {
    1: { status: 'known', masteredAt: now, lastSeen: now },
    2: { status: 'known', masteredAt: now - 30 * 86400000, lastSeen: now - 30 * 86400000 }
  };
  let staleCount = 0, freshCount = 0;
  for (let t = 0; t < 500; t++) {
    const pool = computeGeneralReviewPool(cards, progress, now, 1);
    if (pool[0].id === 2) staleCount++; else freshCount++;
  }
  assert.ok(staleCount > freshCount * 2, `expected stale to dominate, got stale=${staleCount} fresh=${freshCount}`);
});

test('advanceIntervalStage: 0-4 逐档 +1，5 封顶不再增加', () => {
  assert.strictEqual(advanceIntervalStage(0), 1);
  assert.strictEqual(advanceIntervalStage(4), 5);
  assert.strictEqual(advanceIntervalStage(5), 5);
});

test('computeNextReviewAt: 按阶梯天数换算毫秒', () => {
  const now = 1000000;
  assert.strictEqual(computeNextReviewAt(0, now), now + 1 * 86400000);
  assert.strictEqual(computeNextReviewAt(3, now), now + 14 * 86400000);
  assert.strictEqual(computeNextReviewAt(5, now), now + 90 * 86400000);
});

test('applySwipeResult: 首次右滑(无entry) -> stage 0, 1天后到期', () => {
  const now = 1000000;
  const r = applySwipeResult(undefined, true, now);
  assert.strictEqual(r.intervalStage, 0);
  assert.strictEqual(r.nextReviewAt, now + 86400000);
  assert.strictEqual(r.graduated, false);
  assert.strictEqual(r.firstLearnedAt, now);
});

test('applySwipeResult: 右滑推进一档', () => {
  const now = 2000000;
  const entry = { intervalStage: 2, firstLearnedAt: 100 };
  const r = applySwipeResult(entry, true, now);
  assert.strictEqual(r.intervalStage, 3);
  assert.strictEqual(r.firstLearnedAt, 100); // 保留首次学习时间
});

test('applySwipeResult: 90天档(stage 5)右滑 -> graduated true', () => {
  const now = 3000000;
  const entry = { intervalStage: 5, firstLearnedAt: 100 };
  const r = applySwipeResult(entry, true, now);
  assert.strictEqual(r.intervalStage, 5);
  assert.strictEqual(r.graduated, true);
});

test('applySwipeResult: 左滑无论当前在第几档都打回 stage 0，graduated 复位', () => {
  const now = 4000000;
  const entry = { intervalStage: 5, graduated: true, firstLearnedAt: 100 };
  const r = applySwipeResult(entry, false, now);
  assert.strictEqual(r.intervalStage, 0);
  assert.strictEqual(r.graduated, false);
  assert.strictEqual(r.nextReviewAt, now + 86400000);
});

test('computeDueIds: 只返回到期且未毕业的复合id', () => {
  const now = 1000000;
  const progress2 = {
    'n2:noun:1': { nextReviewAt: now - 1000, graduated: false },   // 到期
    'n2:noun:2': { nextReviewAt: now + 1000, graduated: false },   // 未到期
    'n2:noun:3': { nextReviewAt: now - 1000, graduated: true },    // 已毕业，排除
    'n2:noun:4': null
  };
  assert.deepStrictEqual(computeDueIds(progress2, now), ['n2:noun:1']);
});

test('migrateOldStatus: known -> 14天档(stage 3)', () => {
  const now = 1000000;
  const r = migrateOldStatus('known', now);
  assert.strictEqual(r.intervalStage, 3);
  assert.strictEqual(r.nextReviewAt, now + 14 * 86400000);
});

test('migrateOldStatus: unknown -> 1天档(stage 0)', () => {
  const now = 1000000;
  const r = migrateOldStatus('unknown', now);
  assert.strictEqual(r.intervalStage, 0);
  assert.strictEqual(r.nextReviewAt, now + 1 * 86400000);
});

test('migrateOldStatus: 非known/unknown(未学过) -> null', () => {
  assert.strictEqual(migrateOldStatus(null, 1000000), null);
  assert.strictEqual(migrateOldStatus(undefined, 1000000), null);
});

