// 仅测 markQuiz 的状态机逻辑 —— 通过 mock localStorage + 直接构造
// Progress-like 对象来隔离

import { test } from 'node:test';
import assert from 'node:assert';
import { applySwipeResult } from '../plan.js';

// 复制 markQuiz 的核心逻辑，独立可测
function markQuiz(entry, correct, now) {
  entry.quizSeenCount = (entry.quizSeenCount || 0) + 1;
  entry.lastSeen = now;
  if (correct) {
    if (entry.status === 'known') {
      entry.lastWeeklyReviewAt = now;
    } else {
      entry.correctStreak = (entry.correctStreak || 0) + 1;
      if (entry.correctStreak >= 2) {
        entry.status = 'known';
        entry.masteredAt = now;
        entry.correctStreak = 0;
      }
    }
  } else {
    if (entry.status === 'known') {
      entry.status = 'unknown';
      entry.masteredAt = undefined;
    }
    entry.correctStreak = 0;
  }
  return entry;
}

test('unknown + 1 correct → correctStreak=1, still unknown', () => {
  const e = markQuiz({ status: 'unknown' }, true, 100);
  assert.strictEqual(e.status, 'unknown');
  assert.strictEqual(e.correctStreak, 1);
});

test('unknown + 2 consecutive correct → promoted to known', () => {
  let e = markQuiz({ status: 'unknown' }, true, 100);
  e = markQuiz(e, true, 200);
  assert.strictEqual(e.status, 'known');
  assert.strictEqual(e.masteredAt, 200);
  assert.strictEqual(e.correctStreak, 0);
});

test('unknown + 1 correct + 1 wrong → correctStreak resets', () => {
  let e = markQuiz({ status: 'unknown' }, true, 100);
  e = markQuiz(e, false, 200);
  assert.strictEqual(e.correctStreak, 0);
  assert.strictEqual(e.status, 'unknown');
});

test('known + wrong → demoted, masteredAt cleared', () => {
  const e = markQuiz({ status: 'known', masteredAt: 50 }, false, 100);
  assert.strictEqual(e.status, 'unknown');
  assert.strictEqual(e.masteredAt, undefined);
});

test('known + correct → lastWeeklyReviewAt set, stays known', () => {
  const e = markQuiz({ status: 'known', masteredAt: 50 }, true, 100);
  assert.strictEqual(e.status, 'known');
  assert.strictEqual(e.lastWeeklyReviewAt, 100);
});

// ── seenCount：每次mark()(划卡判定)+1，复制自app.js的Progress.mark核心逻辑 ──
function markLegacy(entry, status, now) {
  entry = entry || {};
  entry.seenCount = (entry.seenCount || 0) + 1;
  entry.status = status;
  entry.lastSeen = now;
  entry.correctStreak = 0;
  if (status === 'known') {
    entry.masteredAt = now;
  } else if (status === 'unknown') {
    entry.masteredAt = undefined;
  }
  if (entry.firstLearnedAt === undefined) entry.firstLearnedAt = now;
  return entry;
}

test('markLegacy: seenCount从0开始，每次调用+1', () => {
  let e = markLegacy(undefined, 'known', 100);
  assert.strictEqual(e.seenCount, 1);
  e = markLegacy(e, 'unknown', 200);
  assert.strictEqual(e.seenCount, 2);
  e = markLegacy(e, 'known', 300);
  assert.strictEqual(e.seenCount, 3);
});

test('markLegacy: seenCount累加不影响status的终态覆盖逻辑', () => {
  let e = markLegacy(undefined, 'known', 100);
  assert.strictEqual(e.status, 'known');
  e = markLegacy(e, 'unknown', 200);
  assert.strictEqual(e.status, 'unknown');
  assert.strictEqual(e.seenCount, 2);
});

// ── Progress2.mark 的 seenCount 包装逻辑，复制自app.js ──
// applySwipeResult本身的行为已经在plan.test.js测过，这里只测seenCount包装对不对
function markUnified(entry, correct, now) {
  const prevCount = entry?.seenCount || 0;
  const updated = applySwipeResult(entry, correct, now);
  updated.seenCount = prevCount + 1;
  return updated;
}

test('markUnified: seenCount从0开始每次调用+1，不受correct真假影响', () => {
  let e = markUnified(undefined, true, 100);
  assert.strictEqual(e.seenCount, 1);
  e = markUnified(e, false, 200);
  assert.strictEqual(e.seenCount, 2);
  e = markUnified(e, true, 300);
  assert.strictEqual(e.seenCount, 3);
});

test('markUnified: seenCount之外的字段仍然是applySwipeResult算出来的', () => {
  const e = markUnified(undefined, true, 100);
  assert.strictEqual(e.intervalStage, 0);
  assert.strictEqual(e.firstLearnedAt, 100);
});
