# 全局单词本（收藏）+ 卡片学习次数显示 — 设计文档

**日期**：2026-10-22
**状态**：草案
**前置**：
- `2026-08-24-unified-review-redesign-design.md`（引入了`Progress2`/`compositeId`那整套，本次要在这套之上做）
- `2026-07-13-favorite-cards-design.md`（旧的单等级收藏spec，从未实现完，范围和数据结构都跟本次不兼容，视为废弃，不复用）
**范围**：n1-n5 词汇卡片（`app.js`覆盖的所有页面：传统单文件页如`n1.html`/`n1-noun.html`等，以及统一会话模式`today.html`）
**明确排除**：回忆模式(`recall.js`)、文法模块(`grammar/`)、独立的オノマトペ app(`onomatope/`)——见§6

---

## 1. 目标 & 动机

两个绑在一起但本质独立的需求：

1. 卡片右上角圆圈目前显示的是卡号（之前刚修过的`origId`），用户想换成显示"这张卡出现过学习的次数"——更有信息量，卡号本身没什么用。
2. 加一个收藏功能，收藏的词进一个全局"单词本"，可以跨等级/词性查看，并显示收藏日期。

## 2. 数据结构

### 2.1 学习次数（seenCount）

定义：**每次划卡判定（左划/右划）算一次**，不包括测验答题（测验有自己独立的`quizSeenCount`，两者不互相影响）。

直接在现有两套进度系统的卡片条目里加`seenCount`字段：

**Legacy `Progress.mark(id, status)`**（app.js，给传统单文件页用）：
```js
mark(id, status) {
  if (window.UNIFIED_MODE) { Progress2.mark(id, status === 'known'); return; }
  const now = Date.now();
  const entry = this._progress[id] || {};
  entry.seenCount = (entry.seenCount || 0) + 1;   // 新增
  entry.status = status;
  // ...原有逻辑不变
}
```

**`Progress2.mark(compositeId, correct)`**（app.js，给`UNIFIED_MODE`用）：
`applySwipeResult`（plan.js里的纯函数）每次返回的是全新对象，不会带上旧entry里没列出的字段，所以`seenCount`要在调用它之前取出来、调用之后加回去，不能指望`applySwipeResult`自己保留：
```js
mark(compositeId, correct) {
  this.load();
  const now = Date.now();
  const prevCount = this._data[compositeId]?.seenCount || 0;
  const updated = applySwipeResult(this._data[compositeId], correct, now);
  updated.seenCount = prevCount + 1;   // 新增，plan.js的applySwipeResult本身不改
  this._data[compositeId] = updated;
  this._save();
}
```
`plan.js`的`applySwipeResult`本身不用改，也不用动它现有的单元测试——这个字段是在app.js这一层包装进去的。

**历史数据**：已有的学习记录没有这个字段，旧条目读到的`seenCount`就是`undefined`，显示侧按`|| 0`处理成"0"，不做迁移/回填。

### 2.2 收藏（Favorites）——全局、跨等级

收藏是**全局**概念（用户确认：不分等级词性，统一一个本子），不适合塞进按等级分区的`Progress`/`Progress2`。新开一个独立的全局localStorage key：

```
localStorage['n1card:favorites'] = {
  "n1:verb:5": { addedAt: 1761100000000 },
  "n2:noun:12": { addedAt: 1761100500000 },
  ...
}
```

键是`compositeId`（`{level}:{category}:{origId}`）——这也是为什么之前要先把`compositeId`补到所有页面的卡片对象上（传统页面靠`DataStore.load()`那次patch，统一模式靠`mergeLevelPool`）：没有这个前置修复，收藏在传统页面是做不了的。

## 3. 代码组织

新建`favorites.js`（纯逻辑ES module，不碰DOM，跟`plan.js`一个性质）：

```js
export function toggleFavorite(favMap, compositeId, now) { ... }   // 纯函数，方便单测
export function isFavorited(favMap, compositeId) { ... }

export const Favorites = {
  key: 'n1card:favorites',
  _map: null,
  load() { ... },      // 读localStorage，缺省{}
  _save() { ... },
  toggle(compositeId) { ... },   // load → toggleFavorite纯函数 → save，返回新状态
  remove(compositeId) { ... },   // 单词本"移除"按钮用，内部就是delete + save
  isFavorited(compositeId) { ... },
  all() { ... }         // 返回 { compositeId: {addedAt} } 整个map，单词本用来枚举
};
```

`app.js`（卡片心形按钮）和新的`notebook.js`（单词本页面）都从这里导入`Favorites`，不会出现两份收藏逻辑。

同时把`hub.js`里"拉取全部26个词汇文件建索引"的部分（`CATEGORY_LABELS`/`CATEGORY_TAG_COLOR`/`categoryPageUrl`/`WordSearch`对象）搬到新文件`wordIndex.js`——纯逻辑，不含DOM操作。索引里每条记录加一个`compositeId`字段（跟现有的`id`/`level`/`category`拼出来，跟§2.2的key格式一致）：

```js
{ level, category, id, compositeId, word, kana, meaning, pageUrl }
```

`hub.js`改成`import { WordSearch, CATEGORY_LABELS, CATEGORY_TAG_COLOR } from './wordIndex.js'`，自己只留DOM绑定部分（`initWordSearch()`），行为不变。`notebook.js`同样导入这几个，用`WordSearch.ensureIndex()`拿到完整索引后，自己建一个`Map(compositeId → 词条详情)`去对应收藏列表。

这样"全局搜索"和"全局单词本"复用同一套"拉取26个文件、建索引"的逻辑，不用写两遍，以后这26个文件的加载方式变了也只用改一处。

