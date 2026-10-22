# 全局单词本(收藏) + 卡片学习次数显示 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 卡片右上角圆圈从显示卡号改成显示"这张卡被划过几次"(seenCount)；新增全局收藏功能(跨等级/词性)，收藏的词进一个独立的单词本页面，显示收藏日期。

**Architecture:** `seenCount`是对现有两套进度系统(legacy `Progress`按plain id、统一模式`Progress2`按compositeId)的增量字段，哪套系统标记进度就在哪套系统里+1。收藏是全新的、独立于两套进度系统之外的全局概念，单开一个`favorites.js`纯逻辑模块+专属localStorage key，按`compositeId`存，天然跨等级/词性。单词本页面复用"拉取全部26个词汇文件建索引"这套逻辑——这部分从`hub.js`的首页搜索功能里抽成独立的`wordIndex.js`，两处共用。

**Tech Stack:** 纯浏览器ES module(无打包工具)，Node内置`node:test`跑单元测试，数据是静态JSON文件，持久化是localStorage。

**Spec:** `docs/superpowers/specs/2026-10-22-favorites-notebook-seencount-design.md`

## Global Constraints

- `seenCount`只在**划卡判定**(mark调用，左划/右划)时+1，测验答题(markQuiz)不影响它，也不受它影响。
- 收藏用全局单一localStorage key `n1card:favorites`，格式`{ compositeId: { addedAt } }`，不按等级分区。
- 不回填历史已学词的`seenCount`——新字段，老数据读到`undefined`时显示为`0`。
- 范围只到`app.js`覆盖的词汇卡片页面(传统单文件页 + `today.html`统一会话模式)；`recall.js`、`grammar/`、`onomatope/`明确排除，不接入本次改动。
- 本仓库约定：改完`app.js`/`hub.js`/`styles.css`这几个被多页面共享引用的文件后，**必须**把所有引用它们的HTML文件里的`?v=`查询参数一起bump，否则GitHub Pages/浏览器缓存会让改动"看起来没生效"(这个项目已经因为忘记这一步被用户反馈过两次)。

---

### Task 1: 抽取 wordIndex.js（从 hub.js 搬出全站词汇索引逻辑）

**Files:**
- Create: `wordIndex.js`
- Modify: `hub.js:1-5`（新增import）、`hub.js:380-442`（删除搬走的部分）

**Interfaces:**
- Produces: `wordIndex.js`导出`CATEGORY_LABELS`(Object)、`CATEGORY_TAG_COLOR`(Object)、`categoryPageUrl(level, category) → string`、`WordSearch`对象(`{ async ensureIndex() → Array<{level,category,id,compositeId,word,kana,meaning,pageUrl}>, search(query) → Array }`)。Task 6(notebook.js)会import这三个。

这是纯代码搬移，不改变现有搜索功能的行为，只是多加一个`compositeId`字段给后面的任务用。

- [ ] **Step 1: 创建 `wordIndex.js`**

```js
// wordIndex.js — 跨等级/词性的全站词汇索引：纯逻辑，不碰DOM。
// 给 hub.js 的全局搜索和 notebook.js 的单词本共用，避免同样的"拉取26个
// 词汇文件、建索引"逻辑写两遍。
import { LEVEL_CATEGORY_FILES } from './plan.js';

export const CATEGORY_LABELS = { verb: '动词', noun: '名词', adj: '形容词', adverb: '副词', onomatope: '拟声词', compound: '复合动词' };
export const CATEGORY_TAG_COLOR = { verb: '#4FA896', noun: '#D97B5F', adj: '#8A6FB8', adverb: '#5A9AD4', onomatope: '#C75F87', compound: '#3E8A9E' };

// 词性 -> 对应单词页面的文件名后缀，跟 word-type-picker.html 里的映射保持一致
export function categoryPageUrl(level, category) {
  const suffix = category === 'verb' ? '' : `-${category}`;
  return `${level}${suffix}.html`;
}

export const WordSearch = {
  _index: null,       // 建好后缓存：[{level, category, id, compositeId, word, kana, meaning, pageUrl}, ...]
  _building: null,    // 建索引的 promise，防止用户多次触发重复拉取

  async ensureIndex() {
    if (this._index) return this._index;
    if (this._building) return this._building;
    this._building = (async () => {
      const jobs = [];
      for (const [level, registry] of Object.entries(LEVEL_CATEGORY_FILES)) {
        for (const [category, url] of Object.entries(registry)) {
          jobs.push(
            fetch(url).then(res => res.json()).then(data => ({ level, category, cards: data.cards || [] }))
          );
        }
      }
      const results = await Promise.all(jobs);
      const index = [];
      for (const { level, category, cards } of results) {
        const pageUrl = categoryPageUrl(level, category);
        for (const c of cards) {
          index.push({
            level, category, id: c.id, compositeId: `${level}:${category}:${c.id}`,
            word: c.word, kana: c.kana,
            meaning: (c.meanings && c.meanings[0]) || '',
            pageUrl
          });
        }
      }
      this._index = index;
      return index;
    })();
    return this._building;
  },

  search(query) {
    if (!this._index) return [];
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const hits = [];
    for (const item of this._index) {
      if (
        item.word.toLowerCase().includes(q) ||
        item.kana.toLowerCase().includes(q) ||
        item.meaning.toLowerCase().includes(q)
      ) {
        hits.push(item);
        if (hits.length >= 50) break;
      }
    }
    return hits;
  }
};
```

