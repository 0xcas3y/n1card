# N4 词库扩容（词性拆分，复用 N5 已验证流程）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 N4 词库从现有的纯动词库（150 词）扩容到覆盖名词/形容词/副词/オノマトペ 4 个新词性子库，目标总量对齐官方 JLPT N4 大纲（约 1500 词）。

**Architecture:** 复用已经在 `main` 上验证过的 N5 扩容流程：`scripts/generate-cards.js`（已存在，本次同样不实际调用其 API 路径，改用 subagent 在会话内直接生成，走 Claude Code 订阅额度）、`scripts/validate-cards.js`（不改）、`npm run validate` 的批量校验（已支持任意 `data/cards*.json`，不用再改 `package.json`）。新建 N4 专用 prompt 模板、原始词表、4 个数据文件、4 个学习页面，接入已经泛化好的 `word-type-picker.html`（当前只对 `n1`/`n5` 开放全部 4 个词性选项，需要把 `n4` 也加进去）。

**Tech Stack:** 纯前端静态站点（无构建步骤）、Node.js `--test`、WebSearch/WebFetch 用于词表采集、Claude subagent 用于内容生成（非 Anthropic API 直连）。

## Global Constraints

- Schema 和现有 `data/cards.json` 完全一致，**不修改** `scripts/validate-cards.js`
- 拟声词 `word` 必须等于 `kana`
- 例句难度必须匹配 N4 等级（比 N5 复杂，但不能出现 N3 以上的词汇/句型）
- 生成后必须过 `scripts/validate-cards.js`
- 内容准确性无法自动校验，只能人工抽查；**必须做跨文件重复例句/词性归类检查**（N5 阶段两轮 review 都在这里栽了跟头：合法兼类词如果两个文件例句一字不差、或者词被错误分类到不该在的文件里，都要在生成后立刻自查，不要等最终 review 才发现）
- 词性配额不预设固定比例，以实际能收集到的词表规模为准
- 生成机制：不使用 `scripts/generate-cards.js` 的真实 API 调用路径（会产生 Anthropic API 独立计费，和 Claude Code 订阅是两套账单），改用 controller 直接派发 subagent 生成内容、合并、renumber id、写入最终文件——这是 N5 阶段已经过用户明确批准的既定模式，本次直接沿用，不用再问
- 本计划范围仅 N4——N3 是下一个独立计划，复用同一套 prompt 风格和流程

---

## Task 1: N4 专用生成 prompt（名词/形容词/副词/オノマトペ）

**Files:**
- Create: `data/prompts/generate-batch-n4-noun.md`
- Create: `data/prompts/generate-batch-n4-adj.md`
- Create: `data/prompts/generate-batch-n4-adverb.md`
- Create: `data/prompts/generate-batch-n4-onomatope.md`

改编自 `data/prompts/generate-batch-n5-*.md`（已在 main 上），schema、字段约定完全不变，只调整两处：①难度上调到 N4 等级（比 N5 复杂的句型/词汇，但不能超出 N3）；②补充 N5 阶段两轮 review 踩过的坑，作为生成时的前置提醒。

- [ ] **Step 1: 创建 `data/prompts/generate-batch-n4-noun.md`**

```markdown
# N4 名词 Card Batch Generation Prompt

改编自 `generate-batch-n5-noun.md`，用于生成 N4 等级名词批次。差异：①难度上调到 N4——例句可以用更复杂的从句/时态（て形连接、简体形、基础被动/使役等 N4 语法点），但不能出现 N3 以上词汇；②词表由调用方提供，不自行汇总。

## Input

一份 N4 等级常见名词列表（一行一个，调用方直接给出，可能带（する）标记表示可作サ变动词）。

## Output

JSON 对象 `{ "version": 1, "cards": [...] }`，schema 和字段约定与 `generate-batch-n5-noun.md` 完全一致：`id`/`word`/`kana`/`accent`/`meanings`/`mnemonic`/`examples`，不写 `type`/`transitivity`。

**难度差异**：
- `meanings`：可以比 N5 版本略精炼，不必逐字直白
- `mnemonic`：助记法风格不变
- `examples`：**恰好 2** 个 `{ jp, cn }`，句子可以用 N4 语法点（て形、た形、基础被动/使役、简体形对话），但词汇不能超出 N4 大纲

## Quality checklist

- [ ] 例句只用 N4 及以下等级词汇，句型可以比 N5 复杂但不超 N3
- [ ] `kana` 字段纯平假名
- [ ] 不写 `type`/`transitivity` 字段
- [ ] 标了（する）的词，例句体现サ变动词用法
- [ ] **生成后自查一遍：这批词里有没有词已经在同一批次内重复？有没有明显该属于形容词/副词但被塞进名词表的？**（N5 阶段 嫌い/沢山 两个词就是分类错误漏到了最终 review 才被抓到，这次要在生成时就自查）

## Reference

参考 `data/prompts/generate-batch-n5-noun.md`，例句难度上调一级。
```

