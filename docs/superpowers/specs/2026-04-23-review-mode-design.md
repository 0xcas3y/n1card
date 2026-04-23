# 每日学习 + 复习计划 — 设计文档

**日期**：2026-04-23
**状态**：草案
**前置**：`2026-04-18-n1card-design.md`、打卡 `Streak` 模块、首页月历

---

## 1. 目标 & 动机

现有 app 只有"自由刷卡"：打开、滑一阵、关掉。没有每日节奏、没有复习机制、没有巩固回路。

**产品北极星**：**让用户不用操心地养成背单词习惯**。日历是唯一入口，点一个日子就知道今天要干什么——剩下的节奏、配额、复习曲线全部由 app 处理。

具体化为三条：

1. 每天有明确的 **新词学习配额**（随打卡连续天数解锁，1→2→3 组，每组 30 词）
2. 新学的词**按固定节奏回炉**：次日早 + 次次日早共 2 次四选一 quiz
3. 已掌握的词走**周复习**：每 7 天一次轻量测试，防遗忘

每个词精确 **1 次学习 + 2 次复习 + 长期每周维护**。底层机制：四选一 quiz **动态更新状态**（答错降 不熟、连对升 掌握），形成最轻的 SRS-lite 回路。

**每日仪式感**：一天 **2 场 session**、**2 个打卡点**：

- 🌙 **晚**（学新）→ 晚打卡
- 🌅 **早**（复习昨日、前日新学）→ 早打卡

晚先学、次日早复习——学 → 睡眠巩固 → 早上测试，是教育心理学意义上的"离线巩固"节奏。两个打卡都做完时，日历上当日格子变**金色**。

**非目标**（YAGNI）：
- 完整 SRS（SM-2 / FSRS 的指数间隔曲线）——只做 2 次短期 + 7 天周复习
- 跨设备同步 / 账号
- 每日通知 / 推送
- 自定义学习配额（配额只随 streak 自动解锁）
- 选级别 / 切级别的引导（app 自选"当前等级"，用户不操心）

---

## 2. 词生命周期

一张卡在系统里的状态机：

```
           (首次在"学新"出现)
未学过 ───────────────────────┐
                              │  滑动↓
                         ┌────┼──────┐
                         │    │      │
                      滑动↑   │     掌握
                         │    │      │
                        不熟 ←┘      │
                         │           │ quiz 答错
                         │           ↓
                         │          不熟
                         │
              quiz 连答对 2 次
                         │
                         ↓
                       掌握
```

**关键规则**：
- 状态由两处驱动：**滑动 up/down**（学新）+ **quiz 答对/答错**（复习）
- quiz 答对：`correctStreak++`；若 `correctStreak >= 2` 且当前 不熟 → 升 掌握
- quiz 答错：立即降 不熟，`correctStreak = 0`；若之前是 掌握，清 `masteredAt`
- **七日周复习答对**：只更新 `lastWeeklyReviewAt`，不改状态

---

## 3. 每日计划模型

### 3.1 配额（由 streak 解锁）

| 连续打卡天数 | 每日新学配额 |
|---|---|
| 1–6 天 | 1 组 = **30 词** |
| 7–13 天 | 2 组 = **60 词** |
| ≥14 天 | 3 组 = **90 词**（上限） |

- streak 断掉后归 1，配额也掉回 30 词
- 每个**等级独立**：N1 和 N5 的配额各算各的（用户其实只会专注一个等级，留这个自由度成本低）
- streak 本身保持**全局共享**（现状不变）

### 3.2 每日 session 结构

一天 **2 个必做 session**，对应 2 个打卡点；第 3 个"周复习"独立，按需触发：

| 段 | Session | 内容 | 题池 | 打卡 |
|---|---|---|---|---|
| 🌙 **晚** | **学新** | 滑动卡 | 按等级 id 升序，下 N 个"未学过" | 完成 → 晚打卡 ✓ |
| 🌅 **早** | **早复习** | 四选一 | `(cohort(N-1) ∪ cohort(N-2)) ∩ 不熟` | 完成 → 早打卡 ✓ |
| 📆 任时 | **周复习** | 四选一 | 所有 掌握 且 `now - max(masteredAt, lastWeeklyReviewAt) ≥ 7 天` 的词 | 不影响打卡 |

**时段只是建议**：app 不按钟点判断，session 可按任意顺序进行。推荐昨晚学、今早复——让睡眠巩固新学的词。

### 3.3 打卡规则（暴露给用户）

