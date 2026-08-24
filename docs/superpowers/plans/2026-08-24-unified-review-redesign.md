# 统一学习/复习机制重设计 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把"学新批次+时间窗+早晚双打卡+周复习+一般复习"这套只覆盖动词的旧机制，改造成"今日滑卡"单一入口（新词+到期复习混合，滑卡本身即判定），并把全站所有词性（动词/名词/形容词/副词/拟声词/复合动词）统一接入同一套间隔重复算法；另加一个独立的"回忆模式"听读巩固工具。

**Architecture:** 不改 `data/cards*.json` 数据文件和 `scripts/validate-cards.js`。新增的算法纯函数全部加进 `plan.js`（沿用其"纯函数、可测试、不碰 storage/DOM"的既有约定），有状态的存储/DOM 逻辑加进 `app.js`（沿用 `DataStore`/`Progress`/`Streak` 这些既有对象的写法）。原有的独立词性页面（如 `n2-noun.html`）保留不动，继续用旧的单文件 `DataStore.load()` 路径；新增一个 `window.UNIFIED_MODE` 开关，只有显式设置了这个开关的新页面（`today.html`）才会走多文件合并+复合 id 的新路径，两条路径共享同一份 `app.js`，靠这个开关分叉，不会互相影响。

**Tech Stack:** 纯前端静态站点、Node.js `--test`（`node --test 'scripts/**/*.test.js'`）、Web Speech API（TTS）、localStorage。

## Global Constraints

- 不修改 `data/cards*.json` 任何文件，不修改 `scripts/validate-cards.js`
- 不做真正的 FSRS/SM-2 完整算法，固定阶梯 `[1, 3, 7, 14, 30, 90]` 天
- 不做跨设备同步，仍然是纯 `localStorage`
- 原有独立词性页面（`n1-noun.html`、`n2-adj.html` 等）保持现状可用，不接入新的统一进度存储，不被本计划的改动写入
- 新的统一进度用全新 localStorage 键名 `n1card:progress2:${level}`，不覆盖/不读取旧键 `n1card:progress:${LEVEL_KEY}`（除了一次性迁移时读取旧键）
- 迁移只做一次，用 `n1card:migrated:${level}` 标记位防止重复迁移覆盖用户后续数据
- 复合动词只有 N2 有，其余等级的 `LEVEL_CATEGORY_FILES` 里不含 `compound` 键
- 推荐词性顺序固定为：`verb → noun → compound → adj → adverb → onomatope`（compound 只在 N2 生效）

---

## Task 1: plan.js — 间隔重复算法纯函数

**Files:**
- Modify: `plan.js`
- Test: `scripts/plan.test.js`

**Interfaces:**
- Produces: `INTERVAL_LADDER_DAYS`（数组常量）、`advanceIntervalStage(stage)`、`computeNextReviewAt(stage, now)`、`applySwipeResult(entry, correct, now)`、`computeDueIds(progress2, now)`、`migrateOldStatus(oldStatus, now)` — 后续 Task 3 的 `Progress2` 会直接调用这几个函数

- [ ] **Step 1: 在 `plan.js` 末尾追加以下代码**

```js
// ---- 间隔重复算法（Task 1，统一学习/复习机制重设计）----

export const INTERVAL_LADDER_DAYS = [1, 3, 7, 14, 30, 90];

export function advanceIntervalStage(stage) {
  return Math.min(stage + 1, INTERVAL_LADDER_DAYS.length - 1);
}

export function computeNextReviewAt(stage, now) {
  const clamped = Math.max(0, Math.min(stage, INTERVAL_LADDER_DAYS.length - 1));
  return now + INTERVAL_LADDER_DAYS[clamped] * 86400000;
}

// 滑卡判定 -> 新的 progress2 条目（不读写 storage，纯计算）
// entry: 现有条目或 undefined（首次学）；correct: 右滑(true)/左滑(false)
export function applySwipeResult(entry, correct, now) {
  const firstLearnedAt = entry?.firstLearnedAt ?? now;
  if (correct) {
    const wasMaxStage = (entry?.intervalStage ?? -1) >= INTERVAL_LADDER_DAYS.length - 1;
    const nextStage = entry ? advanceIntervalStage(entry.intervalStage) : 0;
    return {
      intervalStage: nextStage,
      nextReviewAt: computeNextReviewAt(nextStage, now),
      lastReviewedAt: now,
      firstLearnedAt,
      graduated: wasMaxStage ? true : (entry?.graduated || false)
    };
  }
  return {
    intervalStage: 0,
    nextReviewAt: computeNextReviewAt(0, now),
    lastReviewedAt: now,
    firstLearnedAt,
    graduated: false
  };
}

// 到期队列：从 progress2（复合id -> entry 的对象）里挑出未毕业且到期的复合id
export function computeDueIds(progress2, now) {
  const due = [];
  for (const compositeId in progress2) {
    const e = progress2[compositeId];
    if (!e || e.graduated) continue;
    if ((e.nextReviewAt ?? 0) <= now) due.push(compositeId);
  }
  return due;
}

// 旧 known/unknown 状态 -> 新 progress2 条目；已掌握从14天档起步，不熟从1天档重来
export function migrateOldStatus(oldStatus, now) {
  if (oldStatus === 'known') {
    return {
      intervalStage: 3,
      nextReviewAt: computeNextReviewAt(3, now),
      lastReviewedAt: now,
      firstLearnedAt: now,
      graduated: false
    };
  }
  if (oldStatus === 'unknown') {
    return {
      intervalStage: 0,
      nextReviewAt: computeNextReviewAt(0, now),
      lastReviewedAt: now,
      firstLearnedAt: now,
      graduated: false
    };
  }
  return null; // 未学过的词不生成条目
}
```

- [ ] **Step 2: 追加测试到 `scripts/plan.test.js`**（文件顶部 import 需要加上新函数名）

```js
import {
  computeQuota, computeLearnQueue, computeBatchesAllowed, isLearnWindowOpen, computeGeneralReviewPool,
  INTERVAL_LADDER_DAYS, advanceIntervalStage, computeNextReviewAt, applySwipeResult, computeDueIds, migrateOldStatus
} from '../plan.js';
```

```js
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
```

- [ ] **Step 3: 运行测试**

Run: `npm test`
Expected: 全部通过，新增 11 条测试

- [ ] **Step 4: Commit**

```bash
git add plan.js scripts/plan.test.js
git commit -m "feat: 间隔重复算法纯函数(1/3/7/14/30/90天阶梯)"
```

---

## Task 2: plan.js — 统一词池合并 + 推荐词性纯函数

**Files:**
- Modify: `plan.js`
- Test: `scripts/plan.test.js`

**Interfaces:**
- Consumes: 无（纯数据+纯函数）
- Produces: `LEVEL_CATEGORY_FILES`、`CATEGORY_ORDER`、`mergeLevelPool(level, categoryCardArrays)`、`pickRecommendedCategory(pool, progress2)`、`computeNewWordQueue(pool, progress2, quota, category)`、`buildTodaySession(newCards, dueCards)` — Task 3 的 `CardPool`/`Progress2` 会调用这些