- [ ] **Step 2: 创建 `data/prompts/generate-batch-n4-adj.md`**

```markdown
# N4 形容词 Card Batch Generation Prompt

改编自 `generate-batch-n5-adj.md`，用于生成 N4 等级形容词批次。差异：难度上调到 N4。

## Input

一份 N4 等级常见形容词列表（一行一个，调用方直接给出）。

## Output

JSON 对象 `{ "version": 1, "cards": [...] }`，schema 和字段约定与 `generate-batch-n5-adj.md` 完全一致：`id`/`word`/`kana`/`accent`/`type`（`"い形容詞"`|`"な形容詞"`）/`meanings`/`mnemonic`/`examples`。

**特别提醒**：只有真正在标准词典里被归类为 な形容詞 的词才能写 `な形容詞`——像「たくさん」这种不能接「な」直接修饰名词的词（只能用「の」），不算な形容词，不要收进这个文件。判断标准：这个词能不能自然地说「〜な＋名词」？能就是な形容词，不能就不是。

**难度差异**：
- `examples`：**恰好 2** 个 `{ jp, cn }`，可以用 N4 语法点，词汇不超 N4 大纲

## Quality checklist

- [ ] `accent` 只在有把握时填
- [ ] 例句只用 N4 及以下等级词汇和语法
- [ ] `kana` 字段纯平假名
- [ ] 不写 `transitivity` 字段
- [ ] **每个 な形容词都过一遍「〜な＋名词」自然度检查，不自然就不该标 な形容詞**
- [ ] 生成完之后人工抽查一部分词条

## Reference

参考 `data/prompts/generate-batch-n5-adj.md`，例句难度上调一级。
```

- [ ] **Step 3: 创建 `data/prompts/generate-batch-n4-adverb.md`**

```markdown
# N4 副词 Card Batch Generation Prompt

改编自 `generate-batch-n5-adverb.md`，用于生成 N4 等级副词批次。差异：难度上调到 N4。

## Input

一份 N4 等级常见副词列表（一行一个，调用方直接给出）。

## Output

JSON 对象 `{ "version": 1, "cards": [...] }`，schema 和字段约定与 `generate-batch-n5-adverb.md` 完全一致：`id`/`word`/`kana`/`accent`/`meanings`/`mnemonic`/`examples`，不写 `type`/`transitivity`。

**难度差异**：例句可以用 N4 语法点，词汇不超 N4 大纲；助记法词块同样不超 N4 大纲。

## Quality checklist

- [ ] 助记法过三关或朴素读音锚点，词块不超 N4 大纲
- [ ] `kana` 字段纯平假名
- [ ] 不写 `type`/`transitivity` 字段
- [ ] 例句是 N4 等级的自然句型
- [ ] **如果这个词同时也出现在名词/形容词表里（合法兼类词，比如可能出现的「大変」「結構」类型的词），生成时主动换一个和名词/形容词条目不同的例句场景，不要用最直白的那句话——最终 review 会做跨文件比对，重复会被打回来**

## Reference

参考 `data/prompts/generate-batch-n5-adverb.md`，例句难度上调一级。
```

- [ ] **Step 4: 创建 `data/prompts/generate-batch-n4-onomatope.md`**

