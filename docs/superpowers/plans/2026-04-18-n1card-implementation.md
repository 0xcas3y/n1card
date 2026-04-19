# N1 动词洗脑速记卡片 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 建一个纯静态 Web 应用，支持 393 个 N1 动词的卡片学习、手势交互、TTS 发音和"洗脑模式"，部署到 GitHub Pages。

**Architecture:** 单页 HTML + CSS + 原生 JS，无框架无构建。`app.js` 内按职责分若干模块字面量（DataStore / Progress / TTSEngine / CardView / BrainwashMode / Router）。数据放 `data/cards.json`，进度放 localStorage。Spec：`docs/superpowers/specs/2026-04-18-n1card-design.md`。

**Tech Stack:** HTML / CSS / ES2022 模块化 JS（无 import，对象字面量分模块）/ Web Speech API / WebAudio API / localStorage / Node.js（仅用于 validate-cards.js 校验脚本，内置 `node:test`）/ GitHub Pages。

**Testing approach:** 纯前端部分用"每任务后浏览器手动验证"模式。唯一有单元测试的是 `scripts/validate-cards.js`（Node + node:test，TDD）。最终有 Mac Safari + iPhone Safari 手动测试清单。

**Worktree hint:** 此仓库当前还不是 git 仓库（也没有 main 分支），所有工作直接在 `/Users/caseyshi/project/n1card` 根目录进行。Task 1 会把它初始化成 git 仓库。

---

## 里程碑映射

| 里程碑（spec §12） | 对应 Tasks |
|---|---|
| 1. 生成前 30 词 cards.json + 校验脚本 | Task 2, 3, 4 |
| 2. `index.html` + `app.js` 骨架 | Task 1, 5, 6 |
| 3. 手势交互（单击/双击/上下划） | Task 7, 8, 9 |
| 4. TTS + 背面例句单击播放 | Task 10, 11, 12 |
| 5. 进度 localStorage + 筛选器 | Task 13, 14, 15 |
| 6. 洗脑模式（含闪烁、叮音、自动推进） | Task 16, 17, 18, 19, 20 |
| 7. 编辑面板 | Task 21, 22 |
| 8. 生成剩余 360+ 词 | Task 23 |
| 9. Mac + iPhone 手动测试通过 | Task 24 |
| 10. 部署 GitHub Pages | Task 25 |

---

## File Structure（最终产物）

```
n1card/
├── index.html                       # Task 1 创建；Task 5/13/16/21 扩展
├── styles.css                       # Task 1 创建；Task 5/6/17 扩展
├── app.js                           # Task 1 创建空壳；后续 Task 逐步填充
├── .gitignore                       # Task 1
├── README.md                        # Task 1
├── data/
│   ├── raw-words.txt                # 已存在（393 唯一词的原始来源）
│   ├── cards.seed.json              # Task 2：手写 3 张种子卡（承る/妨げる/賜る）
│   ├── cards.json                   # Task 4：30 词 MVP；Task 23：393 全量
│   └── prompts/
│       └── generate-batch.md        # Task 4：生成 prompt 模板
├── scripts/
│   ├── validate-cards.js            # Task 3（TDD）
│   └── validate-cards.test.js       # Task 3（node:test）
└── docs/
    ├── superpowers/
    │   ├── specs/2026-04-18-n1card-design.md   # 已存在
    │   └── plans/2026-04-18-n1card-implementation.md  # 本文件
    └── testing-checklist.md         # Task 24
```

`app.js` 内的模块边界（不分文件）：

| 模块 | 引入 Task | 职责 |
|---|---|---|
| `DataStore` | Task 5 | 加载 cards.json，合并 overrides，`getCard(id)` / `allCards()` |
| `CardView` | Task 5, 6 | 渲染正/反面，随机色池，绑定点击 |
| `Gestures` | Task 7, 8 | 单击/双击/上下划手势识别 |
| `Progress` | Task 9, 13 | localStorage 读写 progress/settings/overrides |
| `TTSEngine` | Task 10 | 封装 Web Speech API，队列、取消 |
| `Router` | Task 13, 14 | 当前卡片 index、筛选、切卡、持久化 lastCardId |
| `TopBar` | Task 14, 15 | 状态栏渲染（计数 / 统计 / 筛选下拉 / 🧠 按钮） |
| `BrainwashMode` | Task 16-20 | 洗脑序列编排 |
| `EditPanel` | Task 21, 22 | 设置 / 编辑模态 |

---

## Task 1: 项目骨架 + git 初始化

**Files:**
- Create: `/Users/caseyshi/project/n1card/index.html`
- Create: `/Users/caseyshi/project/n1card/styles.css`
- Create: `/Users/caseyshi/project/n1card/app.js`
- Create: `/Users/caseyshi/project/n1card/.gitignore`
- Create: `/Users/caseyshi/project/n1card/README.md`

- [ ] **Step 1: 写 `.gitignore`**

```
.DS_Store
.superpowers/
node_modules/
*.log
```

- [ ] **Step 2: 写 `index.html` 最小骨架（含 iOS viewport 禁缩放）**

```html
<!doctype html>
<html lang="zh">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <title>N1 动词速记</title>
  <link rel="stylesheet" href="styles.css">
</head>
<body>
  <div id="app">
    <header id="topbar"></header>
    <main id="cardstage"></main>
  </div>
  <script type="module" src="app.js"></script>
</body>
</html>
```

- [ ] **Step 3: 写 `styles.css` 基础（全局重置 + 安全的触控属性）**

```css
* { box-sizing: border-box; margin: 0; padding: 0; }
html, body { height: 100%; background: #111; color: #fff; font-family: "Hiragino Sans", "Yu Gothic", "PingFang SC", -apple-system, sans-serif; overscroll-behavior: none; }
#app { height: 100%; display: flex; flex-direction: column; }
#topbar { padding: 12px 16px; background: #1a1a1a; font-size: 14px; }
#cardstage { flex: 1; display: flex; align-items: center; justify-content: center; padding: 16px; touch-action: manipulation; }
/* 卡片上禁文字选中、长按菜单 */
.flash-card { user-select: none; -webkit-user-select: none; -webkit-touch-callout: none; touch-action: manipulation; }
```

- [ ] **Step 4: 写 `app.js` 空壳，能启动 + 能在 #cardstage 打个 "hello"**

```js
const $ = (sel) => document.querySelector(sel);

document.addEventListener('DOMContentLoaded', () => {
  $('#topbar').textContent = 'N1 动词速记 · 启动中…';
  $('#cardstage').textContent = 'hello n1card';
});
```

- [ ] **Step 5: 写 `README.md`**

```markdown
# N1 动词洗脑速记卡片

自用的 N1 级日语动词刷卡 Web 应用。

## 本地运行

```bash
python3 -m http.server 8000
# 打开 http://localhost:8000
```

## 设计 & 计划

- 设计：`docs/superpowers/specs/2026-04-18-n1card-design.md`
- 计划：`docs/superpowers/plans/2026-04-18-n1card-implementation.md`
```

- [ ] **Step 6: 浏览器验证**

运行 `python3 -m http.server 8000`，打开 http://localhost:8000，期望：
- 顶部灰条显示 "N1 动词速记 · 启动中…"
- 中间黑屏显示 "hello n1card"
- Safari 无 console 报错

- [ ] **Step 7: git init + 首次 commit**

```bash
cd /Users/caseyshi/project/n1card
git init
git add .gitignore index.html styles.css app.js README.md data/raw-words.txt docs/
git commit -m "scaffold: initial project skeleton and spec/plan docs"
```

---

## Task 2: 手写 3 张种子卡片（开发用）

在生成大批量数据前，先手工写 3 张代表性卡片。这让后续 Task 3-12 有可靠的数据可调试，不受 AI 生成质量波动影响。

**Files:**
- Create: `/Users/caseyshi/project/n1card/data/cards.seed.json`

- [ ] **Step 1: 写 `data/cards.seed.json`**

```json
{
  "version": 1,
  "cards": [
    {
      "id": 1,
      "word": "承る",
      "kana": "うけたまわる",
      "accent": "5",
      "type": "五段",
      "meanings": ["敬悉；知道", "恭听", "遵从；接受"],
      "mnemonic": "受け + 玉 + 割る ⇒ 承る",
      "examples": [
        { "jp": "ご注文を承りました。", "cn": "您的订单我收到了。" },
        { "jp": "お話を承ります。", "cn": "请讲，我恭听。" }
      ]
    },
    {
      "id": 2,
      "word": "妨げる",
      "kana": "さまたげる",
      "accent": "4",
      "type": "一段",
      "meanings": ["妨碍；阻碍"],
      "mnemonic": "女 + 方 ⇒ 妨（挡路） + 害ける",
      "examples": [
        { "jp": "騒音が睡眠を妨げる。", "cn": "噪音妨碍睡眠。" },
        { "jp": "交通の流れを妨げないでください。", "cn": "请不要妨碍交通。" }
      ]
    },
    {
      "id": 3,
      "word": "賜る",
      "kana": "たまわる",
      "accent": "3",
      "type": "五段",
      "meanings": ["蒙赐；承蒙赠与", "赐予（尊者给下者）"],
      "mnemonic": "貝 + 易 ⇒ 賜（宝物赠与） + 玉わる",
      "examples": [
        { "jp": "社長から賞を賜った。", "cn": "承蒙社长赐奖。" },
        { "jp": "ご意見を賜りたく存じます。", "cn": "恳请赐予宝贵意见。" }
      ]
    }
  ]
}
```

