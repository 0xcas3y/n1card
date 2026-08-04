# N3 词库扩容（词性拆分，复用 N5/N4 已验证流程）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 N3 词库从现有的纯动词库（300 词）扩容到覆盖名词/形容词/副词/オノマトペ 4 个新词性子库，目标总量对齐官方 JLPT N3 大纲（约 3750 词，是目前为止四个等级里目标量最大的一次）。

**Architecture:** 完全复用已经在 `main` 上验证过两轮（N5、N4）的流程：`scripts/generate-cards.js`（已存在，本次同样不实际调用其 API 路径，改用 subagent 在会话内直接生成，走 Claude Code 订阅额度）、`scripts/validate-cards.js`（不改）、`npm run validate` 的批量校验（已支持任意 `data/cards*.json`）。新建 N3 专用 prompt 模板、原始词表、4 个数据文件、4 个学习页面，接入已经泛化好的 `word-type-picker.html`（当前对 `n1`/`n4`/`n5` 开放全部 4 个词性选项，需要把 `n3` 也加进去）。

**Tech Stack:** 纯前端静态站点（无构建步骤）、Node.js `--test`、WebSearch/WebFetch 用于词表采集、Claude subagent 用于内容生成（非 Anthropic API 直连）。

## Global Constraints

- Schema 和现有 `data/cards.json` 完全一致，**不修改** `scripts/validate-cards.js`
- 拟声词 `word` 必须等于 `kana`
- 例句难度必须匹配 N3 等级（比 N4 更复杂的句型/词汇——可以用被动/使役/敬语基础/复合助词等 N3 语法点，但不能出现 N2 以上的词汇）
- 生成后必须过 `scripts/validate-cards.js`
- **跨文件重复例句/词性归类检查必须在生成阶段就做**（这是从 N5→N4 两轮里学到的经验：N5 阶段这条检查是最终 review 才补的，栽了 3 次跟头；N4 阶段把这条检查前移到每个生成 subagent 的派发指令里，最终 review 复核 0 处撞车——N3 沿用 N4 的做法，在 Task 2 词表采集阶段就先识别出所有合法跨文件兼类词，在 Task 3 每个生成 subagent 的派发指令里显式列出/提醒）
- **词性自查标准**（同样是 N5→N4 的教训）：名词看能不能接 を/が/の；な形容词看能不能自然说「〜な＋名词」；副词看是不是修饰动词/形容词而非自身做谓语；拟声词看是不是真的有声音/状态拟态结构。N4 阶段这条自查完全避免了 N5 阶段 嫌い/沢山 那类错误，N3 阶段继续用同一套标准
- **词表来源提醒**：N4 阶段发现网上广泛转载的"旧版 JLPT 3 级"词表和现行 N4 不是 1:1 对应（2010 年改革把旧 3 级拆分到新 N4/新 N3）。N3 阶段这个问题可能更突出——旧版 2 级（2級）被拆分到新 N3/新 N2，旧版 3 级也有部分词流入新 N3，所以 N3 的候选词表大概率会同时混入旧 2 级和旧 3 级来源，出现"实际是 N2"或"实际是 N4"的词，务必用 jisho.org 或同等权威工具逐词核实等级，不能只看某个网站的"N3 列表"标签
- 词性配额不预设固定比例，以实际能收集到的词表规模为准；**如果最终实际交付量明显低于 3750 的粗估（参考 N5 /N4 都出现过这种情况），只要是质量优先的主动取舍且有据可查，就是合理结果，不需要为了凑数放宽标准**
- 生成机制：不使用 `scripts/generate-cards.js` 的真实 API 调用路径，改用 controller 直接派发 subagent 生成内容、合并、renumber id、写入最终文件——这是已经过两轮验证的既定模式，直接沿用，不用再问
- 本计划范围仅 N3——N2 由用户自己提供词表，走另外的流程，不在本计划内

---

## Task 1: N3 专用生成 prompt（名词/形容词/副词/オノマトペ）

