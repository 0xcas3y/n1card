# 回忆模式 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a self-contained 🧩 回忆模式 (recall mode) to `app.js` — hide reading (kanji words) or meaning (kana-only words), reveal + TTS, swipe to grade — plus a 顽固单词库 (stubborn-word bank) with priority reinforcement and per-level completion-cycle tracking. Bump the verb "学新" batch size from 30 to 60.

**Architecture:** `RecallMode` is a new top-level state object in `app.js`, modeled directly on the existing `BrainwashMode` (full-screen takeover: saves/restores `Router.visibleCards`, drives its own render loop, calls `TTSEngine`/`Progress`). It needs zero `hub.js` involvement — the "已学过词" pool and session assembly happen entirely client-side from `Progress` + `DataStore`, which is why the same code works unmodified on `n1.html` and every `SIMPLE_MODE` page (`n1-adj.html`, `n1-adverb.html`, `n1-onomatope.html`, `n1-noun.html`). Session assembly (which ids go into today's 60-word batch, priority-injecting stubborn words, cursor wraparound) is a pure function in `plan.js` so it's unit-testable without a DOM.

**Tech Stack:** Vanilla JS (ES modules), `node --test` for unit tests, no build step, static file server.

## Global Constraints

- No new localStorage keys — everything new persists inside the existing `Progress._settings` object (already saved via the existing `settingsKey`), so per-word-type isolation is automatic (each `SIMPLE_MODE` page already has its own `LEVEL_KEY`-scoped storage).
- No new HTML files — `RecallMode` reuses the existing `#cardstage`/`#topbar` DOM mounted by every page's `app.js`.
- Follow existing code style exactly: no semicolon-free style, no framework, plain `element.innerHTML = ...` templating, `Gestures.attach` for swipe/tap, `TTSEngine.speak(text, { rate })` for audio.
- Bump `?v=48` → `?v=49` on every HTML file's `app.js`/`styles.css`/`hub.js` reference in the final task (this project's established cache-busting convention — see commit `837e23d`).
- `hub.js`'s `BATCH_SIZE` change is verb-only and isolated from everything else in this plan — it does not touch `plan.js`, `computeQuota`, or any `SIMPLE_MODE` page.

---

### Task 1: `plan.js` — `computeRecallSession` pure function

**Files:**
- Modify: `plan.js` (append new exported function at end of file)
- Test: `scripts/plan.test.js` (append new test cases at end of file)

**Interfaces:**
- Produces: `computeRecallSession(learnedIds, stubbornIds, position, size = 60)` → `{ cardIds: number[], nextPosition: number, cyclesCompleted: number }`. `learnedIds` is a sorted array of unique card ids (the full "already learned" pool for the current word-type page). `stubbornIds` is an array of card ids currently in the stubborn bank (may include ids not in `learnedIds` — those are ignored). `position` is the saved cursor (0-based index into `learnedIds`). Consumed by `RecallMode.start()` in Task 4.

- [ ] **Step 1: Write the failing tests**

Append to `scripts/plan.test.js` (the file already imports `test`/`assert` at the top and imports several functions from `../plan.js` — add `computeRecallSession` to that existing import line):

```js
// change the existing top import line from:
// import { computeQuota, computeLearnQueue, computeBatchesAllowed, isLearnWindowOpen, computeGeneralReviewPool } from '../plan.js';
// to:
import { computeQuota, computeLearnQueue, computeBatchesAllowed, isLearnWindowOpen, computeGeneralReviewPool, computeRecallSession } from '../plan.js';
```