- [ ] **Step 1: 在 `plan.js` 末尾追加**

```js
// ---- 统一词池（Task 2，统一学习/复习机制重设计）----

export const LEVEL_CATEGORY_FILES = {
  n1: {
    verb: 'data/cards.json',
    noun: 'data/cards-n1-noun.json',
    adj: 'data/cards-n1-adj.json',
    adverb: 'data/cards-n1-adverb.json',
    onomatope: 'data/cards-n1-onomatope.json'
  },
  n2: {
    verb: 'data/cards-n2.json',
    noun: 'data/cards-n2-noun.json',
    compound: 'data/cards-n2-compound.json',
    adj: 'data/cards-n2-adj.json',
    adverb: 'data/cards-n2-adverb.json',
    onomatope: 'data/cards-n2-onomatope.json'
  },
  n3: {
    verb: 'data/cards-n3.json',
    noun: 'data/cards-n3-noun.json',
    adj: 'data/cards-n3-adj.json',
    adverb: 'data/cards-n3-adverb.json',
    onomatope: 'data/cards-n3-onomatope.json'
  },
  n4: {
    verb: 'data/cards-n4.json',
    noun: 'data/cards-n4-noun.json',
    adj: 'data/cards-n4-adj.json',
    adverb: 'data/cards-n4-adverb.json',
    onomatope: 'data/cards-n4-onomatope.json'
  },
  n5: {
    verb: 'data/cards-n5.json',
    noun: 'data/cards-n5-noun.json',
    adj: 'data/cards-n5-adj.json',
    adverb: 'data/cards-n5-adverb.json',
    onomatope: 'data/cards-n5-onomatope.json'
  }
};

// 推荐学习顺序：动词 -> 名词 -> 复合动词(仅N2) -> 形容词 -> 副词 -> 拟声词
export const CATEGORY_ORDER = ['verb', 'noun', 'compound', 'adj', 'adverb', 'onomatope'];

// 合并已经 fetch 好的各词性文件，打 category 标签 + 复合id
// categoryCardArrays: [{ category: 'verb', cards: [...] }, ...]
export function mergeLevelPool(level, categoryCardArrays) {
  const merged = [];
  for (const { category, cards } of categoryCardArrays) {
    for (const c of cards) {
      merged.push({ ...c, category, origId: c.id, compositeId: `${level}:${category}:${c.id}` });
    }
  }
  return merged;
}

// 找出第一个"还有未学词"的词性，全学完返回 null
export function pickRecommendedCategory(pool, progress2) {
  const byCategory = {};
  for (const c of pool) {
    (byCategory[c.category] ??= []).push(c);
  }
  for (const cat of CATEGORY_ORDER) {
    const cards = byCategory[cat];
    if (!cards) continue;
    if (cards.some(c => !progress2[c.compositeId])) return cat;
  }
  return null;
}

// 从指定词性里按原始 id 顺序挑 quota 个未学词
export function computeNewWordQueue(pool, progress2, quota, category) {
  const candidates = pool.filter(c => c.category === category && !progress2[c.compositeId]);
  const sorted = [...candidates].sort((a, b) => a.origId - b.origId);
  return sorted.slice(0, Math.max(0, quota));
}

// 混合今日会话：新词 + 到期复习词，随机打散顺序
export function buildTodaySession(newCards, dueCards) {
  const combined = [...newCards, ...dueCards];
  for (let i = combined.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [combined[i], combined[j]] = [combined[j], combined[i]];
  }
  return combined;
}
```

- [ ] **Step 2: 追加测试到 `scripts/plan.test.js`**（import 里加上新函数名：`mergeLevelPool, pickRecommendedCategory, computeNewWordQueue, buildTodaySession, CATEGORY_ORDER`）

```js
test('mergeLevelPool: 打category标签+复合id，保留原始id为origId', () => {
  const input = [
    { category: 'verb', cards: [{ id: 1, word: '話す' }, { id: 2, word: '書く' }] },
    { category: 'noun', cards: [{ id: 1, word: '本' }] }
  ];
  const merged = mergeLevelPool('n2', input);
  assert.strictEqual(merged.length, 3);
  assert.strictEqual(merged[0].compositeId, 'n2:verb:1');
  assert.strictEqual(merged[0].origId, 1);
  assert.strictEqual(merged[0].category, 'verb');
  assert.strictEqual(merged[2].compositeId, 'n2:noun:1'); // 名词的id=1和动词的id=1不冲突
});

test('pickRecommendedCategory: 动词没学完 -> 返回verb', () => {
  const pool = [
    { category: 'verb', compositeId: 'n2:verb:1' },
    { category: 'noun', compositeId: 'n2:noun:1' }
  ];
  assert.strictEqual(pickRecommendedCategory(pool, {}), 'verb');
});

test('pickRecommendedCategory: 动词学完 -> 跳到noun', () => {
  const pool = [
    { category: 'verb', compositeId: 'n2:verb:1' },
    { category: 'noun', compositeId: 'n2:noun:1' }
  ];
  const progress2 = { 'n2:verb:1': { intervalStage: 0 } };
  assert.strictEqual(pickRecommendedCategory(pool, progress2), 'noun');
});

test('pickRecommendedCategory: 全部学完 -> null', () => {
  const pool = [{ category: 'verb', compositeId: 'n2:verb:1' }];
  const progress2 = { 'n2:verb:1': { intervalStage: 0 } };
  assert.strictEqual(pickRecommendedCategory(pool, progress2), null);
});

test('computeNewWordQueue: 按原始id顺序挑未学词，数量不超过quota', () => {
  const pool = [
    { category: 'noun', origId: 3, compositeId: 'n2:noun:3' },
    { category: 'noun', origId: 1, compositeId: 'n2:noun:1' },
    { category: 'noun', origId: 2, compositeId: 'n2:noun:2' },
    { category: 'verb', origId: 1, compositeId: 'n2:verb:1' }
  ];
  const q = computeNewWordQueue(pool, {}, 2, 'noun');
  assert.deepStrictEqual(q.map(c => c.origId), [1, 2]);
});

test('computeNewWordQueue: 已学过的词被排除', () => {
  const pool = [
    { category: 'noun', origId: 1, compositeId: 'n2:noun:1' },
    { category: 'noun', origId: 2, compositeId: 'n2:noun:2' }
  ];
  const progress2 = { 'n2:noun:1': { intervalStage: 0 } };
  const q = computeNewWordQueue(pool, progress2, 10, 'noun');
  assert.deepStrictEqual(q.map(c => c.origId), [2]);
});

test('buildTodaySession: 合并新词+到期词，长度正确且元素不丢失', () => {
  const newCards = [{ compositeId: 'a' }, { compositeId: 'b' }];
  const dueCards = [{ compositeId: 'c' }];
  const session = buildTodaySession(newCards, dueCards);
  assert.strictEqual(session.length, 3);
  const ids = session.map(c => c.compositeId).sort();
  assert.deepStrictEqual(ids, ['a', 'b', 'c']);
});
```