```markdown
# N4 オノマトペ Card Batch Generation Prompt

改编自 `generate-batch-n5-onomatope.md`，用于生成 N4 等级拟声拟态词批次。差异：难度上调到 N4，且 N4 阶段拟声词数量预期比 N5 多一些（N5 只找到 1 个能明确归为 N4 及以下等级的），但仍然可能是小类别，不强行凑数。

## Input

一份 N4 等级常见拟声拟态词列表（一行一个，调用方直接给出）。

## Output

JSON 对象 `{ "version": 1, "cards": [...] }`，schema 和字段约定与 `generate-batch-n5-onomatope.md` 完全一致：`id`/`word`（必须等于 `kana`）/`kana`/`accent`/`meanings`/`mnemonic`/`examples`，不写 `type`。

**难度差异**：例句可以用 N4 语法点，词汇不超 N4 大纲。

## Quality checklist

- [ ] `word` 和 `kana` 完全相同
- [ ] `kana` 纯平假名
- [ ] 不写 `type`/`transitivity` 字段
- [ ] 例句是 N4 等级句型
- [ ] **确认这个词不是已经在 N5 阶段收录过的同一个词**（拟声词/副词之间容易混淆，比如 N5 阶段的 ちょっと/もっと/ゆっくり 已经明确排除在拟声词外，N4 采词时同样要用「有没有真正的重复音节结构（giongo/gitaigo）」这条标准过滤，不要照抄 N5 已经判定过的边界词）

## Reference

参考 `data/prompts/generate-batch-n5-onomatope.md`，例句难度上调一级。
```

- [ ] **Step 5: 提交**

```bash
git add data/prompts/generate-batch-n4-noun.md data/prompts/generate-batch-n4-adj.md data/prompts/generate-batch-n4-adverb.md data/prompts/generate-batch-n4-onomatope.md
git commit -m "docs: 新增 N4 名词/形容词/副词/拟声词生成 prompt"
```

---

## Task 2: 采集 N4 原始词表（名词/形容词/副词/オノマトペ）

**Files:**
- Create: `data/raw-words-n4-noun.txt`
- Create: `data/raw-words-n4-adj.txt`
- Create: `data/raw-words-n4-adverb.txt`
- Create: `data/raw-words-n4-onomatope.txt`

格式同 `data/raw-words-n5-noun.txt` 等：一行一词，无编号、无释义。

**这个任务需要用 WebSearch/WebFetch 工具**（不是写代码），流程和 N5 阶段（已完成、已验证）完全一致：

- [ ] **Step 1: 搜索公开权威的 JLPT N4 词汇表**

用 WebSearch 查找公开、可信的 N4 词汇表来源，交叉核对至少 2 个独立来源。N5 阶段用过的 JLPTsensei.com（有独立的 N4 名词/形容词/副词页面）和 MLC Meguro Language Center 的官方 N4 词表 PDF 是已验证可用的来源，可以优先复用；Bunpro 的按词性+JLPT等级标签对拟声词采集仍然有效。`tanos.co.uk` 在 N5 阶段全程 500 错误，这次可以再试一次，不行就继续跳过。

- [ ] **Step 2: 按词性分类，排除已在 `data/cards-n4.json` 里的 150 个动词**

- [ ] **Step 3: 写入 4 个 `data/raw-words-n4-*.txt` 文件**

预期规模比 N5 大：官方 N4 大纲约 1500 词，减去已有 150 动词，其余约 1350 分布在 4 个词性里（N5 阶段名词占比最大，N4 大概率也是这个格局）。オノマトペ 仍然可能是小类别，不强行凑数——N5 阶段最终只保留 1 个（ごろごろ），N4 可能会多几个，但也可能仍然很少，两种结果都正常。

- [ ] **Step 4: 词性归类自查**

**这一步是从 N5 阶段的两轮 review 里学到的教训，必须做**：采集完之后，在写入文件前，先过一遍「这个词在标准词典里到底是不是这个词性」的自查，尤其是容易被拉进多个词表的高频词（类似 N5 阶段的 元気/下手/上手/暇/いくら/結構/嫌い/沢山/大丈夫/本当/ゆっくり 这类词）。判断标准：
- 名词：能不能接「を」「が」「の」做主语/宾语/定语？
- な形容词：能不能自然地说「〜な＋名词」？（沢山不行，元気/上手/下手可以）
- 副词：是不是修饰动词/形容词，而不是本身可以做谓语的な形容词？
- 拟声词：是不是真的有声音/状态的拟态结构，而不是普通副词（ちょっと/もっと/ゆっくり 这类已经在 N5 阶段判定为不算拟声词，N4 阶段遇到类似边界词用同样标准）？