- 🌙 **晚打卡** = 完成今日「学新」
- 🌅 **早打卡** = 完成今日「早复习」
- 周复习是"加分项"，不影响打卡
- 两个打卡都 ✓ → 日历格子 **🟡 金色**；只 ✓ 一个 → **🟢 半色**；未打卡 → 默认灰
- 打卡状态**跨等级聚合**：任一等级的学新/早复习完成即触发对应打卡

**streak（连续天数）**：以"当日是否至少有一个打卡"为锚——早或晚有一个 ✓，当日算"续上"；**两个都没做** → streak 断。这和金色无关，金色是更严格的"全完"信号。

### 3.4 Cohort 定义

- **Cohort of date D** = 在 D 这一天晚上通过「学新 session」学完的那一批词的 id 集合
- Cohort 在**创建后的 2 个日历日**参与早复习：Day D+1 早、Day D+2 早
- Day D+3 早起，cohort 退出短期循环；其中仍为 不熟 的词靠**自由刷卡**或**再遇见**时重新巩固（不强制回炉）
- 跳过日期会占 cohort 的两个早复习档位之一——窗口固定在 D+1 / D+2 日历日，用户缺席即损失该次复习（严苛，但避免排队堆积）

### 3.5 单词在每场 quiz 的出现

一个在 Day D 晚上被首次学的词，后续 quiz 出现轨迹（假设每场都做）：

| 场次 | 条件 |
|---|---|
| Day D+1 早复习 | 若滑动时被标 不熟 |
| Day D+2 早复习 | 若当前仍为 不熟（可能中途被 quiz 升 掌握 而出池） |
| Day D+3 早复习后 | cohort 过期。若当前是 掌握 且 `now - masteredAt ≥ 7天` → 进周复习 |

---

## 4. 四选一测试

### 4.1 出题

```
┌──────────────────────────────┐
│         承る                  │
│   ① 谦辞：接受、承担          │
│                              │
│  (A) うけたまわる   ← 正确    │
│  (B) うけおう                 │
│  (C) うけいれる               │
│  (D) うけつける               │
│                              │
│     12/22 · 正确 8            │
└──────────────────────────────┘
```

- 题面：`word`（汉字）+ `meanings[0]`（只显首条中文，避免剧透太多）
- 选项：1 正确 `kana` + 3 干扰项 kana，顺序随机
- 选项点击后：正确高亮绿、错误高亮红、正确项恒亮绿 400ms → 自动下一题
- 答对播 `correct kana` 的 TTS（强化"汉字 → 读音"）；答错不播（避免误绑定）

### 4.2 干扰项选择

从**同级别**（同一 `cards.json`）的其他卡片 kana 里随机抽 3 条。约束：

- 不和正确答案重复
- 不选择 kana 与正确答案**完全相同**（极少见但保险）

简单随机，不按音近/字数相近做精挑——先做简单版，真不够难再加。

### 4.3 完成判定

一场 quiz 的所有词每张答过一次，即算完成。错题当场**不立刻重出**（避免"答错 → 再看到答案 → 立刻答对"骗升级）；若用户还想巩固，再开一场即可。

### 4.4 状态变更（再强调一次）

| 动作 | 更新 |
|---|---|
| 答对 不熟 卡 | `correctStreak++`；若 ≥ 2 → 升 掌握，`masteredAt=now`，`correctStreak=0` |
| 答对 掌握 卡（周复习） | `lastWeeklyReviewAt=now`；状态不变 |
| 答错 不熟 卡 | `correctStreak=0` |
| 答错 掌握 卡 | 降 不熟，清 `masteredAt`，`correctStreak=0` |

**滑动（非 quiz）对 `correctStreak` 的影响**：滑↑（不熟）= `correctStreak=0`；滑↓（掌握）= `masteredAt=now, correctStreak=0`。即滑动是"用户权威裁决"，直接写终态，不走 quiz 的累积逻辑。

---

## 5. 数据模型

### 5.1 localStorage 扩展

**`n1card:progress:<level>`**（既有，扩字段）：

```typescript
{
  [cardId: string]: {
    status: "known" | "unknown" | null,      // 既有
    lastSeen: number,                         // 既有
    firstLearnedAt?: number,                  // 新：首次通过学新 session 学完的 ts
    correctStreak?: number,                   // 新：quiz 连对计数（默认 0）
    masteredAt?: number,                      // 新：升 掌握 的 ts（周复习用）
    lastWeeklyReviewAt?: number,              // 新：上次周复习 ts
    quizSeenCount?: number                    // 新：quiz 累计曝光次数（统计用）
  }
}
```