- [ ] **Step 3: 运行测试**

Run: `npm test`
Expected: 全部通过，新增 7 条测试（累计 Task 1+2 共 18 条新测试）

- [ ] **Step 4: Commit**

```bash
git add plan.js scripts/plan.test.js
git commit -m "feat: 统一词池合并+推荐词性纯函数"
```

---

## Task 3: app.js — CardPool + Progress2 统一存储层

**Files:**
- Modify: `app.js`

**Interfaces:**
- Consumes: `plan.js` 的 `LEVEL_CATEGORY_FILES`、`mergeLevelPool`、`applySwipeResult`、`migrateOldStatus`（新增到 import 语句）
- Produces: `CardPool.load(level)` → `Promise<mergedCards[]>`；`Progress2.mark(compositeId, correct)`、`Progress2.getEntry(compositeId)`、`Progress2.all()` — Task 4 的 `Router`/`DataStore`/`Progress` 分叉逻辑会调用这些

- [ ] **Step 1: 修改 `app.js` 第 1 行的 import，加入新函数**

```js
import {
  aggregateCheckIns, pickDistractors, computeQuota, isLearnWindowOpen,
  LEVEL_CATEGORY_FILES, mergeLevelPool, applySwipeResult, migrateOldStatus
} from './plan.js';
```

- [ ] **Step 2: 在 `Progress` 对象定义之后（`app.js` 第 161 行 `};` 之后，`Streak` 定义之前）插入 `Progress2` 和 `CardPool`**

```js
// 统一进度存储（Task 3，统一学习/复习机制重设计）
// 仅供 window.UNIFIED_MODE 页面使用，键名 progress2 与旧的按页面隔离的 progress 完全独立
const Progress2 = {
  key: `n1card:progress2:${LEVEL_KEY}`,
  _data: {},
  _loaded: false,
  load() {
    if (this._loaded) return;
    try {
      const raw = localStorage.getItem(this.key);
      if (raw) this._data = JSON.parse(raw);
    } catch {}
    this._loaded = true;
  },
  _save() {
    try { localStorage.setItem(this.key, JSON.stringify(this._data)); } catch {}
  },
  mark(compositeId, correct) {
    this.load();
    const now = Date.now();
    this._data[compositeId] = applySwipeResult(this._data[compositeId], correct, now);
    this._save();
  },
  getEntry(compositeId) { this.load(); return this._data[compositeId]; },
  all() { this.load(); return this._data; },
  // oldStatusMap: { compositeId: 'known'|'unknown' }，已有新数据的复合id不覆盖
  migrate(oldStatusMap) {
    this.load();
    const now = Date.now();
    let changed = false;
    for (const compositeId in oldStatusMap) {
      if (this._data[compositeId]) continue;
      const entry = migrateOldStatus(oldStatusMap[compositeId], now);
      if (entry) { this._data[compositeId] = entry; changed = true; }
    }
    if (changed) this._save();
  }
};

// 统一词池加载（多文件合并 + 一次性迁移旧进度）
const CardPool = {
  _cache: {},
  async load(level) {
    if (this._cache[level]) return this._cache[level];
    const registry = LEVEL_CATEGORY_FILES[level];
    if (!registry) throw new Error(`no category registry for level ${level}`);
    const entries = await Promise.all(
      Object.entries(registry).map(async ([category, url]) => {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`${url} fetch failed: ${res.status}`);
        const data = await res.json();
        return { category, cards: data.cards };
      })
    );
    const merged = mergeLevelPool(level, entries);
    this._cache[level] = merged;
    this._maybeMigrate(level, entries);
    return merged;
  },
  _maybeMigrate(level, entries) {
    const flagKey = `n1card:migrated:${level}`;
    try { if (localStorage.getItem(flagKey)) return; } catch { return; }
    const oldStatusMap = {};
    for (const { category } of entries) {
      const oldKey = category === 'verb' ? `n1card:progress:${level}` : `n1card:progress:${level}-${category}`;
      try {
        const raw = localStorage.getItem(oldKey);
        if (!raw) continue;
        const oldProgress = JSON.parse(raw);
        for (const numId in oldProgress) {
          const st = oldProgress[numId]?.status;
          if (st) oldStatusMap[`${level}:${category}:${numId}`] = st;
        }
      } catch {}
    }
    Progress2.migrate(oldStatusMap);
    try { localStorage.setItem(flagKey, '1'); } catch {}
  }
};
```

- [ ] **Step 3: 手动验证（无法用 `node --test` 测试，因为依赖 `fetch`/`localStorage`/浏览器环境，遵循 `Progress`/`DataStore` 现有的"不写单元测试，靠人工过一遍"的既定模式）**

在浏览器 devtools console 里，打开任意页面后执行：
```js
localStorage.setItem('n1card:progress:n2', JSON.stringify({ 1: { status: 'known' }, 2: { status: 'unknown' } }));
localStorage.setItem('n1card:progress:n2-noun', JSON.stringify({ 5: { status: 'known' } }));
```
然后手动 import 并调用 `CardPool.load('n2')`（或等 Task 5 的 `today.html` 页面写好后在那个页面上验证），确认：
- `localStorage.getItem('n1card:progress2:n2')` 出现 `n2:verb:1`(14天档) / `n2:verb:2`(1天档) / `n2:noun:5`(14天档) 三条记录
- `localStorage.getItem('n1card:migrated:n2')` 变成 `'1'`
- 再次调用 `CardPool.load('n2')` 不会重复迁移覆盖数据

- [ ] **Step 4: Commit**

```bash
git add app.js
git commit -m "feat: CardPool统一词池加载 + Progress2统一进度存储(含一次性迁移)"
```

---

## Task 4: app.js — Router 统一会话模式（跳过强制测验、新词左滑重排队）

**Files:**
- Modify: `app.js`

**Interfaces:**
- Consumes: Task 3 的 `Progress2`、Task 2 的 `plan.js` 里已 import 的函数
- Produces: `Router.enterTodaySession(newCards, dueCards)` — Task 5 的页面 bootstrap 脚本调用这个来启动统一会话

- [ ] **Step 1: 修改 `Progress.mark`（app.js 第 98-113 行）加 `UNIFIED_MODE` 分叉**

原代码：
```js
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
```

改成：
```js
  mark(id, status) {
    if (window.UNIFIED_MODE) { Progress2.mark(id, status === 'known'); return; }
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
```

- [ ] **Step 2: 修改 `Router.markAndNext`（app.js 第 1088-1105 行）加"新词左滑重排队"逻辑**

原代码：
```js
  markAndNext(status) {
    const card = this.visibleCards[this.currentIndex];
    if (card) {
      Progress.mark(card.id, status);
      if (this.learnMode) this.learnCompletedIds.push(card.id);
    }
    if (this.learnMode && this.learnCompletedIds.length >= this.learnQueue.length) {
      if (this.learnRetakeDate) this._finishLearn();
      else this._finishBatch();
      return;
    }
    if (this.generalReviewMode && this.currentIndex >= this.visibleCards.length - 1) {
      this.generalReviewMode = false;
      window.location.href = '/';
      return;
    }
    this.nextCard();
  },
```

