# 单词收藏功能 — 设计文档

**日期**：2026-07-13
**状态**：草案
**前置**：`2026-04-18-n1card-design.md`（卡片视图 `CardView`/`Gestures`/`TopBar` 现有实现）
**范围**：n1/n2/n3/n4/n5 词卡（"动词板块"），不涉及 onomatope、grammar 模块
**明确排除**：跨级别统一收藏本、收藏卡片的独立浏览模式（见 §5）

---

## 1. 目标 & 动机

用户刷卡时想把个别词标记出来方便回头集中看，现在没有任何标记机制，只能靠"已掌握/待巩固"这个学习状态，但学习状态是滑卡定难易用的，语义上不适合拿来做"我觉得这词有意思/该重点盯"这种主观标记。

新增一个独立于学习进度的收藏（❤️）标记，加上一个复用现有筛选栏的收藏本入口。

**非目标**（YAGNI，本 spec 范围外）：
- 跨级别（n1~n5）统一的收藏列表页——每个级别页面是独立 app 实例、独立 localStorage 命名空间，本次不做跨级别聚合
- 独立的收藏浏览/复习模式（类似洗脑模式）——收藏本入口只是筛选器的快捷方式，浏览方式和普通刷卡完全一致
- 卡片背面显示收藏状态/收藏按钮——用户明确要求只在正面
- 收藏数量上限、收藏分组/标签

---

## 2. 数据存储

复用现有 `Progress._progress[id]` 结构，新增 `favorite` 字段：

```js
{
  status: 'known' | 'unknown',
  lastSeen, masteredAt, firstLearnedAt, correctStreak, quizSeenCount, lastWeeklyReviewAt,
  favorite: true | false   // 新增，默认 undefined（视为 false）
}
```

- 存在同一个 `n1card:progress:${LEVEL_KEY}` key 下，`Progress._save()` 逻辑不变
- 每个级别独立收藏（n1 的收藏和 n2 的收藏互不影响），符合现有数据分区方式
- `Progress` 新增方法：
  - `toggleFavorite(id)`：翻转 `favorite`，`entry` 不存在则新建（只设 `favorite`，不动 `status`）
  - `isFavorite(id)`：`return !!this._progress[id]?.favorite`
  - `stats()` 不需要改动（收藏不算学习进度指标）

---

## 3. 卡片正面爱心图标

**位置**：卡片下方居中，悬浮在 `.hint-bottom` 提示文字（"单击发音 · 双击翻面 · ←难 →易"）正上方，与提示文字水平居中对齐。

**样式**：
- 未收藏：♡ 空心，低透明度（和 hint-bottom 视觉权重接近，不喧宾夺主）
- 已收藏：♥ 实心，红色高亮
- 点击态：轻微 scale 反馈（复用现有 `.pulse` 动画风格）
- 点击热区 ≥ 44×44px（图标本身可以小，但可点区域要大，方便单手拇指精准点中）——通过 padding 撑大热区，不改变视觉大小

**交互**：
- 单击图标：`Progress.toggleFavorite(card.id)` + 立即更新图标视觉状态（不需要整卡重渲染）
- **必须**从 `Gestures.attach` 的手势判定里排除，处理方式和现有 `.sentence-row` 一致（`pointerdown`/`pointerup` 里 `e.target.closest('.fav-heart')` 直接 return），否则点爱心会同时触发单击发音，且落在双击判定窗口内还可能误触发翻面
- 收藏状态跟随卡片切换：`CardView.renderFront` 渲染时直接读 `Progress.isFavorite(card.id)` 决定初始图标状态

**不做**：拖动/长按等额外手势；背面不显示图标（用户明确要求只在正面）。

---

## 4. TopBar 入口

**改动**：`app.js` `TopBar.render()` 里原来的

```html
<a class="settings-btn" href="/grammar/" title="切换到文法">📖</a>
```

替换为：

```html
<button class="settings-btn" id="favorites-btn" title="收藏本">🔖</button>
```

**行为**：点击 = `Router.applyFilter('favorite_only')`（同时更新 `filter-select` 的显示值），复用现有筛选跳转逻辑，不新开页面/不新增路由状态。

**筛选下拉同步新增选项**：

```html
<option value="favorite_only">只看收藏</option>
```

插入位置：跟在"只看待巩固""只看未学过"后面、"随机乱序"前面。

**筛选逻辑**（`Router.applyFilter` 现有实现里按 `Progress.getFilter()` 过滤 `visibleCards` 的地方）新增一支：

```js
case 'favorite_only':
  pool = DataStore.allCards().filter(c => Progress.isFavorite(c.id));
  break;
```

若收藏为空，走现有"筛选结果为空"的兜底提示（和"只看待巩固"结果为空时行为一致，不新做提示文案）。

**副作用确认**：原 📖 图标移除后，背单词界面不再有跳转文法页的快捷入口，首页仍保留完整的"📖 文法"大按钮入口，用户已确认可接受。

---

## 5. 明确不做（本 spec 范围外）

- 跨级别统一收藏本（需要跨 localStorage 命名空间聚合，属于更大的架构改动，下一轮单独 brainstorm）
- 独立收藏浏览/复习模式——收藏本只是筛选器快捷方式，退出方式、进度条、topbar 文案都和普通刷卡一致，不做特殊处理
- 收藏数量统计展示（比如"已收藏 12 词"）
- 收藏卡片导出/分享

---

## 6. 测试

### 6.1 单元测试（扩 `scripts/progress.test.js`）

- `toggleFavorite`：初次调用 → `true`；再次调用 → `false`
- `isFavorite`：未设置过的卡片 → `false`；设置后 → 与最近一次 `toggleFavorite` 结果一致
- `toggleFavorite` 不影响同一 entry 的 `status`/`masteredAt` 等已有字段

### 6.2 手动清单

- [ ] 卡片正面点爱心图标 → 立即变实心红色，不触发发音、不触发翻面
- [ ] 再点一次 → 变回空心，状态正确切回
- [ ] 双击卡片翻面（不点在爱心上）→ 正常翻面，不受爱心图标影响
- [ ] 单击卡片空白区域 → 正常发音，不受爱心图标影响
- [ ] 收藏后刷新页面 / 切到下一张再切回来 → 收藏状态保留（localStorage 持久化）
- [ ] TopBar 点 🔖 → 筛选自动切到"只看收藏"，卡片池只剩已收藏的词
- [ ] 下拉菜单手动选"只看收藏" → 效果和点 🔖 一致
- [ ] 一张收藏都没有时点 🔖 → 走现有"筛选结果为空"的提示，不报错
- [ ] n1 收藏和 n2 收藏互不影响（分别收藏几个词，切换级别页确认独立）
- [ ] 首页"📖 文法"大按钮仍可正常跳转文法页