向后兼容：字段缺失全部视为 `undefined`，代码里当 0/null 处理。

**`n1card:plan:<level>`**（新）：

```typescript
{
  cohorts: {
    [dateStr: string]: {       // "YYYY-MM-DD"
      cardIds: number[],        // 那天学完的词 id
      completedAt: number       // ts
    }
  },
  sessions: {
    [dateStr: string]: {
      morning?: { status: "done", completedAt: number, correct: number, total: number },  // 早复习
      learn?:   { status: "done", completedAt: number, count: number },                    // 学新（= 晚 session）
      weekly?:  { status: "done", completedAt: number, correct: number, total: number }    // 周复习
    }
  },
  lastWeeklyRun?: number        // 上次进入周复习的 ts（决定"到期"展示）
}
```

Cohort 只保留最近 3 天（D、D-1、D-2 用于 2-day 早复习窗口），更老清理。`sessions` 按日期无限保留（单个 object 很小），用于"回顾界面"。

**`n1card:current-level`**（新，全局）：

```typescript
"n1" | "n2" | "n3" | "n4" | "n5"   // 当日界面默认展示的等级，首次为 "n1"
```

**`n1card:rules-seen`**（新，全局）：

```typescript
true  // 规则区是否已展示过，决定当日界面规则区默认折/展
```

### 5.2 Streak（既有，扩展）

新增**早/晚打卡聚合**字段（跨等级全局）：

```typescript
{
  lastDate: "YYYY-MM-DD",             // 既有：最近打卡日期
  current: number,                    // 既有：连续天数
  longest: number,                    // 既有
  total: number,                      // 既有
  dates: string[],                    // 既有：打卡日列表（只要早或晚有一个就入列）
  checkIns: {                         // 新：每日的细分打卡状态
    [dateStr: string]: {
      morning?: boolean,              // 早打卡（任一等级学新完成 → true）
      evening?: boolean               // 晚打卡（任一等级学新完成 → true）
    }
  }
}
```

API 新增：

- `Streak.markCheckIn(dateStr, kind)`：`kind ∈ {'morning', 'evening'}`；写入 `checkIns[dateStr][kind] = true`，若首次设置则加入 `dates`、重算 `current/longest/total/lastDate`
- `Streak.isGold(dateStr)` → `checkIns[dateStr]?.morning && checkIns[dateStr]?.evening`
- `Streak.getCheckIn(dateStr)` → `{ morning: bool, evening: bool }`

**连续天数（current）规则微调**：
- 以"当日至少有一个打卡"（morning 或 evening）为"续上"条件
- 日期 D 有任一打卡 + D-1 也有 → current++
- D 有任一打卡 + D-1 没有 → current = 1
- D 完全没打卡 → current 当日仍按"最后一次打卡日是 D-1 or D" 判断（沿用现有 `getCurrent` 逻辑）

移除 `Router.markAndNext` 里的 `Streak.tick()` 调用。滑动不再触打卡。

---

## 6. UX 设计

**核心原则**：日历是唯一入口。点一个日子 → 进入那一天的"**当日界面**"——今天是可交互的打卡面板，过去是只读回顾，未来不可点。

### 6.1 首页（index.html）改造

主体仍是现有的 streak-box（连续/最长/累计）+ 月历，但月历从"被动展示"升级为"交互入口"：

**月历格子三态**：

| 状态 | 样式 | 含义 |
|---|---|---|
| 默认 | 灰白数字 | 该日完全未做 |
| 🟢 半完 | 绿色圆底（现有 `.checked`） | 早/晚 打卡只完成一个 |
| 🟡 全完 | **金色圆底**（新） | 早+晚 都 ✓ |
| 🔘 今日 | 外圈高亮描边（现有 `.today`） | 当日标识，独立于三态 |

**点击行为**：

- 点**今日**：进入「当日界面」（可交互）
- 点**过去有打卡记录的日子**：进入「回顾界面」（只读；展示当天学了哪些词、打卡状态、那天的 cohort 列表）
- 点**过去没记录 / 未来日子**：无响应（或极浅 toast "无记录 / 未来日子"）

等级按钮列表保留，作为"想自由刷一下特定等级"的直达口。

### 6.2 当日界面（今日，可交互）

渲染为首页内视图切换（或独立 `day.html`，二选一，实现时定；推荐首页 view-switch 以省路由成本）。包括：

