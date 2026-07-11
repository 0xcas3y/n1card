# 分批学习 + 强制测验 + 时间窗 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把"学新"从一次性发一整批词改造成 30 词一批 + 强制测验 + 晚8点-凌晨1点学习时间窗，并新增一个随时可用、按遗忘曲线权重抽词的"一般复习"入口。

**Architecture:** 保持现有 `plan.js`（纯函数）/ `hub.js`（首页：拥有 Plan/Streak/DayView 状态）/ `app.js`（等级页：拥有 Progress/Router/单场 session 执行）三层分工不变。新增的批次判定、时间窗判定、遗忘曲线抽样全部是 `plan.js` 里的纯函数；`hub.js` 负责决定"今天还能不能学、下一批发哪些词、要不要自动接力下一批"；`app.js` 只负责执行"发到手上的这一批"——滑卡 → 强制测验 → 选择页（继续/复习难词/结束），继续时把控制权交还给 `hub.js` 重新判定。

**Tech Stack:** 原生 JS（ES modules）、no build step、Node `--test` 做纯函数单元测试、localStorage 持久化。

## Global Constraints

- 只改 `n1card/` 根目录下的 `plan.js`、`hub.js`、`app.js`、`n1.html`~`n5.html`（若需要）、`styles.css`，不碰 `onomatope/`、`grammar/`
- 批次大小固定 30，不做可配置项
- 学习时间窗固定 20:00–00:59（本地时间，`hour >= 20 || hour < 1`），不做可配置项
- 强制测验不设分数门槛，做完（走完全部题目）即算通关
- 不新增 localStorage key；扩展现有 `n1card:plan:<level>` 的 `sessions[date].learn` 结构（加 `batchCount` 字段）即可
- 每次改动后运行 `npm test` 确认全部通过（涉及 `plan.js` 的任务），改动 `hub.js`/`app.js` 的任务用浏览器手动验证（本项目现状：只有 `plan.js` 有自动化测试，UI 代码走手动验证清单，参考 `docs/superpowers/specs/2026-04-23-review-mode-design.md` §10）

---

## Task 1: `plan.js` — 拆出 `computeBatchesAllowed`，`computeQuota` 复用它

**Files:**
- Modify: `plan.js:4-11`
- Test: `scripts/plan.test.js`

**Interfaces:**
- Produces: `computeBatchesAllowed(totalDays: number): number`（返回 1/2/3，累计打卡每满 10 天 +1，上限 3）
- `computeQuota(totalDays, baseGroup = 30)` 行为完全不变（现有测试必须继续通过）

- [ ] **Step 1: 写失败测试**

在 `scripts/plan.test.js` 顶部 import 里加 `computeBatchesAllowed`：

```js
import { computeQuota, computeLearnQueue, computeBatchesAllowed } from '../plan.js';
```

在文件末尾（`computeQuota` 相关测试后面任意位置）加：

```js
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
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npm test`
Expected: FAIL —— `computeBatchesAllowed is not a function` 或 import 报错

- [ ] **Step 3: 实现**

把 `plan.js:4-11` 从：

```js
// 配额：累计打卡每满 10 天 +1 组；上限 3 组
// 学新：baseGroup=30 → 30 / 60 / 90
// 洗脑：baseGroup=60 → 60 / 120 / 180
export function computeQuota(totalDays, baseGroup = 30) {
  const t = Math.max(0, totalDays | 0);
  const groups = Math.min(1 + Math.floor(t / 10), 3);
  return baseGroup * groups;
}
```

改成：

```js
// 批数：累计打卡每满 10 天 +1 批；上限 3 批
export function computeBatchesAllowed(totalDays) {
  const t = Math.max(0, totalDays | 0);
  return Math.min(1 + Math.floor(t / 10), 3);
}

// 配额：批数 × 每批词数
// 学新：baseGroup=30 → 30 / 60 / 90
// 洗脑：baseGroup=60 → 60 / 120 / 180
export function computeQuota(totalDays, baseGroup = 30) {
  return baseGroup * computeBatchesAllowed(totalDays);
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npm test`
Expected: PASS，全部测试（包括原有 `computeQuota` 测试）绿色

- [ ] **Step 5: 提交**

