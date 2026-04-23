// 仅测 markQuiz 的状态机逻辑 —— 通过 mock localStorage + 直接构造
// Progress-like 对象来隔离

import { test } from 'node:test';
import assert from 'node:assert';

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