**Files:**
- Create: `data/prompts/generate-batch-n3-noun.md`
- Create: `data/prompts/generate-batch-n3-adj.md`
- Create: `data/prompts/generate-batch-n3-adverb.md`
- Create: `data/prompts/generate-batch-n3-onomatope.md`

改编自 `data/prompts/generate-batch-n4-*.md`（已在 main 上），schema、字段约定完全不变，只调整：①难度上调到 N3 等级；②补充 N3 阶段特有的词表来源提醒。

- [ ] **Step 1: 创建 `data/prompts/generate-batch-n3-noun.md`**

```markdown
# N3 名词 Card Batch Generation Prompt

改编自 `generate-batch-n4-noun.md`，用于生成 N3 等级名词批次。差异：难度上调到 N3——例句可以用更复杂的句型（被动、使役、基础敬语、复合助词如「〜において」「〜に対して」等 N3 语法点），但不能出现 N2 以上词汇；词表由调用方提供，不自行汇总。

## Input

一份 N3 等级常见名词列表（一行一个，调用方直接给出，可能带（する）标记表示可作サ变动词）。

## Output

JSON 对象 `{ "version": 1, "cards": [...] }`，schema 和字段约定与 `generate-batch-n4-noun.md` 完全一致：`id`/`word`/`kana`/`accent`/`meanings`/`mnemonic`/`examples`，不写 `type`/`transitivity`。

**难度差异**：
- `meanings`：可以比 N4 版本更精炼，允许略书面化的释义
- `mnemonic`：助记法风格不变
- `examples`：**恰好 2** 个 `{ jp, cn }`，句子可以用 N3 语法点，词汇不能超出 N3 大纲

## Quality checklist

- [ ] 例句只用 N3 及以下等级词汇，句型可以比 N4 复杂但不超 N2
- [ ] `kana` 字段纯平假名
- [ ] 不写 `type`/`transitivity` 字段
- [ ] 标了（する）的词，例句体现サ变动词用法
- [ ] **生成后自查一遍：这批词里有没有重复？有没有明显该属于形容词/副词但被塞进名词表的？**（延续 N5/N4 阶段的教训——词性判断标准见调用方提供的自查指引）

## Reference

参考 `data/prompts/generate-batch-n4-noun.md`，例句难度上调一级。
```

- [ ] **Step 2: 创建 `data/prompts/generate-batch-n3-adj.md`**

```markdown
# N3 形容词 Card Batch Generation Prompt

改编自 `generate-batch-n4-adj.md`，用于生成 N3 等级形容词批次。差异：难度上调到 N3。

## Input

一份 N3 等级常见形容词列表（一行一个，调用方直接给出）。

## Output

JSON 对象 `{ "version": 1, "cards": [...] }`，schema 和字段约定与 `generate-batch-n4-adj.md` 完全一致：`id`/`word`/`kana`/`accent`/`type`（`"い形容詞"`|`"な形容詞"`）/`meanings`/`mnemonic`/`examples`。

**特别提醒**：只有真正在标准词典里被归类为 な形容詞 的词才能写 `な形容詞`——判断标准：这个词能不能自然地说「〜な＋名词」？能就是な形容词，不能就不是（N5 阶段 沢山 就是这条规则要防的典型错误）。

**难度差异**：
- `examples`：**恰好 2** 个 `{ jp, cn }`，可以用 N3 语法点，词汇不超 N3 大纲

## Quality checklist

- [ ] `accent` 只在有把握时填
- [ ] 例句只用 N3 及以下等级词汇和语法
- [ ] `kana` 字段纯平假名
- [ ] 不写 `transitivity` 字段
- [ ] **每个 な形容词都过一遍「〜な＋名词」自然度检查**
- [ ] 生成完之后人工抽查一部分词条

## Reference

参考 `data/prompts/generate-batch-n4-adj.md`，例句难度上调一级。
```

- [ ] **Step 3: 创建 `data/prompts/generate-batch-n3-adverb.md`**

