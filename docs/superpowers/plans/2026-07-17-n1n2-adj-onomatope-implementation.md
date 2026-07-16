# N1/N2 形容词 + 拟声词扩容 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** N1/N2 新增形容词、拟声词两种词性的自由刷卡+测验学习入口，进度和动词完全独立；首页 N1/N2 入口变成词性选择页。

**Architecture:** 复用现有 `app.js`/`Router`/`CardView`/`QuizMode`/`Progress` 全部逻辑，不改动任何现有分支——形容词/拟声词页面只是往 `app.js` 里注入不同的 `window.LEVEL_NAME`/`CARD_DATA_URL`，靠现有的 `LEVEL_KEY` 命名空间机制自动获得独立的 localStorage 存储。新增一个 `window.SIMPLE_MODE` 标志位，`TopBar` 据此多渲染一个测验入口按钮。内容生成（4 批词表）作为独立任务，产出符合现有 `scripts/validate-cards.js` schema 的 JSON 文件。

**Tech Stack:** 原生 JS/HTML（无框架，无构建），JLPT 词汇内容生成（人工可核对的 AI 生成内容），复用 `scripts/validate-cards.js`（不改这个脚本）。

## Global Constraints

- 新数据文件 schema 和 `data/cards.json` 完全一致，用 `scripts/validate-cards.js data/cards-XXX.json` 校验，不改校验脚本
- 拟声词卡片 `word` 字段必须等于 `kana` 字段（复用现有 `card.word === card.kana` 判断"选语义题"的机制）
- 形容词卡片不写 `transitivity` 字段；`type` 字段填 `"い形容詞"` 或 `"な形容詞"`；拟声词两个字段都不写
- 不改动 N3/N4/N5 的首页入口（还是直接指向各自的 `n{X}.html`）
- 不做分批学新/时间窗/强制测验/早复习/一般复习——形容词/拟声词页面就是普通的自由刷卡 + 手动测验入口
- 不改动现有动词（`n1.html`~`n5.html`）的任何行为

---

### Task 1: `app.js` — TopBar 测验入口

**Files:**
- Modify: `app.js`（`TopBar.render()`）

**Interfaces:**
- Consumes: `window.SIMPLE_MODE`（后续任务里新页面会注入这个全局变量，本任务先只管 TopBar 怎么响应它）、现有 `QuizMode.start()`/`Router.visibleCards`/`DataStore.allCards()`
- Produces: 当 `window.SIMPLE_MODE === true` 时，TopBar 上出现一个"🎯 测验"按钮，点击后用当前筛选出的卡片池发起一场测验

- [ ] **Step 1: 修改 `TopBar.render()`**

在 `app.js` 里找到 `TopBar.render()` 方法中的：

```js
    topbar.innerHTML = `
      ${leftHtml}
      <div class="topbar-center">已掌握 ${stats.known} · 待巩固 ${stats.unknown}</div>
      <div class="topbar-right">
        ${filterHtml}
        <a class="settings-btn" href="/grammar/" style="text-decoration: none;" title="切换到文法">📖</a>
        <button class="settings-btn" id="settings-btn">⚙</button>
        <button class="brainwash-btn" id="brainwash-btn" title="洗脑模式">🧠<span class="brainwash-label"> 洗脑</span></button>
      </div>
    `;
    if (showFilter) {
      topbar.querySelector('#filter-select').value = Progress.getFilter();
      topbar.querySelector('#filter-select').addEventListener('change', (e) => {
        Router.applyFilter(e.target.value);
      });
    }
    topbar.querySelector('#settings-btn').addEventListener('click', () => SettingsPanel.open());
    topbar.querySelector('#brainwash-btn').addEventListener('click', () => {
      if (typeof BrainwashMode !== 'undefined') BrainwashMode.toggle?.();
    });
  }
};
```

改成：