```
┌ ← 返回  ───── 📅 4 月 23 日 · 周三 ─────  🔥 5 天 ┐
│                                                   │
│   打卡：☀️ 早 ○      🌙 晚 ○      （全完 → 金）    │
│                                                   │
│   ▾ 规则（可折叠）                                  │
│     • 🌙 晚打卡 = 完成「学新」（滑卡）             │
│     • 🌅 早打卡 = 完成「早复习」（四选一）         │
│     • 连续打卡 7 天解锁 60 词/天，14 天→90 词      │
│     • 答对 2 次升掌握，答错立刻回不熟              │
│     • 已掌握的词每 7 天来一次周复习                │
│                                                   │
│  ─── 今日 N1（🎯 当前等级）·  配额 30 ───           │
│                                                   │
│   🌅 早复习     昨 + 前日 不熟 · 22 题  [开始]      │
│   🌙 学新       0 / 30                  [开始]      │
│   📆 周复习     7 词到期                [开始]      │
│                                                   │
│                   [切换等级 ▾]                     │
└───────────────────────────────────────────────────┘
```

**规则区**首次进入自动展开，以后默认折叠（`n1card:rules-seen` 标志位）。

**当前等级**由 `n1card:current-level` 决定，默认 `n1`。用户通过底部"切换等级"下拉可改；改了后 session 基于新等级重算。**不强迫用户选**——默认 N1，反正最 popular。

**session 卡按钮**：
- `[开始]` → 进入该 session（学新 → 跳转 `n1.html?session=learn`；quiz → 全屏 quiz 视图）
- `[已完成 18/22]` → 再点可复看小结（不允许重刷当场拿双倍升级）
- `[锁]` → 未解锁（如某 session 有前置条件），灰色不可点

### 6.3 回顾界面（过去，只读）

点击过去日期（有打卡记录）打开：

```
┌ ← 返回  ───── 📅 4 月 22 日 · 周二  ─────────── ┐
│                                                │
│   打卡：☀️ 早 ✓      🌙 晚 ✓      状态：🟡 金  │
│                                                │
│   当日学新（N1）：30 词                         │
│     承る · 携わる · 賜る · …  [30 词]          │
│                                                │
│   四选一记录：                                   │
│     🌅 早复习：答对 18 / 22（82%）              │
│     📆 周复习：—                                 │
│                                                │
│                                                │
│                    [返回]                       │
└────────────────────────────────────────────────┘
```

点词列表中的词可跳到该卡的正面视图（复用现有 `n1.html` + `lastCardId`）。

### 6.4 Session 运行视图

**学新 session**（复用现有滑动卡界面）：
- 在等级页（`n1.html` 等）顶栏进入时，识别 URL `?session=learn`，把 `Router.visibleCards` 限定为"今日学新队列"
- 顶栏进度改为 `学新 3/30`（替换现有 `3/393`）
- 滑完 N 张自动回"当日界面"+ 弹 `🎉 早打卡完成` 提示
- 退出按钮（顶栏"←"）返回当日界面，未完成的进度保留到下次继续

**四选一 session（早复习 / 周复习共用）**：新增 `QuizMode` 全屏视图
- 顶栏：`← 退出 · 12/22 · 正确率 72%`
- 正中央题面卡 + 下方 4 选项
- 答完一题：300ms 反馈动画 → 自动下一题
- 全部答完：小结页 `本轮 · 答对 X / 总 Y · 新升掌握 Z 词` + `[完成]` 按钮 → 回当日界面
- 中途退出：部分进度不保存（quiz 必须一气呵成；设计决定，避免"分次答题"状态爆炸）

### 6.5 等级页（n1.html 等）保持最小改动

- 不加"今日"入口按钮（原设计的 📅 去掉）
- 唯一新东西：URL 支持 `?session=learn` 参数，进入"学新模式"
- 顶栏"← 返回"（从学新 session 返回）逻辑加进来
- **现有自由刷卡 + 筛选 + 洗脑完全保留**。用户随时可以直接进 `n1.html` 刷着玩，滑动仍改状态——但**不生成 cohort**，**不触发打卡**

### 6.6 打卡判定（代码位置）

替换 `Router.markAndNext` 里的 `Streak.tick()`，改为在 session 完成回调里触发：

| Session 完成 | 写入 |
|---|---|
| 学新 完成 | `Plan.markCheckIn(date, 'evening')` + 生成 cohort |
| 早复习 完成 | `Plan.markCheckIn(date, 'morning')` |
| 周复习 完成 | 不触发打卡（不改 morning/evening 标记） |

