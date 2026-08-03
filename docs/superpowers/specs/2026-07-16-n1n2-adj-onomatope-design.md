# N1/N2 形容词 + 拟声词扩容 — 设计文档

**日期**：2026-07-16
**状态**：草案
**前置**：`2026-04-18-n1card-design.md`（`DataStore`/`Progress`/`Router`/`TopBar`/`QuizMode` 现有实现）、`2026-07-11-batch-learn-timegate-design.md`（明确排除了"词库扩展"，本 spec 就是那个"下一轮"）
**范围**：N1、N2 两个级别，新增"形容词"、"拟声词"两种词性的词库 + 学习入口
**明确排除**：
- 学新/复习的时间强制去除（用户明确要求另开一轮，不在本 spec）
- 形容词/拟声词的分批学新、时间窗、强制测验、早复习、一般复习（用户明确要求先做简单版）
- N3/N4/N5 的形容词/拟声词（先做 N1/N2，够用了再说）
- 复用/合并现有 `onomatope/` 模块的富媒体内容（那是独立模块，带动漫截图/音频，本次是全新生成的简单卡片，两者不合并）

---

## 1. 目标 & 动机

现在 N1/N2 的词库只有动词。用户想先把"背什么"这件事扩展到形容词、拟声词，但不想把现在已经很复杂的"分批学新+时间窗+强制测验+早复习+一般复习"那一整套体系也复制一份——先要一个简单能用的版本：自由刷卡（滑卡定难易）+ 四选一测验，学习进度和动词完全独立。

**非目标**（YAGNI，本 spec 范围外，见上方"明确排除"）。

---

## 2. 数据

### 2.1 新增数据文件

```
data/cards-n1-adj.json         N1 形容词，60~80 词
data/cards-n1-onomatope.json   N1 拟声词，60~80 词
data/cards-n2-adj.json         N2 形容词，60~80 词
data/cards-n2-onomatope.json   N2 拟声词，60~80 词
```

**Schema 和现有 `data/cards.json` 完全一致**（复用 `scripts/validate-cards.js` 现有校验规则，不改校验器）：

```json
{
  "version": 1,
  "cards": [
    {
      "id": 1,
      "word": "...",
      "kana": "...",
      "accent": "0" | null,
      "type": "い形容詞" | "な形容詞" | null,
      "meanings": ["...", "..."],
      "mnemonic": "...",
      "examples": [{ "jp": "...", "cn": "..." }, { "jp": "...", "cn": "..." }]
    }
  ]
}
```

- `type` 字段：形容词用 `"い形容詞"`/`"な形容詞"`；拟声词留空/不写（校验器里这个字段本来就是可选的，不影响通过校验）
- `transitivity`（自动词/他动词）：形容词/拟声词都不适用，不写这个字段
- **拟声词的 `word` 应该等于 `kana`**（拟声词本来就基本是纯假名书写，比如「あたふた」）——这不是新规则，是复用现有代码里已经有的一个约定：`app.js` 的 `QuizMode._renderCurrent()` 里 `const meaningMode = card.word === card.kana;` 已经在用"word 和 kana 相等"判断"这是个纯假名词，测验应该考语义而不是读音"，拟声词天然符合这个约定，不需要改任何代码

### 2.2 内容生成

**没有现成词表**，按标准 JLPT N1/N2 大纲汇总常见形容词、拟声词。**这类词汇准确性需要人工抽查校对，AI 生成不能完全保证零遗漏/零错误**——生成后过一遍 `npm run validate` 只能保证格式对，不保证内容对，人工抽查是必要的一步（不是本 spec 能自动化解决的）。

**沿用 `data/prompts/generate-batch.md` 现有的助记法风格**（phrasal narrative：拆音节 + 组成迷你日语短语 + 中文记忆钩子），针对形容词/拟声词的特点做两处调整（新建 `data/prompts/generate-batch-adj.md`、`data/prompts/generate-batch-onomatope.md`，不改现有的 verb 版本）：