- [ ] **Step 2: commit**

```bash
git add data/cards.seed.json
git commit -m "data: add 3 hand-crafted seed cards"
```

---

## Task 3: 数据校验脚本 `validate-cards.js`（TDD）

用 node:test 写 TDD 单元测试，确保 cards.json 的 schema 不破。这是整个项目唯一严格 TDD 的模块。

**Files:**
- Create: `/Users/caseyshi/project/n1card/scripts/validate-cards.js`
- Create: `/Users/caseyshi/project/n1card/scripts/validate-cards.test.js`

- [ ] **Step 1: 写第一个失败测试 — `validate` 存在**

文件 `scripts/validate-cards.test.js`：
```js
import { test } from 'node:test';
import assert from 'node:assert';
import { validate } from './validate-cards.js';

test('validate is a function', () => {
  assert.equal(typeof validate, 'function');
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `node --test scripts/validate-cards.test.js`
Expected: FAIL with module not found / import error

- [ ] **Step 3: 写最小实现让测试通过**

文件 `scripts/validate-cards.js`：
```js
export function validate(data) {
  return { ok: true, errors: [] };
}
```

- [ ] **Step 4: 运行测试**

Run: `node --test scripts/validate-cards.test.js`
Expected: PASS

- [ ] **Step 5: 添加"顶层结构"测试**

在 `validate-cards.test.js` 追加：
```js
test('rejects missing version', () => {
  const r = validate({ cards: [] });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some(e => e.includes('version')));
});

test('rejects missing cards array', () => {
  const r = validate({ version: 1 });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some(e => e.includes('cards')));
});

test('accepts empty valid root', () => {
  const r = validate({ version: 1, cards: [] });
  assert.equal(r.ok, true);
});
```

- [ ] **Step 6: 运行测试确认失败**

Run: `node --test scripts/validate-cards.test.js`
Expected: 2 new tests FAIL

- [ ] **Step 7: 实现顶层校验**

替换 `scripts/validate-cards.js` 的 validate 函数：
```js
export function validate(data) {
  const errors = [];
  if (data?.version !== 1) errors.push('root.version must be 1');
  if (!Array.isArray(data?.cards)) errors.push('root.cards must be array');
  return { ok: errors.length === 0, errors };
}
```

- [ ] **Step 8: 运行测试**

Run: `node --test scripts/validate-cards.test.js`
Expected: ALL PASS

- [ ] **Step 9: 添加"单卡必填字段"测试**

追加到 `validate-cards.test.js`：
```js
const validCard = {
  id: 1, word: "承る", kana: "うけたまわる",
  accent: "5", type: "五段",
  meanings: ["敬悉"], mnemonic: "受け+玉+割る⇒承る",
  examples: [
    { jp: "ご注文を承りました。", cn: "您的订单我收到了。" },
    { jp: "お話を承ります。", cn: "请讲，我恭听。" }
  ]
};

test('accepts a valid card', () => {
  const r = validate({ version: 1, cards: [validCard] });
  assert.equal(r.ok, true, r.errors.join('; '));
});

test('rejects card without id', () => {
  const { id, ...rest } = validCard;
  const r = validate({ version: 1, cards: [rest] });
  assert.equal(r.ok, false);
});

test('rejects examples.length !== 2', () => {
  const bad = { ...validCard, examples: [validCard.examples[0]] };
  const r = validate({ version: 1, cards: [bad] });
  assert.equal(r.ok, false);
});

test('rejects non-hiragana kana', () => {
  const bad = { ...validCard, kana: "ウケタマワル" };
  const r = validate({ version: 1, cards: [bad] });
  assert.equal(r.ok, false);
});

test('rejects duplicate ids', () => {
  const r = validate({ version: 1, cards: [validCard, validCard] });
  assert.equal(r.ok, false);
});
```

- [ ] **Step 10: 运行测试确认失败**

Run: `node --test scripts/validate-cards.test.js`
Expected: 5 new tests FAIL

- [ ] **Step 11: 实现完整 schema 校验**

替换 `scripts/validate-cards.js` 全文：
```js
const HIRAGANA_RE = /^[\u3040-\u309F\u30FC]+$/;

export function validate(data) {
  const errors = [];
  if (data?.version !== 1) errors.push('root.version must be 1');
  if (!Array.isArray(data?.cards)) {
    errors.push('root.cards must be array');
    return { ok: false, errors };
  }

  const seenIds = new Set();
  data.cards.forEach((card, idx) => {
    const prefix = `cards[${idx}]`;
    if (typeof card.id !== 'number') errors.push(`${prefix}.id must be number`);
    else if (seenIds.has(card.id)) errors.push(`${prefix}.id=${card.id} duplicate`);
    else seenIds.add(card.id);

    if (typeof card.word !== 'string' || !card.word) errors.push(`${prefix}.word required`);
    if (typeof card.kana !== 'string' || !HIRAGANA_RE.test(card.kana))
      errors.push(`${prefix}.kana must be hiragana only`);

    if (!Array.isArray(card.meanings) || card.meanings.length === 0)
      errors.push(`${prefix}.meanings must be non-empty array`);
    else card.meanings.forEach((m, j) => {
      if (typeof m !== 'string' || !m.trim()) errors.push(`${prefix}.meanings[${j}] empty`);
    });

    if (typeof card.mnemonic !== 'string' || !card.mnemonic.trim())
      errors.push(`${prefix}.mnemonic required`);

    if (!Array.isArray(card.examples) || card.examples.length !== 2)
      errors.push(`${prefix}.examples must have exactly 2 items`);
    else card.examples.forEach((ex, j) => {
      if (typeof ex?.jp !== 'string' || !ex.jp.trim()) errors.push(`${prefix}.examples[${j}].jp empty`);
      if (typeof ex?.cn !== 'string' || !ex.cn.trim()) errors.push(`${prefix}.examples[${j}].cn empty`);
    });
  });

  return { ok: errors.length === 0, errors };
}

// CLI: node scripts/validate-cards.js data/cards.json
if (import.meta.url === `file://${process.argv[1]}`) {
  const fs = await import('node:fs/promises');
  const file = process.argv[2] || 'data/cards.json';
  const data = JSON.parse(await fs.readFile(file, 'utf8'));
  const r = validate(data);
  if (r.ok) {
    console.log(`ok: ${data.cards.length} cards valid`);
    process.exit(0);
  } else {
    console.error(`FAIL (${r.errors.length} errors):`);
    r.errors.forEach(e => console.error('  - ' + e));
    process.exit(1);
  }
}
```

注意 `package.json` 需声明 `{"type":"module"}`，否则 `import.meta.url` 会报。下一步加上。

- [ ] **Step 12: 创建最小 `package.json`**

文件 `/Users/caseyshi/project/n1card/package.json`：
```json
{
  "name": "n1card",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "node --test scripts/",
    "validate": "node scripts/validate-cards.js data/cards.json"
  }
}
```

- [ ] **Step 13: 运行全部测试**

Run: `npm test`
Expected: ALL PASS（8 个测试左右）

- [ ] **Step 14: 跑种子数据验证**

Run: `node scripts/validate-cards.js data/cards.seed.json`
Expected: `ok: 3 cards valid`

- [ ] **Step 15: commit**

```bash
git add scripts/ package.json
git commit -m "feat(validate): add cards.json schema validator with node:test TDD"
```

---

## Task 4: 生成 30 词 MVP cards.json

这一步由我（Claude）在开发会话里作为数据生成操作执行，不是代码步骤。产出 `data/cards.json` 包含前 30 个唯一词的完整数据。

**Files:**
- Create: `/Users/caseyshi/project/n1card/data/cards.json`
- Create: `/Users/caseyshi/project/n1card/data/prompts/generate-batch.md`

- [ ] **Step 1: 写生成 prompt 模板 `data/prompts/generate-batch.md`**

内容（指导 Claude 按 schema 产 JSON）：
```markdown
# N1 动词卡片批量生成 Prompt

给一批日语 N1 动词列表，按下面 schema 输出合法的 JSON 数组。要求：

- `id`：按输入顺序 1-based 编号
- `kana`：平假名读音（不含声调符号）
- `accent`：东京式声调数字字符串（0 平板；1/2/3… 高音位置），有疑问时 null
- `type`：动词分类 — "五段" / "一段" / "サ变" / "カ变"
- `meanings`：1-4 条中文解释，每条简短（5-15 字）
- `mnemonic`：**汉字拆解式联想记忆**，形如 "受け + 玉 + 割る ⇒ 承る"。不要空泛意译。
- `examples`：**恰好 2 条** N1 语感例句，非儿童级；日文原文 + 中文翻译

输出格式：
```json
{
  "version": 1,
  "cards": [ /* ... */ ]
}
```