如果一个词确实是合法的跨词性兼类词（比如同时是名词和形容词），允许它出现在两个文件里，但要在 Task 3 生成时确保两边例句不同（这条写进了 Task 1 的 prompt 里，这里只是采集阶段的分类判断）。

- [ ] **Step 5: 提交**

```bash
git add data/raw-words-n4-noun.txt data/raw-words-n4-adj.txt data/raw-words-n4-adverb.txt data/raw-words-n4-onomatope.txt
git commit -m "data: 采集 N4 名词/形容词/副词/拟声词原始词表"
```

在 commit message 里写清楚 4 个文件各自的词条数。

---

## Task 3: 生成 N4 四个新数据文件（subagent 生成，非 API 脚本）

**Files:**
- Create: `data/cards-n4-noun.json`
- Create: `data/cards-n4-adj.json`
- Create: `data/cards-n4-adverb.json`
- Create: `data/cards-n4-onomatope.json`

**生成机制**（复用 N5 阶段已批准的模式，不用再问用户）：
1. 把 Task 2 产出的每个 `data/raw-words-n4-*.txt` 按 40-50 词一批切分成多个 chunk 文件（用 `split -l N -d -a 2` 之类的命令，输出到 `.superpowers/sdd/chunks/`，这个目录已经 gitignore）
2. 对每个 chunk 派发一个 subagent：读对应 Task 1 生成的 prompt 模板 + 自己的 chunk 文件，按 schema 生成卡片，`id` 从 1 开始局部编号，写入 `.superpowers/sdd/gen-out/{type}-{NN}.json`（不要让多个 subagent 写同一个文件，避免冲突）
3. 全部 subagent 完成后，controller 用脚本按文件名顺序合并每个词性的所有 chunk 输出，**重新分配全局连续 id**（1..N），写入最终的 `data/cards-n4-{noun,adj,adverb,onomatope}.json`
4. 跑 `npm run validate`

- [ ] **Step 1: 派发生成 subagent（按词性分批，见上面机制说明）**

Model 用 sonnet（内容生成需要真实语言判断，不用最省的 haiku，也不需要 opus）。

- [ ] **Step 2: 合并 + renumber + 校验**

```bash
npm run validate
```

Expected: 所有 `data/cards-n4-*.json` 全部 `ok`

- [ ] **Step 3: 跨文件重复检查（脚本化，不是人工翻）**

```bash
node -e "
const fs = require('fs');
const files = ['data/cards-n4-noun.json','data/cards-n4-adj.json','data/cards-n4-adverb.json','data/cards-n4-onomatope.json'];
const seen = {};
for (const f of files) {
  const d = JSON.parse(fs.readFileSync(f, 'utf8'));
  for (const c of d.cards) {
    const key = f.replace('data/cards-n4-','').replace('.json','');
    if (!seen[c.word]) seen[c.word] = [];
    seen[c.word].push({file: key, examples: c.examples.map(e=>e.jp)});
  }
}
for (const [word, entries] of Object.entries(seen)) {
  if (entries.length > 1) {
    const allEx = entries.flatMap(e => e.examples);
    const hasDup = new Set(allEx).size < allEx.length;
    console.log(word, entries.map(e=>e.file).join(','), hasDup ? '<<< IDENTICAL EXAMPLE — FIX NOW' : 'ok');
  }
}
"
```

任何标 `<<< IDENTICAL EXAMPLE` 的词，在这一步就要改掉其中一份的例句，不要留到最终 review 才处理（N5 阶段这条检查是在最终 review 才做的，这次提前到生成后立刻做）。

- [ ] **Step 4: 人工抽查**

从每个新文件里随机抽 8-10 条，核对读音/词义/例句难度/词性归类是否正确。

- [ ] **Step 5: 提交**

```bash
git add data/cards-n4-noun.json data/cards-n4-adj.json data/cards-n4-adverb.json data/cards-n4-onomatope.json
git commit -m "data: 新增 N4 名词/形容词/副词/拟声词卡片数据"
```

---

## Task 4: N4 四个新页面

**Files:**
- Create: `n4-noun.html`
- Create: `n4-adj.html`
- Create: `n4-adverb.html`
- Create: `n4-onomatope.html`