- **形容词**：`type` 字段改成让 AI 判断填 `い形容詞`/`な形容詞`；助记法逻辑不变，直接复用
- **拟声词**：`word`/`kana` 必须相等（纯假名）；很多拟声词是 AABB 型重复音（比如「そわそわ」），助记法可以直接用"重复的动作/声音意象"而不必强行拆音节凑短语——这条作为生成指导写进新 prompt，不追求每个词都硬凑三条件

---

## 3. 导航：级别页词性选择

**改动**：`index.html` 里 N1/N2 两个入口的 `href` 从直接指向 `n1.html`/`n2.html`，改成指向一个新的词性选择页：

```html
<a class="level-btn lv-n1" href="word-type-picker.html?level=n1">
```

（N3/N4/N5 三个入口不动，还是直接 `href="n3.html"` 等，因为这三个级别本次没有新词性）

**新页面 `word-type-picker.html`**：一个通用的、靠 `?level=` 参数驱动的选择页（N1/N2 共用同一份文件，不用各建一份），三个选项：

```
🈁 动词  → 现有 {level}.html（不动，完整学习体系）
🎨 形容词 → 新增 {level}-adj.html（自由刷卡 + 测验）
🔊 拟声词 → 新增 {level}-onomatope.html（自由刷卡 + 测验）
```

视觉复用 `index.html` 现有的 `.level-btn`/`.section-divider` inline 样式（不新建 CSS 文件，直接照抄同一套 class）。

---

## 4. 新页面：形容词 / 拟声词学习

**新增 4 个 HTML 文件**，结构和 `n1.html`/`n2.html` 完全一样（复用同一个 `app.js`），只是注入的全局变量不同：

```html
<script>
  window.LEVEL_NAME = 'N1-ADJ';               // 用于 n1-adj.html
  window.CARD_DATA_URL = 'data/cards-n1-adj.json';
  window.SIMPLE_MODE = true;
</script>
<script type="module" src="app.js?v=47"></script>
```

四个页面分别是：`n1-adj.html`（`N1-ADJ` / `cards-n1-adj.json`）、`n1-onomatope.html`（`N1-ONOMATOPE` / `cards-n1-onomatope.json`）、`n2-adj.html`（`N2-ADJ` / `cards-n2-adj.json`）、`n2-onomatope.html`（`N2-ONOMATOPE` / `cards-n2-onomatope.json`）。

**进度/打卡隔离**：`Progress.key`/`MistakeLog.key` 都是拿 `window.LEVEL_NAME` 小写化之后的 `LEVEL_KEY` 拼出来的（`app.js` 现有逻辑，不用改），`N1-ADJ` → `n1-adj`，天然和 `n1`（动词）的 key 不一样，**不需要新写任何隔离逻辑，注入不同的 `LEVEL_NAME` 就自动隔离了**。

**关于"独立打卡"**：现有的打卡/连续打卡（`Streak` 模块，`app.js:162`）是一个**全局单例**（`localStorage` key 是 `n1card:streak`，不分级别），只有从 `index.html` 首页日历走"分批学新→强制测验"那条完整流程才会触发 `markCheckIn`。这次形容词/拟声词走的是**直接访问新页面的自由刷卡**，不经过首页日历那条流程，本来就**不会触发任何打卡**——不是需要额外开发"独立打卡"，而是这个简化版本天然就没有打卡这回事（打卡机制是动词分批学习流程专属的，这次明确不做分批）。用户要的"进度独立"体现在**已掌握/待巩固的统计数字**上，这个通过 `LEVEL_KEY` 隔离已经完全满足。

**默认行为**：新页面不需要任何额外代码就是自由刷卡模式——`app.js` 的 `DOMContentLoaded` 现有逻辑本来就是"没有 `?session=` 参数就走 `Router.showCurrent()` 自由刷卡"，只有从首页日历点"开始学习"才会带上 `?session=learn` 进分批模式。新页面从词性选择页直接链接过去，天然不带这个参数，天然是自由刷卡。