## 4. 卡片UI改动（app.js）

### 4.1 右上角徽标：卡号 → 学习次数

```js
function getSeenCount(card) {
  return window.UNIFIED_MODE
    ? (Progress2.getEntry(card.compositeId)?.seenCount || 0)
    : (Progress.getEntry(card.id)?.seenCount || 0);
}
```
`CardView.renderFront`/`renderBack`里原来的
```js
<div class="card-id">${card.origId ?? card.id}</div>
```
改成
```js
<div class="card-id">${getSeenCount(card)}</div>
```
没被划过的卡显示"0"。`.card-id`的字号从18px调小（比如13px），位置/圆圈形状不变。

### 4.2 卡片正面新增收藏心形

位置：卡片下方居中，悬浮在`.hint-bottom`提示文字正上方。未收藏显示♡（低透明度），已收藏显示♥（红色实心）。

```js
renderFront(card, color) {
  const isFav = Favorites.isFavorited(card.compositeId);
  // ... 在front-center和hint-bottom之间插入：
  // <button class="fav-heart${isFav ? ' active' : ''}" aria-label="收藏">${isFav ? '♥' : '♡'}</button>
}
```

点击只切换收藏状态（`Favorites.toggle(card.compositeId)` + 直接改这个按钮的class/文字，不用整卡重渲染），**不触发**发音/翻面——`Gestures.attach`里`pointerdown`/`pointerup`两处都要加上`e.target.closest('.fav-heart')`直接return（跟现有`.sentence-row`排除逻辑的写法一致）。

点击热区用padding撑到44×44px以上，图标本身可以视觉上偏小。

## 5. 单词本页面（notebook.html + notebook.js）

**入口**：首页（`index.html`）新增一个入口按钮，样式和"文法"/"回忆模式"那几个入口一致。

**页面行为**：
1. 页面加载时`await WordSearch.ensureIndex()`拿到全部词条索引（这个页面的核心内容就是列表，不需要像首页搜索框那样"懒加载、等用户交互才拉"——直接加载）
2. `Favorites.all()`拿到收藏的`{compositeId: {addedAt}}`
3. 用索引建一个`compositeId → 词条详情`的Map，把收藏列表里每个compositeId查到对应的word/kana/meaning/level/category/pageUrl
4. **排序**：按`addedAt`倒序（最近收藏的在最上面）
5. 每一行渲染：等级+词性标签（复用`CATEGORY_LABELS`/`CATEGORY_TAG_COLOR`）、单词、假名、释义预览、收藏日期（格式`YYYY-MM-DD`）、一个"移除"按钮
6. 点击行（非移除按钮区域）→ 跳转`${pageUrl}?session=general-review&ids=${id}&mode=swipe`，跟首页搜索结果用的是同一套跳转方式
7. 点击"移除" → `Favorites.remove(compositeId)`，从当前渲染的列表里去掉这一行（不用重新拉取索引）
8. 空状态：收藏列表为空时显示"还没有收藏的词"

## 6. 明确不做

- **回忆模式（recall.js）**：不记录任何划卡进度（"纯巩固不影响进度"），没有自然的`seenCount`挂载点，也不加心形收藏按钮——这个模式的卡片UI本身就没有`.card-id`圆圈和`.hint-bottom`这套结构
- **文法页（grammar/）、独立オノマトペ app（onomatope/）**：各自是独立代码库/独立数据结构，不接入本次的`Favorites`/`seenCount`
- 不回填历史已学词的`seenCount`（§2.1已说明）
- 收藏数量上限、收藏分组/标签、收藏跨设备同步、收藏导出
- 单词本页面不支持按等级/词性筛选（先出一个最简单的时间倒序列表，以后想要再加）

## 7. 测试

### 7.1 自动化

- `favorites.js`里的纯函数（`toggleFavorite`/`isFavorited`，不碰localStorage的部分）写单元测试，覆盖：首次收藏→true，再收藏→false(取消)，不影响map里其他key
- `wordIndex.js`抽出来之后，现有搜索功能的手动验证（见下）要重跑一遍确认行为没变
- `Progress2.mark`新加的`seenCount`累加逻辑：仿照`scripts/progress.test.js`现有的"复制核心逻辑单独测"风格，写一个独立的测试用例验证"连续mark三次→seenCount=3"，且不影响`applySwipeResult`本身返回的其他字段

### 7.2 手动清单

- [ ] `n1.html`等传统页面刷卡，右上角数字从0开始，每划一次+1（左划右划都算）
- [ ] `today.html`统一会话模式刷卡，同样验证`seenCount`正确累加
- [ ] 测验模式（QuizMode）答题不影响`seenCount`（只影响`quizSeenCount`）
- [ ] 卡片正面点心形图标 → 立即变♥红色，不触发发音、不触发翻面；再点一次变回♡
- [ ] 在n1动词页收藏一个词，去n3名词页收藏另一个词，打开单词本 → 两个词都在，等级/词性标签正确
- [ ] 单词本按收藏时间倒序排列
- [ ] 单词本点一行的"移除" → 立即从列表消失，重新进单词本确认真的删除了（localStorage持久化）
- [ ] 单词本点一行（非移除区域）→ 跳转到对应页面并定位到那张卡
- [ ] 一个收藏都没有时打开单词本 → 显示空状态文案，不报错
- [ ] 首页搜索功能（`hub.js`的`WordSearch`，这次被挪了位置）行为跟挪之前完全一致
- [ ] 回忆模式、文法页、オノマトペ app 页面正常，没有因为本次改动报错或多出奇怪的UI
