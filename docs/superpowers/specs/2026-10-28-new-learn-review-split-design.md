# 新学/复习拆分重设计

## 目标

当前"今日滑卡"把新词和到期复习词混在一起随机打散成一个队列，一次性划完才算当天打卡。这次重设计把它拆成两个独立、规则不同的环节：

1. **新学**：固定一批60个新词，顺序随机但内容固定，必须全部右滑（掌握）才算完成这一批，没完成的话明天继续这一批剩下的；完成一批后要等到第二天才解锁下一批。
2. **复习**：基于SRS间隔重复算法的到期词，数量不设上限，完全由算法和生词量决定；划卡行为跟现有逻辑完全一致，不改。

两者在首页"今日"视图里各自是独立入口，各自显示完成状态；当天打卡 = 两者都完成。

## 现状（供实现时对照）

- `plan.js` 的 `computeBatchesAllowed`/`computeQuota`：按累计打卡天数算"批数"（每满10天+1批，封顶3批），用来把新词配额从30涨到60/90。**这次要去掉新学批次对它的依赖，但这两个函数本身不能删**——`app.js` 的洗脑模式（`BrainwashMode.enter()`，约672行）也在用 `computeQuota` 给回顾池设上限，跟这次重设计无关，必须保留。
- `app.js` 的 `session=today` 分支：目前用 `localStorage['n1card:todaybatch:{level}']`（按日期存：`{date, category, newIds}`）把当天选中的新词批次固定化——但只固定"当天"，第二天会重新算一批（不是"没做完就还是这批"）。到期复习词（`dueCards`）每次进入都是实时重新计算的，没有固定化。最终 `Router.enterTodaySession(newCards, dueCards)` 把两者合并随机打散成一个队列，`_finishBatch()` 在统一会话模式下滑完整个队列直接算"今日打卡完成"（跳回首页并带 `today_completed=1`，由 `hub.js` 捕获后调用 `Streak.markCheckIn`）。
- `hub.js` 的 `_todaySummary()`：给首页"今日"卡片算预览用的 `newCount`/`dueCount`，逻辑是 `computeBatchesAllowed * 60` 算新词配额上限、`computeDueIds` 不分词性算整个等级的到期数（注意：跟实际session里`scope=current`按词性过滤的到期数口径不一致，这次要统一）。
- SRS间隔阶梯（`plan.js` 的 `INTERVAL_LADDER_DAYS`/`applySwipeResult`/`computeDueIds`）：右滑进阶（1→3→7→14→30→90天），左滑打回第1天档。**这次完全不改**，复习环节继续用它。

## 数据模型

### 新学批次（替换`n1card:todaybatch:{level}`）

新key：`n1card:newbatch:{level}`，**不再按日期存**（旧的实现是"当天固定"，新的是"直到掌握完才换，不限定哪天"）：

```json
{
  "category": "verb",
  "newIds": ["n1:verb:42", "n1:verb:43", "...（60个compositeId）"],
  "assignedDate": "2026-10-28"
}
```

- `category`/`newIds`：选取算法跟现状一致——`pickRecommendedCategory(pool, progress2)` 选第一个还有生词的词性（按 动词→名词→复合动词→形容词→副词→拟声词 顺序），`computeNewWordQueue(pool, progress2, 60, category)` 按原始id顺序取60个未学词。**配额固定60，不再乘 `computeBatchesAllowed`**。某个词性剩余不足60个时，批次就只有剩下的那几个（不会跨词性凑够60），这跟 `computeNewWordQueue` 现有的实现行为一致，不用额外处理。
- `assignedDate`：记录这批是哪天分配的，只用于"一天一批"的节奏控制（见下），不影响批次内容本身。

批次的生命周期（伪逻辑，不是最终代码）：

```
remaining = newbatch.newIds.filter(id => !progress2[id])

if remaining.length === 0:
  // 这一批已经全部掌握
  if newbatch.assignedDate === today:
    // 今天刚完成，不立刻解锁下一批——等明天
    显示"今天的新学已完成"
  else:
    // 不是今天完成的（可能是前几天就做完、今天还没分配新批次），分配新的一批
    newbatch = 选新批次(category=pickRecommendedCategory(...), newIds=下60个未学词, assignedDate=today)
    若新批次 newIds.length === 0 → 整个等级/词性序列都学完了，显示"全部学完"
else:
  显示"继续上次剩下的 N 个"（不管assignedDate是不是今天，都是继续同一批，直到remaining清零）
```

换句话说："一天一批"只体现在"今天刚清空的批次，当天不会立刻生出下一批"这一点上；没做完的批次可以跨很多天持续出现，直到清零为止。

### 复习：不需要新的持久化状态

每次进入复习环节，实时计算：

