# 每日学习 + 复习计划 — 设计文档

**日期**：2026-04-23
**状态**：草案
**前置**：`2026-04-18-n1card-design.md`、打卡 `Streak` 模块、首页月历

---

## 1. 目标 & 动机

现有 app 只有"自由刷卡"：打开、滑一阵、关掉。没有每日节奏、没有复习机制、没有巩固回路。

把"打卡 + 日期"升级成一套**每日计划**：

1. 每天有明确的 **新词学习配额**（随打卡连续天数解锁，1→2→3 组，每组 30 词）
2. 新学的词会**按固定节奏回炉**：当日晚 + 次日早 + 次日晚共 3 次四选一测试
3. 已掌握的词走**周复习**：每 7 天一次轻量测试，防遗忘
4. 四选一测试会**动态更新卡片状态**（答错降 不熟、连对升 掌握）

目的：把"刷了就忘"改造成"学一次 + 巩固数次 + 长期维护"。

**非目标**（YAGNI）：
- 完整 SRS（SM-2 / FSRS 的指数间隔曲线）——只做 3 次短期 + 7 天周复习
- 跨设备同步 / 账号
- 每日通知 / 推送
- 自定义学习配额（配额只随 streak 自动解锁）

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

每天**最多 3 场** session（不含每日周复习独立一场）：

| Session | 时段暗示 | 内容 | 题池 |
|---|---|---|---|
| 🌅 **早复习** | 上午 | 四选一 | **昨日 cohort** 中当前仍为 不熟 的词 |
| 🌱 **学新** | 中午 | 滑动卡 | 按等级 id 升序，下 N 个"未学过" |
| 🌙 **晚复习** | 晚间 | 四选一 | **今日 + 昨日 cohort** 中当前仍为 不熟 的词 |

加一场**随时可做**的：

| Session | 触发 | 题池 |
|---|---|---|
| 📆 **周复习** | 有 ≥1 张 掌握 词到期（距上次复习 ≥7 天） | 全部到期的 掌握 词 |

**时段只是建议**：app 不按钟点判断，session 可按任意顺序进行。但推荐顺序是 早 → 学新 → 晚，保留"学完当天就趁热复习"的语感。

### 3.3 Cohort 定义

- **Cohort of date D** = 在 D 这一天首次通过"学新 session"学完的那一批词的 id 集合
- Cohort 在**创建后 2 天内**参与短期复习：
  - 被创建当日 晚 session
  - 次日 早 session
  - 次日 晚 session
- 第 3 天起，cohort 退出短期循环；其中仍为 不熟 的词靠**自由刷卡**或**再遇见**时重新巩固（不强制回炉，避免堆积）
- 每张词的 3 次短期复习曝光后，若还是不熟，就走这种"被动再遇"路径

### 3.4 单词在每场 quiz 的出现

一个在 Day D 被首次学的词，后续 quiz 出现轨迹（假设每场都做）：