```js
test('computeRecallSession: empty pool returns empty session', () => {
  const r = computeRecallSession([], [], 0, 60);
  assert.deepStrictEqual(r, { cardIds: [], nextPosition: 0, cyclesCompleted: 0 });
});

test('computeRecallSession: pool smaller than size returns whole pool, cursor wraps once', () => {
  const learned = [1, 2, 3, 4, 5];
  const r = computeRecallSession(learned, [], 0, 60);
  assert.deepStrictEqual(r.cardIds.slice().sort((a, b) => a - b), [1, 2, 3, 4, 5]);
  assert.strictEqual(r.nextPosition, 0);
  assert.strictEqual(r.cyclesCompleted, 1);
});

test('computeRecallSession: stubborn ids are prioritized into the session', () => {
  const learned = [1, 2, 3, 4, 5, 6, 7, 8];
  const r = computeRecallSession(learned, [7, 3], 0, 4);
  // 顽固词（按 learnedIds 顺序）先进：3 然后 7
  assert.deepStrictEqual(r.cardIds.slice(0, 2), [3, 7]);
  assert.strictEqual(r.cardIds.length, 4);
});

test('computeRecallSession: stubborn ids outside the learned pool are ignored', () => {
  const learned = [1, 2, 3];
  const r = computeRecallSession(learned, [999], 0, 3);
  assert.ok(!r.cardIds.includes(999));
  assert.strictEqual(r.cardIds.length, 3);
});

test('computeRecallSession: cursor continues from saved position across calls', () => {
  const learned = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  const first = computeRecallSession(learned, [], 0, 4);
  assert.deepStrictEqual(first.cardIds, [1, 2, 3, 4]);
  assert.strictEqual(first.nextPosition, 4);
  assert.strictEqual(first.cyclesCompleted, 0);

  const second = computeRecallSession(learned, [], first.nextPosition, 4);
  assert.deepStrictEqual(second.cardIds, [5, 6, 7, 8]);
  assert.strictEqual(second.nextPosition, 8);
});

test('computeRecallSession: cursor wraps mid-session and reports cyclesCompleted', () => {
  const learned = [1, 2, 3, 4, 5];
  // position=3, size=4 → takes 4,5 then wraps to 1,2 (covers the whole pool once)
  const r = computeRecallSession(learned, [], 3, 4);
  assert.deepStrictEqual(r.cardIds, [4, 5, 1, 2]);
  assert.strictEqual(r.nextPosition, 2);
  assert.strictEqual(r.cyclesCompleted, 1);
});

test('computeRecallSession: does not double-count a stubborn id the cursor also passes over', () => {
  const learned = [1, 2, 3, 4, 5];
  const r = computeRecallSession(learned, [2], 0, 5);
  // 2 只出现一次（顽固优先注入），游标经过 id=2 时因为已在 pickedSet 里而跳过，不重复
  assert.strictEqual(r.cardIds.filter(id => id === 2).length, 1);
  assert.strictEqual(r.cardIds.length, 5);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — `computeRecallSession is not a function` (or similar `TypeError`/`SyntaxError` from the import), since `plan.js` doesn't export it yet.

- [ ] **Step 3: Implement `computeRecallSession` in `plan.js`**

Append to the end of `plan.js` (after the existing `computeGeneralReviewPool` function):

```js
// 回忆模式会话组装：顽固词优先注入，剩余名额按 learnedIds 的顺序从 position 开始的游标补满。
// 游标每绕回 0 一次，cyclesCompleted 计一次（一次会话内池子很小时可能绕多圈）。
export function computeRecallSession(learnedIds, stubbornIds, position, size = 60) {
  const total = learnedIds.length;
  if (total === 0) return { cardIds: [], nextPosition: 0, cyclesCompleted: 0 };

  const stubbornSet = new Set(stubbornIds);
  const picked = [];
  const pickedSet = new Set();

  // 1. 顽固词优先，按 learnedIds 顺序保证确定性
  for (const id of learnedIds) {
    if (picked.length >= size) break;
    if (stubbornSet.has(id)) {
      picked.push(id);
      pickedSet.add(id);
    }
  }

  // 2. 从 position 开始按游标顺序补满剩余名额
  let pos = ((position % total) + total) % total;
  let cyclesCompleted = 0;
  let steps = 0;
  while (picked.length < size && steps < total) {
    const id = learnedIds[pos];
    if (!pickedSet.has(id)) {
      picked.push(id);
      pickedSet.add(id);
    }
    pos = (pos + 1) % total;
    if (pos === 0) cyclesCompleted++;
    steps++;
  }

  return { cardIds: picked, nextPosition: pos, cyclesCompleted };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS — all `computeRecallSession` tests green, and all pre-existing tests in `scripts/plan.test.js` still pass (the import line change is additive only).

- [ ] **Step 5: Commit**

```bash
git add plan.js scripts/plan.test.js
git commit -m "$(cat <<'EOF'
plan.js: 新增 computeRecallSession——回忆模式会话组装

顽固词优先注入 + 游标顺序补满，纯函数可单测，不碰 hub.js。
EOF
)"
```

---

### Task 2: `hub.js` — 学新批次 30 → 60（仅动词）

**Files:**
- Modify: `hub.js:8`

**Interfaces:**
- Consumes: nothing new.
- Produces: nothing new — this is a constant-value change only, isolated to the verb-only `hub.js`/`index.html` flow. Confirmed independent of everything else in this plan (`plan.js`'s `computeQuota(totalDays, baseGroup=60)` used by brainwash mode already defaults its own call site to 60 and is untouched).

- [ ] **Step 1: Change the constant**

In `hub.js`, change:

```js
const BATCH_SIZE = 30;
```

to:

```js
const BATCH_SIZE = 60;
```

- [ ] **Step 2: Verify existing unit tests still pass**

Run: `npm test`
Expected: PASS — `scripts/plan.test.js` and `scripts/progress.test.js` don't reference `hub.js`'s `BATCH_SIZE` constant directly (it's a local const, not exported), so nothing breaks.

- [ ] **Step 3: Manual smoke test**

```bash
lsof -ti:8002 | xargs kill 2>/dev/null
python3 -m http.server 8002 > /tmp/n1card-recall-test.log 2>&1 &
sleep 1
curl -s http://localhost:8002/hub.js | grep "BATCH_SIZE ="
pkill -f "http.server 8002"
```

Expected output: `const BATCH_SIZE = 60;`

- [ ] **Step 4: Commit**

```bash
git add hub.js
git commit -m "hub.js: 学新批次大小 30 → 60（仅影响动词板块）"
```

---

### Task 3: `app.js` `Progress` — stubborn-bank + cycle-count + recall-settings storage

**Files:**
- Modify: `app.js` (the `Progress` object, roughly lines 57-159)
- Test: Create `scripts/recall.test.js`

**Interfaces:**
- Produces (all methods added to the existing `Progress` object in `app.js`, consumed by `RecallMode` in Task 4 and `SettingsPanel` in Task 6):
  - `Progress.getStubbornSet()` → `number[]`
  - `Progress.addToStubborn(id)` / `Progress.removeFromStubborn(id)` → `void`
  - `Progress.getStubbornStreak(id)` → `number`
  - `Progress.setStubbornStreak(id, n)` → `void` (n<=0 clears the entry)
  - `Progress.getRecallCyclePosition()` → `number`
  - `Progress.setRecallCyclePosition(n)` → `void`
  - `Progress.getRecallCycleCount()` → `number`
  - `Progress.incrementRecallCycleCount(n = 1)` → `void`
  - `Progress.getHideDuration()` → `number` (seconds, default 2)
  - `Progress.setHideDuration(sec)` → `void`
  - `Progress.getTtsRepeatCount()` → `number` (default 2)
  - `Progress.setTtsRepeatCount(n)` → `void`

- [ ] **Step 1: Write the failing tests**

Create `scripts/recall.test.js`. This mirrors the swipe-accounting state machine that `RecallMode._handleSwipe` will implement in `app.js` (Task 4) — same pattern as `scripts/progress.test.js` mirroring `markQuiz`. Keep the two in sync manually if the logic changes.

```js
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: This particular test file is self-contained (defines `recallSwipeAccounting` inline, doesn't import from `app.js`), so it will actually PASS immediately — that's expected and fine, since this file's job is to lock in the *intended* state-machine behavior before Task 4 implements the matching logic in `app.js`. Confirm it passes now so Task 4's implementation has something to match.

Run: `node --test scripts/recall.test.js`
Expected: PASS (all 5 tests green) — this is the one exception in this plan to "write failing test first," because `app.js` isn't a Node-importable module in a way that lets the real `Progress`/`RecallMode` methods be unit tested directly (they close over `window`/`localStorage`/DOM). The mirrored pure function *is* the spec; Task 4 must match it exactly.

- [ ] **Step 3: Add the storage methods to `Progress` in `app.js`**

In `app.js`, find the `_settings` default object (around line 61):

```js
  _settings: { filter: 'all', ttsRate: 0.9, lastCardId: null },
```

Replace with:

```js
  _settings: {
    filter: 'all', ttsRate: 0.9, lastCardId: null,
    stubbornSet: [], stubbornStreak: {},
    recallCyclePosition: 0, recallCycleCount: 0,
    recallHideDuration: 2, recallTtsRepeatCount: 2
  },
```

Then, find `reset() { this._progress = {}; this._settings.lastCardId = null; this._save(); },` (around line 157) and add the following new methods immediately **before** it (so `reset()` stays the last method before `isAvailable()`, matching the existing method ordering):

```js
  getStubbornSet() { return this._settings.stubbornSet || []; },
  addToStubborn(id) {
    const set = new Set(this.getStubbornSet());
    if (!set.has(id)) {
      set.add(id);
      this._settings.stubbornSet = [...set];
      this._save();
    }
  },
  removeFromStubborn(id) {
    const set = new Set(this.getStubbornSet());
    if (set.has(id)) {
      set.delete(id);
      this._settings.stubbornSet = [...set];
      this._save();
    }
  },
  getStubbornStreak(id) { return (this._settings.stubbornStreak || {})[id] || 0; },
  setStubbornStreak(id, n) {
    const map = { ...(this._settings.stubbornStreak || {}) };
    if (n <= 0) delete map[id]; else map[id] = n;
    this._settings.stubbornStreak = map;
    this._save();
  },
  getRecallCyclePosition() { return this._settings.recallCyclePosition || 0; },
  setRecallCyclePosition(n) { this._settings.recallCyclePosition = n; this._save(); },
  getRecallCycleCount() { return this._settings.recallCycleCount || 0; },
  incrementRecallCycleCount(n = 1) {
    this._settings.recallCycleCount = (this._settings.recallCycleCount || 0) + n;
    this._save();
  },
  getHideDuration() { return this._settings.recallHideDuration || 2; },
  setHideDuration(sec) { this._settings.recallHideDuration = sec; this._save(); },
  getTtsRepeatCount() { return this._settings.recallTtsRepeatCount || 2; },
  setTtsRepeatCount(n) { this._settings.recallTtsRepeatCount = n; this._save(); },
```

- [ ] **Step 4: Run tests to verify nothing broke**

Run: `npm test`
Expected: PASS — all existing suites plus `scripts/recall.test.js` green. `app.js` isn't part of the Node test run (it's a browser ES module referencing `window`), so this step is really about confirming `plan.js`/`hub.js` tests are undisturbed.

- [ ] **Step 5: Manual smoke test — confirm no console errors on load**

```bash
lsof -ti:8002 | xargs kill 2>/dev/null
python3 -m http.server 8002 > /tmp/n1card-recall-test.log 2>&1 &
sleep 1
curl -s http://localhost:8002/n1-adj.html -o /dev/null -w "%{http_code}\n"
curl -s http://localhost:8002/app.js | grep -c "getStubbornSet\|setHideDuration\|getRecallCycleCount"
pkill -f "http.server 8002"
```

Expected: `200` then a count ≥ 3 (confirms the new methods are present in the served `app.js`).

- [ ] **Step 6: Commit**

```bash
git add app.js scripts/recall.test.js
git commit -m "$(cat <<'EOF'
app.js: Progress 新增顽固单词库 + 回忆轮次 + 回忆设置的存取方法

存进现有 _settings（复用现有 localStorage key，五个词性页面天然隔离）。
scripts/recall.test.js 镜像顽固库进出状态机，供 Task 4 实现比对。
EOF
)"
```

---

### Task 4: `app.js` — `RecallMode` + CSS

**Files:**
- Modify: `app.js` (add new `RecallMode` object; modify `_attachKeyboard`)
- Modify: `styles.css` (append new rules)

**Interfaces:**
- Consumes: `computeRecallSession` (Task 1, imported from `plan.js`), `Progress.*` stubborn/cycle/setting methods (Task 3), existing `DataStore`, `TTSEngine`, `Gestures`, `CardView.randomColor`, `Router.visibleCards`/`currentIndex`/`currentColor`/`flipped`/`showCurrent`, `TopBar.render`/`addWarning`.
- Produces: `RecallMode.start()`, `RecallMode.exit()`, `RecallMode.active` (boolean) — consumed by Task 5 (TopBar button) and the keyboard handler in this same task.

- [ ] **Step 1: Add the `computeRecallSession` import**

In `app.js`, change the top import line:

```js
import { aggregateCheckIns, pickDistractors, computeQuota, isLearnWindowOpen } from './plan.js';
```

to:

```js
import { aggregateCheckIns, pickDistractors, computeQuota, isLearnWindowOpen, computeRecallSession } from './plan.js';
```

- [ ] **Step 2: Add the `RecallMode` object**

In `app.js`, insert the following new block immediately **after** the closing `};` of `BrainwashMode` (i.e., right before `const LearnListMode = {` — currently line 616):

```js
const RecallMode = {
  active: false,
  _queue: [],
  _idx: 0,
  _revealed: false,
  _hideTimer: null,
  _savedVisibleCards: null,
  _savedIndex: 0,

  start() {
    const learned = DataStore.allCards()
      .filter(c => Progress.getStatus(c.id) !== null)
      .sort((a, b) => a.id - b.id);
    if (learned.length === 0) {
      TopBar.addWarning('还没有学过的词可以复习');
      TopBar.render();
      return;
    }
    const learnedIds = learned.map(c => c.id);
    const learnedSet = new Set(learnedIds);
    const stubbornIds = Progress.getStubbornSet().filter(id => learnedSet.has(id));
    const position = Progress.getRecallCyclePosition();
    const session = computeRecallSession(learnedIds, stubbornIds, position, 60);

    if (session.cyclesCompleted > 0) Progress.incrementRecallCycleCount(session.cyclesCompleted);
    Progress.setRecallCyclePosition(session.nextPosition);

    this._queue = session.cardIds.map(id => DataStore.getCard(id)).filter(Boolean);
    this._idx = 0;
    this._savedVisibleCards = Router.visibleCards;
    this._savedIndex = Router.currentIndex;

    this.active = true;
    document.body.classList.add('recall-on');
    this._showCard();
  },

  exit() {
    this.active = false;
    if (this._hideTimer) { clearTimeout(this._hideTimer); this._hideTimer = null; }
    TTSEngine.cancel();
    document.body.classList.remove('recall-on');
    if (this._savedVisibleCards) {
      Router.visibleCards = this._savedVisibleCards;
      Router.currentIndex = Math.min(this._savedIndex || 0, Math.max(0, this._savedVisibleCards.length - 1));
      this._savedVisibleCards = null;
      Router.currentColor = CardView.randomColor();
      Router.flipped = false;
      Router.showCurrent();
    } else {
      TopBar.render();
    }
  },

  _showCard() {
    if (!this.active) return;
    if (this._idx >= this._queue.length) { this.exit(); return; }
    const card = this._queue[this._idx];
    this._revealed = false;
    const isKanji = card.word !== card.kana;

    const stage = document.querySelector('#cardstage');
    stage.innerHTML = '';
    const el = document.createElement('div');
    el.className = `flash-card recall-card color-${CardView.randomColor()}`;
    el.innerHTML = `
      <div class="card-id">${this._idx + 1}/${this._queue.length}</div>
      <div class="recall-word" data-len="${[...card.word].length}">${card.word}</div>
      <div class="recall-reveal ${isKanji ? 'recall-kana' : 'recall-meaning'}" hidden></div>
      <div class="hint-bottom">${isKanji ? '回忆读音…' : '回忆词义…'} · 揭示后 ←不熟 →掌握</div>
    `;
    stage.appendChild(el);

    Gestures.attach(el, {
      onSwipe: (dir) => {
        if (!this._revealed) return;
        this._handleSwipe(dir === 'left' ? 'unknown' : 'known', card);
      }
    });

    const hideMs = Progress.getHideDuration() * 1000;
    this._hideTimer = setTimeout(() => this._reveal(el, card, isKanji), hideMs);

    TopBar.render();
  },

  async _reveal(el, card, isKanji) {
    if (!this.active) return;
    this._hideTimer = null;
    this._revealed = true;
    const revealEl = el.querySelector('.recall-reveal');
    if (!revealEl) return;
    if (isKanji) {
      revealEl.textContent = card.kana;
      revealEl.hidden = false;
      const repeat = Progress.getTtsRepeatCount();
      const rate = Progress.getTTSRate();
      for (let i = 0; i < repeat; i++) {
        if (!this.active) return;
        await TTSEngine.speak(card.kana, { rate });
      }
    } else {
      revealEl.innerHTML = card.meanings.map((m, i) => `${['①','②','③','④'][i] || '·'} ${m}`).join('<br>');
      revealEl.hidden = false;
    }
  },

  _handleSwipe(status, card) {
    Progress.mark(card.id, status);
    const inStubborn = Progress.getStubbornSet().includes(card.id);
    if (status === 'known') {
      if (inStubborn) {
        const streak = Progress.getStubbornStreak(card.id) + 1;
        if (streak >= 3) {
          Progress.removeFromStubborn(card.id);
          Progress.setStubbornStreak(card.id, 0);
        } else {
          Progress.setStubbornStreak(card.id, streak);
        }
      }
    } else {
      if (!inStubborn) {
        Progress.addToStubborn(card.id);
      } else {
        Progress.setStubbornStreak(card.id, 0);
      }
    }
    this._idx++;
    this._showCard();
  }
};
```

- [ ] **Step 3: Guard the keyboard handler**

In `app.js`, find `_attachKeyboard` (currently around line 1206):

```js
function _attachKeyboard() {
  document.addEventListener('keydown', (e) => {
    if (e.target.matches('input, textarea, select')) return;
    switch (e.key) {
      case ' ':         e.preventDefault(); Router.toggleFlip(); break;
      case 'ArrowLeft': e.preventDefault(); Router.markAndNext('unknown'); break;
      case 'ArrowRight':e.preventDefault(); Router.markAndNext('known'); break;
      case 'ArrowDown': e.preventDefault(); Router.nextCard(); break;
      case 'p': case 'P': Router.playCurrentWord(); break;
      case 'Escape':
        if (Router.learnMode) window.location.href = '/';
        else if (BrainwashMode.active) BrainwashMode.exit();
        break;
    }
  });
}
```

Replace with:

```js
function _attachKeyboard() {
  document.addEventListener('keydown', (e) => {
    if (e.target.matches('input, textarea, select')) return;
    if (RecallMode.active) {
      switch (e.key) {
        case 'ArrowLeft':
          e.preventDefault();
          if (RecallMode._revealed) RecallMode._handleSwipe('unknown', RecallMode._queue[RecallMode._idx]);
          break;
        case 'ArrowRight':
          e.preventDefault();
          if (RecallMode._revealed) RecallMode._handleSwipe('known', RecallMode._queue[RecallMode._idx]);
          break;
        case 'Escape':
          RecallMode.exit();
          break;
      }
      return;
    }
    switch (e.key) {
      case ' ':         e.preventDefault(); Router.toggleFlip(); break;
      case 'ArrowLeft': e.preventDefault(); Router.markAndNext('unknown'); break;
      case 'ArrowRight':e.preventDefault(); Router.markAndNext('known'); break;
      case 'ArrowDown': e.preventDefault(); Router.nextCard(); break;
      case 'p': case 'P': Router.playCurrentWord(); break;
      case 'Escape':
        if (Router.learnMode) window.location.href = '/';
        else if (BrainwashMode.active) BrainwashMode.exit();
        break;
    }
  });
}
```

- [ ] **Step 4: Add CSS**

Append to `styles.css`:

```css
.recall-card { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 28px; text-align: center; padding: 0 24px; }
.recall-word { font-size: clamp(48px, 14vw, 88px); font-weight: 600; letter-spacing: 2px; }
.recall-reveal { font-size: 30px; opacity: 0.92; }
.recall-reveal.recall-meaning { font-size: 20px; line-height: 1.7; max-width: 480px; }
```

- [ ] **Step 5: Run unit tests**

Run: `npm test`
Expected: PASS — this task didn't touch `plan.js` or `hub.js`, so all prior suites stay green (this task has no new automated tests of its own — DOM/timer/TTS logic is covered by the manual checklist in Task 7).

- [ ] **Step 6: Manual smoke test**

```bash
lsof -ti:8002 | xargs kill 2>/dev/null
python3 -m http.server 8002 > /tmp/n1card-recall-test.log 2>&1 &
sleep 1
curl -s http://localhost:8002/app.js | grep -c "const RecallMode = {"
curl -s http://localhost:8002/styles.css | grep -c "\.recall-card"
pkill -f "http.server 8002"
```

Expected: both counts `1`.

Then open `http://localhost:PORT/n1-adj.html` in a real browser (this can't be curl-verified — TTS, timers, and touch gestures need an actual browser), swipe/tap through a few cards so `Progress` has some `known`/`unknown` entries, then run in the browser console: `RecallMode.start()`. Confirm: a card shows only `word` at first, the reading (or meaning, if a kana-only word) appears after the default 2s, TTS plays for kanji words, and swiping left/right advances to the next card without a JS error in the console.

- [ ] **Step 7: Commit**

```bash
git add app.js styles.css
git commit -m "$(cat <<'EOF'
app.js: 新增 RecallMode（回忆模式核心逻辑）

参照 BrainwashMode 的全屏接管模式实现：隐藏读音/词义→倒计时揭示→
朗读（仅汉字词）→滑动记账，滑动同时维护顽固单词库进出。
键盘 Escape/方向键在 RecallMode 激活时优先路由给它。
EOF
)"
```

---

### Task 5: `app.js` `TopBar` — 🧩 按钮 + 顽固词角标

**Files:**
- Modify: `app.js` (the `TopBar.render()` method, roughly lines 384-455)

**Interfaces:**
- Consumes: `RecallMode.start()` (Task 4), `RecallMode.active`, `Progress.getStubbornSet()` (Task 3).
- Produces: nothing new consumed elsewhere.

- [ ] **Step 1: Find the current button markup**

In `app.js`, locate the `topbar-right` div inside `TopBar.render()` (this is the block that already has the `mute-btn`/`settings-btn`/`brainwash-btn` from earlier work):

```js
      <div class="topbar-right">
        ${filterHtml}
        <a class="settings-btn" href="/grammar/" style="text-decoration: none;" title="切换到文法">📖</a>
        <button class="settings-btn" id="mute-btn" title="静音">${TTSEngine.muted ? '🔇' : '🔊'}</button>
        <button class="settings-btn" id="settings-btn">⚙</button>
        <button class="brainwash-btn" id="brainwash-btn" title="洗脑模式">🧠<span class="brainwash-label"> 洗脑</span></button>
      </div>
```

- [ ] **Step 2: Insert the recall button**

Replace that block with (adds a new `recall-btn` between the mute button and the settings gear, hidden while `RecallMode` is already active or `BrainwashMode` is active — same convention as the existing `quizEntryHtml` gating):

```js
      <div class="topbar-right">
        ${filterHtml}
        <a class="settings-btn" href="/grammar/" style="text-decoration: none;" title="切换到文法">📖</a>
        <button class="settings-btn" id="mute-btn" title="静音">${TTSEngine.muted ? '🔇' : '🔊'}</button>
        ${(!RecallMode.active && !BrainwashMode.active) ? `
          <button class="settings-btn" id="recall-btn" title="回忆模式 · 已复习 ${Progress.getRecallCycleCount()} 轮">
            🧩${Progress.getStubbornSet().length > 0 ? `<span class="recall-badge">${Progress.getStubbornSet().length}</span>` : ''}
          </button>
        ` : ''}
        <button class="settings-btn" id="settings-btn">⚙</button>
        <button class="brainwash-btn" id="brainwash-btn" title="洗脑模式">🧠<span class="brainwash-label"> 洗脑</span></button>
      </div>
```

- [ ] **Step 3: Wire the click handler**

In the same `TopBar.render()` method, find where `mute-btn`'s click listener is attached:

```js
    topbar.querySelector('#mute-btn').addEventListener('click', () => {
      TTSEngine.toggleMute();
      TopBar.render();
    });
```

Immediately after it, add:

```js
    topbar.querySelector('#recall-btn')?.addEventListener('click', () => {
      RecallMode.start();
    });
```

(The `?.` guard is needed because the button is conditionally rendered per Step 2 — it won't exist in the DOM while `RecallMode`/`BrainwashMode` is active.)

- [ ] **Step 4: Add the badge CSS**

Append to `styles.css` (same file touched in Task 4, this is a separate small addition):

```css
.recall-badge { display: inline-block; margin-left: 2px; padding: 0 5px; border-radius: 8px; background: #E85D4A; color: #fff; font-size: 11px; vertical-align: top; }
```

- [ ] **Step 5: Run unit tests**

Run: `npm test`
Expected: PASS (unchanged from Task 4 — this task is DOM-only).

- [ ] **Step 6: Manual smoke test**

```bash
lsof -ti:8002 | xargs kill 2>/dev/null
python3 -m http.server 8002 > /tmp/n1card-recall-test.log 2>&1 &
sleep 1
curl -s http://localhost:8002/app.js | grep -c "id=\"recall-btn\""
pkill -f "http.server 8002"
```

Expected: `1`.

Then in a real browser on any of `n1.html`, `n1-adj.html`, `n1-adverb.html`, `n1-onomatope.html`, `n1-noun.html`: confirm the 🧩 button appears in the top bar, clicking it starts `RecallMode` (or shows the "还没有学过的词" warning if nothing's been swiped yet on that page), and after swiping left on a word at least once, reloading the page and reopening recall mode shows a small red badge with a `1` on the button.

- [ ] **Step 7: Commit**

```bash
git add app.js styles.css
git commit -m "app.js: TopBar 新增回忆模式按钮 + 顽固词角标"
```

---

### Task 6: `app.js` `SettingsPanel` — 隐藏时长 + 朗读次数设置项

**Files:**
- Modify: `app.js` (the `SettingsPanel.open()` method, roughly lines 903-950)

**Interfaces:**
- Consumes: `Progress.getHideDuration()`/`setHideDuration()`, `Progress.getTtsRepeatCount()`/`setTtsRepeatCount()` (Task 3).
- Produces: nothing new consumed elsewhere — these settings are read fresh by `RecallMode._showCard()`/`_reveal()` on every card (Task 4), so no explicit "apply" wiring is needed beyond persisting the value.

- [ ] **Step 1: Find the current modal markup**

In `app.js`, in `SettingsPanel.open()`:

```js
    backdrop.innerHTML = `
      <div class="modal">
        <h3>设置</h3>
        <label>TTS 语速：<span id="rate-val">${Progress.getTTSRate().toFixed(2)}</span></label>
        <input type="range" id="rate-input" min="0.5" max="1.5" step="0.05" value="${Progress.getTTSRate()}">
        <div class="row">
          <button id="edit-btn">编辑当前卡</button>
          <button id="export-btn">导出修改</button>
        </div>
        <div class="row">
          <button class="danger" id="reset-btn">清空学习记录</button>
        </div>
        <div class="row">
          <button id="close-btn">关闭</button>
        </div>
      </div>
    `;
```

- [ ] **Step 2: Insert the two new settings**

Replace with (adds the recall-mode section right after the TTS rate slider, before the existing action rows):

```js
    backdrop.innerHTML = `
      <div class="modal">
        <h3>设置</h3>
        <label>TTS 语速：<span id="rate-val">${Progress.getTTSRate().toFixed(2)}</span></label>
        <input type="range" id="rate-input" min="0.5" max="1.5" step="0.05" value="${Progress.getTTSRate()}">
        <label>回忆模式 · 隐藏时长</label>
        <div class="row" id="hide-duration-group">
          ${[1, 2, 3].map(s => `<button data-sec="${s}" class="${s === Progress.getHideDuration() ? 'primary' : ''}">${s}s</button>`).join('')}
        </div>
        <label>回忆模式 · 朗读次数：<span id="repeat-val">${Progress.getTtsRepeatCount()}</span></label>
        <input type="range" id="repeat-input" min="1" max="4" step="1" value="${Progress.getTtsRepeatCount()}">
        <div class="row">
          <button id="edit-btn">编辑当前卡</button>
          <button id="export-btn">导出修改</button>
        </div>
        <div class="row">
          <button class="danger" id="reset-btn">清空学习记录</button>
        </div>
        <div class="row">
          <button id="close-btn">关闭</button>
        </div>
      </div>
    `;
```

- [ ] **Step 3: Wire the new controls**

Find where the existing `rate-input` listener is attached:

```js
    const rateInput = backdrop.querySelector('#rate-input');
    rateInput.addEventListener('input', () => {
      const v = parseFloat(rateInput.value);
      backdrop.querySelector('#rate-val').textContent = v.toFixed(2);
      Progress.setTTSRate(v);
    });
```

Immediately after it, add:

```js
    backdrop.querySelectorAll('#hide-duration-group button').forEach(btn => {
      btn.addEventListener('click', () => {
        const sec = parseInt(btn.dataset.sec, 10);
        Progress.setHideDuration(sec);
        backdrop.querySelectorAll('#hide-duration-group button').forEach(b => b.classList.toggle('primary', b === btn));
      });
    });
    const repeatInput = backdrop.querySelector('#repeat-input');
    repeatInput.addEventListener('input', () => {
      const v = parseInt(repeatInput.value, 10);
      backdrop.querySelector('#repeat-val').textContent = String(v);
      Progress.setTtsRepeatCount(v);
    });
```

- [ ] **Step 4: Run unit tests**

Run: `npm test`
Expected: PASS (unchanged — DOM-only task).

- [ ] **Step 5: Manual smoke test**

Open any page in a browser, click ⚙, confirm the "回忆模式 · 隐藏时长" button group (1s/2s/3s, default 2s highlighted) and "朗读次数" slider (default 2) appear and are clickable/draggable, close and reopen the settings panel, confirm the chosen values persisted (localStorage survives the modal close/reopen).

- [ ] **Step 6: Commit**

```bash
git add app.js
git commit -m "app.js: SettingsPanel 新增回忆模式隐藏时长/朗读次数设置项"
```

---

### Task 7: Cache-bust + full manual verification + wrap-up commit

**Files:**
- Modify: `index.html`, `n1.html`, `n1-adj.html`, `n1-adverb.html`, `n1-onomatope.html`, `n1-noun.html`, `n2.html`, `n2-adj.html`, `n2-onomatope.html`, `n3.html`, `n4.html`, `n5.html`, `ono.html`, `support.html` (bump the static-asset cache-bust query param)

**Interfaces:** None — this task ships the feature, it doesn't add new code interfaces.

- [ ] **Step 1: Bump the version**

```bash
cd /Users/caseyshi/project/n1card/.worktrees/n1n2-adj-onomatope
for f in index.html n1.html n1-adj.html n1-adverb.html n1-onomatope.html n1-noun.html n2.html n2-adj.html n2-onomatope.html n3.html n4.html n5.html ono.html support.html; do
  sed -i '' 's/v=48/v=49/g' "$f"
done
grep -c "v=49" *.html | grep -v ":0"
```

Expected: every listed file shows a count ≥ 1 (2 for pages with both a stylesheet and a script tag, 1 for `support.html` which has no script tag).

- [ ] **Step 2: Run the full unit test suite one more time**

Run: `npm test`
Expected: PASS — every test from Tasks 1, 3, and the pre-existing suites (`computeQuota`, `computeLearnQueue`, `markQuiz`, `validate-cards`, etc.) all green.

- [ ] **Step 3: Full manual checklist (from the design doc §9.2)**

Serve the branch locally and walk through each item, in a real browser (touch/mouse swipe, audio, and `setTimeout`-driven reveals can't be curl-verified):

```bash
lsof -ti:8002 | xargs kill 2>/dev/null
python3 -m http.server 8002 > /tmp/n1card-recall-test.log 2>&1 &
```

- [ ] 回忆模式：有汉字词 → 隐藏读音 N 秒 → 揭示+朗读 M 次 → 滑动
- [ ] 回忆模式：纯假名词 → 隐藏释义 N 秒 → 揭示释义 → 滑动（无朗读环节）
- [ ] 顽固词连续右划 3 次后移出，角标数字减少
- [ ] 回忆模式会话中顽固词优先出现（顽固词库非空时，本次会话前几张必是顽固词）
- [ ] 回忆模式游标轮完一遍后 `recallCycleCount+1`，按钮 title 里"已复习 N 轮"更新
- [ ] 设置面板隐藏时长/朗读次数调整后，下次回忆模式会话生效
- [ ] 学新批次改 60 后，`n1.html` 时间窗+强制测验流程正常，连续打卡天数解锁批数不变
- [ ] 回忆模式按钮在 `n1-adj.html`/`n1-adverb.html`/`n1-onomatope.html`/`n1-noun.html`/`n1.html` 五个页面都能正常工作
- [ ] Escape 键能在回忆模式激活时退出，不误触发 `Router.markAndNext` 或 `BrainwashMode.exit`
- [ ] 方向键左右在回忆模式激活且已揭示时正确记账，未揭示时不响应

```bash
pkill -f "http.server 8002"
```

- [ ] **Step 4: Commit**

```bash
git add index.html n1.html n1-adj.html n1-adverb.html n1-onomatope.html n1-noun.html n2.html n2-adj.html n2-onomatope.html n3.html n4.html n5.html ono.html support.html
git commit -m "$(cat <<'EOF'
bump 静态资源缓存版本号 v48 → v49——回忆模式上线

完成手动测试清单（见 docs/superpowers/specs/2026-08-03-recall-mode-design.md §9.2）。
EOF
)"
```