```js
    const quizEntryHtml = window.SIMPLE_MODE ? `<button class="brainwash-btn" id="quiz-entry-btn" title="测验">🎯 测验</button>` : '';
    topbar.innerHTML = `
      ${leftHtml}
      <div class="topbar-center">已掌握 ${stats.known} · 待巩固 ${stats.unknown}</div>
      <div class="topbar-right">
        ${filterHtml}
        <a class="settings-btn" href="/grammar/" style="text-decoration: none;" title="切换到文法">📖</a>
        <button class="settings-btn" id="settings-btn">⚙</button>
        <button class="brainwash-btn" id="brainwash-btn" title="洗脑模式">🧠<span class="brainwash-label"> 洗脑</span></button>
        ${quizEntryHtml}
      </div>
    `;
    if (showFilter) {
      topbar.querySelector('#filter-select').value = Progress.getFilter();
      topbar.querySelector('#filter-select').addEventListener('change', (e) => {
        Router.applyFilter(e.target.value);
      });
    }
    topbar.querySelector('#settings-btn').addEventListener('click', () => SettingsPanel.open());
    topbar.querySelector('#brainwash-btn').addEventListener('click', () => {
      if (typeof BrainwashMode !== 'undefined') BrainwashMode.toggle?.();
    });
    if (window.SIMPLE_MODE) {
      topbar.querySelector('#quiz-entry-btn').addEventListener('click', () => {
        QuizMode.start({
          queue: Router.visibleCards,
          pool: DataStore.allCards(),
          title: '测验',
          onComplete: () => TopBar.render()
        });
      });
    }
  }
};
```

- [ ] **Step 2: 语法检查**

Run: `node --check app.js`
Expected: 无输出

- [ ] **Step 3: 手动验证**

因为现在还没有页面会设置 `window.SIMPLE_MODE = true`（Task 7 才新建那些页面），这一步先只确认**不破坏现状**：

Run: `python3 -m http.server 8000`，打开 `http://localhost:8000/n1.html`

- [ ] TopBar 上没有出现"🎯 测验"按钮（`window.SIMPLE_MODE` 未定义，等价于 falsy）
- [ ] 其余 TopBar 按钮（📖/⚙/🧠）功能和改动前一致
- [ ] Console 无报错

- [ ] **Step 4: 提交**

```bash
git add app.js
git commit -m "$(cat <<'EOF'
app.js: TopBar 新增 SIMPLE_MODE 测验入口

window.SIMPLE_MODE 为 true 时显示"🎯 测验"按钮，用当前筛选池
发起一场 QuizMode 测验；现有页面未设置这个变量，行为不变。

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: 内容生成 prompt 文件（形容词 + 拟声词）

**Files:**
- Create: `data/prompts/generate-batch-adj.md`
- Create: `data/prompts/generate-batch-onomatope.md`

**Interfaces:**
- 无代码接口，产出两份生成指导文档，供 Task 3-6 的内容生成任务遵循

- [ ] **Step 1: 创建 `data/prompts/generate-batch-adj.md`**

```markdown
# N1/N2 形容词 Card Batch Generation Prompt

改编自 `generate-batch.md`（动词版），用于生成形容词批次。差异只在 `type` 字段取值和无 `transitivity` 字段，助记法规则完全复用动词版本。

## Input

一份 JLPT 指定级别（N1 或 N2）的常见形容词列表（一行一个），不要求调用方提供——生成时按标准 JLPT 大纲自行汇总该级别的常见形容词，避免和该级别动词词库、以及本项目已有的其它级别形容词批次重复。

## Output

JSON 对象 `{ "version": 1, "cards": [...] }`，每张卡片符合下面 schema：