```
dueIds = computeDueIds(progress2, Date.now())
dueCards = pool.filter(c => c.category === 当前新学批次的category && dueIds.has(c.compositeId))
```

范围固定为"当前等级 + 当前主攻词性"（跟新学批次用同一个 `category`，不是整个等级），这样首页预览数字和实际进去看到的数字口径一致（修正现状里 `hub.js`/`app.js` 两边口径不一样的问题）。

## 新学流程

- 进入新学，展示 `remaining`（批次里还没掌握的部分）随机打乱后的顺序。
- 右滑（掌握）：`Progress2.mark(compositeId, true)`，SRS从第1天档起步（明天到期，自然会出现在"复习"里），这张卡退出当前会话。
- 左滑（不熟）：**不写入 `progress2`**，这张卡在本次会话的内存队列里重新排到队尾，之后还会再出现，直到被右滑——这跟现状里"统一会话模式下新词左滑不算数"的行为完全一致，不用改 `app.js` 里那段已有逻辑（`Router.markAndNext` 里 `card._kind === 'new' && status === 'unknown'` 那个分支）。
- 会话内把60个全部右滑完 → 按上面"批次生命周期"的规则处理（今天分配的批次，今天清空就不再生成新批次；非今天分配的批次清空则立刻生成新批次）。

## 复习流程

- 完全沿用现有SRS判定逻辑，不改：右滑 `applySwipeResult(entry, true, now)` 进阶；左滑 `applySwipeResult(entry, false, now)` 打回第1天档、直接退出当天这批（不像新学那样重新排队）。
- 会话一进入就把当前到期的词作为一个固定快照（跟现状 `session=today` 里 `dueCards` 的算法一样），划完快照里所有的词即为"复习完成"。划的过程中理论上不会有新词临时变成到期（`applySwipeResult` 左滑后的 `nextReviewAt` 是"现在+1天"，不会在同一场会话里重新到期），所以不需要处理"越划越多"的情况。

## 打卡定义

```
今日打卡 = 新学批次今天分配的部分已完成（remaining === 0） 且 今天到期的复习词已划完（当前到期数 === 0）
```

如果今天没有分配到新批次（比如上一批是前几天完成的，今天还没解锁新批次），新学部分按"无事可做"直接算完成，不阻塞打卡；同理复习如果今天没有到期词，也直接算完成。

## 首页UI

`hub.js` 的 `DayView._renderTodayCard`（当前渲染单个"今日滑卡"卡片+"开始"按钮）拆成两张独立卡片：

- **「今日新学」**：显示"剩余 N / 60"（或"今日已完成"/"全部学完"），有自己的"开始"按钮，进入新学环节
- **「今日复习」**：显示"到期 N 个"（或"今日已完成"/"暂无到期"），有自己的"开始"按钮，进入复习环节

两张卡片各自独立完成状态，用户可以任意顺序、分开进行，不强制先做哪个。

## 不受影响的部分

- SRS间隔阶梯算法（`INTERVAL_LADDER_DAYS`/`computeNextReviewAt`/`advanceIntervalStage`）完全不变。
- `computeBatchesAllowed`/`computeQuota` 函数本身保留，继续给洗脑模式（`BrainwashMode.enter()`）用；只是新学批次的配额计算不再调用它们，改成固定60。
- 传统单文件页面（n1.html等）的 `Progress`/`learnMode`/`QuizMode`（"通关测验"）体系不受影响——这次重设计只涉及统一会话模式（`today.html`/`UNIFIED_MODE`）。
- 回忆模式（recall.html）、单词本（收藏）、一般复习（`session=general-review`）、早复习/周复习（`session=review`，如果还在使用的话）都不涉及这次改动。

## 迁移考虑

- 已存在的 `n1card:todaybatch:{level}`（旧的、按日期存的格式）在新逻辑第一次读取时需要识别并迁移：如果里面的 `newIds` 还有没进 `progress2` 的（即用户今天开始了一批但没做完），应该把它转换成新的 `n1card:newbatch:{level}` 格式延续下去，而不是直接丢弃重新算一批——否则用户今天刚开始的进度会凭空消失。旧key可以在迁移后清掉。
- 已有的 `n1card:progress2:{level}` 数据不需要改动，`applySwipeResult`/SRS字段结构不变。

## 测试考虑

- 新学批次的"批次生命周期"规则（完成后是否解锁下一批、`assignedDate` 判断）需要新增纯函数单元测试，参照 `plan.js` 现有的测试风格（`scripts/plan.test.js`）。
- 旧 `todaybatch` → 新 `newbatch` 的迁移逻辑需要单元测试覆盖"有未完成进度"和"没有进度"两种情况。
- 打卡定义（新学完成 且 复习完成）需要覆盖"两者都没到期/生成"时直接算完成的边界情况。