```markdown
# N3 副词 Card Batch Generation Prompt

改编自 `generate-batch-n4-adverb.md`，用于生成 N3 等级副词批次。差异：难度上调到 N3。

## Input

一份 N3 等级常见副词列表（一行一个，调用方直接给出）。

## Output

JSON 对象 `{ "version": 1, "cards": [...] }`，schema 和字段约定与 `generate-batch-n4-adverb.md` 完全一致：`id`/`word`/`kana`/`accent`/`meanings`/`mnemonic`/`examples`，不写 `type`/`transitivity`。

**难度差异**：例句可以用 N3 语法点，词汇不超 N3 大纲；助记法词块同样不超 N3 大纲。

## Quality checklist

- [ ] 助记法过三关或朴素读音锚点，词块不超 N3 大纲
- [ ] `kana` 字段纯平假名
- [ ] 不写 `type`/`transitivity` 字段
- [ ] 例句是 N3 等级的自然句型
- [ ] **如果这个词同时也出现在名词/形容词表里（合法兼类词），生成时主动换一个和名词/形容词条目不同的例句场景，不要用最直白的那句话**

## Reference

参考 `data/prompts/generate-batch-n4-adverb.md`，例句难度上调一级。
```

- [ ] **Step 4: 创建 `data/prompts/generate-batch-n3-onomatope.md`**

```markdown
# N3 オノマトペ Card Batch Generation Prompt

改编自 `generate-batch-n4-onomatope.md`，用于生成 N3 等级拟声拟态词批次。差异：难度上调到 N3。N3 阶段拟声词数量可能比 N4/N5 多一些（更多常见拟声拟态词集中在 N3-N2 区间），但仍然可能只是中等规模，不强行凑数。

## Input

一份 N3 等级常见拟声拟态词列表（一行一个，调用方直接给出）。

## Output

JSON 对象 `{ "version": 1, "cards": [...] }`，schema 和字段约定与 `generate-batch-n4-onomatope.md` 完全一致：`id`/`word`（必须等于 `kana`）/`kana`/`accent`/`meanings`/`mnemonic`/`examples`，不写 `type`。

**难度差异**：例句可以用 N3 语法点，词汇不超 N3 大纲。

## Quality checklist

- [ ] `word` 和 `kana` 完全相同
- [ ] `kana` 纯平假名
- [ ] 不写 `type`/`transitivity` 字段
- [ ] 例句是 N3 等级句型
- [ ] **确认这个词不是已经在 N5/N4 阶段收录过的同一个词**（跑程序化去重检查，不要只凭印象）

## Reference

参考 `data/prompts/generate-batch-n4-onomatope.md`，例句难度上调一级。
```

- [ ] **Step 5: 提交**

```bash
git add data/prompts/generate-batch-n3-noun.md data/prompts/generate-batch-n3-adj.md data/prompts/generate-batch-n3-adverb.md data/prompts/generate-batch-n3-onomatope.md
git commit -m "docs: 新增 N3 名词/形容词/副词/拟声词生成 prompt"
```

---

## Task 2: 采集 N3 原始词表（名词/形容词/副词/オノマトペ）

**Files:**
- Create: `data/raw-words-n3-noun.txt`
- Create: `data/raw-words-n3-adj.txt`
- Create: `data/raw-words-n3-adverb.txt`
- Create: `data/raw-words-n3-onomatope.txt`

格式同 `data/raw-words-n4-noun.txt` 等：一行一词，无编号、无释义。

**这个任务需要用 WebSearch/WebFetch 工具**，流程和 N5/N4 阶段（已完成、已验证）一致，但要特别注意 Global Constraints 里提到的"旧版 2 级/3 级混入"问题：

- [ ] **Step 1: 搜索公开权威的 JLPT N3 词汇表**

用 WebSearch 查找公开、可信的 N3 词汇表来源，交叉核对至少 2 个独立来源。已验证可用的来源：JLPTsensei.com（有独立的 N3 名词/形容词/副词页面）、jisho.org（逐词核实等级，N4 阶段证明是最关键的裁决工具）。可以尝试 MLC Meguro Language Center 是否有 N3 词表 PDF；Bunpro 仍然是拟声词候选的来源之一。