`Plan.markCheckIn` 更新 `n1card:streak.checkIns[date]`，并调用 `Streak._recomputeStreak()` 把连续天数和金色日期重算（见 §5.2）。

---

## 7. 迁移与兼容

| 场景 | 处理 |
|---|---|
| 已有 `progress` 条目缺新字段 | 读取时默认 `undefined`，视为 0/null |
| 用户之前标过大量 掌握 但无 `masteredAt` | 每次加载时扫一遍 progress，遇到 `status=='known' && !masteredAt` 就回填 `masteredAt=now`。等价于"首次开启"语义，但免去显式 migration 标志 |
| 用户之前标过大量 不熟 | 不回填到当日 cohort（没 cohort 可回填）。这些词通过自由刷卡再遇见，或等自然学新时若落入配额也会重新曝光 |
| 已编辑的 overrides | 不受影响 |

---

## 8. 边界 & 细节

| 情况 | 行为 |
|---|---|
| Day 1（无 N-1 / N-2 cohort） | 早复习池为空，session 显示"今日无早复习"，早打卡**自动授予**（避免 Day 1 永远无法金色） |
| Day 2（只有 N-1 cohort，无 N-2） | 早复习池仅 cohort(N-1)，正常进行；早打卡正常触发 |
| 跳过一天 | cohort 窗口按日历日，不顺延；缺席该日早复习即损失该次机会 |
| 等级剩余"未学过"不足配额 | 学新 session 当日只学实际数量；滑完即晚打卡 ✓ |
| 某等级全部 掌握 | 无学新；当日界面只显示早复习（若有昨/前日 cohort 不熟）+ 周复习；**晚打卡自动授予**（无新可学） |
| 学新 session 中途退出 | 未滑完不计入 cohort；下次重开继续；晚打卡不触发 |
| 同一天多次开学新 session | 已完成则"已完成"状态，不允许重刷（避免绕过 SRS）。想练更多用自由刷卡 |
| 掌握 词升降反复 | 允许。每次降级清 `masteredAt`，升级重置 `correctStreak=0` |
| 同日切换等级 | 切到另一等级后当日界面展示那级的 session；已完成打卡仍然保留（跨等级聚合） |
| 点击未来日期 | 不响应（或极浅 toast） |
| 点击过去无记录日期 | 不响应 |
| 点击过去有记录日期 | 进入回顾界面（只读） |
| localStorage 满 | 复用现有 `_available=false` 警告机制；plan/checkIn 写失败降级为"今日不保存" |
| 时区 / 跨日 | 用本地 `Date`（和 `Streak` 保持一致） |
| 用户在自由模式手动滑成"掌握" | `masteredAt=now`；7 天后周复习正常触发。不生成 cohort、不算打卡 |

---

## 9. 模块边界

首页 `index.html` 的内嵌 `<script>` 会膨胀到需要拆文件。方案：新建 `hub.js`（首页专用）和复用 `app.js`（等级页专用），互不影响。

首页新增模块（`hub.js`）：

| 模块 | 职责 | 依赖 |
|---|---|---|
| `Plan` | 读写 `plan:<level>`，计算配额/cohort/session 状态/pool 组合 | Progress（跨等级加载）, Streak, DataStore（按等级延迟加载） |
| `Calendar` | 渲染月历（三态：灰/绿/金），点击分发到当日界面 / 回顾界面 | Streak, Plan |
| `DayView` | 当日界面：规则区 + 4 session 卡 + 等级切换。派发按钮点击到 session 启动 | Plan, Streak |
| `RetrospectView` | 回顾界面：只读展示过去某日的 cohort 与打卡结果 | Plan, Streak |
| `QuizMode` | 四选一题面渲染、答题交互、状态变更、小结页 | Progress, DataStore, TTSEngine |

等级页（`app.js`）修改：

| 模块 | 改动 |
|---|---|
| `Progress` | 扩字段；新增 `markQuiz(id, correct)` 统一处理升降；新增 `markSwipe(id, status)` 明确"滑动写终态"（取代当前 `mark`） |
| `Streak` | 扩 `checkIns` + `markCheckIn` + `isGold` API；移除 `Router.markAndNext` 里的 `Streak.tick()` |
| `Router` | URL 带 `?session=learn` 时进入"学新模式"：`visibleCards` 替换为今日队列、顶栏进度变 N/配额、完成时调 `Plan.completeLearn` + `Streak.markCheckIn` + 回首页 |
| `TopBar` | 学新模式下进度显示换为 N/配额；加"← 返回当日"按钮 |

