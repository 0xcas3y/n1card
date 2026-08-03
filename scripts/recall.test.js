// 仅测顽固单词库的进出状态机逻辑 —— 通过独立复刻的纯函数隔离测试
// （镜像 app.js 里 RecallMode._handleSwipe 的顽固库记账逻辑，改动时手动同步）

import { test } from 'node:test';
import assert from 'node:assert';

function recallSwipeAccounting(stubbornSet, stubbornStreak, id, status) {
  const set = new Set(stubbornSet);
  const streak = { ...stubbornStreak };
  const inStubborn = set.has(id);
  if (status === 'known') {
    if (inStubborn) {
      streak[id] = (streak[id] || 0) + 1;
      if (streak[id] >= 3) {
        set.delete(id);
        delete streak[id];
      }
    }
  } else {
    if (!inStubborn) {
      set.add(id);
    } else {
      streak[id] = 0;
    }
  }
  return { stubbornSet: [...set], stubbornStreak: streak };
}

test('recallSwipeAccounting: swiping left on a fresh word adds it to the stubborn set', () => {
  const r = recallSwipeAccounting([], {}, 42, 'unknown');
  assert.deepStrictEqual(r.stubbornSet, [42]);
});

test('recallSwipeAccounting: swiping right on a non-stubborn word does nothing special', () => {
  const r = recallSwipeAccounting([], {}, 42, 'known');
  assert.deepStrictEqual(r.stubbornSet, []);
  assert.deepStrictEqual(r.stubbornStreak, {});
});

test('recallSwipeAccounting: 2 consecutive rights on a stubborn word does not remove it yet', () => {
  let r = recallSwipeAccounting([42], {}, 42, 'known');
  r = recallSwipeAccounting(r.stubbornSet, r.stubbornStreak, 42, 'known');
  assert.deepStrictEqual(r.stubbornSet, [42]);
  assert.strictEqual(r.stubbornStreak[42], 2);
});

test('recallSwipeAccounting: 3 consecutive rights removes it from the stubborn set', () => {
  let r = { stubbornSet: [42], stubbornStreak: {} };
  for (let i = 0; i < 3; i++) {
    r = recallSwipeAccounting(r.stubbornSet, r.stubbornStreak, 42, 'known');
  }
  assert.deepStrictEqual(r.stubbornSet, []);
  assert.strictEqual(r.stubbornStreak[42], undefined);
});

test('recallSwipeAccounting: a left swipe in the middle resets the consecutive-right streak', () => {
  let r = recallSwipeAccounting([42], {}, 42, 'known');       // streak=1
  r = recallSwipeAccounting(r.stubbornSet, r.stubbornStreak, 42, 'unknown'); // interrupt
  assert.strictEqual(r.stubbornStreak[42], 0);
  assert.deepStrictEqual(r.stubbornSet, [42]); // 仍在库里，没被移出
});