- `id`（number）：调用方指定起始偏移量后的 1-based 序号
- `word`（string）：形容词原形（含汉字，如有）
- `kana`（string）：平假名读音，仅 U+3040-309F + 30FC（无汉字、无片假名）
- `accent`（string|null）：东京音调数字字符串，不确定就填 `null`，不要瞎猜
- `type`（string|null）：`"い形容詞"` 或 `"な形容詞"`，二选一
- `meanings`（string[]）：1-4 条简洁中文释义，每条 5-15 字
- `mnemonic`（string）：**短语叙事体助记法**——把读音拆成 2-4 个已知日语词块，读音拼接等于目标读音，再把这些词块组成一个有意义的日语迷你短语，短语要能勾连回形容词的含义。结尾用（）给一句中文记忆钩子，把短语和含义连起来。

  **格式：**
  ```
  词块(读音) + 词块(读音) + 词块(读音) ⇒ <日语迷你短语>（<中文记忆钩子>）
  ```

  **助记法必须过的三关（和动词版完全一致）：**
  1. **音准**：词块读音拼接 = 目标假名。（允许一处轻微凑合，标注ほぼ）
  2. **短语连贯**：词块拼成一个真实或近似真实的日语短语/句子
  3. **含义钩子**：短语要能唤起一个和形容词含义呼应的画面或故事，中文注释要把短语和含义连起来

  **参考示例（形容词专用，风格对齐 `generate-batch.md` 里动词的"金标准示例"）：**
  - **儚い（はかない）** → `は + 果(か) + ない ⇒ 派果ない（派头都没有结果，转瞬即逝的虚幻）`
  - **潔い（いさぎよい）** → `勇(いさ)ぎ + 良い(よい) ⇒ 勇ぎ良い（勇敢利落，毫不留恋）`

  **要避免的坏助记法**（同动词版）：只有读音链没有短语、只讲汉字结构不讲读音、没有锚点词的纯音节堆砌。

- `examples`：**恰好 2** 个对象，每个 `{ jp, cn }`。用该级别真实语境的例句，不要幼儿园日语。

## Quality checklist

- [ ] `accent` 只在有把握时填，`null` 完全可以接受
- [ ] 助记法过三关：音准 + 短语连贯 + 含义钩子
- [ ] 中文钩子把日语短语和形容词含义连起来
- [ ] 例句像真实的该级别日语
- [ ] `kana` 字段纯平假名（跑 `scripts/validate-cards.js` 校验）
- [ ] 不写 `transitivity` 字段（形容词不适用）
- [ ] 生成完之后人工抽查一部分词条的读音/词性/释义是否准确——AI 汇总的 JLPT 词表不能保证零错漏

## Reference

参考 `data/prompts/generate-batch.md`（动词版）和 `data/cards.seed.json` 里的助记法叙事风格。
```

- [ ] **Step 2: 创建 `data/prompts/generate-batch-onomatope.md`**

```markdown
# N1/N2 拟声词 Card Batch Generation Prompt

改编自 `generate-batch.md`（动词版），用于生成拟声拟态词批次。和动词/形容词版本的关键差异：`word` 必须等于 `kana`（拟声词本来就基本是纯假名书写），助记法不强求硬凑"三关"，可以直接用重复音/拟态意象。

## Input

一份 JLPT 指定级别（N1 或 N2）的常见拟声拟态词列表（一行一个），不要求调用方提供——按标准 JLPT 大纲自行汇总该级别常见拟声拟态词，避免和项目里已有的 `onomatope/` 模块内容、以及本项目其它级别批次重复（`onomatope/` 是完全独立的模块，不用去核对那边的词表，只要保证这次生成的批次内部不重复即可）。

## Output

JSON 对象 `{ "version": 1, "cards": [...] }`，每张卡片符合下面 schema：

- `id`（number）：调用方指定起始偏移量后的 1-based 序号
- `word`（string）：**必须和 `kana` 字段完全相同**——拟声拟态词写作纯假名
- `kana`（string）：同 `word`，纯平假名，仅 U+3040-309F + 30FC
- `accent`（string|null）：不确定就填 `null`
- `type`：不写这个字段（拟声词不适用动词/形容词的词性分类）
- `meanings`（string[]）：1-4 条简洁中文释义，每条 5-15 字，注意拟声拟态词的释义通常需要描述"什么状态/怎样的动作声音"，不是单个词能概括的就多写几条
- `mnemonic`（string）：拟声拟态词的助记法**不强求音节拆分+短语拼接**（很多拟声词本身就是 AABB 型重复音，比如「そわそわ」「はらはら」，硬拆音节没有意义）。改用**意象联想**：描述这个声音/动作让人联想到的具体画面或场景，帮助记住"这个音对应这种状态"。如果这个词能拆出有意义的词块并且凑得出短语，也可以沿用动词版的短语叙事体，两种写法都可以，以"好记"为准，不强行统一格式。

  **示例：**
  - **どきどき** → `心脏怦怦跳的拟声——想象紧张或兴奋时心跳声"どき、どき"，对应"忐忑/小鹿乱撞"`
  - **てきぱき** → `て(手) + き(利き) + ぱき(干脆的破裂声) ⇒ 手际干脆利落 → 麻利，办事不拖泥带水`