结构完全照抄 `n5-noun.html`（已在 main 上），只替换 title/`LEVEL_NAME`/`CARD_DATA_URL`。版本号沿用当前站内版本（先跑 `grep -o "app.js?v=[0-9]*" n5-noun.html` 确认当前版本号，不要硬编码 v49——如果 main 上其它改动已经把版本号 bump 过，要跟着用最新的）。

- [ ] **Step 1: 确认当前站内版本号**

```bash
grep -o "app.js?v=[0-9]*\|styles.css?v=[0-9]*" n5-noun.html
```

- [ ] **Step 2: 创建 4 个页面**

`n4-noun.html`（title "N4 名词速记"，`LEVEL_NAME = 'N4-NOUN'`，`CARD_DATA_URL = 'data/cards-n4-noun.json'`）、`n4-adj.html`（"N4 形容词速记"/`N4-ADJ`/`cards-n4-adj.json`）、`n4-adverb.html`（"N4 副词速记"/`N4-ADVERB`/`cards-n4-adverb.json`）、`n4-onomatope.html`（"N4 拟声词速记"/`N4-ONOMATOPE`/`cards-n4-onomatope.json`），HTML 结构完全比照 `n5-noun.html`。

- [ ] **Step 3: 验证**

起本地服务（`package.json` 里没有 `serve` 脚本，用 `python3 -m http.server` 或类似方式），confirm 4 个页面 + 对应数据文件 HTTP 200。

- [ ] **Step 4: 提交**

```bash
git add n4-noun.html n4-adj.html n4-adverb.html n4-onomatope.html
git commit -m "feat: 新增 N4 名词/形容词/副词/拟声词学习页面"
```

---

## Task 5: 导航接入

**Files:**
- Modify: `word-type-picker.html`
- Modify: `index.html`

- [ ] **Step 1: 修改 `word-type-picker.html`**

当前（第 46-47 行）：
```js
const HAS_ADVERB = ['n1', 'n5'].includes(level);
const HAS_NOUN = ['n1', 'n5'].includes(level);
```
改成：
```js
const HAS_ADVERB = ['n1', 'n4', 'n5'].includes(level);
const HAS_NOUN = ['n1', 'n4', 'n5'].includes(level);
```
第 44-45 行的注释也要更新，反映 N4 现在也有全部 4 种子库：
```js
// 各词性子库目前的数据覆盖情况：N1/N4/N5 全部 4 种都有；
// N2 只有形容词/拟声词；N3 还没有任何子库（下一轮扩容内容）
```

- [ ] **Step 2: 修改 `index.html` 的 N4 入口**

第 104 行，从：
```html
      <a class="level-btn lv-n4" href="n4.html">
```
改成：
```html
      <a class="level-btn lv-n4" href="word-type-picker.html?level=n4">
```

第 106 行的词量文案，从 `150 词` 改成 Task 3 实际产出的总量（150 动词 + 4 个新文件的 `cards.length` 之和，用真实数字替换，不要用占位符）：
```html
        <span class="meta"><span class="count"><实际总数> 词</span>初级日常</span>
```

- [ ] **Step 3: 验证**

起本地服务，`index.html` → N4 → 应进入词性选择页，看到 5 个选项，逐个能进入对应页面；N1/N5 应该还是 5 个选项没有回归；N2 应该还是 3 个选项没有回归；N3 应该还是直接进 `n3.html`（还没有词性选择页，本计划不涉及）。

- [ ] **Step 4: 提交**

```bash
git add word-type-picker.html index.html
git commit -m "feat: N4 首页入口接入词性选择页，含名词/形容词/副词/拟声词四个新词性"
```

---

## Task 6: 最终验证清单

- [ ] `npm test` 全量跑一遍，确认没有回归
- [ ] `npm run validate` 全部数据文件通过
- [ ] Task 3 Step 3 的跨文件重复检查脚本再跑一遍，确认 clean
- [ ] N4 四个新页面能正常访问、自由刷卡、测验
- [ ] `index.html` → N4 → 词性选择页 → 五个选项都能进对应页面
- [ ] N1/N2/N5 的词性选择页没有因为这次改动而回归

```bash
npm test
npm run validate
```

Expected: 两个命令都以退出码 0 结束。