- [ ] **Step 2: 修改 `hub.js` 头部的 import，加上从 wordIndex.js 引入**

在现有的
```js
import {
  computeBatchesAllowed, pruneOldCohorts,
  LEVEL_CATEGORY_FILES, pickRecommendedCategory, computeNewWordQueue, computeDueIds
} from './plan.js';
```
下面新增一行：
```js
import { CATEGORY_LABELS, CATEGORY_TAG_COLOR, WordSearch } from './wordIndex.js';
```
（`LEVEL_CATEGORY_FILES`在`hub.js`里还有别的地方用，继续保留，不要删。）

- [ ] **Step 3: 删除 `hub.js` 里已经搬到 wordIndex.js 的那段代码**

找到这一段（从注释开始到`WordSearch`对象的闭合`};`结束，`initWordSearch()`函数**不要删**，它是DOM绑定逻辑，留在hub.js）：
```js
// 全站词汇搜索：不分等级/词性，一次性拉取 plan.js 里登记的全部26个词汇文件，
// 在内存里做子串匹配。懒加载——用户第一次跟搜索框交互才去 fetch，
// 建好之后缓存在内存里，同一次页面停留内不用重新拉取。
const CATEGORY_LABELS = { verb: '动词', noun: '名词', adj: '形容词', adverb: '副词', onomatope: '拟声词', compound: '复合动词' };
const CATEGORY_TAG_COLOR = { verb: '#4FA896', noun: '#D97B5F', adj: '#8A6FB8', adverb: '#5A9AD4', onomatope: '#C75F87', compound: '#3E8A9E' };
// 词性 -> 对应单词页面的文件名后缀，跟 word-type-picker.html 里的映射保持一致
function categoryPageUrl(level, category) {
  const suffix = category === 'verb' ? '' : `-${category}`;
  return `${level}${suffix}.html`;
}

const WordSearch = {
  _index: null,       // 建好后缓存：[{level, category, id, word, kana, meaning, pageUrl}, ...]
  _building: null,    // 建索引的 promise，防止用户多次触发重复拉取

  async ensureIndex() {
    if (this._index) return this._index;
    if (this._building) return this._building;
    this._building = (async () => {
      const jobs = [];
      for (const [level, registry] of Object.entries(LEVEL_CATEGORY_FILES)) {
        for (const [category, url] of Object.entries(registry)) {
          jobs.push(
            fetch(url).then(res => res.json()).then(data => ({ level, category, cards: data.cards || [] }))
          );
        }
      }
      const results = await Promise.all(jobs);
      const index = [];
      for (const { level, category, cards } of results) {
        const pageUrl = categoryPageUrl(level, category);
        for (const c of cards) {
          index.push({
            level, category, id: c.id, word: c.word, kana: c.kana,
            meaning: (c.meanings && c.meanings[0]) || '',
            pageUrl
          });
        }
      }
      this._index = index;
      return index;
    })();
    return this._building;
  },

  search(query) {
    if (!this._index) return [];
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const hits = [];
    for (const item of this._index) {
      if (
        item.word.toLowerCase().includes(q) ||
        item.kana.toLowerCase().includes(q) ||
        item.meaning.toLowerCase().includes(q)
      ) {
        hits.push(item);
        if (hits.length >= 50) break;
      }
    }
    return hits;
  }
};
```
替换成一行注释：
```js
// 全站词汇搜索相关的 CATEGORY_LABELS/CATEGORY_TAG_COLOR/categoryPageUrl/WordSearch
// 已经抽到 wordIndex.js，这里只保留跟首页搜索框DOM绑定相关的 initWordSearch()
```

- [ ] **Step 4: 语法检查**

Run: `node --check hub.js && node --check wordIndex.js`
Expected: 两个都不报错（无输出即成功）

- [ ] **Step 5: 手动验证首页搜索功能行为没变**

本地起个静态服务器（比如`npx serve .`或任何能serve静态文件的方式），打开首页，在搜索框输入一个已知存在的词（比如"ありふれる"），确认：
- 第一次focus搜索框时有"正在加载词库…"提示
- 输入后能正确显示结果（标签/单词/假名/释义都对）
- 点结果能跳转到对应页面并定位到那张卡

- [ ] **Step 6: Commit**