改成：
```js
  markAndNext(status) {
    const card = this.visibleCards[this.currentIndex];
    if (card) {
      // 统一会话模式下，新词左滑不算数：塞回队尾稍后重考，不写进度、不计入完成数
      if (window.UNIFIED_MODE && card._kind === 'new' && status === 'unknown') {
        this.visibleCards.splice(this.currentIndex, 1);
        this.visibleCards.push(card);
        this.currentColor = CardView.randomColor();
        this.flipped = false;
        this.showCurrent();
        return;
      }
      Progress.mark(card.id, status);
      if (this.learnMode) this.learnCompletedIds.push(card.id);
    }
    if (this.learnMode && this.learnCompletedIds.length >= this.learnQueue.length) {
      if (this.learnRetakeDate) this._finishLearn();
      else this._finishBatch();
      return;
    }
    if (this.generalReviewMode && this.currentIndex >= this.visibleCards.length - 1) {
      this.generalReviewMode = false;
      window.location.href = '/';
      return;
    }
    this.nextCard();
  },
```

- [ ] **Step 3: 修改 `Router._finishBatch`（app.js 第 1158-1170 行）加 `UNIFIED_MODE` 跳过强制测验**

原代码：
```js
  _finishBatch() {
    const batchIds = this.learnCompletedIds.slice();
    this.learnMode = false;
    this.learnQueue = [];
    this.learnCompletedIds = [];
    const batchCards = batchIds.map(id => DataStore.getCard(id)).filter(Boolean);
    QuizMode.start({
      queue: batchCards,
      pool: DataStore.allCards(),
      title: '通关测验',
      onComplete: () => ChoiceScreen.show(batchIds)
    });
  },
```

改成：
```js
  _finishBatch() {
    const batchIds = this.learnCompletedIds.slice();
    this.learnMode = false;
    this.learnQueue = [];
    this.learnCompletedIds = [];
    if (window.UNIFIED_MODE) {
      // 统一会话模式：滑卡本身即判定，不需要额外测验关卡，直接算今日完成
      const p = new URLSearchParams();
      p.set('today_completed', '1');
      p.set('level', LEVEL_KEY);
      window.location.href = '/?' + p.toString();
      return;
    }
    const batchCards = batchIds.map(id => DataStore.getCard(id)).filter(Boolean);
    QuizMode.start({
      queue: batchCards,
      pool: DataStore.allCards(),
      title: '通关测验',
      onComplete: () => ChoiceScreen.show(batchIds)
    });
  },
```

- [ ] **Step 4: 新增 `Router.enterTodaySession`，紧跟在 `Router.enterLearnSession`（app.js 第 1115-1126 行）之后**

```js
  enterTodaySession(newCards, dueCards) {
    const tagged = [
      ...newCards.map(c => ({ ...c, _kind: 'new' })),
      ...dueCards.map(c => ({ ...c, _kind: 'due' }))
    ];
    for (let i = tagged.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [tagged[i], tagged[j]] = [tagged[j], tagged[i]];
    }
    this.enterLearnSession(tagged, '/', null);
  },
```

**注**：这里没有直接用 `plan.js` 的 `buildTodaySession`，是因为需要在打散之前先给每张卡打上 `_kind` 标签（`buildTodaySession` 本身只负责打散，不负责打标签）；Task 5 的 bootstrap 脚本调用这个方法时，`newCards`/`dueCards` 都是从 `CardPool` 里筛出来的原始卡片对象，`id` 字段已经是 Task 3 `mergeLevelPool` 设置的 `compositeId`（`mergeLevelPool` 里 `{ ...c, category, origId: c.id, compositeId: ... }` 并没有覆盖 `id`，所以这里需要在 Task 5 组装 `newCards`/`dueCards` 时把 `id` 字段替换成 `compositeId`，见 Task 5 Step 2）。

- [ ] **Step 5: 手动验证**

跟 Task 3 一样，无法单元测试（依赖 DOM/Gestures/localStorage），留到 Task 6 页面搭好后一起做端到端人工验证（见 Task 6 Step 4 的验证清单）。

- [ ] **Step 6: Commit**

```bash
git add app.js
git commit -m "feat: Router统一会话模式(跳过强制测验+新词左滑重排队)"
```

---

## Task 5: 新页面 today.html + bootstrap 脚本

**Files:**
- Create: `today.html`
- Modify: `app.js`（URL 参数处理部分）

**Interfaces:**
- Consumes: Task 3 `CardPool.load`、Task 4 `Router.enterTodaySession`、Task 2 `pickRecommendedCategory`/`computeNewWordQueue`/`computeDueIds`（新增到 import）
- Produces: `/today.html?level=n2` 页面，供 Task 6 的 `hub.js` `SessionLauncher.launchToday()` 跳转

- [ ] **Step 1: 创建 `today.html`**（结构参照现有 `n2.html`，去掉 `CARD_DATA_URL`，加 `UNIFIED_MODE`；`LEVEL_NAME` 从 URL 的 `level` 参数动态取，因为这一个页面要服务 5 个等级）

```html
<!doctype html>
<html lang="zh">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta http-equiv="Cache-Control" content="no-cache, no-store, must-revalidate">
  <meta http-equiv="Pragma" content="no-cache">
  <meta http-equiv="Expires" content="0">
  <title>今日滑卡</title>
  <link rel="stylesheet" href="styles.css?v=50">
  <script>
    (function () {
      const params = new URLSearchParams(location.search);
      const level = (params.get('level') || 'n1').toLowerCase();
      window.LEVEL_NAME = level.toUpperCase();
      window.UNIFIED_MODE = true;
    })();
  </script>
</head>
<body>
  <div id="app">
    <div id="topbar"></div>
    <div id="cardstage"></div>
  </div>
  <script type="module" src="app.js?v=50"></script>
</body>
</html>
```

- [ ] **Step 2: 在 `app.js` 的 URL 参数处理部分新增 `session=today` 分支**

先读一遍 `app.js` 底部现有的 `session` 参数处理逻辑（第 1226 行往后 `_renderTimeLock`/DOMContentLoaded 等价逻辑所在区域），在同一个 `switch`/`if` 结构里，紧跟在现有 `mode === 'swipe'`／`review`／`retake` 等分支旁边加一个新分支（放在读取 `params.get('session')` 之后）：