- `examples`：**恰好 2** 个对象，每个 `{ jp, cn }`。例句要能体现拟声词的语境用法（通常搭配「〜する」或直接修饰动作）。

## Quality checklist

- [ ] `word` 和 `kana` 完全相同
- [ ] `kana` 纯平假名（跑 `scripts/validate-cards.js` 校验）
- [ ] 不写 `type`/`transitivity` 字段
- [ ] 助记法能帮助区分该词和形近的近义拟声词（如果有明显容易混淆的近义词，在助记法里提一句区别，参考 `onomatope/data/cards.json` 里"🔍 近义区别"这种写法风格，但不强制）
- [ ] 例句像真实语境用法
- [ ] 生成完之后人工抽查一部分词条的读音/释义是否准确
```

- [ ] **Step 3: 提交**

```bash
git add data/prompts/generate-batch-adj.md data/prompts/generate-batch-onomatope.md
git commit -m "$(cat <<'EOF'
data/prompts: 新增形容词、拟声词批次生成 prompt

改编自现有动词版 generate-batch.md，形容词沿用完整的音准+短语+
含义钩子三关助记法，拟声词放宽成不强制拆音节、以意象联想为主。

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: 生成 N1 形容词数据

**Files:**
- Create: `data/cards-n1-adj.json`

**Interfaces:**
- Consumes: `data/prompts/generate-batch-adj.md`（Task 2 产出的生成指导）
- Produces: 一份通过 `scripts/validate-cards.js` 校验的 N1 形容词卡片数据，供 Task 7 的 `n1-adj.html` 使用

- [ ] **Step 1: 按 `data/prompts/generate-batch-adj.md` 生成 60~80 个 N1 形容词**

按标准 JLPT N1 大纲汇总常见形容词（い形容詞/な形容詞都包括），逐个按 prompt 里的 schema 和助记法规则生成卡片，`id` 从 1 开始连续编号，写入 `data/cards-n1-adj.json`，顶层结构 `{ "version": 1, "cards": [...] }`。

- [ ] **Step 2: 跑校验**

Run: `node scripts/validate-cards.js data/cards-n1-adj.json`
Expected: `ok: N cards valid`（N 是实际生成的词条数，应在 60~80 之间）

- [ ] **Step 3: 自查**

对照 `data/prompts/generate-batch-adj.md` 的 Quality checklist 过一遍：抽查至少 10 个词条的读音/词性/释义是否符合你对 JLPT N1 词汇的认知，助记法是否真的能帮助记忆（不是凑数）。如果发现明显错误就地修正后重新跑 Step 2 的校验。

- [ ] **Step 4: 提交**

```bash
git add data/cards-n1-adj.json
git commit -m "$(cat <<'EOF'
data: 新增 N1 形容词卡片数据

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: 生成 N1 拟声词数据

**Files:**
- Create: `data/cards-n1-onomatope.json`

**Interfaces:**
- Consumes: `data/prompts/generate-batch-onomatope.md`（Task 2 产出）
- Produces: 一份通过校验的 N1 拟声词卡片数据，供 Task 7 的 `n1-onomatope.html` 使用

- [ ] **Step 1: 按 `data/prompts/generate-batch-onomatope.md` 生成 60~80 个 N1 拟声拟态词**

按标准 JLPT N1 大纲汇总常见拟声拟态词，`word` 必须等于 `kana`，`id` 从 1 开始连续编号，写入 `data/cards-n1-onomatope.json`。

- [ ] **Step 2: 跑校验**

Run: `node scripts/validate-cards.js data/cards-n1-onomatope.json`
Expected: `ok: N cards valid`

- [ ] **Step 3: 自查**

对照 Quality checklist，额外确认**每一条 `word` 都和 `kana` 完全相同**（这是拟声词批次特有的强约束，校验脚本本身不检查这一条相等关系，只检查 `kana` 是纯假名——需要人工/脚本额外确认）。抽查至少 10 个词条读音/释义准确性。

- [ ] **Step 4: 提交**

```bash
git add data/cards-n1-onomatope.json
git commit -m "$(cat <<'EOF'
data: 新增 N1 拟声拟态词卡片数据

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: 生成 N2 形容词数据