---

## 5. 测验入口

**改动**：`app.js` 的 `TopBar.render()` 里，当 `window.SIMPLE_MODE === true` 且不在洗脑模式播放中时，多渲染一个"🎯 测验"按钮（放在现有 `⚙`/`🧠洗脑` 按钮旁边），点击调用现有的 `QuizMode.start()`：

```js
QuizMode.start({
  queue: Router.visibleCards,   // 尊重当前筛选（全部/只看待巩固/只看未学过/随机）
  pool: DataStore.allCards(),   // 干扰项从全量词库抽
  title: '测验',
  onComplete: () => Router.showCurrent()   // 测验做完/中途退出都要回到自由刷卡视图，不能只重绘 TopBar
});
```

`QuizMode`/`CardView`/`Router` 内部逻辑完全不用改——测验的对错判定、连对升级、干扰项抽取都是现成的，形容词走"猜读音"模式（`word !== kana`），拟声词走"猜语义"模式（`word === kana`），两种模式在 `_renderCurrent()` 里已经自动分支，不用新代码。

⚠️ **实现踩坑记录**：第一版这里的 `onComplete` 只调了 `TopBar.render()`，没有调用 `Router.showCurrent()` 真正渲染出卡片——测验完/中途退出后 `#cardstage` 会一直空白。之前所有 `QuizMode` 调用方（学新批次强制测验、早复习、一般复习等）做完测验都是 `location.href` 跳转离开页面，从没暴露过这个问题；这次的"🎯 测验"是第一个测验完要求"留在原页面"的调用方，直接踩中。同时补了 `!BrainwashMode.active` 的判断——洗脑模式播放中这个按钮之前还留着可以点，会和洗脑模式的自动播放循环抢 DOM/抢语音。

**其他 TopBar 按钮**（📖 文法快捷、⚙ 设置、🧠 洗脑）在新页面上照常显示，不做精简——不是本次需要解决的问题，YAGNI。

---

## 6. 明确不做（本 spec 范围外）

见 §1 顶部"明确排除"列表：时间强制去除、形容词/拟声词的分批学新体系、N3/N4/N5 扩容、合并 `onomatope/` 模块内容。

---

## 7. 测试

### 7.1 单元测试

- `npm run validate` 需要能跑通全部 5 个数据文件（原有 `data/cards.json` + 新增 4 个），可能需要 `scripts/validate-cards.js` 支持传入多个文件路径，或者手动分别跑 5 次——具体做法留给实现计划决定
- 无新增纯函数——本次改动是数据 + 页面路由 + 一个 TopBar 按钮，没有需要单元测试的业务逻辑分支

### 7.2 手动清单

- [ ] 首页点 N1 → 进入词性选择页，能看到"动词/形容词/拟声词"三个选项
- [ ] 点"动词" → 进入现有 `n1.html`，行为和改动前完全一致（分批学新、时间窗等都还在）
- [ ] 点"形容词" → 进入 `n1-adj.html`，直接是自由刷卡模式（没有分批/时间窗提示）
- [ ] 在形容词页面滑卡定难易 → 顶栏"已掌握/待巩固"计数正常变化，且和同时打开的 `n1.html`（动词）互不影响
- [ ] 点顶栏"🎯 测验" → 进入四选一测验，形容词是"看词选读音"题型
- [ ] 拟声词页面同样测一遍：自由刷卡 + 测验（应该是"看假名选语义"题型，因为 word=kana）
- [ ] N2 的形容词/拟声词页面同样走一遍
- [ ] `npm run validate` 对 4 个新数据文件全部跑通，无格式错误
- [ ] 人工抽查一部分生成的词条（读音、词性、释义、例句）确认没有明显错误
- [ ] N3/N4/N5 首页入口行为不变（还是直接进各自的 `n{X}.html`，没有词性选择页）