共享（两页都引用）：

- `data-store.js`（抽现在的 `DataStore` 类出来，按等级 lazy load）
- `progress.js`（抽 `Progress` 出来，支持传 level 构造）
- `streak.js`（抽 `Streak` 出来，全局单例）

若拆分实现成本太高，也可以先保持 `app.js`+ `<script>` 结构，在首页把 `app.js` 里的公用部分也 import 进来。实现时定。

---

## 10. 测试

### 10.1 单元测试（Node `--test`，新增 `scripts/plan.test.js`）

- `computeQuota(streak)` → `{1:30, ..., 6:30, 7:60, ..., 13:60, 14:90, ...}`
- `computeLearnQueue(cards, progress, quota)` → 下 N 个未学过 by id 升序
- `computeMorningPool(cohorts, progress, today)` → `(cohort(N-1) ∪ cohort(N-2)) ∩ 不熟`
- `computeWeeklyDue(progress, now)` → 所有 掌握 且 `now - max(masteredAt, lastWeeklyReviewAt) ≥ 7 天`
- 状态机转移：`markQuiz` 各分支
- `pickDistractors(correct, pool)` 返回 3 个不重复非正确答案
- Cohort 过期清理（>7 天删除）
- `Streak.markCheckIn` + `isGold`：单打卡/双打卡/零打卡三种，日期跨天场景

### 10.2 手动清单（`docs/testing-checklist.md` 增补）

- [ ] 新用户 Day 1：点首页"今天"→当日界面：早复习空态 + 早打卡自动 ✓、学新 30、周复习空态
- [ ] Day 1 完成学新 30 → 晚打卡 ✓、cohort 写入、日历当日变**金色**（早+晚皆 ✓）
- [ ] Day 2 回来：早复习 = Day 1 不熟、学新下一批 30
- [ ] Day 2 只完成学新不做早复习 → 日历 Day 2 **半色**、streak=2
- [ ] Day 3 早复习 = cohort(1) ∪ cohort(2) 仍 不熟 的词
- [ ] Day 4 早复习 = cohort(2) ∪ cohort(3)（cohort(1) 已过期）
- [ ] quiz 连对 2 题：状态升 掌握，等级页顶栏"已掌握"数 +1
- [ ] quiz 答错 掌握 词：降 不熟，顶栏数调整
- [ ] 跳过 Day 3 → Day 4 早复习 pool = cohort(2)∪cohort(3)；cohort(1) 在 Day 3 被跳过的那次复习永久丢失
- [ ] streak 到 7 天：配额升 60；到 14：升 90
- [ ] streak 断（一日两打卡都无）：配额掉回 30
- [ ] 点击日历过去某金色日：进入回顾界面，显示当日学的词列表和 quiz 正确率
- [ ] 点击未来日期：无响应
- [ ] 当日界面切换等级：session 内容切换、打卡不丢
- [ ] 自由刷卡滑动仍能改状态但不生成 cohort、不触打卡
- [ ] localStorage 禁用：当日界面显示警告但仍可在内存运行一天
- [ ] 跨等级聚合：N1 完成学新 + N5 完成早复习 = 当日双打卡金色
- [ ] 规则区首次展示、之后折叠

---

## 11. 里程碑

1. `Plan` 模块 + pool 计算 + 配额计算 + 单元测试
2. `Progress` 扩字段 + `markQuiz` + `markSwipe` + 懒回填 `masteredAt`
3. `Streak` 扩 `checkIns` + `markCheckIn` + `isGold` + 单元测试
4. `QuizMode` 视图（独立可跑，假数据驱动）
5. `Router` 学新模式（`?session=learn`）+ 顶栏进度 + 完成回调
6. 首页 `Calendar` 升级为三态 + 可点击；`DayView` 当日界面
7. `RetrospectView` 过去日期只读界面
8. 首页 streak-box 配合金色打卡展示
9. 移除 `Router.markAndNext` 里的 `Streak.tick()`
10. Mac Safari + iPhone Safari 清单过一遍
11. 部署

---

## 12. 明确不做（本 spec 范围外）

- 自定义配额 / 自定义组大小
- 语音题（听读音选汉字）、反向题（中→日）
- 推送通知 / 每日提醒
- 云同步 / 多设备合并
- 更细的 SRS 曲线（3/7/14/30 天等）——仅用"2 次短期 + 7 天周"两档
- 答错立即重出 / 本轮末尾重出
- 成就系统 / 徽章