**Files:**
- Create: `data/cards-n2-adj.json`

**Interfaces:**
- Consumes: `data/prompts/generate-batch-adj.md`
- Produces: 一份通过校验的 N2 形容词卡片数据，供 Task 7 的 `n2-adj.html` 使用

- [ ] **Step 1: 按 `data/prompts/generate-batch-adj.md` 生成 60~80 个 N2 形容词**

按标准 JLPT N2 大纲汇总，注意 N2 难度应低于 N1（更常见、更基础的形容词），避免和 N1 批次里选到的词重复。

- [ ] **Step 2: 跑校验**

Run: `node scripts/validate-cards.js data/cards-n2-adj.json`
Expected: `ok: N cards valid`

- [ ] **Step 3: 自查**

同 Task 3 Step 3。

- [ ] **Step 4: 提交**

```bash
git add data/cards-n2-adj.json
git commit -m "$(cat <<'EOF'
data: 新增 N2 形容词卡片数据

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: 生成 N2 拟声词数据

**Files:**
- Create: `data/cards-n2-onomatope.json`

**Interfaces:**
- Consumes: `data/prompts/generate-batch-onomatope.md`
- Produces: 一份通过校验的 N2 拟声词卡片数据，供 Task 7 的 `n2-onomatope.html` 使用

- [ ] **Step 1: 按 `data/prompts/generate-batch-onomatope.md` 生成 60~80 个 N2 拟声拟态词**

按标准 JLPT N2 大纲汇总，难度低于 N1 批次，避免和 N1 拟声词批次重复。

- [ ] **Step 2: 跑校验**

Run: `node scripts/validate-cards.js data/cards-n2-onomatope.json`
Expected: `ok: N cards valid`

- [ ] **Step 3: 自查**

同 Task 4 Step 3（含 `word`===`kana` 的额外确认）。

- [ ] **Step 4: 提交**

```bash
git add data/cards-n2-onomatope.json
git commit -m "$(cat <<'EOF'
data: 新增 N2 拟声拟态词卡片数据

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: 页面骨架 + 词性选择页 + 首页路由

**Files:**
- Create: `word-type-picker.html`
- Create: `n1-adj.html`
- Create: `n1-onomatope.html`
- Create: `n2-adj.html`
- Create: `n2-onomatope.html`
- Modify: `index.html`（N1/N2 入口 `href`）

**Interfaces:**
- Consumes: Task 1 的 `window.SIMPLE_MODE` TopBar 支持、Task 3-6 产出的 4 个数据文件（`data/cards-n1-adj.json` 等）
- Produces: 完整的用户可达路径：首页 → 词性选择页 → 形容词/拟声词页面