- [ ] **Step 2: 按词性分类，排除已在 `data/cards-n3.json` 里的 300 个动词**

- [ ] **Step 3: 用 jisho.org 逐词核实等级，过滤混入的 N2/N4 词**

这一步是本次 N3 采集相对 N4 阶段最需要加强的地方——N3 处在旧 2 级/3 级的交界，网上"N3 列表"标签的可信度可能比 N4 阶段更低，遇到任何等级存疑的词都要用 jisho.org 或同等工具核实，不确定就排除，不强行凑数。

- [ ] **Step 4: 写入 4 个 `data/raw-words-n3-*.txt` 文件**

预期规模：官方 N3 大纲约 3750 词，减去已有 300 动词，理论缺口约 3450，但参考 N5（实际 531/720）、N4（实际 438/1350）两次的经验，实际能通过严格核实交付的数量大概率明显小于粗估——这是正常的，不是任务失败。

- [ ] **Step 5: 词性归类自查（同 N4 阶段标准）**

对每个候选词过一遍「这个词在标准词典里到底是不是这个词性」的自查，尤其是容易被拉进多个词表的高频词。如果一个词确实是合法的跨词性兼类词，允许它出现在两个文件里，但要在报告里明确列出这些兼类词清单，供 Task 3 生成阶段直接引用（这是 N4 阶段最有效的改进——提前列清单，而不是等生成完再排查）。

- [ ] **Step 6: 提交**

```bash
git add data/raw-words-n3-noun.txt data/raw-words-n3-adj.txt data/raw-words-n3-adverb.txt data/raw-words-n3-onomatope.txt
git commit -m "data: 采集 N3 名词/形容词/副词/拟声词原始词表"
```

在 commit message 里写清楚 4 个文件各自的词条数和采集方法论摘要。

---

## Task 3: 生成 N3 四个新数据文件（subagent 生成，非 API 脚本）

**Files:**
- Create: `data/cards-n3-noun.json`
- Create: `data/cards-n3-adj.json`
- Create: `data/cards-n3-adverb.json`
- Create: `data/cards-n3-onomatope.json`

**生成机制**（复用 N5/N4 阶段已验证的模式）：
1. 把 Task 2 产出的每个 `data/raw-words-n3-*.txt` 切分成多个 chunk 文件，输出到 `.superpowers/sdd/chunks/`。**由于 N3 词表规模可能明显大于 N4（N4 是 438 词分 11 批），如果实际词表规模显著更大（比如超过 800-1000 词），可以适当放大单批大小（比如 50-60 词/批）来控制总批次数，但不要为了减少批次而牺牲单批质量**
2. 对每个 chunk 派发一个 subagent：读对应 Task 1 生成的 prompt 模板 + 自己的 chunk 文件 + **Task 2 报告里列出的跨文件兼类词清单**（在派发指令里直接引用，不要让 subagent 自己去猜哪些词是兼类词），按 schema 生成卡片，写入 `.superpowers/sdd/gen-out/{type}-{NN}.json`
3. 全部 subagent 完成后，controller 合并每个词性的所有 chunk 输出，重新分配全局连续 id，写入最终的 `data/cards-n3-{noun,adj,adverb,onomatope}.json`
4. 跑 `npm run validate`

- [ ] **Step 1: 派发生成 subagent（按词性分批，见上面机制说明；model 用 sonnet）**

- [ ] **Step 2: 合并 + renumber + 校验**

```bash
npm run validate
```

- [ ] **Step 3: 跨文件重复检查（脚本化）**