```bash
git add wordIndex.js hub.js
git commit -m "refactor: 把hub.js里的全站词汇索引逻辑抽到独立的wordIndex.js

纯代码搬移，首页搜索行为不变。给索引记录加了compositeId字段，
后面的单词本功能(notebook.js)要靠它跟收藏数据对应起来。"
```

---

### Task 2: favorites.js 模块 + 单元测试

**Files:**
- Create: `favorites.js`
- Test: `scripts/favorites.test.js`

**Interfaces:**
- Consumes: 无
- Produces: `favorites.js`导出纯函数`toggleFavorite(favMap, compositeId, now) → newFavMap`、`isFavorited(favMap, compositeId) → boolean`，以及`Favorites`对象(`{ toggle(compositeId) → boolean, remove(compositeId) → void, isFavorited(compositeId) → boolean, all() → Object }`)。Task 5(卡片心形按钮)和Task 6(单词本页面)都会import `Favorites`。

- [ ] **Step 1: 写失败的测试 `scripts/favorites.test.js`**

```js
import { test } from 'node:test';
import assert from 'node:assert';
import { toggleFavorite, isFavorited } from '../favorites.js';

test('toggleFavorite: 第一次收藏 → 加进map，带上addedAt', () => {
  const next = toggleFavorite({}, 'n1:verb:5', 1000);
  assert.deepStrictEqual(next, { 'n1:verb:5': { addedAt: 1000 } });
});

test('toggleFavorite: 已收藏的再收藏一次 → 从map里移除(取消收藏)', () => {
  const start = { 'n1:verb:5': { addedAt: 1000 } };
  const next = toggleFavorite(start, 'n1:verb:5', 2000);
  assert.deepStrictEqual(next, {});
});

test('toggleFavorite: 不影响map里其他key', () => {
  const start = { 'n1:verb:5': { addedAt: 1000 }, 'n2:noun:9': { addedAt: 500 } };
  const next = toggleFavorite(start, 'n1:verb:5', 2000);
  assert.deepStrictEqual(next, { 'n2:noun:9': { addedAt: 500 } });
});

test('toggleFavorite: 不做原地修改，传入的原map保持不变', () => {
  const start = { 'n1:verb:5': { addedAt: 1000 } };
  toggleFavorite(start, 'n1:verb:5', 2000);
  assert.deepStrictEqual(start, { 'n1:verb:5': { addedAt: 1000 } });
});

test('isFavorited: 存在的compositeId → true', () => {
  assert.strictEqual(isFavorited({ 'n1:verb:5': { addedAt: 1000 } }, 'n1:verb:5'), true);
});

test('isFavorited: 不存在的compositeId → false', () => {
  assert.strictEqual(isFavorited({ 'n1:verb:5': { addedAt: 1000 } }, 'n2:noun:9'), false);
});
```

- [ ] **Step 2: 运行测试，确认失败**

Run: `node --test scripts/favorites.test.js`
Expected: FAIL，报错找不到`../favorites.js`模块

- [ ] **Step 3: 创建 `favorites.js`**

```js
// favorites.js — 全局收藏(跨等级/词性)：纯逻辑模块，不碰DOM。
// 跟 Progress/Progress2(按等级分区存) 完全独立，键用 compositeId
// (level:category:id)，所以同一个词不管在哪个等级/词性页面收藏，
// 到单词本里看都是同一条，不会因为"是在n1页面收藏的还是n2页面收藏的"
// 而分裂成两条。
const KEY = 'n1card:favorites';

// 纯函数：方便单测，不直接碰 localStorage，也不做原地修改
export function toggleFavorite(favMap, compositeId, now) {
  const next = { ...favMap };
  if (next[compositeId]) {
    delete next[compositeId];
  } else {
    next[compositeId] = { addedAt: now };
  }
  return next;
}

export function isFavorited(favMap, compositeId) {
  return !!favMap[compositeId];
}

export const Favorites = {
  _map: null,
  load() {
    if (this._map) return this._map;
    try {
      const raw = localStorage.getItem(KEY);
      this._map = raw ? JSON.parse(raw) : {};
    } catch {
      this._map = {};
    }
    return this._map;
  },
  _save() {
    try { localStorage.setItem(KEY, JSON.stringify(this._map)); } catch {}
  },
  // 心形按钮点击用：切换收藏状态，返回切换后是不是已收藏
  toggle(compositeId) {
    this.load();
    this._map = toggleFavorite(this._map, compositeId, Date.now());
    this._save();
    return isFavorited(this._map, compositeId);
  },
  // 单词本"移除"按钮用：明确删除，不是toggle(避免双击误操作又加回去)
  remove(compositeId) {
    this.load();
    if (!this._map[compositeId]) return;
    const next = { ...this._map };
    delete next[compositeId];
    this._map = next;
    this._save();
  },
  isFavorited(compositeId) {
    this.load();
    return isFavorited(this._map, compositeId);
  },
  all() {
    this.load();
    return this._map;
  }
};
```

- [ ] **Step 4: 运行测试，确认通过**