- [ ] **Step 1: 创建 `word-type-picker.html`**

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
  <title>选择词性 · 日语速记</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html, body { background: #111; color: #fff; font-family: "Hiragino Sans", "Yu Gothic", "PingFang SC", -apple-system, sans-serif; }
    .wrap { max-width: 600px; margin: 0 auto; padding: 40px 20px; }
    h1 { font-size: 24px; font-weight: 600; margin-bottom: 24px; }
    .back { display: inline-block; margin-bottom: 20px; color: #888; text-decoration: none; font-size: 14px; }
    .level-list { display: flex; flex-direction: column; gap: 12px; }
    .level-btn {
      display: flex; justify-content: space-between; align-items: center;
      padding: 20px 24px; border-radius: 14px;
      text-decoration: none; color: #fff;
      background: #2a2a2a; border: 1px solid #444;
      box-shadow: 0 4px 12px rgba(0,0,0,0.25);
      transition: transform 0.1s, box-shadow 0.15s;
    }
    .level-btn:active { transform: scale(0.98); box-shadow: 0 2px 6px rgba(0,0,0,0.3); }
    .level-btn .lv { font-size: 20px; font-weight: 700; }
    .level-btn .meta { font-size: 13px; opacity: 0.75; text-align: right; flex: 1; margin: 0 12px; }
    .level-btn .arrow { font-size: 22px; opacity: 0.7; }
  </style>
</head>
<body>
  <div class="wrap">
    <a class="back" href="index.html">‹ 返回</a>
    <h1 id="picker-title">选择词性</h1>
    <div class="level-list" id="picker-list"></div>
  </div>
  <script>
    const params = new URLSearchParams(location.search);
    const level = (params.get('level') || 'n1').toLowerCase();
    const LEVEL_LABEL = level.toUpperCase();
    document.getElementById('picker-title').textContent = `📚 ${LEVEL_LABEL} 选择词性`;
    const OPTIONS = [
      { label: '🈁 动词', href: `${level}.html`, desc: '完整学习体系：分批学新+早复习+一般复习' },
      { label: '🎨 形容词', href: `${level}-adj.html`, desc: '自由刷卡 + 测验' },
      { label: '🔊 拟声词', href: `${level}-onomatope.html`, desc: '自由刷卡 + 测验' },
    ];
    document.getElementById('picker-list').innerHTML = OPTIONS.map(o => `
      <a class="level-btn" href="${o.href}">
        <span class="lv">${o.label}</span>
        <span class="meta">${o.desc}</span>
        <span class="arrow">›</span>
      </a>
    `).join('');
  </script>
</body>
</html>
```

- [ ] **Step 2: 创建 `n1-adj.html`**

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
  <title>N1 形容词速记</title>
  <link rel="stylesheet" href="styles.css?v=47">
</head>
<body>
  <div id="app">
    <header id="topbar"></header>
    <main id="cardstage"></main>
  </div>
  <script>
    window.LEVEL_NAME = 'N1-ADJ';
    window.CARD_DATA_URL = 'data/cards-n1-adj.json';
    window.SIMPLE_MODE = true;
  </script>
  <script type="module" src="app.js?v=47"></script>
</body>
</html>
```

- [ ] **Step 3: 创建 `n1-onomatope.html`**

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
  <title>N1 拟声词速记</title>
  <link rel="stylesheet" href="styles.css?v=47">
</head>
<body>
  <div id="app">
    <header id="topbar"></header>
    <main id="cardstage"></main>
  </div>
  <script>
    window.LEVEL_NAME = 'N1-ONOMATOPE';
    window.CARD_DATA_URL = 'data/cards-n1-onomatope.json';
    window.SIMPLE_MODE = true;
  </script>
  <script type="module" src="app.js?v=47"></script>
</body>
</html>
```

- [ ] **Step 4: 创建 `n2-adj.html`**

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
  <title>N2 形容词速记</title>
  <link rel="stylesheet" href="styles.css?v=47">
</head>
<body>
  <div id="app">
    <header id="topbar"></header>
    <main id="cardstage"></main>
  </div>
  <script>
    window.LEVEL_NAME = 'N2-ADJ';
    window.CARD_DATA_URL = 'data/cards-n2-adj.json';
    window.SIMPLE_MODE = true;
  </script>
  <script type="module" src="app.js?v=47"></script>
</body>
</html>
```

- [ ] **Step 5: 创建 `n2-onomatope.html`**

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
  <title>N2 拟声词速记</title>
  <link rel="stylesheet" href="styles.css?v=47">
</head>
<body>
  <div id="app">
    <header id="topbar"></header>
    <main id="cardstage"></main>
  </div>
  <script>
    window.LEVEL_NAME = 'N2-ONOMATOPE';
    window.CARD_DATA_URL = 'data/cards-n2-onomatope.json';
    window.SIMPLE_MODE = true;
  </script>
  <script type="module" src="app.js?v=47"></script>
</body>
</html>
```

- [ ] **Step 6: 修改 `index.html` 的 N1/N2 入口**

找到：

```html
      <a class="level-btn lv-n2" href="n2.html">
        <span class="lv">N2</span>
        <span class="meta"><span class="count">200 词</span>中高级</span>
        <span class="arrow">›</span>
      </a>
      <a class="level-btn lv-n1" href="n1.html">
        <span class="lv">N1</span>
        <span class="meta"><span class="count">394 词</span>高级精通</span>
        <span class="arrow">›</span>
      </a>
```

改成：

```html
      <a class="level-btn lv-n2" href="word-type-picker.html?level=n2">
        <span class="lv">N2</span>
        <span class="meta"><span class="count">200 词</span>中高级</span>
        <span class="arrow">›</span>
      </a>
      <a class="level-btn lv-n1" href="word-type-picker.html?level=n1">
        <span class="lv">N1</span>
        <span class="meta"><span class="count">394 词</span>高级精通</span>
        <span class="arrow">›</span>
      </a>
```

（N5/N4/N3 三个入口不动，还是 `href="n5.html"` 等）

- [ ] **Step 7: 手动验证**

Run: `python3 -m http.server 8000`，打开 `http://localhost:8000/index.html`

- [ ] 点 N1 → 跳转到词性选择页，标题显示"📚 N1 选择词性"，能看到"动词/形容词/拟声词"三个选项
- [ ] 点"动词" → 进入 `n1.html`，行为和改动前完全一致
- [ ] 返回选择页，点"形容词" → 进入 `n1-adj.html`，直接是自由刷卡界面，能看到卡片、能滑卡
- [ ] TopBar 上能看到"🎯 测验"按钮，点击后进入四选一测验
- [ ] 点"拟声词" → 进入 `n1-onomatope.html`，同样自由刷卡 + 测验
- [ ] 用同样的流程走一遍 N2（点 N2 → 词性选择页 → 形容词/拟声词页面）
- [ ] 在形容词页面滑几张卡，切到 `n1.html`（动词）看"已掌握/待巩固"计数没有被形容词页面的操作影响，反之亦然
- [ ] N3/N4/N5 首页入口还是直接进各自页面，没有词性选择页
- [ ] Console 全程无报错

- [ ] **Step 8: 提交**

```bash
git add word-type-picker.html n1-adj.html n1-onomatope.html n2-adj.html n2-onomatope.html index.html
git commit -m "$(cat <<'EOF'
新增词性选择页 + N1/N2 形容词/拟声词页面

首页 N1/N2 入口改成先进词性选择页，动词选项进现有页面不变，
形容词/拟声词进新页面（独立 LEVEL_NAME，自由刷卡 + 测验入口）。

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: 完整回归 + 测试清单归档

**Files:**
- Modify: `docs/testing-checklist.md`

**Interfaces:**
- 无代码接口，本任务是收尾验证

- [ ] **Step 1: 跑全部单元测试**

Run: `npm test`
Expected: PASS，全部测试绿色（本次改动没有新增/修改任何被测的纯函数，测试数量应和改动前一致）

- [ ] **Step 2: 跑全部 5 份卡片数据的校验（原有 + 新增 4 份）**

Run:
```bash
npm run validate
node scripts/validate-cards.js data/cards-n1-adj.json
node scripts/validate-cards.js data/cards-n1-onomatope.json
node scripts/validate-cards.js data/cards-n2-adj.json
node scripts/validate-cards.js data/cards-n2-onomatope.json
```
Expected: 5 条命令全部输出 `ok: N cards valid`

- [ ] **Step 3: 补充手动测试清单**

打开 `docs/testing-checklist.md`，在文件末尾追加：

```markdown
## N1/N2 形容词 + 拟声词扩容（2026-07-17）

- [ ] 首页 N1/N2 入口进词性选择页，N3/N4/N5 入口不变（直接进各自页面）
- [ ] 词性选择页三个选项都能正常跳转
- [ ] 形容词/拟声词页面默认自由刷卡，没有分批/时间窗提示
- [ ] TopBar"🎯 测验"按钮能正常发起四选一测验
- [ ] 形容词测验题型是"看词选读音"，拟声词测验题型是"看假名选语义"
- [ ] 形容词/拟声词/动词三者的已掌握/待巩固计数互不影响
- [ ] N1、N2 各自的形容词/拟声词进度也互不影响
- [ ] 人工抽查过 4 批新数据的读音/词性/释义准确性
```

- [ ] **Step 4: 提交**

```bash
git add docs/testing-checklist.md
git commit -m "$(cat <<'EOF'
docs: 补充 N1/N2 形容词+拟声词扩容的手动测试清单

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```