```bash
git add plan.js scripts/plan.test.js
git commit -m "$(cat <<'EOF'
plan.js: 拆出 computeBatchesAllowed，供分批学习使用

computeQuota 内部改为调用它，行为不变（现有测试全绿）。

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: `plan.js` — `isLearnWindowOpen`（学习时间窗判定）

**Files:**
- Modify: `plan.js`（在文件末尾追加）
- Test: `scripts/plan.test.js`

**Interfaces:**
- Produces: `isLearnWindowOpen(now: Date = new Date()): boolean` —— 本地小时 `hour >= 20 || hour < 1` 时返回 `true`

- [ ] **Step 1: 写失败测试**

在 `scripts/plan.test.js` 顶部 import 里加 `isLearnWindowOpen`：

```js
import { computeQuota, computeLearnQueue, computeBatchesAllowed, isLearnWindowOpen } from '../plan.js';
```

追加测试：

```js
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
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npm test`
Expected: FAIL —— `isLearnWindowOpen is not a function`

- [ ] **Step 3: 实现**

在 `plan.js` 文件末尾（`aggregateCheckIns` 之后）追加：

```js
// 学习窗口：本地时间 20:00–00:59（含）
export function isLearnWindowOpen(now = new Date()) {
  const h = now.getHours();
  return h >= 20 || h < 1;
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npm test`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add plan.js scripts/plan.test.js
git commit -m "$(cat <<'EOF'
plan.js: 新增 isLearnWindowOpen 学习时间窗判定

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: `plan.js` — `computeGeneralReviewPool`（一般复习遗忘曲线抽样）

**Files:**
- Modify: `plan.js`（在文件末尾追加）
- Test: `scripts/plan.test.js`

**Interfaces:**
- Consumes: 卡片形如 `{ id }`；progress 条目形如 `{ status, masteredAt?, lastWeeklyReviewAt?, lastSeen? }`（与 `Progress._progress`/`ProgressRO.get()` 现有结构一致）
- Produces: `computeGeneralReviewPool(cards: Card[], progress: object, now: number, size = 20): Card[]` —— 加权随机不放回抽样，返回卡片对象数组（不是 id），长度 `min(size, 学过的词数)`

- [ ] **Step 1: 写失败测试**

在 `scripts/plan.test.js` 顶部 import 里加 `computeGeneralReviewPool`：

```js
import { computeQuota, computeLearnQueue, computeBatchesAllowed, isLearnWindowOpen, computeGeneralReviewPool } from '../plan.js';
```

追加测试：

```js
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
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npm test`
Expected: FAIL —— `computeGeneralReviewPool is not a function`

- [ ] **Step 3: 实现**

在 `plan.js` 文件末尾追加：

```js
// 一般复习：全部"学过"的词（known/unknown），按简化遗忘曲线权重加权随机不放回抽样
// unknown 固定权重 5；known 权重随距上次复习天数增长，封顶 4、保底 0.5
export function computeGeneralReviewPool(cards, progress, now, size = 20) {
  const DAY_MS = 86400000;
  const weighted = [];
  for (const c of cards) {
    const p = progress[c.id];
    if (!p || !p.status) continue;
    let weight;
    if (p.status === 'unknown') {
      weight = 5;
    } else {
      const last = Math.max(p.masteredAt || 0, p.lastWeeklyReviewAt || 0, p.lastSeen || 0);
      const daysSince = last ? (now - last) / DAY_MS : 999;
      weight = Math.min(4, Math.max(0.5, daysSince / 3));
    }
    weighted.push({ card: c, weight });
  }

  const picked = [];
  const pool = weighted;
  const n = Math.min(size, pool.length);
  for (let i = 0; i < n; i++) {
    const total = pool.reduce((s, w) => s + w.weight, 0);
    if (total <= 0) break;
    let r = Math.random() * total;
    let idx = 0;
    for (; idx < pool.length - 1; idx++) {
      r -= pool[idx].weight;
      if (r <= 0) break;
    }
    picked.push(pool[idx].card);
    pool.splice(idx, 1);
  }
  return picked;
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npm test`
Expected: PASS。统计类测试（500 次抽样）理论上有极小概率偶发失败；若单次失败先重跑一次，若持续失败再排查权重公式

- [ ] **Step 5: 提交**

```bash
git add plan.js scripts/plan.test.js
git commit -m "$(cat <<'EOF'
plan.js: 新增 computeGeneralReviewPool 一般复习加权抽样

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: `hub.js` — `PlanStore.completeLearn` 支持同日多批累加

**Files:**
- Modify: `hub.js:2-5`（import）, `hub.js:83-94`（`completeLearn`）

**Interfaces:**
- Consumes: `computeBatchesAllowed, isLearnWindowOpen, computeGeneralReviewPool` 从 `./plan.js`（Task 1-3 产出）；`BATCH_SIZE` 常量本任务在 hub.js 内部定义（不是从 plan.js 导入，见下）
- Produces: `PlanStore.completeLearn(level, dateStr, cardIds)` 调用后，`plan.sessions[dateStr].learn` 形如 `{ status: 'done', completedAt, count, batchCount }`，`batchCount` 每次调用 +1（同日多次调用累加，不再被覆盖）

> 说明：`BATCH_SIZE` 只在 `hub.js` 里用到（决定"下一批发几个词"），`plan.js` 不需要知道这个常量，所以不导出，直接在 `hub.js` 顶部定义 `const BATCH_SIZE = 30;`。

- [ ] **Step 1: 修改 import**

把 `hub.js:2-5`：

```js
import {
  computeQuota, computeLearnQueue, computeMorningPool, computeWeeklyDue,
  pruneOldCohorts, aggregateCheckIns, pickDistractors
} from './plan.js';
```

改成：

```js
import {
  computeLearnQueue, computeMorningPool, computeWeeklyDue,
  pruneOldCohorts, aggregateCheckIns, pickDistractors,
  computeBatchesAllowed, isLearnWindowOpen, computeGeneralReviewPool
} from './plan.js';

const BATCH_SIZE = 30;
```

（`computeQuota` 不再被 hub.js 使用，改用 `computeBatchesAllowed`，故从 import 里移除）

- [ ] **Step 2: 修改 `completeLearn`**

把 `hub.js:83-94`：

```js
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
```

改成：

```js
  completeLearn(level, dateStr, cardIds) {
    const data = this.load(level);
    if (!data.cohorts[dateStr]) {
      data.cohorts[dateStr] = { cardIds: [...cardIds], completedAt: Date.now() };
    } else {
      const merged = new Set([...data.cohorts[dateStr].cardIds, ...cardIds]);
      data.cohorts[dateStr] = { cardIds: [...merged], completedAt: Date.now() };
    }
    if (!data.sessions[dateStr]) data.sessions[dateStr] = {};
    const prevBatchCount = data.sessions[dateStr].learn?.batchCount || 0;
    data.sessions[dateStr].learn = {
      status: 'done',
      completedAt: Date.now(),
      count: data.cohorts[dateStr].cardIds.length,
      batchCount: prevBatchCount + 1
    };
    this.save(level);
  },
```

- [ ] **Step 3: 手动验证**

浏览器打开 `http://localhost:8000/`（先起服务：`python3 -m http.server 8000`），打开开发者工具 Console：

```js
localStorage.removeItem('n1card:plan:n1');
```

刷新页面，在 Console 里手动模拟两次调用（因为 `PlanStore` 未挂到 `window`，改用检查 localStorage 的方式）：暂时跳过运行时验证，留到 Task 9（`learn_completed` 处理）里用真实点击流程一起验证——那时会自然触发 `completeLearn` 两次并可在 Console 里跑：

```js
JSON.parse(localStorage.getItem('n1card:plan:n1')).sessions
```

确认某天的 `learn.batchCount` 随批次累加。此步骤先跳过，仅确认代码无语法错误：

Run: `node --check hub.js`
Expected: 无输出（无语法错误）

- [ ] **Step 4: 提交**

```bash
git add hub.js
git commit -m "$(cat <<'EOF'
hub.js: completeLearn 支持同日多批累加 batchCount

为分批学习做准备：同一天可以多次调用 completeLearn（每批一次），
batchCount 累加而不是被覆盖。

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: `hub.js` — `_sessionStatus` 改为按批计算

**Files:**
- Modify: `hub.js:138-151`（`_sessionStatus`）

**Interfaces:**
- Consumes: `computeBatchesAllowed`, `isLearnWindowOpen`, `BATCH_SIZE`（Task 4 已引入）
- Produces: `_sessionStatus(level, dateStr)` 返回对象新增字段 `batchesAllowed: number`, `batchesDone: number`, `learnWindowOpen: boolean`；`learnQueue` 现在最多含 `BATCH_SIZE`（30）张卡（不再是整份配额）；移除 `quota` 字段（后续任务里所有 `stat.quota` 引用都要换成 `stat.batchesAllowed`）

- [ ] **Step 1: 修改**

把 `hub.js:138-151`：

```js
async function _sessionStatus(level, dateStr) {
  const plan = PlanStore.load(level);
  const cards = await CardCache.load(level);
  const prog = ProgressRO.get(level);
  const streakState = Streak.load();
  const quota = computeQuota(streakState.total || 0);
  const learnDone = plan.sessions[dateStr]?.learn?.status === 'done';
  const morningDone = plan.sessions[dateStr]?.morning?.status === 'done';
  const weeklyDone = plan.sessions[dateStr]?.weekly?.status === 'done';
  const learnQueue = learnDone ? [] : computeLearnQueue(cards, prog, quota);
  const morningPool = computeMorningPool(plan.cohorts, prog, dateStr);
  const weeklyDueIds = computeWeeklyDue(prog, Date.now());
  return { plan, cards, prog, quota, learnDone, morningDone, weeklyDone, learnQueue, morningPool, weeklyDueIds };
}
```

改成：

```js
async function _sessionStatus(level, dateStr) {
  const plan = PlanStore.load(level);
  const cards = await CardCache.load(level);
  const prog = ProgressRO.get(level);
  const streakState = Streak.load();
  const batchesAllowed = computeBatchesAllowed(streakState.total || 0);
  const batchesDone = plan.sessions[dateStr]?.learn?.batchCount || 0;
  const learnWindowOpen = isLearnWindowOpen();
  const morningDone = plan.sessions[dateStr]?.morning?.status === 'done';
  const weeklyDone = plan.sessions[dateStr]?.weekly?.status === 'done';
  const learnQueue = batchesDone >= batchesAllowed ? [] : computeLearnQueue(cards, prog, BATCH_SIZE);
  const learnDone = batchesDone >= batchesAllowed || learnQueue.length === 0;
  const morningPool = computeMorningPool(plan.cohorts, prog, dateStr);
  const weeklyDueIds = computeWeeklyDue(prog, Date.now());
  return {
    plan, cards, prog, batchesAllowed, batchesDone, learnWindowOpen,
    learnDone, morningDone, weeklyDone, learnQueue, morningPool, weeklyDueIds
  };
}
```

- [ ] **Step 2: 手动验证（先只查语法+运行不报错，功能验证放 Task 6）**

Run: `node --check hub.js`
Expected: 无输出

浏览器打开 `http://localhost:8000/`，Console 应无报错（此时页面渲染还会用到 `stat.quota`，下一步会修，暂时页面可能显示 `undefined 词`，这是预期的中间状态）

- [ ] **Step 3: 提交**

```bash
git add hub.js
git commit -m "$(cat <<'EOF'
hub.js: _sessionStatus 改为按批（30 词）计算学新队列

新增 batchesAllowed/batchesDone/learnWindowOpen；learnQueue 现在
只发一批（30 词）而不是整份配额。

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: `hub.js` — `_renderLearnCard` 改为批次进度 + 时间窗展示，更新规则区文案

**Files:**
- Modify: `hub.js:194-196`（`day-level` 一行）, `hub.js:182-192`（规则区文案）, `hub.js:230-237`（`_renderLearnCard`）

**Interfaces:**
- Consumes: `stat.batchesAllowed`, `stat.batchesDone`, `stat.learnWindowOpen`, `stat.learnQueue`（Task 5 产出）

- [ ] **Step 1: 改配额展示行**

把 `hub.js:194-196`：

```js
      <div class="day-level">
        当前等级： <span class="day-level-val">${LEVEL_LABELS[level] || level.toUpperCase()}</span> · 配额 ${stat.quota} 词
      </div>
```

改成：

```js
      <div class="day-level">
        当前等级： <span class="day-level-val">${LEVEL_LABELS[level] || level.toUpperCase()}</span> · 今日 ${stat.batchesAllowed} 批
      </div>
```

- [ ] **Step 2: 改规则区文案**

把 `hub.js:182-192`：

```js
      <details class="day-rules" ${rulesSeen ? '' : 'open'}>
        <summary>规则</summary>
        <ul>
          <li>🌙 晚打卡 = 完成「学新」（滑卡）</li>
          <li>🌅 早打卡 = 完成「早复习」（四选一）</li>
          <li>每日学新 30 词；累计打卡每满 10 天 +1 组，上限 3 组（90 词/天）</li>
          <li>洗脑模式 60 词起，同步每 10 天 +1 组（上限 180 词）</li>
          <li>答对 2 次升「掌握」，答错立刻回「不熟」</li>
          <li>「掌握」每 7 天来一次周复习</li>
        </ul>
      </details>
```

改成：

```js
      <details class="day-rules" ${rulesSeen ? '' : 'open'}>
        <summary>规则</summary>
        <ul>
          <li>🌙 晚打卡 = 完成 1 批「学新」（30 词滑卡 + 强制通关测验）</li>
          <li>🌅 早打卡 = 完成「早复习」（四选一）</li>
          <li>学新只能在 <strong>晚 8 点-凌晨 1 点</strong> 进行；早复习/一般复习随时可用</li>
          <li>每日批数上限：累计打卡每满 10 天 +1 批，上限 3 批（90 词/天）</li>
          <li>洗脑模式 60 词起，同步每 10 天 +1 组（上限 180 词）</li>
          <li>答对 2 次升「掌握」，答错立刻回「不熟」</li>
          <li>「掌握」每 7 天来一次周复习；🔁 一般复习按遗忘曲线随时补练老词</li>
        </ul>
      </details>
```

- [ ] **Step 3: 重写 `_renderLearnCard`**

把 `hub.js:230-237`：

```js
  _renderLearnCard(stat, level, dateStr) {
    if (dateStr !== todayStr()) return '';
    const n = stat.learnQueue.length;
    const done = stat.learnDone;
    const label = done ? `✅ 已完成` : (n === 0 ? `无未学过词（自动 ✓）` : `0 / ${n}`);
    const btn = done ? '' : (n === 0 ? `<button class="ds-btn" data-action="auto-evening">标记完成</button>` : `<button class="ds-btn" data-action="learn">开始</button>`);
    return `<div class="day-session-card"><div class="dsc-icon">🌙</div><div class="dsc-body"><div class="dsc-title">学新</div><div class="dsc-sub">${label}</div></div>${btn}</div>`;
  },
```

改成：

```js
  _renderLearnCard(stat, level, dateStr) {
    if (dateStr !== todayStr()) return '';
    const { batchesDone, batchesAllowed, learnWindowOpen, learnQueue } = stat;
    const n = learnQueue.length;
    const batchLabel = `${batchesDone}/${batchesAllowed} 批`;
    let label, btn;
    if (n === 0 && batchesDone === 0) {
      label = '无未学过词（自动 ✓）';
      btn = '<button class="ds-btn" data-action="auto-evening">标记完成</button>';
    } else if (n === 0) {
      label = `✅ ${batchLabel} · 无更多新词`;
      btn = '';
    } else if (batchesDone >= batchesAllowed) {
      label = `✅ 今日 ${batchLabel} 已完成`;
      btn = '';
    } else if (!learnWindowOpen) {
      label = `⏰ 学习窗口：晚8点-凌晨1点（${batchLabel}）`;
      btn = '';
    } else {
      label = `${batchLabel} · 下一批 ${n} 词`;
      btn = `<button class="ds-btn" data-action="learn">${batchesDone > 0 ? '继续下一批' : '开始学习'}</button>`;
    }
    return `<div class="day-session-card"><div class="dsc-icon">🌙</div><div class="dsc-body"><div class="dsc-title">学新</div><div class="dsc-sub">${label}</div></div>${btn}</div>`;
  },
```

- [ ] **Step 4: 手动验证**

```bash
python3 -m http.server 8000
```

浏览器打开 `http://localhost:8000/`，点今日日历格子进入当日界面：

- [ ] 若浏览器本地时间不在 20:00–00:59：学新卡片显示 `⏰ 学习窗口：晚8点-凌晨1点（0/1 批）`，无按钮
- [ ] 用 Console 临时改系统时间不现实，改用 Console 直接验证纯函数：`import('./plan.js').then(m => console.log(m.isLearnWindowOpen()))`，结果应和当前钟点一致
- [ ] 规则区文案已更新为新版

- [ ] **Step 5: 提交**

```bash
git add hub.js
git commit -m "$(cat <<'EOF'
hub.js: 学新卡片改为批次进度 + 时间窗展示

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: `hub.js` — 新增「🔁 一般复习」卡片

**Files:**
- Modify: `hub.js:198-202`（`day-sessions` 区块）, `hub.js:238-245`（在 `_renderWeeklyCard` 后新增 `_renderGeneralReviewCard`）

**Interfaces:**
- Consumes: `computeGeneralReviewPool`（Task 3）, `stat.cards`, `stat.prog`
- Produces: `DayView._renderGeneralReviewCard(stat, dateStr): string`

- [ ] **Step 1: 在 sessions 区块里插入**

把 `hub.js:198-202`：

```js
      <div class="day-sessions">
        ${this._renderMorningCard(stat, dateStr)}
        ${this._renderLearnCard(stat, level, dateStr)}
        ${this._renderWeeklyCard(stat, level, dateStr)}
      </div>
```

改成：

```js
      <div class="day-sessions">
        ${this._renderMorningCard(stat, dateStr)}
        ${this._renderLearnCard(stat, level, dateStr)}
        ${this._renderWeeklyCard(stat, level, dateStr)}
        ${this._renderGeneralReviewCard(stat, dateStr)}
      </div>
```

- [ ] **Step 2: 新增渲染函数**

在 `hub.js` 里 `_renderWeeklyCard` 方法（原 `hub.js:238-245`）后面插入新方法（同一个 `DayView` 对象内，逗号分隔）：

```js
  _renderGeneralReviewCard(stat, dateStr) {
    if (dateStr !== todayStr()) return '';
    const hasPool = Object.keys(stat.prog).some(id => stat.prog[id]?.status);
    if (!hasPool) return '';
    return `<div class="day-session-card">
      <div class="dsc-icon">🔁</div>
      <div class="dsc-body"><div class="dsc-title">一般复习</div><div class="dsc-sub">随时可刷，不算打卡</div></div>
      <div class="dsc-actions">
        <button class="ds-btn ds-btn-small" data-action="general-review-swipe">滑卡</button>
        <button class="ds-btn ds-btn-small" data-action="general-review-quiz">测验</button>
      </div>
    </div>`;
  },
```

- [ ] **Step 3: 手动验证**

Run: `node --check hub.js`
Expected: 无输出

浏览器打开当日界面：若该等级 `n1card:progress:n1` 里还没有任何词的记录，"一般复习"卡片应该不出现；先在 `n1.html` 里随便滑几张卡（产生 progress 记录），返回首页当日界面，应看到"🔁 一般复习"卡片和"滑卡""测验"两个按钮（此时点击还没接线，Task 8 才接线）

- [ ] **Step 4: 提交**

```bash
git add hub.js
git commit -m "$(cat <<'EOF'
hub.js: 新增一般复习卡片渲染（尚未接点击事件）

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: `hub.js` — `SessionLauncher.launchGeneralReview` + 按钮接线

**Files:**
- Modify: `hub.js:278-291`（`SessionLauncher`）, `hub.js:247-268`（`_attachSessionHandlers`）

**Interfaces:**
- Produces: `SessionLauncher.launchGeneralReview(level, mode, ids)` —— 跳转 `/${level}.html?session=general-review&mode=${mode}&ids=...`

- [ ] **Step 1: 扩展 `SessionLauncher`**

把 `hub.js:278-291`：

```js
const SessionLauncher = {
  launchLearn(level, dateStr, stat) {
    const ids = stat.learnQueue.map(c => c.id).join(',');
    window.location.href = `/${level}.html?session=learn&ids=${ids}`;
  },
  launchMorning(level, dateStr, stat) {
    const ids = stat.morningPool.join(',');
    window.location.href = `/${level}.html?session=review&kind=morning&ids=${ids}`;
  },
  launchWeekly(level, dateStr, stat) {
    const ids = stat.weeklyDueIds.join(',');
    window.location.href = `/${level}.html?session=review&kind=weekly&ids=${ids}`;
  }
};
```

改成：

```js
const SessionLauncher = {
  launchLearn(level, dateStr, stat) {
    const ids = stat.learnQueue.map(c => c.id).join(',');
    window.location.href = `/${level}.html?session=learn&ids=${ids}`;
  },
  launchMorning(level, dateStr, stat) {
    const ids = stat.morningPool.join(',');
    window.location.href = `/${level}.html?session=review&kind=morning&ids=${ids}`;
  },
  launchWeekly(level, dateStr, stat) {
    const ids = stat.weeklyDueIds.join(',');
    window.location.href = `/${level}.html?session=review&kind=weekly&ids=${ids}`;
  },
  launchGeneralReview(level, mode, ids) {
    window.location.href = `/${level}.html?session=general-review&mode=${mode}&ids=${ids.join(',')}`;
  }
};
```

- [ ] **Step 2: 接线按钮点击**

把 `hub.js:247-268`：

```js
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
```

改成：

```js
  _attachSessionHandlers(el, stat, level, dateStr) {
    el.querySelectorAll('.ds-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const action = btn.dataset.action;
        switch (action) {
          case 'morning': return SessionLauncher.launchMorning(level, dateStr, stat);
          case 'learn': return SessionLauncher.launchLearn(level, dateStr, stat);
          case 'weekly': return SessionLauncher.launchWeekly(level, dateStr, stat);
          case 'general-review-swipe': {
            const pool = computeGeneralReviewPool(stat.cards, stat.prog, Date.now());
            return SessionLauncher.launchGeneralReview(level, 'swipe', pool.map(c => c.id));
          }
          case 'general-review-quiz': {
            const pool = computeGeneralReviewPool(stat.cards, stat.prog, Date.now());
            return SessionLauncher.launchGeneralReview(level, 'quiz', pool.map(c => c.id));
          }
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
```

- [ ] **Step 3: 手动验证**

Run: `node --check hub.js`
Expected: 无输出

浏览器里点"一般复习"卡片的"滑卡"按钮，地址栏应跳到 `n1.html?session=general-review&mode=swipe&ids=...`（此时 `n1.html`/`app.js` 还不认识这个 session，会走到默认自由刷卡逻辑——这是预期的中间状态，Task 15 才会真正处理这个参数）

- [ ] **Step 4: 提交**

```bash
git add hub.js
git commit -m "$(cat <<'EOF'
hub.js: 一般复习按钮接线 SessionLauncher.launchGeneralReview

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: `hub.js` — `learn_completed` 处理支持 `continue=1` 自动接力下一批

**Files:**
- Modify: `hub.js:423-434`（`DOMContentLoaded` 里的 `learn_completed` 分支）

**Interfaces:**
- Consumes: URL 参数 `continue=1`（由 `app.js` 的 `ChoiceScreen` 在 Task 12 产出）

- [ ] **Step 1: 修改**

把 `hub.js:423-434`：

```js
  const params = new URLSearchParams(location.search);
  if (params.get('learn_completed') === '1') {
    const level = params.get('level') || 'n1';
    const ids = (params.get('ids') || '').split(',').map(n => parseInt(n, 10)).filter(n => Number.isFinite(n));
    const dateStr = todayStr();
    PlanStore.completeLearn(level, dateStr, ids);
    Streak.markCheckIn(dateStr, 'evening');
    // 清 URL 参数后开 DayView
    history.replaceState({}, '', '/');
    DayView.render(dateStr);
  }
```

改成：

```js
  const params = new URLSearchParams(location.search);
  if (params.get('learn_completed') === '1') {
    const level = params.get('level') || 'n1';
    const ids = (params.get('ids') || '').split(',').map(n => parseInt(n, 10)).filter(n => Number.isFinite(n));
    const dateStr = todayStr();
    const wantsContinue = params.get('continue') === '1';
    PlanStore.completeLearn(level, dateStr, ids);
    Streak.markCheckIn(dateStr, 'evening');
    // 清 URL 参数
    history.replaceState({}, '', '/');
    if (wantsContinue) {
      _sessionStatus(level, dateStr).then(stat => {
        if (stat.learnQueue.length > 0 && !stat.learnDone && stat.learnWindowOpen) {
          SessionLauncher.launchLearn(level, dateStr, stat);
        } else {
          DayView.render(dateStr);
        }
      });
    } else {
      DayView.render(dateStr);
    }
  }
```

- [ ] **Step 2: 手动验证**

Run: `node --check hub.js`
Expected: 无输出

功能级验证留到 Task 15（需要 `app.js` 的 `ChoiceScreen` 才能触发 `continue=1`），此处先确认没有语法错误、页面正常加载不报错。

- [ ] **Step 3: 提交**

```bash
git add hub.js
git commit -m "$(cat <<'EOF'
hub.js: learn_completed 支持 continue=1 自动接力下一批

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: `styles.css` — 新增选择页 / 时间锁定页 / 一般复习卡片样式

**Files:**
- Modify: `styles.css:123`（body 状态类隐藏 topbar 规则）, `styles.css:227-231`（`.ds-btn` 后追加新规则）

**Interfaces:**
- Produces: CSS 类 `.choice-actions`、`.dsc-actions`、`.ds-btn-small`；body 类 `choice-on`/`hardreview-on`/`timelock-on` 隐藏 `#topbar`

- [ ] **Step 1: 扩展隐藏 topbar 的选择器**

找到 `styles.css:123`：

```css
body.quiz-on #topbar, body.learnlist-on #topbar { display: none; }
```

改成：

```css
body.quiz-on #topbar, body.learnlist-on #topbar,
body.choice-on #topbar, body.hardreview-on #topbar, body.timelock-on #topbar { display: none; }
```

- [ ] **Step 2: 新增选择页/一般复习按钮样式**

在 `styles.css:227-231` 的 `.ds-btn { ... }` 规则后面追加：

```css
.dsc-actions { display: flex; gap: 6px; }
.ds-btn-small { padding: 8px 12px; font-size: 13px; }
.choice-actions { display: flex; flex-direction: column; gap: 10px; margin-top: 16px; }
```

- [ ] **Step 3: 手动验证**

Run: `node --check hub.js` 不适用于 CSS；改为浏览器打开页面确认样式文件正常加载（Network 面板 200，Console 无 CSS 解析错误）

- [ ] **Step 4: 提交**

```bash
git add styles.css
git commit -m "$(cat <<'EOF'
styles.css: 新增选择页/时间锁定页/一般复习卡片样式

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 11: `app.js` — Router 支持批次完成分岔 + 一般复习会话

**Files:**
- Modify: `app.js:1`（import）, `app.js:905-915`（Router 字段）, `app.js:977-988`（`markAndNext`）, `app.js:998-1030`（`enterLearnSession`/`_finishLearn` 后新增方法）

**Interfaces:**
- Consumes: `isLearnWindowOpen` from `./plan.js`（Task 2）
- Produces:
  - `Router.generalReviewMode: boolean`（新字段，默认 `false`）
  - `Router.enterGeneralReviewSession(cards: Card[])`
  - `Router._finishBatch()` —— 学新批次滑完后调用，交给 `ChoiceScreen`（Task 12 产出，本任务先声明调用点，`ChoiceScreen` 下一任务补全）

- [ ] **Step 1: 修改 import**

把 `app.js:1`：

```js
import { aggregateCheckIns, pickDistractors, computeQuota } from './plan.js';
```

改成：

```js
import { aggregateCheckIns, pickDistractors, computeQuota, isLearnWindowOpen } from './plan.js';
```

- [ ] **Step 2: Router 新增字段**

把 `app.js:905-915`：

```js
const Router = {
  currentIndex: 0,
  currentColor: null,
  flipped: false,
  visibleCards: [],
  learnMode: false,
  learnQueue: [],
  learnCompletedIds: [],
  learnReturnUrl: null,
  learnRetakeDate: null,
```

改成：

```js
const Router = {
  currentIndex: 0,
  currentColor: null,
  flipped: false,
  visibleCards: [],
  learnMode: false,
  learnQueue: [],
  learnCompletedIds: [],
  learnReturnUrl: null,
  learnRetakeDate: null,
  generalReviewMode: false,
```

- [ ] **Step 3: 修改 `markAndNext`**

把 `app.js:977-988`：

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

改成：

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

- [ ] **Step 4: 新增 `enterGeneralReviewSession` 和 `_finishBatch`**

在 `app.js` 的 `_finishLearn()` 方法结尾（`app.js:1011-1030` 之后，`toggleFlip()` 之前）插入两个新方法：

```js
  enterGeneralReviewSession(cards) {
    this.generalReviewMode = true;
    this.visibleCards = cards;
    this.currentIndex = 0;
    this.currentColor = CardView.randomColor();
    this.flipped = false;
    this.showCurrent();
  },

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

> 注意：这一步引用了 `ChoiceScreen`，它在 Task 12 才会被定义。JS 里函数体内引用的标识符只在**调用时**才需要存在（不是定义时），所以只要 Task 12 紧接着完成，运行时就不会报错；但如果只做到本任务就去手动测试"学完一批"，会在浏览器 Console 看到 `ChoiceScreen is not defined`——这是预期的中间状态。

- [ ] **Step 5: 语法检查**

Run: `node --check app.js`
Expected: 无输出

- [ ] **Step 6: 提交**

```bash
git add app.js
git commit -m "$(cat <<'EOF'
app.js: Router 支持学新批次完成分岔 + 一般复习会话

markAndNext 学新批次滑完后调用 _finishBatch（非 retake 场景），
retake 场景保留原 _finishLearn 行为不变。新增 enterGeneralReviewSession
供一般复习滑卡模式使用。

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 12: `app.js` — `ChoiceScreen` 模块（批次通关后的选择页）

**Files:**
- Modify: `app.js:795`（`QuizMode` 之后插入新模块）

**Interfaces:**
- Consumes: `isLearnWindowOpen`（Task 2）、`DataStore`、`Progress`、`LEVEL_KEY`（既有）、`HardReviewMode`（Task 13 产出，同样是"运行时才需要"的前向引用）
- Produces: `ChoiceScreen.show(batchIds: number[])`

- [ ] **Step 1: 插入模块**

在 `app.js:795` 的 `window.QuizMode = QuizMode;  // 供 hub.js 调用` 这一行之后（`const SettingsPanel = {` 之前）插入：

```js
const ChoiceScreen = {
  show(batchIds) {
    document.body.classList.add('choice-on');
    const hardIds = batchIds.filter(id => Progress.getStatus(id) === 'unknown');
    const hasMoreWords = DataStore.allCards().some(c => !Progress.getStatus(c.id));
    const canContinue = hasMoreWords && isLearnWindowOpen();
    const stage = document.querySelector('#cardstage');
    stage.innerHTML = `
      <div class="quiz-summary">
        <div class="qs-title">这一批通关了！</div>
        <div class="qs-line">本批 ${batchIds.length} 词</div>
        <div class="choice-actions">
          ${canContinue ? '<button class="qs-done" id="cs-continue">继续下一批</button>' : ''}
          ${hardIds.length > 0 ? '<button class="qs-done" id="cs-review">复习刚才的不熟词</button>' : ''}
          <button class="qs-done" id="cs-end">结束</button>
        </div>
      </div>
    `;
    const continueBtn = stage.querySelector('#cs-continue');
    if (continueBtn) continueBtn.addEventListener('click', () => this._finish(batchIds, true));
    const reviewBtn = stage.querySelector('#cs-review');
    if (reviewBtn) reviewBtn.addEventListener('click', () => {
      document.body.classList.remove('choice-on');
      HardReviewMode.start(hardIds, () => this.show(batchIds));
    });
    stage.querySelector('#cs-end').addEventListener('click', () => this._finish(batchIds, false));
  },
  _finish(batchIds, wantsContinue) {
    document.body.classList.remove('choice-on');
    const p = new URLSearchParams();
    p.set('learn_completed', '1');
    p.set('level', LEVEL_KEY);
    p.set('ids', batchIds.join(','));
    if (wantsContinue) p.set('continue', '1');
    window.location.href = '/?' + p.toString();
  }
};
```

- [ ] **Step 2: 语法检查**

Run: `node --check app.js`
Expected: 无输出

- [ ] **Step 3: 提交**

```bash
git add app.js
git commit -m "$(cat <<'EOF'
app.js: 新增 ChoiceScreen——批次通关测验后的选择页

三个选项：继续下一批（需还有未学词且在学习窗口内）/ 复习刚才的
不熟词（可选）/ 结束返回首页。

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 13: `app.js` — `HardReviewMode` 模块（批次内不熟词的可选复习）

**Files:**
- Modify: `app.js:795`（紧接 `ChoiceScreen` 之后插入）

**Interfaces:**
- Consumes: `CardView`, `Gestures`, `TTSEngine`, `Progress`, `DataStore`（既有模块）
- Produces: `HardReviewMode.start(ids: number[], onDone: () => void)`

- [ ] **Step 1: 插入模块**

紧接 Task 12 插入的 `ChoiceScreen` 定义之后，插入：

```js
const HardReviewMode = {
  cards: [],
  idx: 0,
  flipped: false,
  onDone: null,
  start(ids, onDone) {
    this.cards = ids.map(id => DataStore.getCard(id)).filter(Boolean);
    this.idx = 0;
    this.flipped = false;
    this.onDone = onDone;
    document.body.classList.add('hardreview-on');
    this._render();
  },
  _render() {
    if (this.idx >= this.cards.length) {
      document.body.classList.remove('hardreview-on');
      const cb = this.onDone;
      this.onDone = null;
      cb?.();
      return;
    }
    const card = this.cards[this.idx];
    const color = CardView.randomColor();
    const stage = document.querySelector('#cardstage');
    stage.innerHTML = '';
    const el = this.flipped ? CardView.renderBack(card, color) : CardView.renderFront(card, color);
    stage.appendChild(el);
    Gestures.attach(el, {
      onTap: () => TTSEngine.speak(card.kana, { rate: Progress.getTTSRate() }),
      onDoubleTap: () => { this.flipped = !this.flipped; this._render(); },
      onSwipe: (dir) => {
        Progress.mark(card.id, dir === 'left' ? 'unknown' : 'known');
        this.idx++;
        this.flipped = false;
        this._render();
      }
    });
  }
};
```

- [ ] **Step 2: 语法检查**

Run: `node --check app.js`
Expected: 无输出

- [ ] **Step 3: 提交**

```bash
git add app.js
git commit -m "$(cat <<'EOF'
app.js: 新增 HardReviewMode——批次内不熟词的可选复习

复用 CardView/Gestures/TTSEngine，滑卡逻辑和正常学新一致
（左难/右易，Progress.mark 记录），复习完回调返回选择页。

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 14: `app.js` — `TopBar` 支持一般复习模式展示

**Files:**
- Modify: `app.js:385-393`（`TopBar.render` 里的 `leftHtml` 分支）, `app.js:396`（`showFilter`）

**Interfaces:**
- Consumes: `Router.generalReviewMode`（Task 11 产出）

- [ ] **Step 1: 修改 `leftHtml` 分支**

把 `app.js:385-393`：

```js
    if (Router.learnMode) {
      const done = Router.learnCompletedIds.length;
      const total = Router.learnQueue.length;
      leftHtml = `<a class="topbar-left" href="/" style="color: inherit; text-decoration: none;">← 返回 · 学新 ${done}/${total}${streakHtml}${warn}</a>`;
    } else {
      const total = DataStore.allCards().length;
      const idx = Router.currentIndex + 1;
      leftHtml = `<a class="topbar-left" href="index.html" style="color: inherit; text-decoration: none;">📚 ${LEVEL} · ${idx}/${total}${streakHtml}${warn}</a>`;
    }
```

改成：

```js
    if (Router.learnMode) {
      const done = Router.learnCompletedIds.length;
      const total = Router.learnQueue.length;
      leftHtml = `<a class="topbar-left" href="/" style="color: inherit; text-decoration: none;">← 返回 · 学新 ${done}/${total}${streakHtml}${warn}</a>`;
    } else if (Router.generalReviewMode) {
      const total = Router.visibleCards.length;
      const idx = Router.currentIndex + 1;
      leftHtml = `<a class="topbar-left" href="/" style="color: inherit; text-decoration: none;">← 返回 · 一般复习 ${idx}/${total}${streakHtml}${warn}</a>`;
    } else {
      const total = DataStore.allCards().length;
      const idx = Router.currentIndex + 1;
      leftHtml = `<a class="topbar-left" href="index.html" style="color: inherit; text-decoration: none;">📚 ${LEVEL} · ${idx}/${total}${streakHtml}${warn}</a>`;
    }
```

- [ ] **Step 2: 修改 `showFilter`**

把 `app.js:396`：

```js
    const showFilter = !Router.learnMode && !BrainwashMode.active;
```

改成：

```js
    const showFilter = !Router.learnMode && !Router.generalReviewMode && !BrainwashMode.active;
```

- [ ] **Step 3: 语法检查**

Run: `node --check app.js`
Expected: 无输出

- [ ] **Step 4: 提交**

```bash
git add app.js
git commit -m "$(cat <<'EOF'
app.js: TopBar 一般复习模式下显示专属进度，隐藏筛选下拉

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 15: `app.js` — `DOMContentLoaded`：学新时间窗拦截 + `session=general-review` 处理

**Files:**
- Modify: `app.js:1170-1184`（`session === 'learn'` 分支）, 在其之前插入 `session === 'general-review'` 分支, 在文件里新增 `_renderTimeLock` 函数

**Interfaces:**
- Consumes: `isLearnWindowOpen`（Task 2）、`Router.enterGeneralReviewSession`（Task 11）、`QuizMode`（既有）

- [ ] **Step 1: 新增 `_renderTimeLock` 函数**

在 `app.js` 里 `_attachKeyboard` 函数定义（`app.js:1069-1084`）之后插入：

```js
function _renderTimeLock() {
  document.body.classList.add('timelock-on');
  document.querySelector('#cardstage').innerHTML = `
    <div class="quiz-summary">
      <div class="qs-title">⏰ 现在不是学习时间</div>
      <div class="qs-line">学习窗口：晚 8 点 - 凌晨 1 点</div>
      <div class="qs-line">请晚一点再来~</div>
      <button class="qs-done" onclick="location.href='/'">返回</button>
    </div>
  `;
}
```

- [ ] **Step 2: 插入 `session=general-review` 分支**

在 `DOMContentLoaded` 回调里，找到 `if (params.get('session') === 'retake') { ... }` 整段（`app.js:1130-1169`）**结束之后**、`if (params.get('session') === 'learn') { ... }`（`app.js:1170`）**之前**，插入：

```js
    if (params.get('session') === 'general-review') {
      const mode = params.get('mode') || 'swipe';
      const queueIds = (params.get('ids') || '').split(',').map(n => parseInt(n, 10)).filter(n => Number.isFinite(n));
      const queue = queueIds.map(id => DataStore.getCard(id)).filter(Boolean);
      if (queue.length === 0) { window.location.href = '/'; return; }
      TTSEngine.init();
      if (mode === 'quiz') {
        QuizMode.start({
          queue,
          pool: DataStore.allCards(),
          title: '一般复习',
          onComplete: () => { window.location.href = '/'; }
        });
      } else {
        Router.enterGeneralReviewSession(queue);
        _attachKeyboard();
      }
      return;
    }
```

- [ ] **Step 3: 修改 `session === 'learn'` 分支加时间窗拦截**

把 `app.js:1170-1184`：

```js
    if (params.get('session') === 'learn') {
      const queueIds = (params.get('ids') || '').split(',').map(n => parseInt(n, 10)).filter(n => Number.isFinite(n));
      const queue = queueIds
        .map(id => DataStore.getCard(id))
        .filter(Boolean);
      if (queue.length > 0) {
        TTSEngine.init();
        if (!Progress.isAvailable()) TopBar.addWarning('进度不保存');
        if (!TTSEngine.isSupported()) TopBar.addWarning('不支持发音');
        const retakeDate = params.get('retake');
        Router.enterLearnSession(queue, '/', retakeDate);
        _attachKeyboard();
        return;
      }
    }
```

改成：

```js
    if (params.get('session') === 'learn') {
      const queueIds = (params.get('ids') || '').split(',').map(n => parseInt(n, 10)).filter(n => Number.isFinite(n));
      const queue = queueIds
        .map(id => DataStore.getCard(id))
        .filter(Boolean);
      const retakeDate = params.get('retake');
      if (!retakeDate && !isLearnWindowOpen()) {
        _renderTimeLock();
        return;
      }
      if (queue.length > 0) {
        TTSEngine.init();
        if (!Progress.isAvailable()) TopBar.addWarning('进度不保存');
        if (!TTSEngine.isSupported()) TopBar.addWarning('不支持发音');
        Router.enterLearnSession(queue, '/', retakeDate);
        _attachKeyboard();
        return;
      }
    }
```

- [ ] **Step 4: 语法检查**

Run: `node --check app.js`
Expected: 无输出

- [ ] **Step 5: 端到端手动验证（本任务是整条链路首次可以完整走通，务必全部执行）**

```bash
python3 -m http.server 8000
```

浏览器打开 `http://localhost:8000/`：

- [ ] 若当前不在 20:00–00:59：点日历今日格子进当日界面，"学新"卡片显示锁定文案无按钮；直接访问 `http://localhost:8000/n1.html?session=learn&ids=1,2,3` 应看到"⏰ 现在不是学习时间"锁定页而不是卡片
- [ ] 若当前在 20:00–00:59（或临时把系统时间调到这个区间测试）：
  - [ ] 点"开始学习" → 进入滑卡，顶栏显示"学新 0/30"（或剩余未学词数，若不足 30）
  - [ ] 滑完全部 → 自动弹出"通关测验"（四选一），顶栏消失
  - [ ] 测验做完 → 进入选择页，显示"这一批通关了！"，按钮组合视情况显示"继续下一批"/"复习刚才的不熟词"/"结束"
  - [ ] 点"结束" → 跳转回首页，当日界面"学新"卡片显示"✅ 今日 1/N 批已完成"或可继续（视 batchesAllowed）
  - [ ] 再次点"开始学习"进入第二批（若 batchesAllowed ≥ 2）滑完测完，选择页点"继续下一批" → 应该自动跳过首页停留，直接进入第三批的滑卡界面（如果还有批次可学）
  - [ ] 若某批测验后点"复习刚才的不熟词"（前提是这一批里有滑"难"的词）→ 进入不熟词的单独滑卡复习，滑完自动回到选择页
- [ ] 回首页点"一般复习"卡片的"滑卡"按钮 → 进入一般复习滑卡模式，顶栏显示"一般复习 1/N"，滑完最后一张自动跳回首页
- [ ] 回首页点"一般复习"卡片的"测验"按钮 → 进入四选一测验，做完自动跳回首页
- [ ] Console 全程无报错

- [ ] **Step 6: 提交**

```bash
git add app.js
git commit -m "$(cat <<'EOF'
app.js: 学新时间窗拦截 + session=general-review 处理

学新（非 retake）在 20:00-00:59 之外访问会看到锁定页；一般复习
的滑卡/测验两种模式通过 session=general-review&mode= 接入。

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 16: 完整回归 + `docs/testing-checklist.md` 补充

**Files:**
- Modify: `docs/testing-checklist.md`（若不存在则创建）

**Interfaces:**
- 无代码接口，本任务是收尾验证

- [ ] **Step 1: 跑全部单元测试**

Run: `npm test`
Expected: PASS，全部测试绿色（包括 Task 1-3 新增的和原有的）

- [ ] **Step 2: 跑 `npm run validate`（确认没有动到卡片数据结构）**

Run: `npm run validate`
Expected: PASS

- [ ] **Step 3: 补充手动测试清单**

打开（或创建）`docs/testing-checklist.md`，在文件末尾追加：

```markdown
## 分批学习 + 强制测验 + 时间窗（2026-07-11）

- [ ] 20:00–00:59 内点"开始学习" → 发一批（≤30 词）→ 滑完 → 强制弹测验 → 测完进选择页
- [ ] 选择页"继续下一批"：未超今日批次上限且还有未学词 → 自动接力进入下一批滑卡（不需要先回首页再点一次）
- [ ] 选择页"继续下一批"在已达当日批次上限时不显示
- [ ] 非 20:00–00:59 时段：等级页"开始学习"入口锁定，直接访问 `?session=learn` URL 也会拦截显示锁定页
- [ ] 非学习时段："早复习""一般复习"两个入口仍正常可点
- [ ] 一般复习（滑卡/测验两种模式）：多次进入，"不熟"词和"很久没复习的已掌握词"出现频率明显高于"最近刚复习过的已掌握词"
- [ ] 一般复习不影响当日打卡状态（只完成一般复习，学新/早复习打卡不受影响）
- [ ] 完成 1 批（滑卡+测验）即触发晚打卡 ✓，不要求刷满当日全部批次
- [ ] 剩余未学词不足 30 → 按实际数量发批，测完后选择页不显示"继续下一批"
- [ ] 批次内没有滑"难"的词时，选择页不显示"复习刚才的不熟词"
- [ ] 直接访问 `?session=learn&retake=<date>`（若存在这个历史入口）不受时间窗限制——回归验证未破坏 retake 路径
```

- [ ] **Step 4: 提交**

```bash
git add docs/testing-checklist.md
git commit -m "$(cat <<'EOF'
docs: 补充分批学习+强制测验+时间窗的手动测试清单

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```