| 场次 | 条件 |
|---|---|
| Day D 晚 | 若滑动时被标 不熟 |
| Day D+1 早 | 若当前仍为 不熟 |
| Day D+1 晚 | 若当前仍为 不熟 |
| Day D+1 晚之后 | cohort 过期。若当前是 掌握 且 `now - masteredAt ≥ 7天` → 进周复习 |

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
      morning?: { status: "done", completedAt: number, correct: number, total: number },
      learn?:   { status: "done", completedAt: number, count: number },
      evening?: { status: "done", completedAt: number, correct: number, total: number }
    }
  },
  lastWeeklyRun?: number        // 上次进入周复习的 ts（决定"到期"展示）
}
```

Cohort 只保留最近 7 天的记录，老数据清理（降低 localStorage 占用）。

### 5.2 Streak（既有，微调）

- `tick()` 触发条件改为"**完成当日学新 session**"或"**今日无学新但完成任一 session**"
- 其他字段和 API 不动

---

## 6. UX 设计

### 6.1 等级页 — 顶部"今日"入口

在每级 `.html`（n1.html、n2.html…）的顶栏增加一个 `📅 今日` 按钮，位于 `🧠 洗脑` 旁边：

- 点击弹出**今日计划面板**（modal）
- 面板展示 4 张 session 卡，依次：早复习 / 学新 / 晚复习 / 周复习
- 每张卡：图标 + 名称 + 进度 + `[开始] / [已完成]` 按钮

```
┌─ 📅 今日 N1 · 🔥5 · 配额 30 ─────────────┐
│                                          │
│  🌅 早复习      昨日 不熟 · 22 题         │
│                 [开始] / [已完成 18/22]    │
│                                          │
│  🌱 学新        0 / 30                    │
│                 [开始]                    │
│                                          │
│  🌙 晚复习      今+昨 不熟 · 需先学新      │
│                 [未解锁]                  │
│                                          │
│  📆 周复习      7 词到期                  │
│                 [开始]                    │
│                                          │
│               [关闭]                      │
└──────────────────────────────────────────┘
```

### 6.2 session 运行视图

**学新 session**：复用现有滑动卡界面，只是 `Router.visibleCards` 在进入时被设置为"今日配额词列表"。顶栏增加"1/30"进度指示（替换现有的 5/393）。完成后自动回到今日面板 + 弹提示"今日学新完成 🎉"。

**四选一 session（早/晚/周复习共用）**：新增一个 `QuizMode` 视图：
- 全屏，类似洗脑模式的沉浸感但带交互
- 顶栏极简：`← 退出 · 12/22 · 正确率 72%`
- 正中央题面卡，下方 4 个可点击选项
- 答完一题：300ms 反馈动画 → 自动下一题
- 答完全部：展示小结页 `本轮 · 答对 X / 总 Y · 新升掌握 Z 词` → 回今日面板

### 6.3 首页 hub

在现有 streak-box 下面插一个"**今日进度条**"：

```
N1 · 今日：学新 0/30 · 🌅 完成 · 🌙 待办 · 📆 7 词到期
```

点击进 N1 等级页并自动打开今日面板。仅显示有 `cohorts` 或 `progress` 的等级。

### 6.4 自由模式保留

既有"全部 / 只看待巩固 / 只看未学过 / 随机"筛选 + 滑动**继续保留**。用户可以不开今日面板、直接自由刷。滑动打的 up/down 仍写入 `progress`，但**不进当日 cohort**（cohort 只在走完整"学新 session"时才生成）。

### 6.5 打卡判定

`Streak.tick()` 触发时机改为：
1. "学新 session"完成时（N 张全部滑完）
2. 若今日无新词可学（全掌握），任一复习 session（早/晚/周）完成时也触发

现有"任何 mark 都 tick"的行为**移除**，以免自由刷一下就算打卡（和"学习计划"的 streak 语义脱节）。

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
| Day 1（无昨日 cohort） | 早复习不可用，提示"今日无早复习" |
| 跳过一天 | 老 cohort 过期，不强塞回新的 cohort。用户看到"无早复习" |
| 等级剩余"未学过"不足配额 | 学新 session 当日只学实际数量，完成即 tick |
| 某等级全部 掌握 | 无学新；只有周复习（到期时） |
| 学新 session 中途退出 | 未滑完的不计入 cohort；下次重开继续 |
| 同一天多次开学新 session | 已完成则显示"已完成"，再次进入只能看不能重学（或加"再刷一轮"自由模式入口） |
| 掌握 词升降反复 | 允许。每次降级清 `masteredAt`，升级重置 `correctStreak=0` |
| localStorage 满 | 复用现有 `_available=false` 警告机制；plan 写失败降级为"今日不保存" |
| 时区 / 跨日 | 用本地 `Date`（和 `Streak` 保持一致） |

---

## 9. 模块边界

新增模块（延续现有 `app.js` 一体风格）：

| 模块 | 职责 | 依赖 |
|---|---|---|
| `Plan` | 读写 `plan:<level>`，计算今日配额/cohort/session 状态，pool 计算 | Progress, Streak, DataStore |
| `QuizMode` | 四选一题面渲染、答题交互、状态变更、完成回调 | Progress, DataStore, TTSEngine |
| `TodayPanel` | 今日面板 modal（4 张 session 卡渲染 + 按钮分发） | Plan |

修改模块：

| 模块 | 改动 |
|---|---|
| `Progress` | 字段扩展；新增 `markQuiz(id, correct)` 统一处理升降 |
| `Streak` | `tick()` 触发点改为"session 完成"，移除 `Router.markAndNext` 里的 `Streak.tick()` |
| `Router` | 支持 "plan learn mode"：`enterLearnSession(cardIds)` 设置 visibleCards + 进度计数 |
| `TopBar` | 加 `📅` 入口按钮；学新模式下进度显示切换到 N/quota |
| `index.html` | hub 加"今日进度条"段 |

---

## 10. 测试

### 10.1 单元测试（Node `--test`，新增 `scripts/plan.test.js`）

- `computeQuota(streak)` → `{1:30, 2:30, ..., 6:30, 7:60, ..., 13:60, 14:90, ...}`
- `computeLearnQueue(cards, progress, quota)` → 下 N 个未学过 by id 升序
- `computeMorningPool(cohorts, progress, today)` → 昨日 cohort ∩ 不熟
- `computeEveningPool(cohorts, progress, today)` → (今日 ∪ 昨日) cohort ∩ 不熟
- `computeWeeklyDue(progress, now)` → 所有 掌握 且 `now - max(masteredAt, lastWeeklyReviewAt) ≥ 7 天`
- 状态机转移：`markQuiz` 各分支
- `pickDistractors(correct, pool)` 返回 3 个不重复非正确答案
- Cohort 过期清理

### 10.2 手动清单（`docs/testing-checklist.md` 增补）

- [ ] 新用户 Day 1：开 N1 → 今日面板：早复习禁用、学新 30、晚复习等待、周复习无
- [ ] Day 1 完成学新 30 → tick 打卡 + 晚复习解锁 + cohort 写入
- [ ] Day 2 回来：早复习= Day 1 不熟、学新= 下一批 30、晚复习= 今+昨 不熟
- [ ] quiz 连对 2 题：状态升 掌握，顶栏"已掌握"数+1
- [ ] quiz 答错 掌握 词：降 不熟，顶栏数调整
- [ ] 跳 1 天回来：无早复习，昨日 cohort 已过期
- [ ] streak 到 7 天：配额升 60；到 14：升 90
- [ ] streak 断：配额掉回 30
- [ ] 自由刷卡滑动仍能改状态但不生成 cohort、不触 tick
- [ ] 首页"今日进度条"点击跳转正确
- [ ] localStorage 禁用：今日面板显示警告但仍可在内存运行一天
- [ ] 所有等级独立：N1 完成学新不会影响 N5 配额

---

## 11. 里程碑

1. `Plan` 模块 + pool 计算 + 单元测试
2. `Progress` 扩字段 + `markQuiz` + 兼容回填
3. `QuizMode` 视图（独立可跑，假数据驱动）
4. `TodayPanel` modal + session 分发
5. `Router.enterLearnSession` + 学新进度显示
6. `Streak.tick` 触发点迁移 + `markAndNext` 去 tick
7. Hub 今日进度条
8. 首次开启回填 `masteredAt`
9. Mac Safari + iPhone Safari 清单过一遍
10. 部署

---

## 12. 明确不做（本 spec 范围外）

- 自定义配额 / 自定义组大小
- 语音题（听读音选汉字）、反向题（中→日）
- 推送通知 / 每日提醒
- 云同步 / 多设备合并
- 更细的 SRS 曲线（3/7/14/30 天等）——仅用"3 次短期 + 7 天周"两档
- 答错立即重出 / 本轮末尾重出
- 成就系统 / 徽章