参考 `data/cards.seed.json` 里 `承る`、`妨げる`、`賜る` 的风格和 mnemonic 写法。
```

- [ ] **Step 2: Claude 在对话内按模板生成前 30 词的 JSON**

取 `data/raw-words.txt` 去重后的前 30 词，喂给 prompt，生成 `data/cards.json`。手工校对难点词（承る、賜る、携わる、蔑む、弁える 等）的 mnemonic 质量。

- [ ] **Step 3: 运行校验脚本**

Run: `node scripts/validate-cards.js data/cards.json`
Expected: `ok: 30 cards valid`

- [ ] **Step 4: commit**

```bash
git add data/cards.json data/prompts/generate-batch.md
git commit -m "data: add 30-card MVP dataset + generation prompt"
```

---

## Task 5: DataStore + 渲染正面

**Files:**
- Modify: `/Users/caseyshi/project/n1card/app.js`（替换整个）
- Modify: `/Users/caseyshi/project/n1card/styles.css`（追加卡片样式）

- [ ] **Step 1: 追加卡片正面 CSS 到 `styles.css`**

```css
.flash-card {
  width: min(90vw, 360px);
  aspect-ratio: 9 / 16;
  max-height: 75vh;
  border-radius: 18px;
  padding: 32px 28px;
  color: #fff;
  box-shadow: 0 8px 24px rgba(0,0,0,0.35);
  display: flex;
  flex-direction: column;
  position: relative;
  overflow: hidden;
}
.flash-card.color-blue   { background: #5A9AD4; }
.flash-card.color-green  { background: #4FA896; }
.flash-card.color-purple { background: #8A6FB8; }
.flash-card.color-coral  { background: #D97B5F; }
.flash-card.color-teal   { background: #3E8A9E; }
.flash-card.color-pink   { background: #C75F87; }
.card-id {
  position: absolute; top: 24px; right: 24px;
  width: 38px; height: 38px;
  border: 2px solid rgba(255,255,255,0.85);
  border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  font-size: 18px; font-weight: 500;
}
.front-center { flex: 1; display: flex; align-items: center; justify-content: center; }
.front-word { font-size: clamp(64px, 18vw, 110px); font-weight: 600; letter-spacing: 4px; }
.hint-bottom { position: absolute; bottom: 16px; left: 0; right: 0; text-align: center; font-size: 12px; opacity: 0.5; letter-spacing: 1px; }
```

- [ ] **Step 2: 重写 `app.js` 加入 DataStore + CardView（只渲染正面）**

```js
const COLORS = ['blue', 'green', 'purple', 'coral', 'teal', 'pink'];

const DataStore = {
  cards: [],
  async load() {
    const res = await fetch('data/cards.json');
    if (!res.ok) throw new Error(`cards.json fetch failed: ${res.status}`);
    const data = await res.json();
    this.cards = data.cards;
    return this.cards;
  },
  allCards() { return this.cards; },
  getCard(id) { return this.cards.find(c => c.id === id); }
};

const CardView = {
  randomColor() { return COLORS[Math.floor(Math.random() * COLORS.length)]; },
  renderFront(card, color) {
    const el = document.createElement('div');
    el.className = `flash-card color-${color}`;
    el.innerHTML = `
      <div class="card-id">${card.id}</div>
      <div class="front-center"><div class="front-word">${card.word}</div></div>
      <div class="hint-bottom">单击发音 · 双击翻面</div>
    `;
    return el;
  }
};

const Router = {
  currentIndex: 0,
  currentColor: null,
  showCurrent() {
    const cards = DataStore.allCards();
    if (cards.length === 0) return;
    const card = cards[this.currentIndex];
    this.currentColor = CardView.randomColor();
    const stage = document.querySelector('#cardstage');
    stage.innerHTML = '';
    stage.appendChild(CardView.renderFront(card, this.currentColor));
  }
};

document.addEventListener('DOMContentLoaded', async () => {
  const topbar = document.querySelector('#topbar');
  try {
    await DataStore.load();
    topbar.textContent = `N1 动词速记 · ${DataStore.allCards().length} 词`;
    Router.showCurrent();
  } catch (err) {
    topbar.textContent = '加载失败';
    document.querySelector('#cardstage').textContent = String(err);
  }
});
```

- [ ] **Step 3: 浏览器验证**

`python3 -m http.server 8000` → Safari 打开 localhost:8000。期望：
- 顶部：`N1 动词速记 · 30 词`
- 中间：随机色卡片，大号汉字 `承る`，右上角圆圈 `1`，底部提示
- 刷新页面颜色会变（验证随机）

- [ ] **Step 4: commit**

```bash
git add app.js styles.css
git commit -m "feat(card): load cards.json and render front side with random color"
```

---

## Task 6: 渲染背面

**Files:**
- Modify: `/Users/caseyshi/project/n1card/app.js`
- Modify: `/Users/caseyshi/project/n1card/styles.css`

- [ ] **Step 1: 追加背面 CSS**

```css
.back-head { font-size: 34px; font-weight: 600; margin-right: 50px; }
.back-kana { font-size: 14px; opacity: 0.85; margin-bottom: 14px; }
.section-title { font-size: 18px; font-weight: 500; margin: 12px 0 6px; opacity: 0.95; }
.section-body { font-size: 17px; line-height: 1.7; opacity: 0.95; }
.sentence-row { padding: 8px 10px; border-radius: 8px; margin: 4px -10px; cursor: pointer; transition: background 0.15s; }
.sentence-row:hover, .sentence-row:active { background: rgba(255,255,255,0.14); }
.sentence-row .jp { font-size: 16px; line-height: 1.5; }
.sentence-row .cn { font-size: 13px; opacity: 0.75; margin-top: 2px; }
.flash-card.back { padding-top: 28px; overflow-y: auto; }
```

- [ ] **Step 2: 在 CardView 增加 `renderBack`**

在 app.js 的 `CardView` 对象内追加：
```js
  renderBack(card, color) {
    const el = document.createElement('div');
    el.className = `flash-card back color-${color}`;
    const meanings = card.meanings.map((m, i) => `${['①','②','③','④'][i]} ${m}`).join('<br>');
    el.innerHTML = `
      <div class="card-id">${card.id}</div>
      <div class="back-head">${card.word}</div>
      <div class="back-kana">${card.kana} ${card.accent ? '['+card.accent+']' : ''} ${card.type ? '· '+card.type : ''}</div>
      <div class="section-title">注释</div>
      <div class="section-body">${meanings}</div>
      <div class="section-title">关联记忆</div>
      <div class="section-body">${card.mnemonic}</div>
      <div class="section-title">例句</div>
      <div class="section-body">
        ${card.examples.map((ex, i) => `
          <div class="sentence-row" data-ex-index="${i}">
            <div class="jp">${['①','②'][i]} ${ex.jp}</div>
            <div class="cn">${ex.cn}</div>
          </div>
        `).join('')}
      </div>
      <div class="hint-bottom">双击翻回正面</div>
    `;
    return el;
  },
```

- [ ] **Step 3: 在 Router 加一个临时 "flipped" 切换**

替换 `Router` 对象为：
```js
const Router = {
  currentIndex: 0,
  currentColor: null,
  flipped: false,
  showCurrent() {
    const cards = DataStore.allCards();
    if (cards.length === 0) return;
    const card = cards[this.currentIndex];
    if (!this.currentColor) this.currentColor = CardView.randomColor();
    const stage = document.querySelector('#cardstage');
    stage.innerHTML = '';
    stage.appendChild(this.flipped
      ? CardView.renderBack(card, this.currentColor)
      : CardView.renderFront(card, this.currentColor));
  },
  nextCard() {
    this.currentIndex = (this.currentIndex + 1) % DataStore.allCards().length;
    this.currentColor = CardView.randomColor();
    this.flipped = false;
    this.showCurrent();
  },
  toggleFlip() {
    this.flipped = !this.flipped;
    this.showCurrent();
  }
};
```

- [ ] **Step 4: 临时暴露测试入口（纯为 Task 6 验证用，Task 7 移除）**

在 app.js 底部追加：
```js
// TEMP: dev-only, removed in Task 7
window._flip = () => Router.toggleFlip();
window._next = () => Router.nextCard();
```

- [ ] **Step 5: 浏览器验证**

打开 localhost:8000，在 Safari Console 跑：
- `_flip()` → 翻到背面，看到注释 ①②③、关联记忆、两条例句
- `_flip()` → 翻回正面
- `_next()` → 下一张卡片，颜色变，翻面状态重置

- [ ] **Step 6: commit**

```bash
git add app.js styles.css
git commit -m "feat(card): render back side with meanings, mnemonic, examples"
```

---

## Task 7: 单击 / 双击 手势

单击 vs 双击用 200ms 延迟窗口区分。

**Files:**
- Modify: `/Users/caseyshi/project/n1card/app.js`

- [ ] **Step 1: 新增 `Gestures` 模块**

在 app.js 顶部区域（DataStore 之后）追加：
```js
const Gestures = {
  attach(el, { onTap, onDoubleTap, onSwipe }) {
    let tapTimer = null;
    let tapStart = null;
    let touchStart = null;

    const clearTap = () => { if (tapTimer) { clearTimeout(tapTimer); tapTimer = null; } };

    el.addEventListener('pointerdown', (e) => {
      touchStart = { x: e.clientX, y: e.clientY, t: performance.now() };
    });
    el.addEventListener('pointerup', (e) => {
      if (!touchStart) return;
      const dx = e.clientX - touchStart.x;
      const dy = e.clientY - touchStart.y;
      const dt = performance.now() - touchStart.t;
      const speed = Math.hypot(dx, dy) / dt;

      // 滑动判定
      if (Math.abs(dy) > 40 && Math.abs(dy) > Math.abs(dx) * 1.5 && speed > 0.3) {
        clearTap();
        onSwipe?.(dy < 0 ? 'up' : 'down');
        touchStart = null;
        return;
      }
      // 几乎不动 → 点击
      if (Math.hypot(dx, dy) < 10) {
        if (tapTimer) {
          clearTap();
          onDoubleTap?.(e);
        } else {
          tapTimer = setTimeout(() => {
            tapTimer = null;
            onTap?.(e);
          }, 200);
        }
      }
      touchStart = null;
    });
  }
};
```

- [ ] **Step 2: 在 Router.showCurrent 里绑定手势**

替换 `Router.showCurrent`：
```js
  showCurrent() {
    const cards = DataStore.allCards();
    if (cards.length === 0) return;
    const card = cards[this.currentIndex];
    if (!this.currentColor) this.currentColor = CardView.randomColor();
    const stage = document.querySelector('#cardstage');
    stage.innerHTML = '';
    const cardEl = this.flipped
      ? CardView.renderBack(card, this.currentColor)
      : CardView.renderFront(card, this.currentColor);
    stage.appendChild(cardEl);

    Gestures.attach(cardEl, {
      onTap: (e) => {
        // 背面的例句点击优先级更高 → 由例句 row 自己处理
        if (e.target.closest('.sentence-row')) return;
        console.log('[tap]', card.word);  // Task 10 会接 TTS
      },
      onDoubleTap: () => this.toggleFlip(),
      onSwipe: (dir) => {
        console.log('[swipe]', dir);  // Task 8/9 会接 Progress
        this.nextCard();
      }
    });

    // 背面例句单独绑定（Task 11 接 TTS）
    if (this.flipped) {
      cardEl.querySelectorAll('.sentence-row').forEach(row => {
        row.addEventListener('click', (e) => {
          e.stopPropagation();
          const idx = parseInt(row.dataset.exIndex, 10);
          console.log('[sentence tap]', card.examples[idx].jp);
        });
      });
    }
  },
```

- [ ] **Step 3: 移除 Task 6 的 TEMP 调试入口**

从 app.js 底部删除 `window._flip` / `window._next`。

- [ ] **Step 4: 浏览器验证**

- 单击卡片：console 打印 `[tap] 承る`（~200ms 延迟）
- 双击卡片：翻面
- 在背面单击例句：console 打印 `[sentence tap] ご注文…`（不翻面）
- 手机上快速上划 / 下划：console 打印 `[swipe] up` / `[swipe] down` + 切下一张

- [ ] **Step 5: commit**

```bash
git add app.js
git commit -m "feat(gesture): tap/double-tap/swipe recognition with Pointer Events"
```

---

## Task 8: 键盘快捷键（Mac 专用）

**Files:**
- Modify: `/Users/caseyshi/project/n1card/app.js`

- [ ] **Step 1: 在 DOMContentLoaded 处理器里追加键盘事件**

替换 `document.addEventListener('DOMContentLoaded', ...)` 块：
```js
document.addEventListener('DOMContentLoaded', async () => {
  const topbar = document.querySelector('#topbar');
  try {
    await DataStore.load();
    topbar.textContent = `N1 动词速记 · ${DataStore.allCards().length} 词`;
    Router.showCurrent();

    document.addEventListener('keydown', (e) => {
      if (e.target.matches('input, textarea, select')) return;
      switch (e.key) {
        case ' ':         e.preventDefault(); Router.toggleFlip(); break;
        case 'ArrowUp':   e.preventDefault(); Router.markAndNext('unknown'); break;
        case 'ArrowDown': e.preventDefault(); Router.markAndNext('known'); break;
        case 'ArrowRight':e.preventDefault(); Router.nextCard(); break;
        case 'p': case 'P': Router.playCurrentWord(); break;
      }
    });
  } catch (err) {
    topbar.textContent = '加载失败';
    document.querySelector('#cardstage').textContent = String(err);
  }
});
```

- [ ] **Step 2: 在 Router 加 stub 方法（Task 9/10 会实现）**

在 Router 对象里追加：
```js
  markAndNext(status) {
    // Task 9: 调用 Progress.mark()
    console.log('[mark]', status);
    this.nextCard();
  },
  playCurrentWord() {
    // Task 10: 调用 TTSEngine
    console.log('[play word]');
  }
```

- [ ] **Step 3: 浏览器验证（Mac Safari）**

- Space → 翻面
- ArrowUp → console `[mark] unknown` + 下一张
- ArrowDown → console `[mark] known` + 下一张
- ArrowRight → 直接下一张
- P → console `[play word]`

- [ ] **Step 4: commit**

```bash
git add app.js
git commit -m "feat(keyboard): add arrow/space/p shortcuts for Mac"
```

---

## Task 9: Progress 模块 + localStorage 集成

**Files:**
- Modify: `/Users/caseyshi/project/n1card/app.js`

- [ ] **Step 1: 新增 `Progress` 模块**

在 app.js 的 DataStore 之后追加：
```js
const Progress = {
  key: 'n1card:progress',
  settingsKey: 'n1card:settings',
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
    this._progress[id] = { status, lastSeen: Date.now() };
    this._save();
  },
  getStatus(id) { return this._progress[id]?.status || null; },
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

- [ ] **Step 2: 在 Router 集成 Progress**

替换 `Router.markAndNext` 和 `Router.nextCard`：
```js
  markAndNext(status) {
    const card = DataStore.allCards()[this.currentIndex];
    if (card) Progress.mark(card.id, status);
    this.nextCard();
  },
  nextCard() {
    const cards = DataStore.allCards();
    this.currentIndex = (this.currentIndex + 1) % cards.length;
    this.currentColor = CardView.randomColor();
    this.flipped = false;
    Progress.setLastCardId(cards[this.currentIndex].id);
    this.showCurrent();
  },
```

把 `Gestures.attach` 的 `onSwipe` 改为：
```js
      onSwipe: (dir) => this.markAndNext(dir === 'up' ? 'unknown' : 'known'),
```

- [ ] **Step 3: 启动时恢复位置 + 加载 Progress**

修改 DOMContentLoaded 里 `await DataStore.load();` 后紧跟一行：
```js
    Progress.load();
    const lastId = Progress.getLastCardId();
    if (lastId !== null) {
      const idx = DataStore.allCards().findIndex(c => c.id === lastId);
      if (idx >= 0) Router.currentIndex = idx;
    }
```

并把"加载失败"路径里也提示 Progress 不可用时：
```js
    if (!Progress.isAvailable()) {
      topbar.textContent += ' · ⚠ 进度不会保存（隐私模式）';
    }
```

- [ ] **Step 4: 浏览器验证**

- 下划 → 刷新页面 → 位置保留在下一张（不回到第一张）
- 在 Safari 开发者工具的 Application → Local Storage 里能看到 `n1card:progress` 和 `n1card:settings`
- 上划几张 → 在 console 跑 `Progress.stats()` → 返回正确 known/unknown 计数
- 隐私模式打开测试：顶部有 ⚠ 警告，但 App 仍能用

- [ ] **Step 5: commit**

```bash
git add app.js
git commit -m "feat(progress): persist progress and settings to localStorage"
```

---

## Task 10: TTSEngine + 卡片单击发音

**Files:**
- Modify: `/Users/caseyshi/project/n1card/app.js`

- [ ] **Step 1: 新增 `TTSEngine` 模块**

在 Progress 之后追加：
```js
const TTSEngine = {
  _supported: 'speechSynthesis' in window,
  _jaVoice: null,
  _queue: [],
  _speaking: false,

  init() {
    if (!this._supported) return;
    const pick = () => {
      const voices = speechSynthesis.getVoices();
      this._jaVoice = voices.find(v => v.lang.startsWith('ja')) || null;
    };
    pick();
    speechSynthesis.addEventListener('voiceschanged', pick);
  },
  isSupported() { return this._supported; },
  hasJapanese() { return this._jaVoice !== null; },

  speak(text, { rate = 0.9, onEnd = null, onStart = null } = {}) {
    if (!this._supported) { onEnd?.(); return; }
    return new Promise((resolve) => {
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'ja-JP';
      if (this._jaVoice) u.voice = this._jaVoice;
      u.rate = rate;
      u.onstart = () => onStart?.();
      u.onend = () => { onEnd?.(); resolve(); };
      u.onerror = () => { onEnd?.(); resolve(); };
      speechSynthesis.speak(u);
    });
  },
  cancel() {
    if (this._supported) speechSynthesis.cancel();
  }
};
```

- [ ] **Step 2: 在 Router 接入 TTS**

替换 `Router.playCurrentWord`：
```js
  playCurrentWord() {
    const card = DataStore.allCards()[this.currentIndex];
    if (card) TTSEngine.speak(card.kana, { rate: Progress.getTTSRate() });
  },
  playExample(idx) {
    const card = DataStore.allCards()[this.currentIndex];
    if (card) TTSEngine.speak(card.examples[idx].jp, { rate: Progress.getTTSRate() });
  },
```

把 `Gestures.attach` 的 `onTap` 改为：
```js
      onTap: (e) => {
        if (e.target.closest('.sentence-row')) return;
        Router.playCurrentWord();
      },
```

把背面例句行的监听器改为：
```js
      cardEl.querySelectorAll('.sentence-row').forEach(row => {
        row.addEventListener('click', (e) => {
          e.stopPropagation();
          const idx = parseInt(row.dataset.exIndex, 10);
          Router.playExample(idx);
        });
      });
```

- [ ] **Step 3: DOMContentLoaded 里 init TTS**

在 `Progress.load();` 之后加：
```js
    TTSEngine.init();
    if (!TTSEngine.isSupported()) {
      topbar.textContent += ' · ⚠ 当前浏览器不支持发音';
    }
```

- [ ] **Step 4: 浏览器验证**

- Mac Safari：单击卡片正面 → 听到 `うけたまわる` 发音（Kyoko/Otoya 声音）
- 翻到背面 → 单击例句行 → 听到该句发音
- 按 `P` 键 → 同样播放单词
- 多次快速点击：后一次会打断前一次（speechSynthesis 行为）

- [ ] **Step 5: commit**

```bash
git add app.js
git commit -m "feat(tts): add Web Speech API wrapper and wire tap/key to TTS"
```

---

## Task 11: 顶部状态栏（计数 + 统计）

**Files:**
- Modify: `/Users/caseyshi/project/n1card/app.js`
- Modify: `/Users/caseyshi/project/n1card/styles.css`

- [ ] **Step 1: 追加顶部栏 CSS**

```css
#topbar { display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 10px 16px; background: #1a1a1a; font-size: 13px; }
.topbar-left { font-weight: 500; }
.topbar-center { opacity: 0.8; text-align: center; flex: 1; }
.topbar-right { display: flex; gap: 8px; align-items: center; }
.topbar-right select, .topbar-right button {
  background: #2a2a2a; color: #eee; border: 1px solid #444;
  border-radius: 6px; padding: 4px 10px; font-size: 13px; cursor: pointer;
}
.topbar-right button.brainwash-btn { background: #E85D4A; color: #fff; border-color: #E85D4A; }
.topbar-warn { color: #ffb74d; margin-left: 8px; font-size: 12px; }
```

- [ ] **Step 2: 新增 TopBar 模块**

在 Router 之前追加：
```js
const TopBar = {
  warnings: [],
  addWarning(msg) { this.warnings.push(msg); },
  render() {
    const topbar = document.querySelector('#topbar');
    const total = DataStore.allCards().length;
    const idx = Router.currentIndex + 1;
    const stats = Progress.stats();
    const warn = this.warnings.length ? `<span class="topbar-warn">⚠ ${this.warnings.join(' · ')}</span>` : '';
    topbar.innerHTML = `
      <div class="topbar-left">📚 N1 动词 · ${idx}/${total}${warn}</div>
      <div class="topbar-center">已掌握 ${stats.known} · 待巩固 ${stats.unknown}</div>
      <div class="topbar-right">
        <select id="filter-select">
          <option value="all">全部</option>
          <option value="unknown_only">只看待巩固</option>
          <option value="unseen_only">只看未学过</option>
          <option value="random">随机乱序</option>
        </select>
        <button class="brainwash-btn" id="brainwash-btn">🧠 洗脑</button>
      </div>
    `;
    topbar.querySelector('#filter-select').value = Progress.getFilter();
    topbar.querySelector('#filter-select').addEventListener('change', (e) => {
      Router.applyFilter(e.target.value);
    });
    topbar.querySelector('#brainwash-btn').addEventListener('click', () => {
      BrainwashMode?.toggle?.();  // Task 16 才实现
    });
  }
};
```

- [ ] **Step 3: Router.showCurrent 里调 TopBar.render()**

在 `Router.showCurrent()` 末尾（`stage.appendChild(cardEl);` 之后）加：
```js
    TopBar.render();
```

- [ ] **Step 4: Router 加 applyFilter stub**

在 Router 对象加：
```js
  applyFilter(filter) {
    Progress.setFilter(filter);
    // Task 12 实现真实过滤
    this.showCurrent();
  },
```

- [ ] **Step 5: 把之前的 topbar.textContent 警告改成 TopBar.addWarning**

在 DOMContentLoaded 里，替换：
```js
    topbar.textContent = `N1 动词速记 · ${DataStore.allCards().length} 词`;
```
为：
```js
    // (no topbar.textContent — TopBar.render() takes over)
```

并替换 TTS / Progress 警告块：
```js
    if (!Progress.isAvailable()) TopBar.addWarning('进度不保存');
    if (!TTSEngine.isSupported()) TopBar.addWarning('不支持发音');
```

- [ ] **Step 6: 浏览器验证**

- 顶部左：`📚 N1 动词 · 1/30`
- 中间：`已掌握 0 · 待巩固 0`
- 右：下拉（全部/只看待巩固/...）+ 红色 🧠 洗脑按钮
- 上划几张后，统计数字变化
- 切换下拉：console 不报错（过滤下一 task 才实现）

- [ ] **Step 7: commit**

```bash
git add app.js styles.css
git commit -m "feat(topbar): render counter, stats, filter dropdown, brainwash button"
```

---

## Task 12: 筛选器实现

Router 维护 `visibleCards`（按 filter 派生）而不是直接用 DataStore.allCards。`currentIndex` 指向 `visibleCards` 的 index。

**Files:**
- Modify: `/Users/caseyshi/project/n1card/app.js`

- [ ] **Step 1: 在 Router 内加 visibleCards 派生**

替换整个 Router 对象（较大改动）：
```js
const Router = {
  currentIndex: 0,
  currentColor: null,
  flipped: false,
  visibleCards: [],

  computeVisible() {
    const all = DataStore.allCards();
    const filter = Progress.getFilter();
    let v;
    switch (filter) {
      case 'unknown_only':
        v = all.filter(c => Progress.getStatus(c.id) === 'unknown'); break;
      case 'unseen_only':
        v = all.filter(c => Progress.getStatus(c.id) === null); break;
      case 'random':
        v = [...all].sort(() => Math.random() - 0.5); break;
      case 'all':
      default:
        v = [...all];
    }
    this.visibleCards = v.length > 0 ? v : all;  // 空则回退全部
  },

  showCurrent() {
    if (this.visibleCards.length === 0) this.computeVisible();
    if (this.visibleCards.length === 0) return;
    if (this.currentIndex >= this.visibleCards.length) this.currentIndex = 0;
    const card = this.visibleCards[this.currentIndex];
    if (!this.currentColor) this.currentColor = CardView.randomColor();
    const stage = document.querySelector('#cardstage');
    stage.innerHTML = '';
    const cardEl = this.flipped
      ? CardView.renderBack(card, this.currentColor)
      : CardView.renderFront(card, this.currentColor);
    stage.appendChild(cardEl);

    Gestures.attach(cardEl, {
      onTap: (e) => {
        if (e.target.closest('.sentence-row')) return;
        this.playCurrentWord();
      },
      onDoubleTap: () => this.toggleFlip(),
      onSwipe: (dir) => this.markAndNext(dir === 'up' ? 'unknown' : 'known')
    });

    if (this.flipped) {
      cardEl.querySelectorAll('.sentence-row').forEach(row => {
        row.addEventListener('click', (e) => {
          e.stopPropagation();
          const idx = parseInt(row.dataset.exIndex, 10);
          this.playExample(idx);
        });
      });
    }
    TopBar.render();
  },

  markAndNext(status) {
    const card = this.visibleCards[this.currentIndex];
    if (card) Progress.mark(card.id, status);
    this.nextCard();
  },
  nextCard() {
    if (this.visibleCards.length === 0) return;
    this.currentIndex = (this.currentIndex + 1) % this.visibleCards.length;
    this.currentColor = CardView.randomColor();
    this.flipped = false;
    Progress.setLastCardId(this.visibleCards[this.currentIndex].id);
    this.showCurrent();
  },
  toggleFlip() { this.flipped = !this.flipped; this.showCurrent(); },

  applyFilter(filter) {
    const currentCard = this.visibleCards[this.currentIndex];
    Progress.setFilter(filter);
    this.computeVisible();
    // 尽量保留位置：若当前卡仍在新列表里，就定位到它
    const keepIdx = currentCard ? this.visibleCards.findIndex(c => c.id === currentCard.id) : -1;
    this.currentIndex = keepIdx >= 0 ? keepIdx : 0;
    this.currentColor = CardView.randomColor();
    this.flipped = false;
    this.showCurrent();
  },

  playCurrentWord() {
    const card = this.visibleCards[this.currentIndex];
    if (card) TTSEngine.speak(card.kana, { rate: Progress.getTTSRate() });
  },
  playExample(idx) {
    const card = this.visibleCards[this.currentIndex];
    if (card) TTSEngine.speak(card.examples[idx].jp, { rate: Progress.getTTSRate() });
  }
};
```

- [ ] **Step 2: DOMContentLoaded 里启动时调 computeVisible**

在 `Progress.load();` 之后加：
```js
    Router.computeVisible();
```

并把 "恢复 lastCardId" 那段改为基于 visibleCards：
```js
    const lastId = Progress.getLastCardId();
    if (lastId !== null) {
      const idx = Router.visibleCards.findIndex(c => c.id === lastId);
      if (idx >= 0) Router.currentIndex = idx;
    }
```

- [ ] **Step 3: 浏览器验证**

- 上划 3 张 → 下拉切到"只看待巩固" → 只有那 3 张循环
- 切到"只看未学过" → 除标记过的 3 张外，其他 27 张循环
- 切到"随机乱序" → 顺序变
- 切回"全部" → 恢复正常
- 筛选为"只看待巩固"，但没标记过任何卡时，回退到全部（不白屏）

- [ ] **Step 4: commit**

```bash
git add app.js
git commit -m "feat(filter): visibleCards derivation from filter with position preservation"
```

---

## Task 13: 洗脑模式 — 进入 / 退出 + 核心播放序列

**Files:**
- Modify: `/Users/caseyshi/project/n1card/app.js`
- Modify: `/Users/caseyshi/project/n1card/styles.css`

- [ ] **Step 1: 追加洗脑模式 CSS**

```css
body.brainwash-on #topbar { background: #E85D4A; }
body.brainwash-on #cardstage { background: rgba(0,0,0,0.3); }
.brainwash-exit {
  background: rgba(255,255,255,0.15); border: 1px solid rgba(255,255,255,0.3);
  color: #fff; border-radius: 6px; padding: 4px 10px; font-size: 13px; cursor: pointer;
}
.brainwash-current-example {
  color: #fff; font-size: 15px; opacity: 0.95; text-align: center;
}
@keyframes pulse {
  0%   { transform: scale(1.0); }
  50%  { transform: scale(1.08); }
  100% { transform: scale(1.0); }
}
.front-word.pulse { animation: pulse 0.35s ease-out; }
```

- [ ] **Step 2: 新增 `BrainwashMode` 模块**

在 Router 之前（但 TopBar 之后）追加：
```js
const BrainwashMode = {
  active: false,
  _aborted: false,
  _paused: false,

  async toggle() {
    if (this.active) this.exit();
    else await this.enter();
  },
  async enter() {
    this.active = true;
    this._aborted = false;
    this._paused = false;
    document.body.classList.add('brainwash-on');
    // 确保在正面
    Router.flipped = false;
    Router.showCurrent();
    await this._runLoop();
  },
  exit() {
    this.active = false;
    this._aborted = true;
    TTSEngine.cancel();
    document.body.classList.remove('brainwash-on');
    TopBar.render();
  },
  pauseToggle() {
    this._paused = !this._paused;
    if (this._paused) TTSEngine.cancel();
  },
  async skipToNext() {
    this._aborted = true;
    TTSEngine.cancel();
    Router.nextCard();
    this._aborted = false;
    await this._runLoop();
  },

  async _runLoop() {
    while (this.active && !this._aborted) {
      const card = Router.visibleCards[Router.currentIndex];
      if (!card) break;
      await this._playCard(card);
      if (this._aborted) break;
      // 进下一张（不改 progress）
      Router.currentIndex = (Router.currentIndex + 1) % Router.visibleCards.length;
      Router.currentColor = CardView.randomColor();
      Router.flipped = false;
      Progress.setLastCardId(Router.visibleCards[Router.currentIndex].id);
      Router.showCurrent();
    }
  },

  async _playCard(card) {
    // 10 × word，每次 pulse
    for (let i = 0; i < 10 && !this._aborted; i++) {
      await this._waitIfPaused();
      this._pulseWord();
      await TTSEngine.speak(card.kana, { rate: Progress.getTTSRate() });
      if (this._aborted) return;
      await this._sleep(300);
    }
    if (this._aborted) return;
    await this._ding();
    // 例句 1 × 2
    for (let rep = 0; rep < 2 && !this._aborted; rep++) {
      await this._waitIfPaused();
      this._showExampleInTopBar(card.examples[0].jp);
      await TTSEngine.speak(card.examples[0].jp, { rate: Progress.getTTSRate() });
      if (this._aborted) return;
      await this._sleep(300);
    }
    if (this._aborted) return;
    await this._ding();
    // 例句 2 × 2
    for (let rep = 0; rep < 2 && !this._aborted; rep++) {
      await this._waitIfPaused();
      this._showExampleInTopBar(card.examples[1].jp);
      await TTSEngine.speak(card.examples[1].jp, { rate: Progress.getTTSRate() });
      if (this._aborted) return;
      await this._sleep(300);
    }
    await this._sleep(800);
  },

  _pulseWord() {
    const el = document.querySelector('.front-word');
    if (!el) return;
    el.classList.remove('pulse');
    void el.offsetWidth;  // reflow
    el.classList.add('pulse');
  },
  _showExampleInTopBar(jp) {
    const center = document.querySelector('.topbar-center');
    if (center) {
      center.textContent = jp;
      center.classList.add('brainwash-current-example');
    }
  },
  async _ding() {
    // Task 15 实现 WebAudio；先用静音占位
    await this._sleep(150);
  },
  _sleep(ms) { return new Promise(r => setTimeout(r, ms)); },
  async _waitIfPaused() {
    while (this._paused && !this._aborted) await this._sleep(100);
  }
};
```

- [ ] **Step 3: Gestures 在洗脑模式下的特殊行为**

替换 `Router.showCurrent` 里 Gestures.attach 的 onSwipe 和 onDoubleTap：
```js
      onDoubleTap: () => {
        if (BrainwashMode.active) BrainwashMode.pauseToggle();
        else this.toggleFlip();
      },
      onSwipe: (dir) => {
        if (BrainwashMode.active) BrainwashMode.skipToNext();
        else this.markAndNext(dir === 'up' ? 'unknown' : 'known');
      }
```

- [ ] **Step 4: Esc 键退出洗脑**

在键盘事件 switch 里加：
```js
        case 'Escape': if (BrainwashMode.active) BrainwashMode.exit(); break;
```

- [ ] **Step 5: 浏览器验证**

- 点 🧠 按钮 → 顶部变红，卡片 dim，开始播单词 × 10 遍（每遍汉字会脉冲）
- 单词播完 → 顶部中间替换为例句日文 → 播例 1 × 2 → 例 2 × 2
- 自动进下一张（颜色换，继续序列）
- 上/下划 → 跳下一张，新序列
- 双击 → 暂停/继续（console 听不到声但 speechSynthesis 会停）
- 再点 🧠 或按 Esc → 退出，顶部恢复

- [ ] **Step 6: commit**

```bash
git add app.js styles.css
git commit -m "feat(brainwash): enter/exit, 10x word + 2x each example, pulse + auto-advance"
```

---

## Task 14: 洗脑模式 — WebAudio 叮声分隔

**Files:**
- Modify: `/Users/caseyshi/project/n1card/app.js`

- [ ] **Step 1: 在 BrainwashMode 内新增 _ding 实现**

替换 `BrainwashMode._ding`：
```js
  _audioCtx: null,
  _getAudioCtx() {
    if (!this._audioCtx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (Ctx) this._audioCtx = new Ctx();
    }
    return this._audioCtx;
  },
  async _ding() {
    const ctx = this._getAudioCtx();
    if (!ctx) { await this._sleep(150); return; }
    // 两个叠加正弦：440 + 880，80ms 衰减
    const now = ctx.currentTime;
    const playTone = (freq) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.18, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
      osc.connect(gain); gain.connect(ctx.destination);
      osc.start(now); osc.stop(now + 0.15);
    };
    playTone(440); playTone(880);
    await this._sleep(160);
  },
```

- [ ] **Step 2: 浏览器验证**

- 进入洗脑模式，10 遍单词播完后应听到清脆短"叮"声
- 例 1 播完后同样有"叮"
- iOS Safari 上需先有用户交互才能启动 AudioContext —— 因为洗脑总是由点击 🧠 进入，已满足

- [ ] **Step 3: commit**

```bash
git add app.js
git commit -m "feat(brainwash): WebAudio ding separator between phases"
```

---

## Task 15: 设置面板 + 重置 + 编辑

**Files:**
- Modify: `/Users/caseyshi/project/n1card/app.js`
- Modify: `/Users/caseyshi/project/n1card/styles.css`

- [ ] **Step 1: 追加设置面板 CSS**

```css
.modal-backdrop {
  position: fixed; inset: 0; background: rgba(0,0,0,0.6);
  display: flex; align-items: center; justify-content: center; z-index: 100;
}
.modal {
  background: #222; color: #eee; border-radius: 12px;
  padding: 20px; width: min(90vw, 460px); max-height: 85vh; overflow-y: auto;
}
.modal h3 { margin-bottom: 12px; font-size: 18px; }
.modal label { display: block; margin: 10px 0 4px; font-size: 13px; opacity: 0.8; }
.modal input, .modal textarea {
  width: 100%; background: #111; color: #eee; border: 1px solid #444;
  border-radius: 6px; padding: 8px; font-family: inherit; font-size: 14px;
}
.modal textarea { min-height: 60px; resize: vertical; }
.modal .row { display: flex; gap: 8px; margin-top: 16px; }
.modal button {
  flex: 1; background: #2a2a2a; color: #eee; border: 1px solid #444;
  border-radius: 6px; padding: 10px; font-size: 14px; cursor: pointer;
}
.modal button.primary { background: #5A9AD4; border-color: #5A9AD4; }
.modal button.danger { background: #c0392b; border-color: #c0392b; }
.settings-btn {
  background: #2a2a2a; color: #eee; border: 1px solid #444;
  border-radius: 6px; padding: 4px 10px; font-size: 13px; cursor: pointer;
}
```

- [ ] **Step 2: 新增 SettingsPanel 模块**

在 BrainwashMode 之后追加：
```js
const SettingsPanel = {
  open() {
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';
    backdrop.innerHTML = `
      <div class="modal">
        <h3>设置</h3>
        <label>TTS 语速：<span id="rate-val">${Progress.getTTSRate().toFixed(2)}</span></label>
        <input type="range" id="rate-input" min="0.5" max="1.5" step="0.05" value="${Progress.getTTSRate()}">
        <div class="row">
          <button id="edit-btn">编辑当前卡</button>
          <button id="export-btn">导出修改</button>
        </div>
        <div class="row">
          <button class="danger" id="reset-btn">清空学习记录</button>
        </div>
        <div class="row">
          <button id="close-btn">关闭</button>
        </div>
      </div>
    `;
    document.body.appendChild(backdrop);
    backdrop.addEventListener('click', (e) => { if (e.target === backdrop) this.close(); });

    const rateInput = backdrop.querySelector('#rate-input');
    rateInput.addEventListener('input', () => {
      const v = parseFloat(rateInput.value);
      backdrop.querySelector('#rate-val').textContent = v.toFixed(2);
      Progress.setTTSRate(v);
    });
    backdrop.querySelector('#edit-btn').addEventListener('click', () => {
      this.close();
      EditPanel.open(Router.visibleCards[Router.currentIndex]);
    });
    backdrop.querySelector('#export-btn').addEventListener('click', () => {
      this._exportOverrides();
    });
    backdrop.querySelector('#reset-btn').addEventListener('click', () => {
      if (confirm('清空所有学习记录？（不会影响你编辑过的卡片）')) {
        Progress.reset();
        Router.computeVisible();
        Router.currentIndex = 0;
        Router.showCurrent();
        this.close();
      }
    });
    backdrop.querySelector('#close-btn').addEventListener('click', () => this.close());
  },
  close() {
    document.querySelector('.modal-backdrop')?.remove();
  },
  _exportOverrides() {
    const data = JSON.stringify(DataStore.exportOverrides(), null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'cards.overrides.json';
    a.click(); URL.revokeObjectURL(url);
  }
};
```

- [ ] **Step 3: TopBar 上加设置按钮**

在 TopBar.render 的 topbar-right 里，🧠 前面加：
```html
        <button class="settings-btn" id="settings-btn">⚙</button>
```

并追加事件：
```js
    topbar.querySelector('#settings-btn').addEventListener('click', () => SettingsPanel.open());
```

- [ ] **Step 4: DataStore 增加 overrides 支持**

在 DataStore 对象加：
```js
  overrides: {},
  loadOverrides() {
    try {
      const o = localStorage.getItem('n1card:overrides');
      if (o) this.overrides = JSON.parse(o);
    } catch {}
  },
  _saveOverrides() {
    try { localStorage.setItem('n1card:overrides', JSON.stringify(this.overrides)); }
    catch {}
  },
  applyOverride(id, patch) {
    this.overrides[id] = { ...this.overrides[id], ...patch };
    const i = this.cards.findIndex(c => c.id === id);
    if (i >= 0) this.cards[i] = { ...this.cards[i], ...patch };
    this._saveOverrides();
  },
  exportOverrides() {
    return { version: 1, overrides: this.overrides };
  }
```

并在 `load()` 末尾合并 overrides：
```js
    this.loadOverrides();
    for (const id in this.overrides) {
      const i = this.cards.findIndex(c => c.id === parseInt(id, 10));
      if (i >= 0) this.cards[i] = { ...this.cards[i], ...this.overrides[id] };
    }
    return this.cards;
```

- [ ] **Step 5: 浏览器验证（仅 Settings 部分；Edit 下一步做）**

- 点 ⚙ → 弹出模态
- 拖 TTS 语速滑块 → 播放单词能听出速度变化
- 导出修改 → 下载 `cards.overrides.json`（此时内容为 `{"version":1,"overrides":{}}`）
- 清空学习记录 → 确认后统计归零
- 点背景 / 关闭 → 关闭

- [ ] **Step 6: commit**

```bash
git add app.js styles.css
git commit -m "feat(settings): settings modal with TTS rate, reset, export overrides"
```

---

## Task 16: 编辑面板

**Files:**
- Modify: `/Users/caseyshi/project/n1card/app.js`

- [ ] **Step 1: 新增 EditPanel 模块**

在 SettingsPanel 之后追加：
```js
const EditPanel = {
  open(card) {
    if (!card) return;
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';
    backdrop.innerHTML = `
      <div class="modal">
        <h3>编辑 · ${card.word}</h3>
        <label>注释（每行一条）</label>
        <textarea id="edit-meanings">${card.meanings.join('\n')}</textarea>
        <label>关联记忆</label>
        <textarea id="edit-mnemonic">${card.mnemonic}</textarea>
        <label>例句 1 · 日文</label>
        <input id="edit-ex1-jp" value="${this._esc(card.examples[0].jp)}">
        <label>例句 1 · 中文</label>
        <input id="edit-ex1-cn" value="${this._esc(card.examples[0].cn)}">
        <label>例句 2 · 日文</label>
        <input id="edit-ex2-jp" value="${this._esc(card.examples[1].jp)}">
        <label>例句 2 · 中文</label>
        <input id="edit-ex2-cn" value="${this._esc(card.examples[1].cn)}">
        <div class="row">
          <button class="primary" id="save-btn">保存</button>
          <button id="cancel-btn">取消</button>
        </div>
      </div>
    `;
    document.body.appendChild(backdrop);
    backdrop.addEventListener('click', (e) => { if (e.target === backdrop) this.close(); });
    backdrop.querySelector('#cancel-btn').addEventListener('click', () => this.close());
    backdrop.querySelector('#save-btn').addEventListener('click', () => {
      const patch = {
        meanings: backdrop.querySelector('#edit-meanings').value.split('\n').map(s => s.trim()).filter(Boolean),
        mnemonic: backdrop.querySelector('#edit-mnemonic').value.trim(),
        examples: [
          { jp: backdrop.querySelector('#edit-ex1-jp').value.trim(), cn: backdrop.querySelector('#edit-ex1-cn').value.trim() },
          { jp: backdrop.querySelector('#edit-ex2-jp').value.trim(), cn: backdrop.querySelector('#edit-ex2-cn').value.trim() }
        ]
      };
      DataStore.applyOverride(card.id, patch);
      this.close();
      Router.showCurrent();
    });
  },
  close() { document.querySelector('.modal-backdrop')?.remove(); },
  _esc(s) { return String(s).replace(/"/g, '&quot;'); }
};
```

- [ ] **Step 2: 浏览器验证**

- ⚙ → 编辑当前卡 → 模态里显示当前卡字段
- 修改注释、例句 → 保存
- 卡片立即刷新显示新内容
- 刷新页面 → 修改保留（Application → Local Storage 有 `n1card:overrides`）
- ⚙ → 导出修改 → 下载的 JSON 含刚才改的内容

- [ ] **Step 3: commit**

```bash
git add app.js
git commit -m "feat(edit): add card editor modal with localStorage overrides"
```

---

## Task 17: 错误处理兜底

集中做一次错误处理审计：fetch 失败全屏错误页 + 重试，speechSynthesis 错误多次后提示。

**Files:**
- Modify: `/Users/caseyshi/project/n1card/app.js`
- Modify: `/Users/caseyshi/project/n1card/styles.css`

- [ ] **Step 1: 追加错误页 CSS**

```css
.fatal-error {
  padding: 40px 20px; text-align: center;
}
.fatal-error h2 { color: #ff6b6b; margin-bottom: 12px; }
.fatal-error button {
  margin-top: 16px; background: #5A9AD4; color: #fff;
  border: none; border-radius: 6px; padding: 10px 20px; cursor: pointer;
}
```

- [ ] **Step 2: 改写 DOMContentLoaded 的 catch 分支**

```js
  } catch (err) {
    document.querySelector('#topbar').textContent = '加载失败';
    document.querySelector('#cardstage').innerHTML = `
      <div class="fatal-error">
        <h2>无法加载卡片数据</h2>
        <p>${err.message}</p>
        <button onclick="location.reload()">重试</button>
      </div>
    `;
  }
```

- [ ] **Step 3: TTSEngine 加错误计数**

替换 `TTSEngine.speak`：
```js
  _errorCount: 0,
  speak(text, { rate = 0.9, onEnd = null, onStart = null } = {}) {
    if (!this._supported) { onEnd?.(); return Promise.resolve(); }
    return new Promise((resolve) => {
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'ja-JP';
      if (this._jaVoice) u.voice = this._jaVoice;
      u.rate = rate;
      u.onstart = () => onStart?.();
      u.onend = () => { onEnd?.(); resolve(); };
      u.onerror = () => {
        this._errorCount++;
        if (this._errorCount === 3) TopBar.addWarning('TTS 多次失败');
        if (this._errorCount === 3) TopBar.render();
        onEnd?.(); resolve();
      };
      speechSynthesis.speak(u);
    });
  },
```

- [ ] **Step 4: 浏览器验证错误路径**

- 临时把 `data/cards.json` 改个文件名 → 刷新 → 看到全屏 "无法加载卡片数据" + 重试按钮
- 改回来 → 点重试 → 恢复正常
- iPhone 隐私模式 → 顶部有"进度不保存"警告，功能正常

- [ ] **Step 5: commit**

```bash
git add app.js styles.css
git commit -m "feat(errors): fatal error page with retry, TTS error counting"
```

---

## Task 18: 生成完整 393 词 cards.json

**Files:**
- Modify: `/Users/caseyshi/project/n1card/data/cards.json`

- [ ] **Step 1: 去重 raw-words.txt 得到 393 词**

Run: `awk 'NF' data/raw-words.txt | awk '!seen[$0]++'`
Expected: 393 行

- [ ] **Step 2: 分 13 批生成剩余 363 词**

在 Claude 对话内按 `data/prompts/generate-batch.md` 的 prompt，每批约 30 词生成。把每批的 cards 数组片段拼进 `data/cards.json`。保证 id 连续（30 MVP 之后从 31 开始），无重复。

对这些高频难词（承る/賜る/携わる/蔑む/弁える/頷く/俯く/鑑みる 等）手工校对 mnemonic 和例句。

- [ ] **Step 3: 运行完整校验**

Run: `node scripts/validate-cards.js data/cards.json`
Expected: `ok: 393 cards valid`

- [ ] **Step 4: 浏览器验证**

- 刷新 → 顶部 `📚 N1 动词 · 1/393`
- 翻到后面的卡片（按 → 或上下划），随机抽查几张看 mnemonic 和例句质量
- 筛选 "只看未学过" → 还剩 392 或接近（取决于之前标记数）

- [ ] **Step 5: commit**

```bash
git add data/cards.json
git commit -m "data: expand cards.json to full 393 N1 verbs"
```

---

## Task 19: 手动测试清单 + 双设备验证

**Files:**
- Create: `/Users/caseyshi/project/n1card/docs/testing-checklist.md`

- [ ] **Step 1: 写测试清单**

```markdown
# N1 卡片 手动测试清单

对照 `docs/superpowers/specs/2026-04-18-n1card-design.md` §10.2。在 **Mac Safari** 和 **iPhone Safari** 各跑一遍，勾选通过项。

## 启动 & 渲染
- [ ] 初次加载顶部计数正确（1/393）
- [ ] 卡片随机 6 色之一，白字清晰
- [ ] 右上角编号圈显示正确 id
- [ ] 刷新多次，颜色随机分布

## 点击 / 发音
- [ ] 正面单击卡片 → 播放单词日语 TTS（约 200ms 延迟后）
- [ ] 双击卡片 → 翻到背面
- [ ] 背面单击汉字区域 → 播放单词
- [ ] 背面单击例句 1 行 → 播放例句 1
- [ ] 背面单击例句 2 行 → 播放例句 2
- [ ] 背面双击 → 翻回正面
- [ ] 单击例句时 不触发翻面

## 手势切卡
- [ ] 正面上划 → 卡片换、计数 +1、待巩固 +1
- [ ] 正面下划 → 卡片换、计数 +1、已掌握 +1
- [ ] 背面上划 / 下划 → 同上（不需要先翻回）

## 键盘（仅 Mac）
- [ ] Space → 翻面
- [ ] ↑ / ↓ → 上划 / 下划
- [ ] → → 不评分直接下一张
- [ ] P → 播放单词
- [ ] Esc（洗脑模式中）→ 退出

## 进度持久化
- [ ] 刷新页面 → 从上次位置继续
- [ ] 标记后刷新 → 统计数字保留
- [ ] Safari 隐私模式 → 顶部"进度不保存"警告，功能仍可用

## 筛选器
- [ ] "全部" → 393 张循环
- [ ] "只看待巩固" → 仅上划过的
- [ ] "只看未学过" → 排除已标记
- [ ] "随机乱序" → 切换后顺序变
- [ ] 筛选切换时当前卡尽量保留

## 洗脑模式
- [ ] 点 🧠 → 顶部变红，卡片显示正面
- [ ] 听到单词播 10 遍 + 汉字脉冲
- [ ] 10 遍后"叮"声
- [ ] 顶部显示例句 1 日文 + 播 2 遍
- [ ] "叮"声
- [ ] 顶部显示例句 2 日文 + 播 2 遍
- [ ] 自动进下一张，颜色换，序列重来
- [ ] 洗脑中上/下划 → 立即跳下一张，新序列开始
- [ ] 洗脑中双击 → 暂停 / 继续
- [ ] 点 🧠 或 Esc → 退出，恢复正常

## 设置 & 编辑
- [ ] ⚙ 弹出设置模态
- [ ] TTS 语速滑块 → 下次发音速度变化
- [ ] 清空学习记录 → 确认后统计归零，覆盖保留
- [ ] 编辑当前卡 → 改字段 → 保存 → 立即生效
- [ ] 编辑后刷新 → 修改保留
- [ ] 导出修改 → 下载 cards.overrides.json

## iOS 专项
- [ ] 双击卡片不会触发页面缩放
- [ ] 长按卡片不弹选字菜单
- [ ] 上下划不触发页面滚动回弹
- [ ] 从主屏添加到主屏 → 全屏启动（apple-mobile-web-app-capable 生效）
```

- [ ] **Step 2: Mac Safari 跑一遍测试**

打开 http://localhost:8000，逐项勾选。记录未通过项。

- [ ] **Step 3: iPhone Safari 跑一遍测试**

Mac 上运行 `python3 -m http.server 8000` 确认绑定 0.0.0.0：改为 `python3 -m http.server 8000 --bind 0.0.0.0`。用 iPhone Safari 打开 `http://<mac-ip>:8000`。逐项勾选。

- [ ] **Step 4: 修复发现的问题（可能迭代几轮）**

每个修复独立 commit，commit message 前缀 `fix:`。

- [ ] **Step 5: commit 测试清单**

```bash
git add docs/testing-checklist.md
git commit -m "docs: add manual testing checklist"
```

---

## Task 20: GitHub 仓库 + Pages 部署

**Files:**
- 无新文件；只是 push + 配置 Pages

- [ ] **Step 1: 创建 GitHub 仓库（用户手动或 gh CLI）**

推荐用 gh CLI：
```bash
gh repo create n1card --public --source=. --remote=origin --push
```
或手动：在 github.com 新建空仓库 `n1card`，然后：
```bash
git remote add origin git@github.com:<username>/n1card.git
git branch -M main
git push -u origin main
```

- [ ] **Step 2: 启用 GitHub Pages**

在仓库 Settings → Pages：
- Source: Deploy from a branch
- Branch: `main` / `(root)`
- Save

等 1-2 分钟，页面会显示 `Your site is live at https://<username>.github.io/n1card/`。

- [ ] **Step 3: 公网访问测试**

- Mac Safari 打开 Pages URL：整体功能正常（注意所有资源路径要相对，不能以 `/` 开头）
- iPhone Safari 打开 Pages URL：核心路径（启动、发音、翻面、上下划、洗脑）正常

常见坑：
- `<link rel="stylesheet" href="styles.css">` 和 `<script src="app.js">` 本已用相对路径 ✓
- `fetch('data/cards.json')` 也是相对路径 ✓

- [ ] **Step 4: 添加 Pages URL 到 README**

```markdown
## 在线访问

https://<username>.github.io/n1card/
```

- [ ] **Step 5: commit + push**

```bash
git add README.md
git commit -m "docs: add deployed Pages URL"
git push
```

- [ ] **Step 6: iPhone 添加到主屏**

iPhone Safari 打开 URL → 分享 → 添加到主屏幕。测试从主屏图标启动是否全屏。

---

## Self-Review（计划已写完，下面自查一遍）

**Spec coverage 检查：**

| Spec 章节 | 覆盖 Task |
|---|---|
| §1 目标 & 约束 | Task 1（viewport）+ 整体架构 |
| §2 架构（模块边界） | Task 5-16 分别实现 |
| §3.1 卡片 schema | Task 2（种子）+ Task 3（校验） |
| §3.2 localStorage schema | Task 9（progress/settings）+ Task 15（overrides） |
| §3.3 去重 | Task 4 step 1 / Task 18 step 1 |
| §4 视觉 | Task 5（正面）+ Task 6（背面）+ Task 11（顶部）|
| §5.1 手势 | Task 7（tap/double）+ Task 9/12（swipe→progress）|
| §5.2 顶部栏 | Task 11（渲染）+ Task 12（筛选） |
| §5.3 编辑面板 | Task 15（入口）+ Task 16（实现） |
| §6 洗脑模式（序列、手势、音频、配比） | Task 13 + Task 14 |
| §7 进度 & 会话 | Task 9 + Task 12（筛选保位） |
| §8 数据生成策略（两阶段、质量） | Task 4（MVP）+ Task 18（全量） |
| §9 错误处理 | Task 9（Progress fallback）+ Task 10（TTS）+ Task 17 |
| §10 测试（校验 + 手动清单） | Task 3 + Task 19 |
| §12 里程碑 10（GitHub Pages） | Task 20 |

**Placeholder 扫描**：grep 了一下，没有 TODO/TBD/"implement later"/"similar to"。每个 code step 都是完整代码。

**类型一致性**：
- `Progress.mark(id, status)` status 是 `"known" | "unknown"` 全文统一
- `TTSEngine.speak(text, opts)` 全文签名一致
- `Router.visibleCards` 在 Task 12 引入后所有后续 Task 用的是它而非 allCards
- `CardView.renderFront/renderBack(card, color)` 签名一致

**Execution handoff**：见文末。