```js
    if (params.get('session') === 'today') {
      const level = LEVEL_KEY;
      CardPool.load(level).then(pool => {
        Progress2.load();
        const progress2 = Progress2.all();
        const category = params.get('category') || pickRecommendedCategory(pool, progress2) || 'verb';
        const quota = parseInt(params.get('quota') || '60', 10);
        const scope = params.get('scope') || 'current'; // current | overall
        const newCards = computeNewWordQueue(pool, progress2, quota, category)
          .map(c => ({ ...c, id: c.compositeId }));
        let duePool = pool;
        if (scope === 'current') duePool = pool.filter(c => c.category === category);
        const dueIds = new Set(computeDueIds(progress2, Date.now()));
        const dueCards = duePool
          .filter(c => dueIds.has(c.compositeId))
          .map(c => ({ ...c, id: c.compositeId }));
        Router.enterTodaySession(newCards, dueCards);
      });
      return;
    }
```

同时在文件顶部 import 语句（Task 3 Step 1 已经改过一次）里再补上 `pickRecommendedCategory, computeNewWordQueue, computeDueIds`：

```js
import {
  aggregateCheckIns, pickDistractors, computeQuota, isLearnWindowOpen,
  LEVEL_CATEGORY_FILES, mergeLevelPool, applySwipeResult, migrateOldStatus,
  pickRecommendedCategory, computeNewWordQueue, computeDueIds
} from './plan.js';
```

**注**：`scope=overall`（综合池）时 `duePool = pool` 不做筛选，即整个等级内所有词性的到期词都算进来；跨等级的"综合"（不只是当前等级内综合）留给 Task 7 回忆模式和 Task 6 首页的范围选择器处理，本 Task 只做"当前等级内的 当前主攻/综合" 两档，够用即可（YAGNI，不在这里做跨等级的今日滑卡混合，产品设计里"今日滑卡"本来就是围绕一个等级展开的）。

- [ ] **Step 3: 手动验证**

浏览器打开 `/today.html?level=n2`，确认：
- 页面正常加载卡片
- 滑卡后 `localStorage.getItem('n1card:progress2:n2')` 有对应复合id的新记录
- 60 词滑完后跳转回 `/?today_completed=1&level=n2`，没有弹出测验

- [ ] **Step 4: Commit**

```bash
git add today.html app.js
git commit -m "feat: 新增today.html统一滑卡会话页面"
```

---

## Task 6: hub.js — 今日滑卡统一入口 + 二态打卡日历

**Files:**
- Modify: `hub.js`

**Interfaces:**
- Consumes: 无新依赖（`plan.js` 已有的 `aggregateCheckIns` 等，加上直接读 `localStorage` 的 `n1card:progress2:*`/`n1card:migrated:*`，不需要额外 import，因为 `hub.js` 是独立执行环境，不能直接调用 `app.js` 里定义的 `CardPool`/`Progress2` —— 这两个是 `app.js` 内部对象，`hub.js` 需要自己用 `fetch`+`localStorage` 重新算一遍"今日有多少新词/到期词"这个轻量估算，不需要真的合并整个词池，只需要计数）
- Produces: `SessionLauncher.launchToday(level)`

- [ ] **Step 1: 修改顶部 import，从 `plan.js` 额外引入统一词池相关函数**

原：
```js
import {
  computeLearnQueue, computeMorningPool, computeWeeklyDue,
  pruneOldCohorts, aggregateCheckIns, pickDistractors,
  computeBatchesAllowed, isLearnWindowOpen, computeGeneralReviewPool
} from './plan.js';
```

改为：
```js
import {
  computeBatchesAllowed,
  LEVEL_CATEGORY_FILES, pickRecommendedCategory, computeNewWordQueue, computeDueIds
} from './plan.js';
```

（`computeLearnQueue`/`computeMorningPool`/`computeWeeklyDue`/`pruneOldCohorts`/`pickDistractors`/`isLearnWindowOpen`/`computeGeneralReviewPool`/`aggregateCheckIns` 这些全部只服务于旧的早晚双打卡+周复习+一般复习体系，本次全部下线，`hub.js` 里所有引用它们的代码在本 Task 后续 Step 里一并删除；`plan.js` 文件本身**不删除**这些函数——保留是因为它们是纯函数没有副作用，删掉需要同步改 `scripts/plan.test.js` 里对应的十几条既有测试，属于"清理债务"而非"本次任务必须"，YAGNI，留到以后单独一次清理）

- [ ] **Step 2: 精简 `_sessionStatus` 为今日新词数+到期复习数的轻量估算**（替换 app.js 第 147-165 行整个函数）

原函数删除，改为：
```js
async function _todaySummary(level) {
  const registry = LEVEL_CATEGORY_FILES[level];
  if (!registry) return { newCount: 0, dueCount: 0, category: null };
  let progress2 = {};
  try { progress2 = JSON.parse(localStorage.getItem(`n1card:progress2:${level}`)) || {}; } catch {}
  const entries = await Promise.all(
    Object.entries(registry).map(async ([category, url]) => {
      const res = await fetch(url);
      const data = await res.json();
      return { category, cards: data.cards };
    })
  );
  // 只需要知道"有没有到期/有没有新词"和数量，不需要完整合并对象（跟 app.js 的 CardPool 逻辑重复但各自独立维护，避免 hub.js 依赖 app.js 内部对象）
  const pool = [];
  for (const { category, cards } of entries) {
    for (const c of cards) pool.push({ category, origId: c.id, compositeId: `${level}:${category}:${c.id}` });
  }
  const streakState = Streak.load();
  const batchesAllowed = computeBatchesAllowed(streakState.total || 0);
  const category = pickRecommendedCategory(pool, progress2) || 'verb';
  const newCount = computeNewWordQueue(pool, progress2, batchesAllowed * 60, category).length;
  const dueCount = computeDueIds(progress2, Date.now()).length;
  return { newCount, dueCount, category, batchesAllowed };
}
```

- [ ] **Step 3: 简化 `DayView.render`，把 🌙/🌅 两张卡片合并成一张"今日滑卡"卡片**

删除 `_renderMorningCard`、`_renderLearnCard`、`_renderWeeklyCard`、`_renderGeneralReviewCard` 四个方法（原 app.js 第 238-290 行），替换成一个：

```js
  async _renderTodayCard(dateStr, level) {
    if (dateStr !== todayStr()) return '';
    const summary = await _todaySummary(level);
    const total = summary.newCount + summary.dueCount;
    const done = Streak.getCheckIn(dateStr).done;
    if (done) {
      return `<div class="day-session-card"><div class="dsc-icon">✅</div><div class="dsc-body"><div class="dsc-title">今日滑卡</div><div class="dsc-sub">已完成</div></div></div>`;
    }
    if (total === 0) {
      return `<div class="day-session-card"><div class="dsc-icon">🎉</div><div class="dsc-body"><div class="dsc-title">今日滑卡</div><div class="dsc-sub">暂无新词/到期词</div></div><button class="ds-btn" data-action="auto-today">标记完成</button></div>`;
    }
    return `<div class="day-session-card">
      <div class="dsc-icon">🗂️</div>
      <div class="dsc-body"><div class="dsc-title">今日滑卡</div><div class="dsc-sub">新词 ${summary.newCount} · 到期复习 ${summary.dueCount}</div></div>
      <button class="ds-btn" data-action="today">开始</button>
    </div>`;
  },
```

