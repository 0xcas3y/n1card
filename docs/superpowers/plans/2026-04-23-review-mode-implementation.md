# 每日学习 + 复习计划 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在现有 n1card 上加一层"每日学习 + 复习"计划：日历为入口、一天两 session（晚学 / 早复）、两打卡、金色仪式、SRS-lite 四选一 quiz。

**Architecture:** 纯静态前端，延续现有"`app.js` 一体 + `index.html` inline script"风格，最小切分：抽一个 `plan.js` 纯函数模块供 Node test 和浏览器共用；把首页逻辑抽到新 `hub.js`；`app.js` 扩展滑动卡的"学新模式"（`?session=learn`）。Quiz 是 `app.js` 里的一个视图，和洗脑模式平行。

**Tech Stack:** 原生 ES modules、localStorage、`node --test`、无框架、无构建。

**Spec:** `docs/superpowers/specs/2026-04-23-review-mode-design.md`

---

## 文件结构

**新增：**
- `plan.js` — 纯函数模块（ES module，双端可用）：`computeQuota`、`computeLearnQueue`、`computeMorningPool`、`computeWeeklyDue`、`pickDistractors`、`pruneOldCohorts`、`aggregateCheckIns`
- `hub.js` — 首页逻辑（ES module）：`PlanStore`（读写 `n1card:plan:<level>`）、`DayView`、`RetrospectView`、升级的 `Calendar`
- `scripts/plan.test.js` — `plan.js` 的 Node 单元测试

**修改：**
- `app.js` — `Progress`/`Streak` 扩字段；新增 `QuizMode`；`Router` 加学新模式；`TopBar` 适配
- `index.html` — 日历升级为三态 + 点击路由；嵌入 `hub.js`；增加 DayView/RetrospectView 容器；删除当前内联 streak script
- `styles.css` — `.cal-day.gold`、DayView 卡片、QuizMode 布局
- `scripts/validate-cards.js`（无需改）

**职责边界：**
- `plan.js` 只做**计算**，不读写 storage、不碰 DOM
- `hub.js` 只在首页（index.html）用，不污染等级页
- `app.js` 照旧是等级页主逻辑
- storage 的读写封装：`Progress`/`Streak` 在 `app.js`，`PlanStore` 在 `hub.js`（两者都调用 `plan.js` 里的纯函数）

---

## 重要约定

- **commit 信息**都用现有风格：中文动词前缀（`feat(plan): ...` / `fix(quiz): ...`），最后附 `Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>`
- localStorage key 前缀统一 `n1card:`
- 单元测试只为纯逻辑写；UI 手工在浏览器测
- 每个任务结束**commit**，tests 变绿之后才 commit

---

## Task 1: plan.js 骨架 + 配额函数

**Files:**
- Create: `plan.js`
- Create: `scripts/plan.test.js`

- [ ] **Step 1: 建 `scripts/plan.test.js` 写 `computeQuota` 测试**

```js
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
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npm test`
Expected: FAIL — "Cannot find module '../plan.js'"

- [ ] **Step 3: 建 `plan.js` 实现 `computeQuota`**

```js
// plan.js — 纯函数模块，可在 Node 和浏览器中使用
// 不读写 storage、不碰 DOM

export function computeQuota(streak) {
  if (streak >= 14) return 90;
  if (streak >= 7) return 60;
  return 30;
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npm test`
Expected: PASS — 4 tests passing

- [ ] **Step 5: commit**