Run: `node --test scripts/favorites.test.js`
Expected: PASS，6个测试全部通过

- [ ] **Step 5: Commit**

```bash
git add favorites.js scripts/favorites.test.js
git commit -m "feat: 新增favorites.js全局收藏模块，按compositeId存，跨等级/词性"
```

---

### Task 3: seenCount 字段（Progress.mark + Progress2.mark）

**Files:**
- Modify: `app.js:116-132`（`Progress.mark`）、`app.js:199-204`（`Progress2.mark`）
- Test: `scripts/progress.test.js`（追加测试）

**Interfaces:**
- Consumes: 无新依赖
- Produces: 两套进度系统的entry对象里多一个`seenCount`字段(number)。Task 4会读`Progress.getEntry(id)?.seenCount`和`Progress2.getEntry(compositeId)?.seenCount`。

- [ ] **Step 1: 在 `scripts/progress.test.js` 末尾追加失败的测试**

打开`scripts/progress.test.js`，在文件末尾加上：

```js
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
```

- [ ] **Step 2: 运行测试，确认新测试失败**

Run: `node --test scripts/progress.test.js`
Expected: 新加的2个测试 FAIL（这时候还没改app.js，但因为是复制的逻辑独立测试，其实这一步测的是"复制过去的逻辑本身对不对"——正常应该直接PASS。如果PASS就跳过Step3里legacy部分照抄即可，继续走Step 3改真正的app.js）

- [ ] **Step 3: 修改 `app.js` 的 `Progress.mark`**

把
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
改成：
```js
  mark(id, status) {
    if (window.UNIFIED_MODE) { Progress2.mark(id, status === 'known'); return; }
    // 滑动：终态覆盖
    const now = Date.now();
    const entry = this._progress[id] || {};
    entry.seenCount = (entry.seenCount || 0) + 1;
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

- [ ] **Step 4: 在 `scripts/progress.test.js` 追加 Progress2 的测试**

接着上面继续加：

```js
// ── Progress2.mark 的 seenCount 包装逻辑，复制自app.js ──
// applySwipeResult本身的行为已经在plan.test.js测过，这里只测seenCount包装对不对
import { applySwipeResult } from '../plan.js';

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
```

注意：`import { applySwipeResult } from '../plan.js';` 这行要放在文件**最上面**（跟已有的`import { test } from 'node:test';`和`import assert from 'node:assert';`放一起），ES module的import不能写在文件中间。

- [ ] **Step 5: 运行测试，确认失败**

Run: `node --test scripts/progress.test.js`
Expected: 新加的`markUnified`相关测试 FAIL（因为还没改`app.js`的`Progress2.mark`——不过这两个测试本身测的是复制出来的逻辑，如果写对了应该直接PASS；这一步主要是确认测试本身没写错，不是在测app.js）

- [ ] **Step 6: 修改 `app.js` 的 `Progress2.mark`**

把
```js
  mark(compositeId, correct) {
    this.load();
    const now = Date.now();
    this._data[compositeId] = applySwipeResult(this._data[compositeId], correct, now);
    this._save();
  },
```
改成：
```js
  mark(compositeId, correct) {
    this.load();
    const now = Date.now();
    const prevCount = this._data[compositeId]?.seenCount || 0;
    const updated = applySwipeResult(this._data[compositeId], correct, now);
    updated.seenCount = prevCount + 1;
    this._data[compositeId] = updated;
    this._save();
  },
```

- [ ] **Step 7: 运行全部测试，确认通过**

Run: `node --test scripts/progress.test.js`
Expected: PASS，全部测试通过（包括原有的markQuiz测试）

- [ ] **Step 8: 语法检查整个app.js**

Run: `node --check app.js`
Expected: 无输出（成功）

- [ ] **Step 9: Commit**

```bash
git add app.js scripts/progress.test.js
git commit -m "feat: Progress.mark/Progress2.mark新增seenCount字段，每次划卡判定+1