`DayView.render` 内部原来拼接 `${this._renderMorningCard(...)}${this._renderLearnCard(...)}${this._renderWeeklyCard(...)}${this._renderGeneralReviewCard(...)}` 那一段（原第 213-218 行 `<div class="day-sessions">...</div>`），改成：

```js
      <div class="day-sessions">
        ${await this._renderTodayCard(dateStr, level)}
      </div>
```

（`render` 方法本来就是 `async`，这里直接 `await` 没问题）

- [ ] **Step 4: 简化 `_attachSessionHandlers`，把 `morning`/`learn`/`weekly`/`general-review-*`/`auto-morning`/`auto-evening` 几个 action 全部替换成 `today`/`auto-today` 两个**（app.js 第 292-321 行）

```js
  _attachSessionHandlers(el, level, dateStr) {
    el.querySelectorAll('.ds-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const action = btn.dataset.action;
        if (action === 'today') {
          window.location.href = `/today.html?level=${level}&session=today`;
        } else if (action === 'auto-today') {
          Streak.markCheckIn(dateStr);
          this.render(dateStr);
        }
      });
    });
  },
```

注意 `DayView.render` 里调用这个方法的地方（原第 235 行 `this._attachSessionHandlers(el, stat, level, dateStr);`）要同步改成 `this._attachSessionHandlers(el, level, dateStr);`（去掉 `stat` 参数，因为不再需要 `_sessionStatus` 返回的复杂对象）。`DayView.render` 整个方法体内所有对 `stat.xxx` 的引用（`stat.batchesAllowed` 等）也要一并删除或替换——具体来说，`render` 方法里 `const stat = await _sessionStatus(level, dateStr);` 这一行删除，`当前等级：...· 今日 ${stat.batchesAllowed} 批` 这行文案里的 `${stat.batchesAllowed}` 部分删掉（等级切换本身保留，批数信息不再单独展示，因为"批"这个概念在新流程里已经融进"今日滑卡"卡片的新词计数里了）。

- [ ] **Step 5: 简化 `Streak`，把 `checkIns[date] = {morning, evening}` 两键改成单一 `done` 布尔值**

修改 `markCheckIn`（app.js 第 40-62 行）：

原来接受 `(dateStr, kind)` 且 `kind` 必须是 `'morning'|'evening'`，改成只接受 `(dateStr)`：

```js
  markCheckIn(dateStr) {
    this.load();
    if (this._state.checkIns[dateStr]?.done) return;
    this._state.checkIns[dateStr] = { done: true };
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
```

`getStatus(dateStr)` 原来调用 `aggregateCheckIns` 返回 `'gold'|'half'|'none'` 三态，改成直接返回布尔：

```js
  getStatus(dateStr) { this.load(); return !!this._state.checkIns[dateStr]?.done; },
```

- [ ] **Step 6: 修改日历渲染逻辑，从三态 CSS class 改成二态**（`renderHubBody` 内部 `render` 闭包，app.js 第 379-408 行附近）

原代码里 `const status = Streak.getStatus(ds); if (status === 'gold') cls.push('gold'); else if (status === 'half') cls.push('checked');` 改成：

```js
      const done = Streak.getStatus(ds);
      if (done) cls.push('checked');
```

`clickable`/`isPast` 那行 `const clickable = (ds === todayKey) || (isPast && (status === 'gold' || status === 'half'));` 改成：

```js
      const clickable = (ds === todayKey) || (isPast && done);
```

- [ ] **Step 7: 修改文件顶部结尾处的 URL 参数回流处理（`document.addEventListener('DOMContentLoaded', ...)` 内部）**，把 `learn_completed`/`review_completed`/`retake_completed` 三段回流逻辑，替换成一段 `today_completed`：

原来三个 `if (params.get('xxx_completed') === '1') {...}` 块全部删除，替换成：

```js
  if (params.get('today_completed') === '1') {
    const dateStr = todayStr();
    Streak.markCheckIn(dateStr);
    history.replaceState({}, '', '/');
    DayView.render(dateStr);
    return;
  }
```

- [ ] **Step 8: 删除不再使用的 `SessionLauncher` 方法**（`launchLearn`/`launchMorning`/`launchWeekly`/`launchGeneralReview`，app.js 第 331-348 行），`SessionLauncher` 对象整体可以直接删除（不再被任何地方引用，因为 Step 4 里 `today` action 直接内联跳转 URL，没有走 `SessionLauncher`）——如果后续 Task 7 回忆模式需要类似的跳转封装，到时候再单独加。

- [ ] **Step 9: 更新 `RetrospectView`**（app.js 第 412-474 行），原来展示"当日学新 X 词"+"早复习"+"周复习"三行统计的逻辑，依赖 `PlanStore.load(level)` 的 `cohorts`/`sessions` 结构，这套结构本次改造后不再写入新数据（`PlanStore` 整个对象在新流程里不再被调用）。为了不破坏"点历史日期能看回顾"这个功能，本 Task 里 `RetrospectView` 改成只显示打卡状态（有没有做），不再展示具体学了哪些词——具体做法：`RetrospectView.render` 方法体内 `for (const level of LEVELS) {...}` 整段循环删除（因为其内容全部依赖旧的 `PlanStore.load(level).sessions/cohorts`），只保留顶部的日期/打卡状态展示部分：

```js
  async render(dateStr) {
    document.querySelector('#hub-main').style.display = 'none';
    document.querySelector('#day-view').style.display = 'none';
    const el = document.querySelector('#retro-view');
    el.style.display = 'block';

    const [y, m, d] = dateStr.split('-').map(Number);
    const weekday = ['日','一','二','三','四','五','六'][new Date(y, m-1, d).getDay()];
    const done = Streak.getStatus(dateStr);

    el.innerHTML = `
      <div class="day-head">
        <button class="day-back" id="retro-back">← 返回</button>
        <div class="day-date">📅 ${m}月${d}日 · 周${weekday}</div>
        <div class="day-streak">${done ? '✅' : '—'}</div>
      </div>
      <div class="retro-empty">${done ? '这一天完成了今日滑卡' : '这一天没有打卡记录'}</div>
    `;
    el.querySelector('#retro-back').addEventListener('click', () => {
      el.style.display = 'none';
      document.querySelector('#hub-main').style.display = 'block';
      renderHubBody();
    });
  }
```

（`PlanStore`/`CurrentLevel`/`CardCache`/`ProgressRO`/`LEVELS`/`CARD_URLS`/`LEVEL_LABELS` 这些对象和常量本 Task 不删除——`CurrentLevel`还在被"切换等级"下拉框用，`LEVELS`/`LEVEL_LABELS` 还在被等级切换和词性显示用；`PlanStore`/`CardCache`/`ProgressRO` 虽然不再被新流程调用，但保留不影响功能，属于"清理债务"，YAGNI 到以后单独处理）

- [ ] **Step 10: 手动验证**