```bash
git add plan.js scripts/plan.test.js
git commit -m "$(cat <<'EOF'
feat(plan): add computeQuota (streak→daily new-word quota)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: plan.js — computeLearnQueue

**Files:**
- Modify: `plan.js`
- Modify: `scripts/plan.test.js`

- [ ] **Step 1: 加测试**

Append to `scripts/plan.test.js`:

```js
import { computeLearnQueue } from '../plan.js';

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
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npm test`
Expected: FAIL — `computeLearnQueue is not a function`

- [ ] **Step 3: 实现 `computeLearnQueue`**

Append to `plan.js`:

```js
export function computeLearnQueue(cards, progress, quota) {
  const sorted = [...cards].sort((a, b) => a.id - b.id);
  const queue = [];
  for (const c of sorted) {
    const st = progress[c.id]?.status;
    if (st === 'known' || st === 'unknown') continue;
    queue.push(c);
    if (queue.length >= quota) break;
  }
  return queue;
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npm test`
Expected: PASS — all tests

- [ ] **Step 5: commit**

```bash
git add plan.js scripts/plan.test.js
git commit -m "$(cat <<'EOF'
feat(plan): add computeLearnQueue (next N unseen by id)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: plan.js — computeMorningPool & pruneOldCohorts

**Files:**
- Modify: `plan.js`
- Modify: `scripts/plan.test.js`

- [ ] **Step 1: 加测试**

Append to `scripts/plan.test.js`:

```js
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
```

- [ ] **Step 2: 跑测试，失败**

Run: `npm test`
Expected: FAIL — functions not found

- [ ] **Step 3: 实现**

Append to `plan.js`:

```js
// YYYY-MM-DD → Date (local)
function _parseDate(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

// Date → YYYY-MM-DD (local)
function _fmtDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function _shiftDays(dateStr, delta) {
  const d = _parseDate(dateStr);
  d.setDate(d.getDate() + delta);
  return _fmtDate(d);
}

export function computeMorningPool(cohorts, progress, todayStr) {
  const yesterday = _shiftDays(todayStr, -1);
  const dayBefore = _shiftDays(todayStr, -2);
  const ids = new Set();
  for (const key of [yesterday, dayBefore]) {
    const co = cohorts[key];
    if (!co) continue;
    for (const id of co.cardIds) ids.add(id);
  }
  return [...ids].filter(id => progress[id]?.status === 'unknown');
}

export function pruneOldCohorts(cohorts, todayStr) {
  const keep = new Set([
    todayStr,
    _shiftDays(todayStr, -1),
    _shiftDays(todayStr, -2)
  ]);
  const out = {};
  for (const k of Object.keys(cohorts)) if (keep.has(k)) out[k] = cohorts[k];
  return out;
}
```

- [ ] **Step 4: 跑测试，通过**

Run: `npm test`
Expected: PASS

- [ ] **Step 5: commit**

```bash
git add plan.js scripts/plan.test.js
git commit -m "$(cat <<'EOF'
feat(plan): add computeMorningPool + pruneOldCohorts

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: plan.js — computeWeeklyDue

**Files:**
- Modify: `plan.js`
- Modify: `scripts/plan.test.js`

- [ ] **Step 1: 加测试**

Append to `scripts/plan.test.js`:

```js
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
```

- [ ] **Step 2: 跑测试，失败**

Run: `npm test`
Expected: FAIL

- [ ] **Step 3: 实现**

Append to `plan.js`:

```js
const WEEK_MS = 7 * 24 * 3600 * 1000;

export function computeWeeklyDue(progress, now) {
  const due = [];
  for (const id in progress) {
    const p = progress[id];
    if (p.status !== 'known') continue;
    const last = p.lastWeeklyReviewAt || p.masteredAt;
    if (!last) continue;
    if (now - last >= WEEK_MS) due.push(parseInt(id, 10));
  }
  return due;
}
```

- [ ] **Step 4: 跑测试，通过**

Run: `npm test`
Expected: PASS

- [ ] **Step 5: commit**

```bash
git add plan.js scripts/plan.test.js
git commit -m "$(cat <<'EOF'
feat(plan): add computeWeeklyDue (7-day mastered recheck)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: plan.js — pickDistractors

**Files:**
- Modify: `plan.js`
- Modify: `scripts/plan.test.js`

- [ ] **Step 1: 加测试**

Append to `scripts/plan.test.js`:

```js
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
```

- [ ] **Step 2: 跑测试，失败**

Run: `npm test`
Expected: FAIL

- [ ] **Step 3: 实现**

Append to `plan.js`:

```js
export function pickDistractors(correct, pool, count = 3) {
  const candidates = pool.map(c => c.kana).filter(k => k && k !== correct);
  const unique = [...new Set(candidates)];
  // Fisher–Yates 部分洗牌
  for (let i = unique.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [unique[i], unique[j]] = [unique[j], unique[i]];
  }
  return unique.slice(0, count);
}
```

- [ ] **Step 4: 跑测试，通过**

Run: `npm test`
Expected: PASS

- [ ] **Step 5: commit**

```bash
git add plan.js scripts/plan.test.js
git commit -m "$(cat <<'EOF'
feat(plan): add pickDistractors (random non-equal kanas)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Streak 扩展 — checkIns + isGold + markCheckIn

**Files:**
- Modify: `app.js`
- Create: `scripts/streak.test.js`

Streak 逻辑已经在 `app.js` 里，没有独立文件。为了可测，我们**不**抽出 `streak.js`——改用"直接调 `app.js` 的逻辑"不可能（DOM 依赖）。所以把 Streak 里将要新增的**纯函数**部分挪到 `plan.js`，把 I/O 部分留在 `app.js`。

- [ ] **Step 1: 加 `aggregateCheckIns` 纯函数到 plan.js + 测试**

Append to `scripts/plan.test.js`:

```js
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
```

Append to `plan.js`:

```js
export function aggregateCheckIns(checkIns, dateStr) {
  const c = checkIns?.[dateStr];
  if (!c) return 'none';
  if (c.morning && c.evening) return 'gold';
  if (c.morning || c.evening) return 'half';
  return 'none';
}
```

Run `npm test` — expect PASS.

- [ ] **Step 2: 扩展 `app.js` 里的 `Streak`**

Find `const Streak = { ... }` block (app.js lines ~106–160). Replace it entirely with:

```js
// 打卡：全局（跨 level 共享），记录哪些日期用户真实完成了 session
import { aggregateCheckIns } from './plan.js';

const Streak = {
  key: 'n1card:streak',
  _state: { lastDate: null, current: 0, longest: 0, total: 0, dates: [], checkIns: {} },
  _loaded: false,

  _dateStr(d) {
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  },
  load() {
    if (this._loaded) return;
    try {
      const s = localStorage.getItem(this.key);
      if (s) this._state = { ...this._state, ...JSON.parse(s) };
    } catch {}
    if (!Array.isArray(this._state.dates)) this._state.dates = this._state.lastDate ? [this._state.lastDate] : [];
    if (!this._state.checkIns || typeof this._state.checkIns !== 'object') this._state.checkIns = {};
    this._loaded = true;
  },
  _save() {
    try { localStorage.setItem(this.key, JSON.stringify(this._state)); } catch {}
  },

  markCheckIn(dateStr, kind) {
    this.load();
    if (kind !== 'morning' && kind !== 'evening') return;
    if (!this._state.checkIns[dateStr]) this._state.checkIns[dateStr] = {};
    if (this._state.checkIns[dateStr][kind]) return;  // idempotent
    this._state.checkIns[dateStr][kind] = true;

    // 维护 dates、current、longest、total、lastDate
    if (!this._state.dates.includes(dateStr)) {
      this._state.dates.push(dateStr);
      // 判断是否与 lastDate 连续
      if (this._state.lastDate) {
        const last = new Date(this._state.lastDate);
        last.setDate(last.getDate() + 1);
        const expected = this._dateStr(last);
        this._state.current = (expected === dateStr) ? (this._state.current + 1) : 1;
      } else {
        this._state.current = 1;
      }
      if (this._state.current > this._state.longest) this._state.longest = this._state.current;
      this._state.total += 1;
      this._state.lastDate = dateStr;
    }
    this._save();
  },

  getStatus(dateStr) { this.load(); return aggregateCheckIns(this._state.checkIns, dateStr); },
  getCheckIn(dateStr) { this.load(); return this._state.checkIns[dateStr] || {}; },
  isGold(dateStr) { return this.getStatus(dateStr) === 'gold'; },

  getCurrent() {
    this.load();
    const today = this._dateStr(new Date());
    if (this._state.lastDate === today) return this._state.current;
    const y = new Date(); y.setDate(y.getDate() - 1);
    if (this._state.lastDate === this._dateStr(y)) return this._state.current;
    return 0;
  },
  getLongest() { this.load(); return this._state.longest || 0; },
  getTotal() { this.load(); return this._state.total || 0; },
  getLastDate() { this.load(); return this._state.lastDate; },
  getAllDates() { this.load(); return [...this._state.dates]; }
};
```

- [ ] **Step 3: 去掉老的 `Streak.tick` 入口**

In `app.js`, find `markAndNext(status) { ... Streak.tick(); ... }` and delete the `Streak.tick();` call. The method should become:

```js
markAndNext(status) {
  const card = this.visibleCards[this.currentIndex];
  if (card) {
    Progress.mark(card.id, status);
  }
  this.nextCard();
},
```

- [ ] **Step 4: 在浏览器里打开 index.html 确认不报错**

```bash
python3 -m http.server 8000
# 打开 http://localhost:8000
```

Expected: 原有功能正常运转，顶栏仍显示 streak（来自历史数据），滑动不再 tick 新打卡。

- [ ] **Step 5: commit**

```bash
git add app.js plan.js scripts/plan.test.js
git commit -m "$(cat <<'EOF'
feat(streak): add checkIns + markCheckIn API (per-day morning/evening)

Swipes no longer auto-tick; check-ins now triggered by session completion.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Progress 扩展 — markQuiz + masteredAt backfill

**Files:**
- Modify: `app.js`

- [ ] **Step 1: 扩 Progress 字段 + `markQuiz` + 懒回填**

In `app.js`, find the `const Progress = { ... }` block (around lines 55–103) and replace with:

```js
const Progress = {
  key: `n1card:progress:${LEVEL_KEY}`,
  settingsKey: `n1card:settings:${LEVEL_KEY}`,
  _progress: {},
  _settings: { filter: 'all', ttsRate: 0.9, lastCardId: null },
  _available: true,

  load() {
    try {
      const p = localStorage.getItem(this.key);
      if (p) this._progress = JSON.parse(p);
      const s = localStorage.getItem(this.settingsKey);
      if (s) this._settings = { ...this._settings, ...JSON.parse(s) };
    } catch (err) {
      console.warn('localStorage unavailable:', err);
      this._available = false;
    }
    // 懒回填：已经标了 known 但没有 masteredAt 的，回填为 now
    // 让老用户的掌握词在 7 天后进入周复习
    const now = Date.now();
    let changed = false;
    for (const id in this._progress) {
      const p = this._progress[id];
      if (p.status === 'known' && !p.masteredAt) {
        p.masteredAt = now;
        changed = true;
      }
    }
    if (changed) this._save();
  },
  _save() {
    if (!this._available) return;
    try {
      localStorage.setItem(this.key, JSON.stringify(this._progress));
      localStorage.setItem(this.settingsKey, JSON.stringify(this._settings));
    } catch (err) {
      this._available = false;
    }
  },
  mark(id, status) {
    // 滑动：终态覆盖
    const now = Date.now();
    const entry = this._progress[id] || {};
    entry.status = status;
    entry.lastSeen = now;
    entry.correctStreak = 0;  // 滑动清零 quiz streak
    if (status === 'known') {
      entry.masteredAt = now;
    } else if (status === 'unknown') {
      entry.masteredAt = undefined;
    }
    if (entry.firstLearnedAt === undefined) entry.firstLearnedAt = now;
    this._progress[id] = entry;
    this._save();
  },
  markQuiz(id, correct) {
    const now = Date.now();
    const entry = this._progress[id] || { status: 'unknown', lastSeen: now };
    entry.lastSeen = now;
    entry.quizSeenCount = (entry.quizSeenCount || 0) + 1;

    if (correct) {
      if (entry.status === 'known') {
        entry.lastWeeklyReviewAt = now;  // 周复习续期
      } else {
        // 不熟答对：连对 +1，达到 2 升掌握
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
    this._progress[id] = entry;
    this._save();
  },
  getStatus(id) { return this._progress[id]?.status || null; },
  getEntry(id) { return this._progress[id]; },
  all() { return this._progress; },
  stats() {
    const s = { known: 0, unknown: 0, unseen: 0 };
    for (const k in this._progress) {
      if (this._progress[k].status === 'known') s.known++;
      else if (this._progress[k].status === 'unknown') s.unknown++;
    }
    return s;
  },
  setLastCardId(id) { this._settings.lastCardId = id; this._save(); },
  getLastCardId() { return this._settings.lastCardId; },
  getFilter() { return this._settings.filter; },
  setFilter(f) { this._settings.filter = f; this._save(); },
  getTTSRate() { return this._settings.ttsRate; },
  setTTSRate(r) { this._settings.ttsRate = r; this._save(); },
  reset() { this._progress = {}; this._settings.lastCardId = null; this._save(); },
  isAvailable() { return this._available; }
};
```

- [ ] **Step 2: 加 markQuiz 的单元测试**

Create `scripts/progress.test.js`:

```js
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
```

- [ ] **Step 3: 跑测试，通过**

Run: `npm test`
Expected: PASS — new progress tests + existing plan tests all pass

- [ ] **Step 4: 浏览器验证 backfill 不 break 老数据**

```bash
python3 -m http.server 8000
# 打开 index.html 或 n1.html，看 localStorage 的 n1card:progress:n1 条目
# 已有 status:"known" 的条目应获得 masteredAt 字段（first load 触发）
```

Expected: 原有用户进度仍可见，新字段按需回填。

- [ ] **Step 5: commit**

```bash
git add app.js scripts/progress.test.js
git commit -m "$(cat <<'EOF'
feat(progress): add markQuiz + correctStreak/masteredAt fields

SRS-lite status machine: 2 consecutive correct quiz answers promote
unknown→known; any wrong demotes known→unknown. Swipe remains
authoritative. masteredAt lazy-backfilled for legacy known entries.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: QuizMode 视图（在 app.js 里新加）

**Files:**
- Modify: `app.js`
- Modify: `styles.css`

- [ ] **Step 1: 加 QuizMode 模块到 app.js**

Append to `app.js`, after `const BrainwashMode = { ... };` block:

```js
import { pickDistractors } from './plan.js';

const QuizMode = {
  active: false,
  _queue: [],
  _pool: [],         // 全部同级别卡片池，用于抽干扰项
  _idx: 0,
  _correct: 0,
  _promoted: 0,
  _onComplete: null,

  start({ queue, pool, title, onComplete }) {
    this._queue = queue.slice();
    this._pool = pool;
    this._idx = 0;
    this._correct = 0;
    this._promoted = 0;
    this._onComplete = onComplete;
    this._title = title || '复习';
    this.active = true;
    document.body.classList.add('quiz-on');
    this._renderCurrent();
  },
  exit() {
    this.active = false;
    document.body.classList.remove('quiz-on');
    const stage = document.querySelector('#cardstage');
    if (stage) stage.innerHTML = '';
    TopBar.render();
  },

  _renderCurrent() {
    if (this._idx >= this._queue.length) {
      this._renderSummary();
      return;
    }
    const card = this._queue[this._idx];
    const distractors = pickDistractors(card.kana, this._pool, 3);
    const options = [card.kana, ...distractors];
    for (let i = options.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [options[i], options[j]] = [options[j], options[i]];
    }

    const stage = document.querySelector('#cardstage');
    stage.innerHTML = `
      <div class="quiz-card">
        <div class="quiz-topbar">
          <button class="quiz-exit" id="quiz-exit">← 退出</button>
          <span class="quiz-progress">${this._idx + 1} / ${this._queue.length} · 正确 ${this._correct}</span>
        </div>
        <div class="quiz-word">${card.word}</div>
        <div class="quiz-meaning">${(card.meanings && card.meanings[0]) || ''}</div>
        <div class="quiz-options">
          ${options.map(o => `<button class="quiz-opt" data-val="${o}">${o}</button>`).join('')}
        </div>
      </div>
    `;
    stage.querySelector('#quiz-exit').addEventListener('click', () => this.exit());
    stage.querySelectorAll('.quiz-opt').forEach(btn => {
      btn.addEventListener('click', () => this._handleAnswer(btn, card, options));
    });
  },

  _handleAnswer(btn, card, options) {
    const chosen = btn.dataset.val;
    const correct = chosen === card.kana;
    const before = Progress.getEntry(card.id)?.status;
    Progress.markQuiz(card.id, correct);
    const after = Progress.getEntry(card.id)?.status;
    if (before !== 'known' && after === 'known') this._promoted++;
    if (correct) this._correct++;

    // 可视反馈
    document.querySelectorAll('.quiz-opt').forEach(b => {
      b.disabled = true;
      if (b.dataset.val === card.kana) b.classList.add('quiz-correct');
      else if (b === btn) b.classList.add('quiz-wrong');
    });
    if (correct) TTSEngine.speak(card.kana, { rate: Progress.getTTSRate() });

    setTimeout(() => {
      this._idx++;
      this._renderCurrent();
    }, 700);
  },

  _renderSummary() {
    const total = this._queue.length;
    const stage = document.querySelector('#cardstage');
    stage.innerHTML = `
      <div class="quiz-summary">
        <div class="qs-title">${this._title} 完成</div>
        <div class="qs-line">答对 ${this._correct} / ${total}</div>
        <div class="qs-line">新升掌握 ${this._promoted} 词</div>
        <button class="qs-done" id="qs-done">完成</button>
      </div>
    `;
    stage.querySelector('#qs-done').addEventListener('click', () => {
      const cb = this._onComplete;
      this.exit();
      if (cb) cb({ total, correct: this._correct, promoted: this._promoted });
    });
  }
};
window.QuizMode = QuizMode;  // 供 hub.js 调用
```

- [ ] **Step 2: 加 quiz 相关样式到 styles.css**

Append to `styles.css`:

```css
body.quiz-on #topbar { display: none; }

.quiz-card {
  width: min(92vw, 420px);
  padding: 20px;
  color: #fff;
  display: flex; flex-direction: column; gap: 16px;
}
.quiz-topbar { display: flex; justify-content: space-between; align-items: center; font-size: 13px; opacity: 0.8; }
.quiz-exit { background: none; border: 0; color: #ccc; font-size: 14px; cursor: pointer; padding: 6px 10px; }
.quiz-word { font-size: clamp(48px, 12vw, 80px); font-weight: 600; text-align: center; margin: 12px 0 4px; letter-spacing: 3px; }
.quiz-meaning { font-size: 16px; opacity: 0.85; text-align: center; margin-bottom: 20px; }
.quiz-options { display: flex; flex-direction: column; gap: 10px; }
.quiz-opt {
  padding: 16px;
  border: 1px solid #444;
  background: #1d1d1d; color: #fff;
  font-size: 20px; border-radius: 10px; cursor: pointer;
  transition: background 0.15s, border-color 0.15s;
  font-family: inherit;
}
.quiz-opt:hover:not(:disabled) { background: #2a2a2a; }
.quiz-opt.quiz-correct { background: #2a5d3a; border-color: #4caf50; }
.quiz-opt.quiz-wrong { background: #5d2a2a; border-color: #e57373; }

.quiz-summary { text-align: center; color: #fff; }
.qs-title { font-size: 22px; margin-bottom: 16px; }
.qs-line { font-size: 17px; opacity: 0.9; margin: 6px 0; }
.qs-done {
  margin-top: 24px; padding: 10px 32px;
  background: #4FA896; color: #fff; border: 0; border-radius: 10px;
  font-size: 16px; cursor: pointer; font-family: inherit;
}
```

- [ ] **Step 3: 浏览器里手工演练一次**

打开一个调试控制台的等级页（e.g. n1.html），执行：

```js
QuizMode.start({
  queue: [DataStore.getCard(1), DataStore.getCard(2), DataStore.getCard(3)],
  pool: DataStore.allCards(),
  title: '测试',
  onComplete: r => console.log('完成', r)
});
```

Expected：quiz 视图渲染、点选项有 green/red 反馈、3 题结束后出小结页。

- [ ] **Step 4: 更新 styles.css 版本号**

In `n1.html` / `index.html` 等 HTML, 把 `styles.css?v=29` 改为 `styles.css?v=30`（破 cache）。全局替换：

```bash
grep -rl 'styles.css?v=29' --include='*.html' . | xargs sed -i '' 's/styles.css?v=29/styles.css?v=30/g'
```

Expected: 所有 *.html 里的版本号同步更新。

- [ ] **Step 5: commit**

```bash
git add app.js styles.css *.html
git commit -m "$(cat <<'EOF'
feat(quiz): add QuizMode (4-choice reading test)

Full-screen quiz view with auto-advance, correct/wrong flash,
and summary page. Hooked to Progress.markQuiz for SRS updates.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: Router 学新模式（`?session=learn`）

**Files:**
- Modify: `app.js`

- [ ] **Step 1: 加入"学新模式"状态 + URL 参数处理**

In `app.js`, find the `const Router = { ... }` block. Add these fields/methods:

1. Add state fields (near `currentIndex`):
```js
learnMode: false,
learnQueue: [],
learnCompletedIds: [],
learnReturnUrl: null,
```

2. Add two new methods after `nextCard()`:
```js
async enterLearnSession(queue, returnUrl) {
  this.learnMode = true;
  this.learnQueue = queue.slice();
  this.learnCompletedIds = [];
  this.learnReturnUrl = returnUrl;
  this.visibleCards = queue;
  this.currentIndex = 0;
  this.currentColor = CardView.randomColor();
  this.flipped = false;
  this.showCurrent();
},

_finishLearn() {
  const ids = this.learnCompletedIds.slice();
  const url = this.learnReturnUrl || '/';
  this.learnMode = false;
  this.learnQueue = [];
  this.learnCompletedIds = [];
  this.learnReturnUrl = null;
  // 把完成信号塞进 URL（hub.js 会读取后写 cohort 和 markCheckIn）
  const p = new URLSearchParams();
  p.set('learn_completed', '1');
  p.set('level', LEVEL_KEY);
  p.set('ids', ids.join(','));
  window.location.href = url + '?' + p.toString();
},
```

3. Modify `markAndNext(status)` to track completion in learn mode:
```js
markAndNext(status) {
  const card = this.visibleCards[this.currentIndex];
  if (card) {
    Progress.mark(card.id, status);
    if (this.learnMode) this.learnCompletedIds.push(card.id);
  }
  if (this.learnMode && this.learnCompletedIds.length >= this.learnQueue.length) {
    this._finishLearn();
    return;
  }
  this.nextCard();
},
```

- [ ] **Step 2: DOMContentLoaded 里解析 `?session=learn`**

In `app.js`, modify the bottom `document.addEventListener('DOMContentLoaded', ...)` block. Locate the `await DataStore.load();` line and just after `Router.computeVisible();` add:

```js
    // 若 URL 带 ?session=learn，进入学新模式
    const params = new URLSearchParams(location.search);
    if (params.get('session') === 'learn') {
      const queueIds = (params.get('ids') || '').split(',').map(n => parseInt(n, 10)).filter(Boolean);
      const queue = queueIds
        .map(id => DataStore.getCard(id))
        .filter(Boolean);
      if (queue.length > 0) {
        Router.enterLearnSession(queue, '/');
        document.addEventListener('keydown', (e) => {
          if (e.key === 'Escape' && Router.learnMode) {
            // 允许用户中途退出，回首页（未完成计数不入 cohort）
            window.location.href = '/';
          }
        });
        return;
      }
    }
```

- [ ] **Step 3: TopBar 学新模式下改进度文案**

In `app.js`, find `TopBar.render()`. Replace the `const idx = Router.currentIndex + 1;` / `total` computation at the top of `render()` with:

```js
  render() {
    const topbar = document.querySelector('#topbar');
    let leftHtml;
    const stats = Progress.stats();
    const streak = Streak.getCurrent();
    const streakHtml = streak > 0 ? ` · 🔥${streak}` : '';
    const warn = this.warnings.length ? `<span class="topbar-warn">⚠ ${this.warnings.join(' · ')}</span>` : '';

    if (Router.learnMode) {
      const done = Router.learnCompletedIds.length;
      const total = Router.learnQueue.length;
      leftHtml = `<a class="topbar-left" href="/" style="color: inherit; text-decoration: none;">← 返回 · 学新 ${done}/${total}${streakHtml}${warn}</a>`;
    } else {
      const total = DataStore.allCards().length;
      const idx = Router.currentIndex + 1;
      leftHtml = `<a class="topbar-left" href="index.html" style="color: inherit; text-decoration: none;">📚 ${LEVEL} · ${idx}/${total}${streakHtml}${warn}</a>`;
    }

    topbar.innerHTML = `
      ${leftHtml}
      <div class="topbar-center">已掌握 ${stats.known} · 待巩固 ${stats.unknown}</div>
      <div class="topbar-right">
        <select id="filter-select">
          <option value="all">全部</option>
          <option value="unknown_only">只看待巩固</option>
          <option value="unseen_only">只看未学过</option>
          <option value="random">随机乱序</option>
        </select>
        <a class="settings-btn" href="/grammar/" style="text-decoration: none;" title="切换到文法">📖</a>
        <button class="settings-btn" id="settings-btn">⚙</button>
        <button class="brainwash-btn" id="brainwash-btn" title="洗脑模式">🧠<span class="brainwash-label"> 洗脑</span></button>
      </div>
    `;
    topbar.querySelector('#filter-select').value = Progress.getFilter();
    topbar.querySelector('#filter-select').addEventListener('change', (e) => {
      Router.applyFilter(e.target.value);
    });
    topbar.querySelector('#settings-btn').addEventListener('click', () => SettingsPanel.open());
    topbar.querySelector('#brainwash-btn').addEventListener('click', () => {
      if (typeof BrainwashMode !== 'undefined') BrainwashMode.toggle?.();
    });
  }
```

- [ ] **Step 4: 浏览器手工测试**

```bash
python3 -m http.server 8000
# 打开: http://localhost:8000/n1.html?session=learn&ids=1,2,3
```

Expected:
- 顶栏变成"← 返回 · 学新 0/3"
- 滑动 3 张卡后，自动跳到 `/?learn_completed=1&level=n1&ids=1,2,3`

- [ ] **Step 5: commit**

```bash
git add app.js
git commit -m "$(cat <<'EOF'
feat(router): add learn-session mode (?session=learn&ids=...)

Level page accepts an explicit queue via URL; on completion,
redirects home with learn_completed params for hub.js to wire
up cohort + check-in.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: hub.js 骨架 + PlanStore

**Files:**
- Create: `hub.js`

- [ ] **Step 1: 建 `hub.js`，含 PlanStore + 日期工具**

Create `hub.js`:

```js
// hub.js — 首页（index.html）逻辑：PlanStore + DayView + RetrospectView + Calendar
import {
  computeQuota, computeLearnQueue, computeMorningPool, computeWeeklyDue,
  pruneOldCohorts, aggregateCheckIns, pickDistractors
} from './plan.js';

const LEVELS = ['n1', 'n2', 'n3', 'n4', 'n5'];
const CARD_URLS = { n1: 'data/cards.json', n2: 'data/n2-cards.json', n3: 'data/n3-cards.json', n4: 'data/n4-cards.json', n5: 'data/n5-cards.json' };

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

const Streak = {
  key: 'n1card:streak',
  _state: null,
  load() {
    if (this._state) return this._state;
    try { this._state = JSON.parse(localStorage.getItem(this.key)) || {}; } catch { this._state = {}; }
    if (!this._state.checkIns) this._state.checkIns = {};
    if (!Array.isArray(this._state.dates)) this._state.dates = [];
    return this._state;
  },
  _save() { try { localStorage.setItem(this.key, JSON.stringify(this._state)); } catch {} },
  markCheckIn(dateStr, kind) {
    this.load();
    if (kind !== 'morning' && kind !== 'evening') return;
    if (!this._state.checkIns[dateStr]) this._state.checkIns[dateStr] = {};
    if (this._state.checkIns[dateStr][kind]) return;
    this._state.checkIns[dateStr][kind] = true;
    if (!this._state.dates.includes(dateStr)) {
      this._state.dates.push(dateStr);
      if (this._state.lastDate) {
        const last = new Date(this._state.lastDate);
        last.setDate(last.getDate() + 1);
        const pad = n => String(n).padStart(2, '0');
        const expected = `${last.getFullYear()}-${pad(last.getMonth()+1)}-${pad(last.getDate())}`;
        this._state.current = (expected === dateStr) ? ((this._state.current || 0) + 1) : 1;
      } else {
        this._state.current = 1;
      }
      if ((this._state.current || 0) > (this._state.longest || 0)) this._state.longest = this._state.current;
      this._state.total = (this._state.total || 0) + 1;
      this._state.lastDate = dateStr;
    }
    this._save();
  },
  getStatus(dateStr) { this.load(); return aggregateCheckIns(this._state.checkIns, dateStr); },
  getCheckIn(dateStr) { this.load(); return this._state.checkIns[dateStr] || {}; }
};

const PlanStore = {
  _cache: {},
  key(level) { return `n1card:plan:${level}`; },
  load(level) {
    if (this._cache[level]) return this._cache[level];
    let data = { cohorts: {}, sessions: {}, lastWeeklyRun: 0 };
    try {
      const raw = localStorage.getItem(this.key(level));
      if (raw) data = { ...data, ...JSON.parse(raw) };
    } catch {}
    data.cohorts = pruneOldCohorts(data.cohorts || {}, todayStr());
    this._cache[level] = data;
    return data;
  },
  save(level) {
    const data = this._cache[level];
    if (!data) return;
    try { localStorage.setItem(this.key(level), JSON.stringify(data)); } catch {}
  },
  completeLearn(level, dateStr, cardIds) {
    const data = this.load(level);
    if (!data.cohorts[dateStr]) {
      data.cohorts[dateStr] = { cardIds: [...cardIds], completedAt: Date.now() };
    } else {
      const merged = new Set([...data.cohorts[dateStr].cardIds, ...cardIds]);
      data.cohorts[dateStr] = { cardIds: [...merged], completedAt: Date.now() };
    }
    if (!data.sessions[dateStr]) data.sessions[dateStr] = {};
    data.sessions[dateStr].learn = { status: 'done', completedAt: Date.now(), count: cardIds.length };
    this.save(level);
  },
  completeMorning(level, dateStr, stats) {
    const data = this.load(level);
    if (!data.sessions[dateStr]) data.sessions[dateStr] = {};
    data.sessions[dateStr].morning = { status: 'done', completedAt: Date.now(), ...stats };
    this.save(level);
  },
  completeWeekly(level, dateStr, stats) {
    const data = this.load(level);
    if (!data.sessions[dateStr]) data.sessions[dateStr] = {};
    data.sessions[dateStr].weekly = { status: 'done', completedAt: Date.now(), ...stats };
    data.lastWeeklyRun = Date.now();
    this.save(level);
  }
};

const CurrentLevel = {
  key: 'n1card:current-level',
  get() { try { return localStorage.getItem(this.key) || 'n1'; } catch { return 'n1'; } },
  set(v) { try { localStorage.setItem(this.key, v); } catch {} }
};

// 卡片数据缓存（按需加载）
const CardCache = {
  _map: {},
  async load(level) {
    if (this._map[level]) return this._map[level];
    const res = await fetch(CARD_URLS[level]);
    const j = await res.json();
    this._map[level] = j.cards;
    return j.cards;
  }
};

// Progress 读取（只读；写入由 QuizMode 在各等级页做）
const ProgressRO = {
  get(level) {
    try { return JSON.parse(localStorage.getItem(`n1card:progress:${level}`)) || {}; }
    catch { return {}; }
  }
};

export { Streak, PlanStore, CurrentLevel, CardCache, ProgressRO, todayStr, LEVELS };
```

- [ ] **Step 2: 浏览器 console 确认 import 不报错**

```bash
python3 -m http.server 8000
# 打开 index.html，在 DevTools console:
# const m = await import('./hub.js'); console.log(m);
```

Expected: 模块导出正常，未报错（module 仅定义符号，未渲染）。

- [ ] **Step 3: commit**

```bash
git add hub.js
git commit -m "$(cat <<'EOF'
feat(hub): add PlanStore + Streak + level/card helpers

Foundation for DayView/RetrospectView/Calendar. Pure storage
concerns; no DOM yet.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 11: DayView（今日界面）

**Files:**
- Modify: `hub.js`
- Modify: `index.html`
- Modify: `styles.css`

- [ ] **Step 1: 在 index.html 加 DayView 容器 + view switching**

Edit `index.html`. Change the inline `<script>` block at the bottom to load `hub.js` as a module. Also add containers:

Inside `<div class="hub">`, wrap the existing `.streak-box`, `.streak-cal`, `.level-list` sections in a new `<div id="hub-main">` so we can hide them when DayView is on. Add two sibling containers:

```html
<div id="day-view" style="display:none;"></div>
<div id="retro-view" style="display:none;"></div>
```

Replace the inline `<script>...</script>` at the bottom with:

```html
<script type="module" src="hub.js?v=30"></script>
```

Expected structure of hub body inside `<div class="hub">`:

```html
<div id="hub-main">
  <h1>...</h1>
  <p class="subtitle">...</p>
  <div id="streak-box" class="streak-box" style="display:none;"></div>
  <div id="streak-cal" class="streak-cal" style="display:none;">...</div>
  <div class="level-list">...</div>
  <div class="section-divider">...</div>
  ...
  <p class="footer">...</p>
</div>
<div id="day-view" style="display:none;"></div>
<div id="retro-view" style="display:none;"></div>
```

- [ ] **Step 2: 在 hub.js 底部加 DayView 实现 + 入口路由**

Append to `hub.js`:

```js
const RULES_SEEN_KEY = 'n1card:rules-seen';

async function _sessionStatus(level, dateStr) {
  const plan = PlanStore.load(level);
  const cards = await CardCache.load(level);
  const prog = ProgressRO.get(level);
  const streakState = Streak.load();
  const quota = computeQuota(streakState.current || 0);
  const learnDone = plan.sessions[dateStr]?.learn?.status === 'done';
  const morningDone = plan.sessions[dateStr]?.morning?.status === 'done';
  const weeklyDone = plan.sessions[dateStr]?.weekly?.status === 'done';
  const learnQueue = learnDone ? [] : computeLearnQueue(cards, prog, quota);
  const morningPool = computeMorningPool(plan.cohorts, prog, dateStr);
  const weeklyDueIds = computeWeeklyDue(prog, Date.now());
  return { plan, cards, prog, quota, learnDone, morningDone, weeklyDone, learnQueue, morningPool, weeklyDueIds };
}

const DayView = {
  async render(dateStr) {
    document.querySelector('#hub-main').style.display = 'none';
    document.querySelector('#retro-view').style.display = 'none';
    const el = document.querySelector('#day-view');
    el.style.display = 'block';

    const level = CurrentLevel.get();
    const streakCurrent = Streak.load().current || 0;
    const stat = await _sessionStatus(level, dateStr);

    const rulesSeen = !!localStorage.getItem(RULES_SEEN_KEY);
    const [y, m, d] = dateStr.split('-').map(Number);
    const weekday = ['日','一','二','三','四','五','六'][new Date(y, m-1, d).getDay()];

    const morningStat = Streak.getCheckIn(dateStr).morning ? '✓' : '○';
    const eveningStat = Streak.getCheckIn(dateStr).evening ? '✓' : '○';

    el.innerHTML = `
      <div class="day-head">
        <button class="day-back" id="day-back">← 返回</button>
        <div class="day-date">📅 ${m}月${d}日 · 周${weekday}</div>
        <div class="day-streak">🔥 ${streakCurrent} 天</div>
      </div>

      <div class="day-checks">
        打卡： 🌙 晚 ${eveningStat}  ·  🌅 早 ${morningStat}
      </div>

      <details class="day-rules" ${rulesSeen ? '' : 'open'}>
        <summary>规则</summary>
        <ul>
          <li>🌙 晚打卡 = 完成「学新」（滑卡）</li>
          <li>🌅 早打卡 = 完成「早复习」（四选一）</li>
          <li>连续 7 天 → 60 词/天；14 天 → 90 词/天</li>
          <li>答对 2 次升「掌握」，答错立刻回「不熟」</li>
          <li>「掌握」每 7 天来一次周复习</li>
        </ul>
      </details>

      <div class="day-level">
        当前等级： <span class="day-level-val">${level.toUpperCase()}</span> · 配额 ${stat.quota} 词
      </div>

      <div class="day-sessions">
        ${this._renderMorningCard(stat, dateStr)}
        ${this._renderLearnCard(stat, level, dateStr)}
        ${this._renderWeeklyCard(stat, level, dateStr)}
      </div>

      <div class="day-level-switch">
        <label>切换等级：</label>
        <select id="day-level-sel">
          ${LEVELS.map(l => `<option value="${l}" ${l===level?'selected':''}>${l.toUpperCase()}</option>`).join('')}
        </select>
      </div>
    `;

    el.querySelector('#day-back').addEventListener('click', () => this.exit());
    const details = el.querySelector('.day-rules');
    details.addEventListener('toggle', () => { if (!details.open) localStorage.setItem(RULES_SEEN_KEY, '1'); });
    el.querySelector('#day-level-sel').addEventListener('change', (e) => {
      CurrentLevel.set(e.target.value);
      this.render(dateStr);
    });
    this._attachSessionHandlers(el, stat, level, dateStr);
  },

  _renderMorningCard(stat, dateStr) {
    if (dateStr !== todayStr()) return '';
    const n = stat.morningPool.length;
    const done = stat.morningDone;
    const label = n === 0 ? '今日无早复习（自动 ✓）' : (done ? `✅ 已完成` : `昨+前日 不熟 · ${n} 题`);
    const btn = done ? '' : (n === 0 ? `<button class="ds-btn" data-action="auto-morning">标记完成</button>` : `<button class="ds-btn" data-action="morning">开始</button>`);
    return `<div class="day-session-card"><div class="dsc-icon">🌅</div><div class="dsc-body"><div class="dsc-title">早复习</div><div class="dsc-sub">${label}</div></div>${btn}</div>`;
  },
  _renderLearnCard(stat, level, dateStr) {
    if (dateStr !== todayStr()) return '';
    const n = stat.learnQueue.length;
    const done = stat.learnDone;
    const label = done ? `✅ 已完成` : (n === 0 ? `无未学过词（自动 ✓）` : `0 / ${n}`);
    const btn = done ? '' : (n === 0 ? `<button class="ds-btn" data-action="auto-evening">标记完成</button>` : `<button class="ds-btn" data-action="learn">开始</button>`);
    return `<div class="day-session-card"><div class="dsc-icon">🌙</div><div class="dsc-body"><div class="dsc-title">学新</div><div class="dsc-sub">${label}</div></div>${btn}</div>`;
  },
  _renderWeeklyCard(stat, level, dateStr) {
    if (dateStr !== todayStr()) return '';
    const n = stat.weeklyDueIds.length;
    if (n === 0) return '';
    const btn = stat.weeklyDone ? '' : `<button class="ds-btn" data-action="weekly">开始</button>`;
    const label = stat.weeklyDone ? `✅ 已完成` : `${n} 词到期`;
    return `<div class="day-session-card"><div class="dsc-icon">📆</div><div class="dsc-body"><div class="dsc-title">周复习</div><div class="dsc-sub">${label}</div></div>${btn}</div>`;
  },

  _attachSessionHandlers(el, stat, level, dateStr) {
    el.querySelectorAll('.ds-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const action = btn.dataset.action;
        switch (action) {
          case 'morning': return SessionLauncher.launchMorning(level, dateStr, stat);
          case 'learn': return SessionLauncher.launchLearn(level, dateStr, stat);
          case 'weekly': return SessionLauncher.launchWeekly(level, dateStr, stat);
          case 'auto-morning':
            PlanStore.completeMorning(level, dateStr, { correct: 0, total: 0 });
            Streak.markCheckIn(dateStr, 'morning');
            this.render(dateStr);
            return;
          case 'auto-evening':
            PlanStore.completeLearn(level, dateStr, []);
            Streak.markCheckIn(dateStr, 'evening');
            this.render(dateStr);
            return;
        }
      });
    });
  },

  exit() {
    document.querySelector('#day-view').style.display = 'none';
    document.querySelector('#retro-view').style.display = 'none';
    document.querySelector('#hub-main').style.display = 'block';
    if (typeof window.renderHubBody === 'function') window.renderHubBody();
  }
};

const SessionLauncher = {
  launchLearn(level, dateStr, stat) {
    const ids = stat.learnQueue.map(c => c.id).join(',');
    // 去对应等级页，带 session=learn + ids
    window.location.href = `/${level}.html?session=learn&ids=${ids}`;
  },
  // morning/weekly 留给 Task 12 填充
  launchMorning(level, dateStr, stat) { alert('早复习 TODO Task 12'); },
  launchWeekly(level, dateStr, stat) { alert('周复习 TODO Task 12'); }
};

export { DayView, SessionLauncher };
```

- [ ] **Step 3: 在 hub.js 里把"老内联 streak script"的 hub 渲染逻辑抽出**

Append to `hub.js`:

```js
// 渲染首页 streak-box + streak-cal + 月历（升级为三态 + 可点击）
function renderHubBody() {
  const state = Streak.load();
  const dates = new Set(state.dates || []);
  if ((state.longest || 0) === 0 && dates.size === 0) return;

  const box = document.getElementById('streak-box');
  if (box) {
    box.style.display = 'flex';
    const today = todayStr();
    const current = state.current || 0;
    const longest = state.longest || 0;
    const total = state.total || 0;
    const todayFlag = state.lastDate === today ? '✅' : '';
    box.innerHTML = `
      <div class="item"><div class="num">🔥 ${current}</div><div class="lbl">连续 ${todayFlag}</div></div>
      <div class="item"><div class="num">${longest}</div><div class="lbl">最长</div></div>
      <div class="item"><div class="num">${total}</div><div class="lbl">累计天数</div></div>
    `;
  }

  const cal = document.getElementById('streak-cal');
  if (!cal) return;
  cal.style.display = 'block';
  let viewY = new Date().getFullYear();
  let viewM = new Date().getMonth();
  const pad = n => String(n).padStart(2, '0');
  const fmt = (y, m, d) => `${y}-${pad(m+1)}-${pad(d)}`;
  const todayKey = todayStr();

  const render = () => {
    document.getElementById('cal-month').textContent = `${viewY}年${viewM+1}月`;
    const firstWd = new Date(viewY, viewM, 1).getDay();
    const daysInMonth = new Date(viewY, viewM+1, 0).getDate();
    let html = '';
    for (let i = 0; i < firstWd; i++) html += '<div class="cal-day empty"></div>';
    for (let d = 1; d <= daysInMonth; d++) {
      const ds = fmt(viewY, viewM, d);
      const cls = ['cal-day'];
      const status = Streak.getStatus(ds);
      if (status === 'gold') cls.push('gold');
      else if (status === 'half') cls.push('checked');
      if (ds === todayKey) cls.push('today');
      const isPast = ds < todayKey;
      const isFuture = ds > todayKey;
      const clickable = (ds === todayKey) || (isPast && (status === 'gold' || status === 'half'));
      if (clickable) cls.push('clickable');
      html += `<div class="${cls.join(' ')}" data-date="${ds}">${d}</div>`;
    }
    document.getElementById('cal-grid').innerHTML = html;
    document.getElementById('cal-grid').querySelectorAll('.cal-day.clickable').forEach(el => {
      el.addEventListener('click', () => {
        const ds = el.dataset.date;
        if (ds === todayKey) DayView.render(ds);
        else RetrospectView.render(ds);
      });
    });
  };
  document.getElementById('cal-prev').onclick = () => { viewM--; if (viewM < 0) { viewM = 11; viewY--; } render(); };
  document.getElementById('cal-next').onclick = () => { viewM++; if (viewM > 11) { viewM = 0; viewY++; } render(); };
  render();
}
window.renderHubBody = renderHubBody;

// RetrospectView 占位（Task 13 填充）
const RetrospectView = {
  render(dateStr) { alert(`回顾 ${dateStr} TODO Task 13`); }
};

// 启动：页面加载时渲染首页
document.addEventListener('DOMContentLoaded', () => {
  renderHubBody();

  // 处理 learn_completed 回流
  const params = new URLSearchParams(location.search);
  if (params.get('learn_completed') === '1') {
    const level = params.get('level') || 'n1';
    const ids = (params.get('ids') || '').split(',').map(n => parseInt(n, 10)).filter(Boolean);
    const dateStr = todayStr();
    PlanStore.completeLearn(level, dateStr, ids);
    Streak.markCheckIn(dateStr, 'evening');
    // 清 URL 参数后开 DayView
    history.replaceState({}, '', '/');
    DayView.render(dateStr);
  }
});

export { renderHubBody, RetrospectView, DayView };
```

- [ ] **Step 4: 加 DayView 相关样式到 styles.css**

Append to `styles.css`:

```css
/* DayView + RetrospectView */
#day-view, #retro-view {
  max-width: 600px; margin: 0 auto; padding: 20px 16px;
}
.day-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px; }
.day-back { background: none; border: 0; color: #ccc; font-size: 15px; cursor: pointer; padding: 4px 8px; }
.day-date { font-size: 18px; font-weight: 500; }
.day-streak { font-size: 14px; opacity: 0.8; }
.day-checks { text-align: center; padding: 12px; background: rgba(255,255,255,0.05); border-radius: 10px; margin-bottom: 14px; font-size: 14px; }
.day-rules { background: rgba(255,255,255,0.04); border-radius: 10px; padding: 12px 14px; margin-bottom: 14px; font-size: 13px; }
.day-rules summary { cursor: pointer; opacity: 0.8; font-weight: 500; }
.day-rules ul { margin-top: 10px; padding-left: 20px; line-height: 1.7; opacity: 0.85; }
.day-level { font-size: 14px; opacity: 0.75; margin: 10px 0; text-align: center; }
.day-level-val { color: #4FA896; font-weight: 600; }
.day-sessions { display: flex; flex-direction: column; gap: 10px; }
.day-session-card {
  display: flex; align-items: center; gap: 14px;
  padding: 14px 16px; background: rgba(255,255,255,0.06);
  border-radius: 12px; border: 1px solid rgba(255,255,255,0.08);
}
.dsc-icon { font-size: 22px; }
.dsc-body { flex: 1; }
.dsc-title { font-size: 15px; font-weight: 500; }
.dsc-sub { font-size: 12px; opacity: 0.65; margin-top: 2px; }
.ds-btn {
  background: #4FA896; color: #fff; border: 0;
  padding: 8px 18px; border-radius: 8px; font-size: 14px;
  cursor: pointer; font-family: inherit;
}
.day-level-switch { margin-top: 20px; text-align: center; font-size: 13px; opacity: 0.7; }
.day-level-switch select {
  background: #1a1a1a; color: #fff; border: 1px solid #333;
  padding: 6px 10px; border-radius: 6px; font-family: inherit;
}
```

Also add the gold state for `.cal-day`:

```css
.cal-day.gold { background: #D4A74F; color: #111; opacity: 1; font-weight: 600; box-shadow: 0 0 8px rgba(212, 167, 79, 0.5); }
.cal-day.clickable { cursor: pointer; }
.cal-day.clickable:hover { transform: scale(1.08); }
```

- [ ] **Step 5: 浏览器手工走一遍**

```bash
python3 -m http.server 8000
# 打开 http://localhost:8000
# 先用 DevTools 伪造 streak：
#   localStorage.setItem('n1card:streak', JSON.stringify({lastDate: '2026-04-22', current: 1, longest: 1, total: 1, dates: ['2026-04-22'], checkIns: {'2026-04-22': {morning: true, evening: true}}}))
# 刷新 → 日历 22 号应为金色、可点 → 弹 Retro 占位 alert
# 点今日（23）→ 进 DayView：显示规则区、3 session 卡（学新/早复习空态/周复习若无则隐藏）
# 点"学新 开始" → 跳 n1.html?session=learn&ids=1,2,...
# 滑完 → 回首页自动 DayView，晚打卡 ✓
```

Expected: 所有 flow 可用。

- [ ] **Step 6: commit**

```bash
git add hub.js index.html styles.css
git commit -m "$(cat <<'EOF'
feat(hub): add DayView + interactive calendar + learn-session wiring

Calendar is now clickable (gold/half/today states). Clicking
today opens DayView with rules + session cards. Learn session
launches n1.html?session=learn and learn_completed callback
writes cohort + evening check-in.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 12: 早复习 + 周复习 session 启动

**Files:**
- Modify: `hub.js`
- Modify: 某个等级页 (`n1.html` 起) 加入 `?session=review` 处理

因为 `QuizMode` 定义在 `app.js`（等级页），从首页启动早复习 / 周复习需要跳到等级页并带 URL 参数。

- [ ] **Step 1: `app.js` 识别 `?session=review` URL 参数**

In `app.js`'s `DOMContentLoaded` handler, **before** the `?session=learn` branch already added in Task 9, add:

```js
    if (params.get('session') === 'review') {
      const kind = params.get('kind') || 'morning';   // 'morning' | 'weekly'
      const queueIds = (params.get('ids') || '').split(',').map(n => parseInt(n, 10)).filter(Boolean);
      const queue = queueIds.map(id => DataStore.getCard(id)).filter(Boolean);
      if (queue.length > 0) {
        const title = kind === 'weekly' ? '周复习' : '早复习';
        QuizMode.start({
          queue,
          pool: DataStore.allCards(),
          title,
          onComplete: ({ total, correct, promoted }) => {
            const p = new URLSearchParams();
            p.set('review_completed', '1');
            p.set('level', LEVEL_KEY);
            p.set('kind', kind);
            p.set('total', String(total));
            p.set('correct', String(correct));
            window.location.href = '/?' + p.toString();
          }
        });
        return;
      } else {
        // 空题池直接回去
        window.location.href = `/?review_completed=1&level=${LEVEL_KEY}&kind=${kind}&total=0&correct=0`;
        return;
      }
    }
```

- [ ] **Step 2: `hub.js` 在 DOMContentLoaded 处理 `review_completed`**

Inside the `DOMContentLoaded` block in `hub.js`, **after** the `learn_completed` branch, add:

```js
  if (params.get('review_completed') === '1') {
    const level = params.get('level') || 'n1';
    const kind = params.get('kind') || 'morning';
    const total = parseInt(params.get('total') || '0', 10);
    const correct = parseInt(params.get('correct') || '0', 10);
    const dateStr = todayStr();
    if (kind === 'weekly') {
      PlanStore.completeWeekly(level, dateStr, { correct, total });
    } else {
      PlanStore.completeMorning(level, dateStr, { correct, total });
      Streak.markCheckIn(dateStr, 'morning');
    }
    history.replaceState({}, '', '/');
    DayView.render(dateStr);
    return;
  }
```

- [ ] **Step 3: 更新 `SessionLauncher.launchMorning` / `launchWeekly`**

In `hub.js`, replace the two alert-placeholder methods on `SessionLauncher`:

```js
  launchMorning(level, dateStr, stat) {
    const ids = stat.morningPool.join(',');
    window.location.href = `/${level}.html?session=review&kind=morning&ids=${ids}`;
  },
  launchWeekly(level, dateStr, stat) {
    const ids = stat.weeklyDueIds.join(',');
    window.location.href = `/${level}.html?session=review&kind=weekly&ids=${ids}`;
  }
```

- [ ] **Step 4: 浏览器手工测试**

```bash
python3 -m http.server 8000
# 启动场景：需要早复习可启动的状态
# DevTools：
#   localStorage.setItem('n1card:plan:n1', JSON.stringify({
#     cohorts: {'2026-04-22': {cardIds: [1,2,3,4,5], completedAt: Date.now()}},
#     sessions: {'2026-04-22': {learn: {status:'done', completedAt: Date.now(), count: 5}}}
#   }));
#   const prog = JSON.parse(localStorage.getItem('n1card:progress:n1')||'{}');
#   for (const id of [1,2,3,4,5]) prog[id] = {status:'unknown', lastSeen: Date.now()};
#   localStorage.setItem('n1card:progress:n1', JSON.stringify(prog));
# 刷新首页 → 点今日 → DayView 显示"早复习 5 题" → 点开始 → quiz 跑完 → 回首页自动开 DayView，早打卡 ✓
```

Expected: 打卡状态正确、DayView 刷新后显示"✅ 已完成"、日历 today 变金色（若 learn 也做了）。

- [ ] **Step 5: commit**

```bash
git add app.js hub.js
git commit -m "$(cat <<'EOF'
feat(session): wire morning/weekly quizzes via ?session=review

Hub launches level-page QuizMode via URL; completion returns
to hub with review_completed params which update PlanStore
and Streak.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 13: RetrospectView（过去日期只读）

**Files:**
- Modify: `hub.js`

- [ ] **Step 1: 实现 RetrospectView**

In `hub.js`, replace the placeholder `RetrospectView` with:

```js
const RetrospectView = {
  async render(dateStr) {
    document.querySelector('#hub-main').style.display = 'none';
    document.querySelector('#day-view').style.display = 'none';
    const el = document.querySelector('#retro-view');
    el.style.display = 'block';

    const [y, m, d] = dateStr.split('-').map(Number);
    const weekday = ['日','一','二','三','四','五','六'][new Date(y, m-1, d).getDay()];
    const checkIn = Streak.getCheckIn(dateStr);
    const status = Streak.getStatus(dateStr);
    const goldLabel = status === 'gold' ? '🟡 金' : (status === 'half' ? '🟢 半' : '—');

    const sections = [];
    for (const level of LEVELS) {
      const plan = PlanStore.load(level);
      const session = plan.sessions[dateStr];
      const cohort = plan.cohorts[dateStr];
      if (!session && !cohort) continue;
      const cards = await CardCache.load(level).catch(() => []);
      const byId = Object.fromEntries(cards.map(c => [c.id, c]));
      const wordList = (cohort?.cardIds || [])
        .map(id => byId[id]?.word)
        .filter(Boolean)
        .join(' · ');
      sections.push(`
        <div class="retro-level">
          <div class="retro-level-title">${level.toUpperCase()}</div>
          ${cohort ? `<div class="retro-line">当日学新 ${cohort.cardIds.length} 词${wordList ? '：' + wordList : ''}</div>` : ''}
          ${session?.morning ? `<div class="retro-line">🌅 早复习：答对 ${session.morning.correct} / ${session.morning.total}</div>` : ''}
          ${session?.weekly ? `<div class="retro-line">📆 周复习：答对 ${session.weekly.correct} / ${session.weekly.total}</div>` : ''}
        </div>
      `);
    }

    el.innerHTML = `
      <div class="day-head">
        <button class="day-back" id="retro-back">← 返回</button>
        <div class="day-date">📅 ${m}月${d}日 · 周${weekday}</div>
        <div class="day-streak">${goldLabel}</div>
      </div>
      <div class="day-checks">
        打卡： 🌙 晚 ${checkIn.evening ? '✓' : '—'}  ·  🌅 早 ${checkIn.morning ? '✓' : '—'}
      </div>
      ${sections.length ? sections.join('') : '<div class="retro-empty">这一天没有记录</div>'}
    `;
    el.querySelector('#retro-back').addEventListener('click', () => {
      el.style.display = 'none';
      document.querySelector('#hub-main').style.display = 'block';
      renderHubBody();
    });
  }
};
```

- [ ] **Step 2: 样式**

Append to `styles.css`:

```css
.retro-level { background: rgba(255,255,255,0.05); border-radius: 10px; padding: 12px 14px; margin-bottom: 10px; }
.retro-level-title { font-weight: 600; color: #4FA896; margin-bottom: 6px; }
.retro-line { font-size: 13px; opacity: 0.85; line-height: 1.6; }
.retro-empty { text-align: center; padding: 30px; opacity: 0.5; }
```

- [ ] **Step 3: 浏览器测试**

```bash
# 构造一个过去日有记录的场景（见前面的 DevTools 命令）
# 刷新 → 月历上那天变金色 → 点击 → 进 RetrospectView
```

Expected: 展示当日学的词 + quiz 正确率；返回按钮正常。

- [ ] **Step 4: commit**

```bash
git add hub.js styles.css
git commit -m "$(cat <<'EOF'
feat(hub): add RetrospectView (readonly past-day summary)

Shows per-level cohort words + quiz scores for any past date
with check-in activity.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 14: 清理旧日历脚本 + 手动 QA 清单

**Files:**
- Modify: `index.html`（若 Task 11 没完全删，这里补齐）
- Modify: `docs/testing-checklist.md`（或新建）

- [ ] **Step 1: 确认 index.html 里旧的内联 `<script>`(那段读 `n1card:streak` 的 IIFE) 已删除**

`index.html` 末尾应只剩 `<script type="module" src="hub.js?v=30"></script>`，**不能**有老的 `(function() { try { const raw = localStorage.getItem('n1card:streak'); ... })();`。若还有，删除。

Verify:

Run: `grep -c "n1card:streak" index.html`
Expected: 0（只应从 hub.js 访问 localStorage）

- [ ] **Step 2: 建 / 更新 `docs/testing-checklist.md`**

Append this section (or create the file if absent):

```markdown
## 每日计划 + 复习 QA（2026-04-23 设计）

### 首次使用（空 localStorage）
- [ ] 进首页，看到等级列表。无 streak-box（没打过卡）
- [ ] 直接点 N1 → 正常进自由刷卡模式
- [ ] 先打一卡（滑任意方向）→ 回首页 → 仍无 streak-box（不再 tick）

### Day 1
- [ ] 首页点今日（日历格子）→ DayView 显示规则区（首次自动展开）
- [ ] 学新 30 词队列正确，滑完 → 跳回首页 → DayView 显示 晚打卡 ✓，日历今日半色
- [ ] 早复习显示"今日无早复习（自动 ✓）" → 点"标记完成" → 早打卡 ✓，日历今日金色

### Day 2（需要改系统日期或用 DevTools 造数据）
- [ ] 打开今日 DayView → 早复习显示"昨+前日 不熟 N 题"
- [ ] 开始早复习 → Quiz → 答对 2 次某词 → 完成后回首页看 Progress 顶栏"已掌握" +1
- [ ] 答错某已掌握词 → 回顶栏"已掌握" -1

### Day 3+
- [ ] cohort(1) + cohort(2) 同时出现在早复习池
- [ ] Day 4 时只剩 cohort(2) + cohort(3)

### 跳过一天
- [ ] 跳过 Day 3 → Day 4 早复习池 = cohort(2) ∪ cohort(3)
- [ ] Day 5 pool = cohort(3) ∪ cohort(4)（cohort(2) 已过期、cohort(1) 永久丢失其第二次复习）

### 周复习
- [ ] mastered 7 天后的词出现在"周复习"卡
- [ ] 答对 → 不改状态，只刷新 lastWeeklyReviewAt
- [ ] 答错 → 降回 不熟

### Streak 配额
- [ ] streak 6 → 7 时配额从 30 升 60
- [ ] streak 13 → 14 时升 90
- [ ] streak 断（两日皆无打卡）→ 下次打卡 streak=1，配额 30

### 等级切换
- [ ] DayView 切换等级下拉 → session 内容切换
- [ ] N1 学新 + N5 早复习 → 日历当日金色（跨等级聚合）

### 回顾
- [ ] 点过去金色日 → RetrospectView 展示当日学的词与 quiz 正确率
- [ ] 点未来日期 / 空白日 → 无响应

### 自由模式
- [ ] 直接进 n1.html → 自由刷卡仍工作
- [ ] 滑动修改状态，但日历不打卡

### localStorage 禁用（Safari 隐私模式）
- [ ] 顶栏黄色警告"进度不保存"
- [ ] DayView 仍显示，内存运行
```

- [ ] **Step 3: 跑一遍所有单元测试，确认绿**

Run: `npm test`
Expected: 所有测试通过（plan + progress 共约 25+ 条）

- [ ] **Step 4: Mac Safari + iPhone Safari 过一遍 checklist**

Spot-check 关键路径：
- 首次 DayView
- 学新滑完打卡
- Quiz 答题 + 自动升降
- 日历点击路由（今日 / 过去 / 未来）
- 切等级

- [ ] **Step 5: commit**

```bash
git add docs/testing-checklist.md index.html
git commit -m "$(cat <<'EOF'
docs(testing): add daily-plan QA checklist; clean legacy calendar IIFE

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 15: 部署

**Files:** none

- [ ] **Step 1: 冒烟测试整站**

```bash
python3 -m http.server 8000
# 主路径：打开 / → 点日历 → DayView → 学新 → 回首页 → DayView → 早复习 → 回首页
# 其它页：n1.html / n5.html 正常 / grammar 路径仍可达 / support 页不受影响
```

- [ ] **Step 2: 推 main**

```bash
git push origin main
```

- [ ] **Step 3: 等 GitHub Pages 更新（~1–2 分钟）后验证公网 URL**

Open `https://jlptcards.app` on iPhone Safari：
- 首次加载（清 site data 模拟新用户）
- 走一遍 Day 1 流程
- 确认 iPhone 触控 + 滑动手势正常

---

## 自检摘要（写计划人自查，已过）

- **Spec 覆盖：** 12 节全覆盖；§3.2 session 结构 → Task 10-12；§4 quiz → Task 8；§5 数据模型 → Task 6-7、10；§6 UX → Task 11-13；§7 迁移 → Task 7 `masteredAt` 回填；§8 边界 → Task 11 里 auto-morning / auto-evening 处理；§9 模块边界 → 文件结构匹配；§10 测试 → Task 1-5 单测 + Task 14 手测；§11 里程碑 ≈ 本文件任务序。
- **无占位：** 所有代码块包含可运行内容；所有测试显示 expected 结果。
- **命名一致：** `markCheckIn(date, kind)` 贯穿；`kind ∈ {'morning', 'evening'}`；`PlanStore.completeLearn / completeMorning / completeWeekly`；`Streak.getStatus(date) → 'gold'|'half'|'none'`。