测验答题(markQuiz)不受影响，是独立的quizSeenCount。"
```

---

### Task 4: 卡片右上角显示 seenCount（替代卡号）

**Files:**
- Modify: `app.js:503-504`附近新增helper函数、`app.js`里`CardView.renderFront`和`renderBack`各一处
- Modify: `styles.css:26-33`（`.card-id`字号）

**Interfaces:**
- Consumes: Task 3产出的`seenCount`字段（通过`Progress.getEntry`/`Progress2.getEntry`读取）
- Produces: 无新接口，纯UI展示变化

- [ ] **Step 1: 在 `app.js` 里 `CardView` 定义之前新增 helper 函数**

找到：
```js
const CardView = {
  randomColor() { return COLORS[Math.floor(Math.random() * COLORS.length)]; },
```
在它上面加：
```js
function getSeenCount(card) {
  return window.UNIFIED_MODE
    ? (Progress2.getEntry(card.compositeId)?.seenCount || 0)
    : (Progress.getEntry(card.id)?.seenCount || 0);
}

const CardView = {
  randomColor() { return COLORS[Math.floor(Math.random() * COLORS.length)]; },
```

- [ ] **Step 2: 修改 `renderFront` 和 `renderBack` 里的 `.card-id`**

两处都把
```js
      <div class="card-id">${card.origId ?? card.id}</div>
```
改成：
```js
      <div class="card-id">${getSeenCount(card)}</div>
```
（`renderFront`和`renderBack`各一处，一共改2处，可以用编辑器的"替换全部"，这两处当前内容完全一致。）

- [ ] **Step 3: 修改 `styles.css` 的 `.card-id` 字号**

把
```css
.card-id {
  position: absolute; top: 24px; right: 24px;
  width: 38px; height: 38px;
  border: 2px solid rgba(255,255,255,0.85);
  border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  font-size: 18px; font-weight: 500;
}
```
改成：
```css
.card-id {
  position: absolute; top: 24px; right: 24px;
  width: 38px; height: 38px;
  border: 2px solid rgba(255,255,255,0.85);
  border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  font-size: 13px; font-weight: 500;
}
```

- [ ] **Step 4: 语法检查**

Run: `node --check app.js`
Expected: 无输出（成功）

- [ ] **Step 5: 手动验证**

起本地静态服务器，打开`n1.html`（传统页面）：
- 翻到任意一张新卡，右上角圆圈应该显示"0"
- 左划或右划一次，再翻回这张卡，应该显示"1"
- 再划一次，变成"2"

打开`today.html`（统一会话模式），重复同样的验证。

- [ ] **Step 6: Commit**

```bash
git add app.js styles.css
git commit -m "feat: 卡片右上角圆圈从显示卡号改成显示学习次数(seenCount)"
```

---

### Task 5: 卡片正面收藏心形按钮

**Files:**
- Modify: `app.js`头部import、`app.js`的`Gestures.attach`（pointerdown/pointerup两处）、`CardView.renderFront`、`Router.showCurrent`
- Modify: `styles.css`（新增`.fav-heart`样式）

**Interfaces:**
- Consumes: Task 2产出的`Favorites`（`isFavorited(compositeId)`/`toggle(compositeId)`）
- Produces: 无新接口，卡片正面多一个可点击的收藏图标

- [ ] **Step 1: `app.js` 头部新增 import**

找到：
```js
import {
  aggregateCheckIns, pickDistractors, computeQuota, isLearnWindowOpen,
  LEVEL_CATEGORY_FILES, mergeLevelPool, applySwipeResult, migrateOldStatus,
  pickRecommendedCategory, computeNewWordQueue, computeDueIds
} from './plan.js';
```
下面加一行：
```js
import { Favorites } from './favorites.js';
```

- [ ] **Step 2: 修改 `Gestures.attach`，把 `.fav-heart` 排除在手势判定之外**

找到：
```js
    el.addEventListener('pointerdown', (e) => {
      if (e.target.closest('.sentence-row')) { touchStart = null; return; }
      touchStart = { x: e.clientX, y: e.clientY, t: performance.now() };
    });
    el.addEventListener('pointercancel', () => { touchStart = null; clearTap(); });
    el.addEventListener('pointerup', (e) => {
      if (e.target.closest('.sentence-row')) { touchStart = null; clearTap(); return; }
```
改成：
```js
    el.addEventListener('pointerdown', (e) => {
      if (e.target.closest('.sentence-row') || e.target.closest('.fav-heart')) { touchStart = null; return; }
      touchStart = { x: e.clientX, y: e.clientY, t: performance.now() };
    });
    el.addEventListener('pointercancel', () => { touchStart = null; clearTap(); });
    el.addEventListener('pointerup', (e) => {
      if (e.target.closest('.sentence-row') || e.target.closest('.fav-heart')) { touchStart = null; clearTap(); return; }
```

- [ ] **Step 3: 修改 `CardView.renderFront`，加上心形按钮**

把
```js
  renderFront(card, color) {
    const el = document.createElement('div');
    el.className = `flash-card color-${color}`;
    el.innerHTML = `
      <div class="card-id">${getSeenCount(card)}</div>
      <div class="front-center"><div class="front-word" data-len="${[...card.word].length}">${card.word}</div></div>
      <div class="hint-bottom">单击发音 · 双击翻面 · ←难 →易</div>
    `;
    return el;
  },
```
改成：
```js
  renderFront(card, color) {
    const el = document.createElement('div');
    el.className = `flash-card color-${color}`;
    const isFav = Favorites.isFavorited(card.compositeId);
    el.innerHTML = `
      <div class="card-id">${getSeenCount(card)}</div>
      <div class="front-center"><div class="front-word" data-len="${[...card.word].length}">${card.word}</div></div>
      <button class="fav-heart${isFav ? ' active' : ''}" aria-label="收藏">${isFav ? '♥' : '♡'}</button>
      <div class="hint-bottom">单击发音 · 双击翻面 · ←难 →易</div>
    `;
    return el;
  },
```

- [ ] **Step 4: 在 `Router.showCurrent` 里绑定心形按钮的点击事件**

找到（在`showCurrent()`方法里，`Gestures.attach(...)`调用之后）：
```js
    if (this.flipped) {
      cardEl.querySelectorAll('.sentence-row').forEach(row => {
        row.addEventListener('click', (e) => {
          e.stopPropagation();
          // 400ms 内刚双击翻面的话，落点误触例句不算数
          if (performance.now() - (this._flipTime || 0) < 400) return;
          const idx = parseInt(row.dataset.exIndex, 10);
          this.playExample(idx);
        });
      });
    }
    TopBar.render();
  },
```
改成（在`if (this.flipped) {...}`块后面、`TopBar.render();`之前，新增一段）：
```js
    if (this.flipped) {
      cardEl.querySelectorAll('.sentence-row').forEach(row => {
        row.addEventListener('click', (e) => {
          e.stopPropagation();
          // 400ms 内刚双击翻面的话，落点误触例句不算数
          if (performance.now() - (this._flipTime || 0) < 400) return;
          const idx = parseInt(row.dataset.exIndex, 10);
          this.playExample(idx);
        });
      });
    } else {
      const heart = cardEl.querySelector('.fav-heart');
      if (heart) {
        heart.addEventListener('click', (e) => {
          e.stopPropagation();
          const nowFav = Favorites.toggle(card.compositeId);
          heart.classList.toggle('active', nowFav);
          heart.textContent = nowFav ? '♥' : '♡';
        });
      }
    }
    TopBar.render();
  },
```

- [ ] **Step 5: 新增 `.fav-heart` 样式**

在`styles.css`的`.hint-bottom`那一行下面（紧跟着，不要插在中间破坏其他规则）新增：
```css
.fav-heart {
  position: absolute; bottom: 40px; left: 0; right: 0; margin: 0 auto;
  width: 44px; height: 44px;
  display: flex; align-items: center; justify-content: center;
  background: none; border: 0; cursor: pointer; padding: 0;
  font-size: 22px; line-height: 1; color: rgba(255,255,255,0.5);
}
.fav-heart.active { color: #ff4d6d; }
.fav-heart:active { transform: scale(0.9); }
```

- [ ] **Step 6: 语法检查**

Run: `node --check app.js`
Expected: 无输出（成功）

- [ ] **Step 7: 手动验证**

起本地静态服务器，打开`n1.html`：
- 卡片正面能看到心形图标（空心♡，半透明）
- 点一下 → 变成实心♥红色，**不触发发音**，**不触发翻面**
- 再点一下 → 变回空心♡
- 单击卡片空白区域（不点心形）→ 正常发音
- 双击卡片（不点心形）→ 正常翻面
- 刷新页面/切到下一张再切回来 → 收藏状态保留（localStorage持久化）

在`today.html`统一会话模式重复同样验证。

- [ ] **Step 8: Commit**

```bash
git add app.js styles.css
git commit -m "feat: 卡片正面新增收藏心形按钮，独立于学习进度之外"
```

---

### Task 6: 单词本页面（notebook.html + notebook.js）

**Files:**
- Create: `notebook.html`
- Create: `notebook.js`

**Interfaces:**
- Consumes: Task 1的`WordSearch`/`CATEGORY_LABELS`/`CATEGORY_TAG_COLOR`（from `wordIndex.js`）、Task 2的`Favorites`（from `favorites.js`）
- Produces: 无（终端页面，不被其他任务依赖）

- [ ] **Step 1: 创建 `notebook.html`**

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
  <title>单词本 · JLPT 語彙</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html, body { background: #111; color: #fff; font-family: "Hiragino Sans", "Yu Gothic", "PingFang SC", -apple-system, sans-serif; }
    .wrap { max-width: 600px; margin: 0 auto; padding: 40px 20px; }
    .back { display: inline-block; margin-bottom: 20px; color: #888; text-decoration: none; font-size: 14px; }
    .back:hover { color: #fff; }
    h1 { font-size: 24px; font-weight: 600; margin-bottom: 8px; }
    .subtitle { opacity: 0.7; font-size: 13px; margin-bottom: 24px; }
    .nb-list { display: flex; flex-direction: column; gap: 10px; }
    .nb-row {
      display: flex; align-items: center; gap: 12px;
      padding: 14px 16px; border-radius: 12px;
      background: #1c1c1c; border: 1px solid #2a2a2a;
      cursor: pointer;
    }
    .nb-row:hover { background: #242424; }
    .nb-tag {
      flex-shrink: 0; font-size: 10px; font-weight: 600; letter-spacing: 0.5px;
      padding: 3px 7px; border-radius: 5px; color: #fff; white-space: nowrap;
    }
    .nb-word { flex-shrink: 0; font-size: 17px; font-weight: 600; }
    .nb-kana { flex-shrink: 0; font-size: 12px; opacity: 0.6; }
    .nb-meaning {
      flex: 1; min-width: 0; font-size: 13px; opacity: 0.8;
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }
    .nb-date { flex-shrink: 0; font-size: 11px; opacity: 0.5; font-family: monospace; }
    .nb-remove {
      flex-shrink: 0; background: none; border: 0; color: #888;
      font-size: 16px; cursor: pointer; padding: 4px 6px; line-height: 1;
    }
    .nb-remove:hover { color: #ff4d6d; }
    .nb-empty { text-align: center; opacity: 0.5; font-size: 14px; padding: 60px 0; }
  </style>
</head>
<body>
  <div class="wrap">
    <a class="back" href="/">‹ 返回</a>
    <h1>单词本</h1>
    <p class="subtitle">收藏的词，不分等级词性，按收藏时间排序</p>
    <div class="nb-list" id="nb-list"></div>
  </div>
  <script type="module" src="notebook.js?v=1"></script>
</body>
</html>
```

- [ ] **Step 2: 创建 `notebook.js`**

```js
import { WordSearch, CATEGORY_LABELS, CATEGORY_TAG_COLOR } from './wordIndex.js';
import { Favorites } from './favorites.js';

function formatDate(ts) {
  const d = new Date(ts);
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function showEmpty(listEl) {
  listEl.innerHTML = '<div class="nb-empty">还没有收藏的词</div>';
}

async function render() {
  const listEl = document.getElementById('nb-list');
  const favMap = Favorites.all();
  const compositeIds = Object.keys(favMap);

  if (compositeIds.length === 0) {
    showEmpty(listEl);
    return;
  }

  const index = await WordSearch.ensureIndex();
  const byCompositeId = new Map(index.map(item => [item.compositeId, item]));

  const rows = compositeIds
    .map(cid => ({ cid, addedAt: favMap[cid].addedAt, detail: byCompositeId.get(cid) }))
    .filter(r => r.detail)   // 理论上不该发生，但数据文件里查不到的跳过，不崩页面
    .sort((a, b) => b.addedAt - a.addedAt);

  if (rows.length === 0) {
    showEmpty(listEl);
    return;
  }

  listEl.innerHTML = rows.map(({ cid, addedAt, detail }) => {
    const tagColor = CATEGORY_TAG_COLOR[detail.category] || '#555';
    const tagLabel = `${detail.level.toUpperCase()} · ${CATEGORY_LABELS[detail.category] || detail.category}`;
    const url = `${detail.pageUrl}?session=general-review&ids=${detail.id}&mode=swipe`;
    return `
      <div class="nb-row" data-cid="${cid}" data-url="${url}">
        <span class="nb-tag" style="background:${tagColor}">${tagLabel}</span>
        <span class="nb-word">${detail.word}</span>
        <span class="nb-kana">${detail.word !== detail.kana ? detail.kana : ''}</span>
        <span class="nb-meaning">${detail.meaning}</span>
        <span class="nb-date">${formatDate(addedAt)}</span>
        <button class="nb-remove" data-cid="${cid}" title="移除" aria-label="移除">✕</button>
      </div>
    `;
  }).join('');

  listEl.querySelectorAll('.nb-row').forEach(row => {
    row.addEventListener('click', (e) => {
      if (e.target.closest('.nb-remove')) return;
      window.location.href = row.dataset.url;
    });
  });
  listEl.querySelectorAll('.nb-remove').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      Favorites.remove(btn.dataset.cid);
      const row = btn.closest('.nb-row');
      row.remove();
      if (!listEl.querySelector('.nb-row')) showEmpty(listEl);
    });
  });
}

render();
```

- [ ] **Step 3: 语法检查**

Run: `node --check notebook.js`
Expected: 无输出（成功）

- [ ] **Step 4: 手动验证**

起本地静态服务器：
- 先去`n1.html`收藏1-2个词，去`n3-noun.html`（或任意另一个等级词性）收藏1个词
- 打开`notebook.html`：
  - 能看到刚才收藏的全部词，等级+词性标签正确
  - 按收藏时间倒序排列（最后收藏的在最上面）
  - 收藏日期格式是`YYYY-MM-DD`
  - 点一行（非移除按钮区域）→ 跳转到对应页面并定位到那张卡
  - 点"✕"移除 → 立即从列表消失；刷新`notebook.html`确认真的删掉了（不是只是前端临时隐藏）
- 把所有收藏都移除干净，打开`notebook.html` → 显示"还没有收藏的词"，不报错

- [ ] **Step 5: Commit**

```bash
git add notebook.html notebook.js
git commit -m "feat: 新增全局单词本页面(notebook.html)，跨等级/词性查看收藏"
```

---

### Task 7: 首页加单词本入口

**Files:**
- Modify: `index.html`（"· 巩固 ·" 分区）

**Interfaces:**
- Consumes: Task 6产出的`notebook.html`
- Produces: 无

- [ ] **Step 1: 在首页"· 巩固 ·"分区加一个入口**

找到：
```html
    <div class="section-divider">· 巩固 ·</div>
    <div class="level-list">
      <a class="level-btn external" href="/recall.html" style="background: linear-gradient(135deg, #4FA896, #3E8A9E); border: 0;">
        <span class="lv" style="font-size: 22px;">回忆模式</span>
        <span class="meta"><span class="count">随时可用</span><span class="desc">看着复习 · 听力通勤复习</span></span>
        <span class="arrow">›</span>
      </a>
    </div>
```
改成：
```html
    <div class="section-divider">· 巩固 ·</div>
    <div class="level-list">
      <a class="level-btn external" href="/recall.html" style="background: linear-gradient(135deg, #4FA896, #3E8A9E); border: 0;">
        <span class="lv" style="font-size: 22px;">回忆模式</span>
        <span class="meta"><span class="count">随时可用</span><span class="desc">看着复习 · 听力通勤复习</span></span>
        <span class="arrow">›</span>
      </a>
      <a class="level-btn external" href="/notebook.html" style="background: linear-gradient(135deg, #8A6FB8, #5A4A8C); border: 0;">
        <span class="lv" style="font-size: 22px;">单词本</span>
        <span class="meta"><span class="count">全部等级</span><span class="desc">收藏的词都在这里</span></span>
        <span class="arrow">›</span>
      </a>
    </div>
```

- [ ] **Step 2: 手动验证**

打开首页，确认"单词本"入口出现在"回忆模式"下面，点击能跳转到`notebook.html`。

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "feat: 首页新增单词本入口"
```

---

### Task 8: 缓存刷新 + 全量回归测试

**Files:**
- Modify: 所有引用`app.js`/`hub.js`/`styles.css`的HTML文件（`?v=`参数bump）

**Interfaces:**
- Consumes: Task 1-7的全部改动
- Produces: 无（收尾任务）

这个仓库的硬性规矩（见Global Constraints）：改完`app.js`/`hub.js`/`styles.css`后，必须把所有引用它们的HTML文件里的`?v=`一起bump，否则浏览器/GitHub Pages缓存会让这次的改动"看起来没生效"——这个项目已经因为漏做这一步被用户反馈过两次。本次计划改了这三个文件，所以必须执行这一步。

- [ ] **Step 1: 确认当前版本号**

Run: `grep -rh "app\.js?v=\|hub\.js?v=\|styles\.css?v=" *.html | sort -u`
Expected: 看到当前统一的版本号（执行计划时这一步之前应该全部是同一个数字，比如`v=52`；记下这个数字，下一步要bump到`数字+1`）

- [ ] **Step 2: 批量bump版本号**

把上一步看到的版本号（假设是52，如果不是52请把下面命令里的`52`/`53`换成实际看到的数字和它+1）：
```bash
for f in *.html; do
  sed -i '' 's/app\.js?v=52/app.js?v=53/' "$f"
  sed -i '' 's/hub\.js?v=52/hub.js?v=53/' "$f"
  sed -i '' 's/styles\.css?v=52/styles.css?v=53/' "$f"
done
```

- [ ] **Step 3: 确认全部bump成功，没有遗漏**

Run: `grep -rl "app\.js?v=52\|hub\.js?v=52\|styles\.css?v=52" *.html`
Expected: 无输出（说明没有遗漏的旧版本号）

Run: `grep -rh "app\.js?v=\|hub\.js?v=\|styles\.css?v=" *.html | sort -u`
Expected: 全部统一显示为`v=53`

- [ ] **Step 4: 跑全量单元测试**

Run: `npm test`
Expected: 全部测试通过（PASS），包括Task 2、Task 3新加的测试和原有的`plan.test.js`/`validate-cards.test.js`/`generate-cards.test.js`

- [ ] **Step 5: 过一遍spec里的手动验证清单**

对照`docs/superpowers/specs/2026-10-22-favorites-notebook-seencount-design.md`第7.2节的手动清单，逐条确认（Task 4-7已经分别验证过对应条目，这里是过一遍完整清单、补上没覆盖到的）：
- [ ] 测验模式（QuizMode）答题不影响`seenCount`（只影响`quizSeenCount`）—— 打开任意一个词性页面(比如`n1-adj.html`)，点"测验"答几题，确认对应单词的`seenCount`没变化（可以在答题前后分别翻到正面看圆圈数字）
- [ ] 回忆模式、文法页、オノマトペ app 页面正常，没有因为本次改动报错或多出奇怪的UI —— 分别打开`recall.html`、`grammar/index.html`、`onomatope/index.html`，确认页面正常加载、没有console报错

- [ ] **Step 6: Commit**

```bash
git add -A -- '*.html'
git commit -m "chore: bump app.js/hub.js/styles.css缓存版本号(v52→v53)，本次改动涉及这三个文件"
```

- [ ] **Step 7: Push**

```bash
git push origin main
```