浏览器打开首页 `/`：
- "今日滑卡"卡片正确显示新词数+到期复习数
- 点"开始"跳转到 `/today.html?level=xxx&session=today`
- 滑完一批后跳回首页，卡片变成"✅ 已完成"
- 日历格子二态显示正常（今天完成后变实心 `checked` 样式）
- 点历史日期能看到简化后的打卡回顾（不报错）

- [ ] **Step 11: Commit**

```bash
git add hub.js
git commit -m "feat: 首页今日滑卡统一入口(取代早晚双打卡)+二态打卡日历"
```

---

## Task 7: 回忆模式（独立页面 + 两种子模式）

**Files:**
- Create: `recall.html`
- Create: `recall.js`
- Modify: `app.js`（`TTSEngine.speak` 加 `lang` 参数支持中文朗读）

**Interfaces:**
- Consumes: Task 3 的 `CardPool`（通过独立 `fetch`，不依赖 `app.js` 内部对象，因为 `recall.js` 是全新的独立入口，跟 `today.html` 一样各自 fetch，不共享 JS 运行时状态）
- Produces: `/recall.html` 独立页面

- [ ] **Step 1: 扩展 `app.js` 的 `TTSEngine.speak`，支持指定语言（默认日语不变，新增中文选项供回忆模式的"读中文"用）**

原代码（app.js 第 274-294 行）：
```js
  speak(text, { rate = 0.9, onEnd = null, onStart = null } = {}) {
    if (this.muted) { onEnd?.(); return Promise.resolve(); }
    if (!this._supported) { onEnd?.(); return Promise.resolve(); }
    return new Promise((resolve) => {
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'ja-JP';
      if (this._jaVoice) u.voice = this._jaVoice;
      u.rate = rate;
```

改成：
```js
  speak(text, { rate = 0.9, onEnd = null, onStart = null, lang = 'ja-JP' } = {}) {
    if (this.muted) { onEnd?.(); return Promise.resolve(); }
    if (!this._supported) { onEnd?.(); return Promise.resolve(); }
    return new Promise((resolve) => {
      const u = new SpeechSynthesisUtterance(text);
      u.lang = lang;
      if (lang === 'ja-JP' && this._jaVoice) u.voice = this._jaVoice;
      u.rate = rate;
```

（`recall.html` 不复用 `app.js` 的 `TTSEngine`——因为 `app.js` 顶部大量代码依赖 `window.LEVEL_NAME`/`window.CARD_DATA_URL` 单等级假设，`recall.js` 需要跨等级跨词性自由取词，硬塞进 `app.js` 的全局状态模型会很别扭。这里改的是 `app.js` 里的 `TTSEngine`，是为了后续如果要让 `today.html` 也能读中文做准备；`recall.js` 会自己实现一个更小的独立 TTS 封装，见 Step 3）

- [ ] **Step 2: 创建 `recall.html`**

```html
<!doctype html>
<html lang="zh">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover">
  <title>回忆模式</title>
  <link rel="stylesheet" href="styles.css?v=50">
  <style>
    .recall-wrap { max-width: 480px; margin: 0 auto; padding: 24px 20px; }
    .recall-picker { display: flex; flex-direction: column; gap: 12px; margin-bottom: 20px; }
    .recall-picker select { padding: 10px; border-radius: 10px; font-size: 15px; }
    .recall-mode-tabs { display: flex; gap: 8px; margin-bottom: 20px; }
    .recall-mode-tab { flex: 1; padding: 12px; border-radius: 10px; border: 1px solid #444; background: #1a1a1a; color: #ccc; text-align: center; cursor: pointer; }
    .recall-mode-tab.active { background: #4FA896; color: #fff; border-color: #4FA896; }
    .recall-stage { text-align: center; padding: 60px 20px; min-height: 200px; }
    .recall-word { font-size: 32px; font-weight: 600; margin-bottom: 12px; }
    .recall-kana { font-size: 18px; opacity: 0.7; margin-bottom: 20px; }
    .recall-meaning { font-size: 20px; color: #4FA896; min-height: 28px; }
    .recall-progress { font-size: 13px; opacity: 0.5; margin-top: 20px; }
    .recall-gap-setting { display: flex; align-items: center; gap: 10px; justify-content: center; margin-top: 16px; }
  </style>
</head>
<body>
  <div class="recall-wrap">
    <a href="/" style="opacity:0.6;font-size:13px;">← 返回</a>
    <h2>🧠 回忆模式</h2>
    <div class="recall-picker">
      <label>取词范围：
        <select id="recall-scope">
          <option value="current">当前主攻</option>
          <option value="overall">综合（跨等级跨词性）</option>
          <option value="custom">自由指定</option>
        </select>
      </label>
      <div id="recall-custom-picker" style="display:none;">
        <select id="recall-level"><option value="n1">N1</option><option value="n2">N2</option><option value="n3">N3</option><option value="n4">N4</option><option value="n5">N5</option></select>
        <select id="recall-category"><option value="verb">动词</option><option value="noun">名词</option><option value="adj">形容词</option><option value="adverb">副词</option><option value="onomatope">拟声词</option><option value="compound">复合动词(仅N2)</option></select>
      </div>
    </div>
    <div class="recall-mode-tabs">
      <div class="recall-mode-tab active" data-mode="visual">👀 看着复习</div>
      <div class="recall-mode-tab" data-mode="audio">🎧 听力/通勤复习</div>
    </div>
    <div class="recall-gap-setting" id="recall-gap-setting" style="display:none;">
      间隔：
      <select id="recall-gap"><option value="3">3秒</option value="5" selected><option value="5">5秒</option></select>
    </div>
    <button class="ds-btn" id="recall-start" style="width:100%;margin-top:20px;">开始</button>
    <div id="recall-stage" class="recall-stage" style="display:none;"></div>
  </div>
  <script type="module" src="recall.js?v=50"></script>
</body>
</html>
```

- [ ] **Step 3: 创建 `recall.js`**