```bash
node -e "
const fs = require('fs');
const files = ['data/cards-n3-noun.json','data/cards-n3-adj.json','data/cards-n3-adverb.json','data/cards-n3-onomatope.json'];
const seen = {};
for (const f of files) {
  const d = JSON.parse(fs.readFileSync(f, 'utf8'));
  for (const c of d.cards) {
    const key = f.replace('data/cards-n3-','').replace('.json','');
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

任何标 `<<< IDENTICAL EXAMPLE` 的词，在这一步就要改掉。

- [ ] **Step 4: 人工抽查**

从每个新文件里随机抽 8-10 条（大文件可以适当多抽），核对读音/词义/例句难度/词性归类。

- [ ] **Step 5: 提交**

```bash
git add data/cards-n3-noun.json data/cards-n3-adj.json data/cards-n3-adverb.json data/cards-n3-onomatope.json
git commit -m "data: 新增 N3 名词/形容词/副词/拟声词卡片数据"
```

---

## Task 4: N3 四个新页面

**Files:**
- Create: `n3-noun.html`
- Create: `n3-adj.html`
- Create: `n3-adverb.html`
- Create: `n3-onomatope.html`

结构完全照抄 `n4-noun.html`（已在 main 上），只替换 title/`LEVEL_NAME`/`CARD_DATA_URL`。先确认当前站内版本号（不要硬编码）：

```bash
grep -o "app.js?v=[0-9]*\|styles.css?v=[0-9]*" n4-noun.html
```

- [ ] **Step 1: 创建 4 个页面**

`n3-noun.html`（title "N3 名词速记"，`LEVEL_NAME = 'N3-NOUN'`，`CARD_DATA_URL = 'data/cards-n3-noun.json'`）、`n3-adj.html`（"N3 形容词速记"/`N3-ADJ`/`cards-n3-adj.json`）、`n3-adverb.html`（"N3 副词速记"/`N3-ADVERB`/`cards-n3-adverb.json`）、`n3-onomatope.html`（"N3 拟声词速记"/`N3-ONOMATOPE`/`cards-n3-onomatope.json`）。

- [ ] **Step 2: 验证**

起本地服务（`python3 -m http.server` 或类似方式），confirm 4 个页面 + 对应数据文件 HTTP 200。

- [ ] **Step 3: 提交**

```bash
git add n3-noun.html n3-adj.html n3-adverb.html n3-onomatope.html
git commit -m "feat: 新增 N3 名词/形容词/副词/拟声词学习页面"
```

---

## Task 5: 导航接入

**Files:**
- Modify: `word-type-picker.html`
- Modify: `index.html`

- [ ] **Step 1: 修改 `word-type-picker.html`**

把 `HAS_ADVERB`/`HAS_NOUN` 的 `['n1', 'n4', 'n5'].includes(level)` 改成 `['n1', 'n3', 'n4', 'n5'].includes(level)`。更新附近注释：现在 N1/N3/N4/N5 全部 4 种都有；N2 只有形容词/拟声词。

- [ ] **Step 2: 修改 `index.html` 的 N3 入口**

`href` 从 `n3.html` 改成 `word-type-picker.html?level=n3`；词量文案从 `300 词` 改成 Task 3 实际产出的总量（300 动词 + 4 个新文件的 `cards.length` 之和，用真实数字替换）。

- [ ] **Step 3: 验证**

起本地服务，`index.html` → N3 → 应进入词性选择页，5 个选项都能进入对应页面；N1/N4/N5 应该还是 5 个选项没有回归；N2 应该还是 3 个选项没有回归。

- [ ] **Step 4: 提交**

```bash
git add word-type-picker.html index.html
git commit -m "feat: N3 首页入口接入词性选择页，含名词/形容词/副词/拟声词四个新词性"
```

---

## Task 6: 最终验证清单

- [ ] `npm test` 全量跑一遍，确认没有回归
- [ ] `npm run validate` 全部数据文件通过
- [ ] Task 3 Step 3 的跨文件重复检查脚本再跑一遍，确认 clean
- [ ] N3 四个新页面能正常访问、自由刷卡、测验
- [ ] `index.html` → N3 → 词性选择页 → 五个选项都能进对应页面
- [ ] N1/N2/N4/N5 的词性选择页没有因为这次改动而回归

```bash
npm test
npm run validate
```

Expected: 两个命令都以退出码 0 结束。