```js
import { LEVEL_CATEGORY_FILES, mergeLevelPool, computeDueIds } from './plan.js';

const RecallTTS = {
  _supported: 'speechSynthesis' in window,
  _jaVoice: null,
  _zhVoice: null,
  init() {
    if (!this._supported) return;
    const pick = () => {
      const voices = speechSynthesis.getVoices();
      this._jaVoice = voices.find(v => v.lang.startsWith('ja')) || null;
      this._zhVoice = voices.find(v => v.lang.startsWith('zh')) || null;
    };
    pick();
    speechSynthesis.addEventListener('voiceschanged', pick);
  },
  speak(text, lang) {
    if (!this._supported) return Promise.resolve();
    return new Promise((resolve) => {
      const u = new SpeechSynthesisUtterance(text);
      u.lang = lang;
      u.voice = lang === 'zh-CN' ? this._zhVoice : this._jaVoice;
      u.onend = () => resolve();
      u.onerror = () => resolve();
      speechSynthesis.speak(u);
    });
  }
};
RecallTTS.init();

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function loadLevelPool(level) {
  const registry = LEVEL_CATEGORY_FILES[level];
  const entries = await Promise.all(
    Object.entries(registry).map(async ([category, url]) => {
      const res = await fetch(url);
      const data = await res.json();
      return { category, cards: data.cards };
    })
  );
  return mergeLevelPool(level, entries);
}

async function buildPool(scope, customLevel, customCategory) {
  if (scope === 'custom') {
    const pool = await loadLevelPool(customLevel);
    return pool.filter(c => c.category === customCategory);
  }
  // current / overall 都需要用户当前进度来判断"已学过的词"范围；简化处理：
  // current = 当前等级(取 localStorage 里 n1card:current-level，缺省 n1)的已学词；overall = 全部5个等级的已学词
  const levels = scope === 'current' ? [localStorage.getItem('n1card:current-level') || 'n1'] : Object.keys(LEVEL_CATEGORY_FILES);
  let all = [];
  for (const lv of levels) {
    const pool = await loadLevelPool(lv);
    let progress2 = {};
    try { progress2 = JSON.parse(localStorage.getItem(`n1card:progress2:${lv}`)) || {}; } catch {}
    const learned = pool.filter(c => progress2[c.compositeId]);
    all = all.concat(learned);
  }
  return all;
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

let selectedMode = 'visual';
let running = false;

document.querySelectorAll('.recall-mode-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.recall-mode-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    selectedMode = tab.dataset.mode;
    document.getElementById('recall-gap-setting').style.display = selectedMode === 'audio' ? 'flex' : 'none';
  });
});

document.getElementById('recall-scope').addEventListener('change', (e) => {
  document.getElementById('recall-custom-picker').style.display = e.target.value === 'custom' ? 'block' : 'none';
});

document.getElementById('recall-start').addEventListener('click', async () => {
  if (running) return;
  running = true;
  const scope = document.getElementById('recall-scope').value;
  const customLevel = document.getElementById('recall-level').value;
  const customCategory = document.getElementById('recall-category').value;
  const gapSec = parseInt(document.getElementById('recall-gap').value, 10);

  const pool = shuffle(await buildPool(scope, customLevel, customCategory));
  const stage = document.getElementById('recall-stage');
  stage.style.display = 'block';

  for (let i = 0; i < pool.length; i++) {
    const card = pool[i];
    stage.innerHTML = `
      <div class="recall-word">${card.word}</div>
      <div class="recall-kana">${card.word !== card.kana ? card.kana : ''}</div>
      <div class="recall-meaning" id="recall-meaning"></div>
      <div class="recall-progress">${i + 1} / ${pool.length}</div>
    `;
    for (let rep = 0; rep < 3; rep++) {
      if (rep < 2) {
        await RecallTTS.speak(card.kana, 'ja-JP');
        if (selectedMode === 'audio') await sleep(gapSec * 1000);
      } else {
        if (selectedMode === 'visual') {
          document.getElementById('recall-meaning').textContent = (card.meanings && card.meanings[0]) || '';
          await RecallTTS.speak(card.kana, 'ja-JP');
        } else {
          const meaning = (card.meanings && card.meanings[0]) || '';
          await RecallTTS.speak(meaning, 'zh-CN');
        }
      }
    }
    await sleep(400);
  }
  stage.innerHTML = `<div class="recall-word">🎉 本轮完成</div>`;
  running = false;
});
```

- [ ] **Step 4: 手动验证**

浏览器打开 `/recall.html`：
- 三种取词范围（当前主攻/综合/自由指定）都能正常加载词
- 看着复习：前两遍不显示中文，第三遍显示
- 听力复习：前两遍之间有可感知的间隔停顿，第三遍读中文（需要系统装有中文 TTS 语音，若没有会静默跳过，不报错——这是预期行为，不是 bug）
- 全部完成后显示"本轮完成"
- 确认 `localStorage` 里 `n1card:progress2:*` 没有被回忆模式写入任何变化（纯巩固，不影响算法进度）

- [ ] **Step 5: Commit**

```bash
git add recall.html recall.js app.js
git commit -m "feat: 新增回忆模式独立页面(看着复习/听力通勤复习)"
```

---

## Task 8: index.html — 首页入口整合

**Files:**
- Modify: `index.html`

- [ ] **Step 1: 在首页 `.footer` 之前（或紧跟"今日滑卡"卡片渲染容器附近）新增回忆模式入口链接**

在 `index.html` 现有的 `<div class="section-divider">· 拟声拟态 ·</div>` 那一段之前，加一个新的入口区块：

```html
    <div class="section-divider">· 巩固 ·</div>
    <div class="level-list">
      <a class="level-btn external" href="/recall.html" style="background: linear-gradient(135deg, #4FA896, #3E8A9E); border: 0;">
        <span class="lv" style="font-size: 22px;">🧠 回忆模式</span>
        <span class="meta"><span class="count">随时可用</span>看着复习 · 听力通勤复习</span>
        <span class="arrow">›</span>
      </a>
    </div>
```

- [ ] **Step 2: 更新规则说明文案**（`index.html` 里 `<p class="subtitle">` 那一行，原文案提到"晚学新/早复习/金色打卡"）

原：
```html
    <p class="subtitle"><strong>点今日日历</strong>进入当日计划：🌙 晚学新、🌅 早复习，两次打卡都做完 → 日历当日变 🟡 金色。往下也可以选级别直接自由刷卡。</p>
```

改为：
```html
    <p class="subtitle"><strong>点今日日历</strong>进入今日滑卡：新词+到期复习混在一起滑，滑完当天打卡。随时可用「回忆模式」听读巩固，不影响进度。</p>
```

- [ ] **Step 3: 手动验证**

浏览器打开首页，确认"回忆模式"入口可点击跳转，文案更新正确，页面视觉上和现有其他入口卡片风格一致。

- [ ] **Step 4: Commit**

```bash
git add index.html
git commit -m "feat: 首页接入回忆模式入口+更新规则文案"
```

---

## Task 9: 最终验证清单

- [ ] `npm test` 全部通过（含 Task 1+2 新增的 18 条测试）
- [ ] `npm run validate` 全部通过（本计划不改任何 `data/cards*.json`，理应本来就通过，跑一遍确认没有意外改动）
- [ ] 端到端人工过一遍完整流程：
  - 首次进入某等级的"今日滑卡"，确认触发一次性迁移（`n1card:migrated:${level}` 出现），且原有 `known`/`unknown` 数据正确映射到 14天/1天档
  - 滑完一批新词，直接完成打卡，没有强制测验弹窗
  - 新词左滑后重新出现在本次会话稍后位置，右滑后不再出现
  - 到期复习词左滑后 `intervalStage` 回到 0，右滑后正确推进一档
  - 首页日历二态显示正确，历史日期回顾能正常打开不报错
  - 回忆模式两种子模式都能正常播放，不写入 `progress2`
  - 原有独立词性页面（如 `n2-noun.html`）打开后功能完全不受影响，用的还是旧的 `n1card:progress:n2-noun` 键
- [ ] 全分支 review（opus）通过
