# N2 词库扩容（用户提供词表：形容词/拟声词追加 + 副词/复合动词新增）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 用用户直接提供的词表（不走 WebSearch 采集）扩充 N2 词库：现有形容词库 68→241（+173）、现有拟声词库 75→106（+31）；新增副词库（75 词，全新类别）；新增复合动词库（125 词，**全新词性类别，本项目此前从未支持过**）。

**Architecture:** 复用已经验证三轮（N5/N4/N3）的生成流程：subagent 分批生成（不走 `scripts/generate-cards.js` 的真实 API 路径）、`scripts/validate-cards.js` 不改、`npm run validate` 批量校验。与前三轮的关键差异：**本次词表由用户直接提供，跳过 WebSearch 采集 + jisho.org 等级核实**（用户是权威来源，不需要交叉核对 JLPT 等级），但仍然要做词性自查（尤其复合动词的 type/transitivity 判断）；形容词/拟声词是**追加**到现有文件（延续 id，不重新生成已有卡片），副词/复合动词是**全新文件**。

**Tech Stack:** 纯前端静态站点、Node.js `--test`、Claude subagent 用于内容生成。

## Global Constraints

- Schema 和现有 `data/cards.json` 完全一致，**不修改** `scripts/validate-cards.js`
- 拟声词 `word` 必须等于 `kana`
- **复合动词是全新词性类别**：schema 沿用动词的 `type`（五段/一段/サ变/カ变）+ `transitivity`（自/他，可选，复合动词很多沿用后一半词根的自他性，判断不确定就不写）
- 例句难度必须匹配 N2 等级（比 N3 更复杂，可以用敬语、书面语、复杂修饰从句，但不能出现 N1 词汇）
- 生成后必须过 `scripts/validate-cards.js`
- **形容词/拟声词是追加,不是重建**：新卡片的 `id` 必须从现有文件的最大 id + 1 开始连续编号，不能和现有 68/75 张卡片的 id 冲突；合并后两个文件分别变成 241/106 张
- 副词/复合动词是全新文件，`id` 从 1 开始
- 用户提供的词表已经经过一轮人工去重（形容词去掉了和现有 68 词重复的 6 个，拟声词去掉了和现有 75 词重复的 8 个），Task 2 只需确认格式，不需要重新去重
- 生成机制：不使用 `scripts/generate-cards.js` 的真实 API 调用路径，改用 controller 直接派发 subagent 生成内容、合并、renumber id（追加类的话，起始 id 不是 1，见上）——沿用 N5/N4/N3 阶段已批准的既定模式
- 本计划不涉及 N2 的名词类别（用户没有提供名词词表，N2 依然没有名词子库）

---

## Task 1: N2 专用生成 prompt（形容词追加/副词/拟声词追加/复合动词）

**Files:**
- Create: `data/prompts/generate-batch-n2-adj-append.md`
- Create: `data/prompts/generate-batch-n2-adverb.md`
- Create: `data/prompts/generate-batch-n2-onomatope-append.md`
- Create: `data/prompts/generate-batch-n2-compound-verb.md`

- [ ] **Step 1: 创建 `data/prompts/generate-batch-n2-adj-append.md`**

```markdown
# N2 形容词（追加批次）Card Batch Generation Prompt

改编自 `generate-batch-n3-adj.md`，用于给**已有 68 词的 N2 形容词库**追加新词。差异：①难度是 N2 等级（比 N3 更复杂，可用敬语/书面语，不能超 N1 词汇）；②词表由用户直接提供，已确认是真实 N2 词汇，不需要再做 JLPT 等级核实，但仍需做词性自查。

## Input

一份 N2 等级形容词列表（一行一个，调用方直接给出）。

## Output

JSON 对象 `{ "version": 1, "cards": [...] }`，schema 和字段约定与 `generate-batch-n3-adj.md` 完全一致：`id`/`word`/`kana`/`accent`/`type`（`"い形容詞"`|`"な形容詞"`）/`meanings`/`mnemonic`/`examples`。**`id` 起始偏移量由调用方指定**（这批是追加到已有 68 词的文件，起始 id 不是 1）。

**特别提醒**：只有真正能自然说「〜な＋名词」的词才标 `な形容詞`。

**难度差异**：例句可以用 N2 语法点（敬语、书面语、より复杂的修饰从句），词汇不超 N2 大纲。

## Quality checklist

- [ ] `accent` 只在有把握时填
- [ ] 例句只用 N2 及以下等级词汇和语法
- [ ] `kana` 字段纯平假名
- [ ] 每个 な形容词都过一遍「〜な＋名词」自然度检查
- [ ] 生成完之后人工抽查一部分词条

## Reference

参考 `data/prompts/generate-batch-n3-adj.md`，例句难度上调一级。
```

- [ ] **Step 2: 创建 `data/prompts/generate-batch-n2-adverb.md`**

```markdown
# N2 副词 Card Batch Generation Prompt

改编自 `generate-batch-n3-adverb.md`，用于生成 N2 等级副词批次（N2 首次拥有独立副词库）。差异：难度上调到 N2；词表由用户提供，无需等级核实。

## Input

一份 N2 等级常见副词列表（一行一个，调用方直接给出）。

## Output

JSON 对象 `{ "version": 1, "cards": [...] }`，schema 和字段约定与 `generate-batch-n3-adverb.md` 完全一致：`id`/`word`/`kana`/`accent`/`meanings`/`mnemonic`/`examples`，不写 `type`/`transitivity`。**`id` 从 1 开始**（全新文件）。

**难度差异**：例句可以用 N2 语法点，词汇不超 N2 大纲。

## Quality checklist

- [ ] 助记法过三关或朴素读音锚点
- [ ] `kana` 字段纯平假名
- [ ] 不写 `type`/`transitivity` 字段
- [ ] 例句是 N2 等级的自然句型

## Reference

参考 `data/prompts/generate-batch-n3-adverb.md`，例句难度上调一级。
```

- [ ] **Step 3: 创建 `data/prompts/generate-batch-n2-onomatope-append.md`**

```markdown
# N2 拟声词（追加批次）Card Batch Generation Prompt

改编自 `generate-batch-n3-onomatope.md`，用于给**已有 75 词的 N2 拟声词库**追加新词。差异：词表由用户提供，无需等级核实；难度是 N2 等级。

## Input

一份 N2 等级拟声拟态词列表（一行一个，调用方直接给出）。

## Output

JSON 对象 `{ "version": 1, "cards": [...] }`，schema 和字段约定与 `generate-batch-n3-onomatope.md` 完全一致：`id`/`word`（必须等于 `kana`）/`kana`/`accent`/`meanings`/`mnemonic`/`examples`，不写 `type`。**`id` 起始偏移量由调用方指定**（追加到已有 75 词的文件）。

**难度差异**：例句可以用 N2 语法点。

## Quality checklist

- [ ] `word` 和 `kana` 完全相同
- [ ] `kana` 纯平假名
- [ ] 例句是 N2 等级句型
- [ ] **确认这个词不是已经在 N1/N3/N4/N5 阶段收录过的同一个词**（程序化去重检查）

## Reference

参考 `data/prompts/generate-batch-n3-onomatope.md`，例句难度上调一级。
```

- [ ] **Step 4: 创建 `data/prompts/generate-batch-n2-compound-verb.md`**

```markdown
# N2 复合动词 Card Batch Generation Prompt

**本项目首次支持的词性类别**。复合动词（複合動詞）是由两个动词词干拼接构成的动词（如 取り上げる＝取る＋上げる，飛び回る＝飛ぶ＋回る），conjugate 方式跟随后半部分动词，词义往往是两个词根含义的引申组合。

## Input

一份 N2 等级常见复合动词列表（一行一个，调用方直接给出，均为汉字+假名混写的普通动词写法）。

## Output

JSON 对象 `{ "version": 1, "cards": [...] }`，schema 复用**动词**的 schema（不是形容词/副词那套），每张卡片：

- `id`（number）：调用方指定起始偏移量后的 1-based 序号
- `word`（string）：复合动词书写形式（汉字+假名，如 取り上げる）
- `kana`（string）：平假名读音，仅 U+3040-309F + 30FC
- `accent`（string|null）：不确定就填 `null`
- `type`（string）：`"五段"` | `"一段"` | `"サ变"` | `"カ变"` —— **判断依据是整个复合动词的活用形，通常跟随后半部分词根**（如 〜上げる＝一段，〜込む＝五段，〜出す＝五段），不确定就参照后半部分动词单独使用时的活用类型
- `transitivity`（string|null）：`"自"` | `"他"` | `"自他"`（部分复合动词兼有自他两种用法，如 変わる/変える 型）——不确定就填 `null`，不要猜
- `meanings`（string[]）：1-4 条简洁中文释义
- `mnemonic`（string）：**复合动词的助记法应该优先用真实的词素分解**（这是本类别最大的优势——复合动词本身就是两个真实动词的拼接，不需要凑短语）：`词根1(读音，本义) + 词根2(读音，本义) ⇒ 复合词（组合后的引申义，说明两个词根的意义是怎么引申出整体含义的）`。例如：`取る(とる，拿取) + 上げる(あげる，往上举) ⇒ 取り上げる（拿起来往上举 → 引申为"拿起/提出话题/没收"）`。如果两个词根的字面组合逻辑不直观，要在括号里补充说明引申的推理链条，不能只是罗列两个词根的意思不做连接。
- `examples`：**恰好 2** 个 `{ jp, cn }`，可以用 N2 语法点，词汇不超 N2 大纲。

## Quality checklist

- [ ] `type` 判断依据是整个复合动词的实际活用形（可以用「〜ます」测试：取り上げます→一段；取り組みます→五段）
- [ ] `transitivity` 不确定就填 `null`，不要猜
- [ ] 助记法必须做真实的词素拆分（词根1+词根2），并说明引申逻辑，不能只是拼接两个词不解释
- [ ] `kana` 字段纯平假名
- [ ] 例句是 N2 等级的自然句型
- [ ] 生成完之后人工抽查一部分词条的活用类型和释义是否准确

## Reference

参考 `data/prompts/generate-batch.md`（N1 动词版，本项目最初的动词生成 prompt）的整体 schema 和难度基调，助记法风格改为词素分解优先（而不是动词版的音节拼短语），因为复合动词天然适合词素分解。
```

- [ ] **Step 5: 提交**

```bash
git add data/prompts/generate-batch-n2-adj-append.md data/prompts/generate-batch-n2-adverb.md data/prompts/generate-batch-n2-onomatope-append.md data/prompts/generate-batch-n2-compound-verb.md
git commit -m "docs: 新增 N2 形容词追加/副词/拟声词追加/复合动词生成 prompt"
```

---

## Task 2: 确认用户提供的原始词表格式

**Files:**
- Already created (untracked, need to `git add`): `data/raw-words-n2-adj-new.txt`（173词，已去重）、`data/raw-words-n2-adverb.txt`（75词）、`data/raw-words-n2-onomatope-new.txt`（31词，已去重）、`data/raw-words-n2-compound.txt`（125词）

这批词表是用户直接提供的（不是 WebSearch 采集），已经在对话中跟用户确认过 2 处疑似手误（形容词表「洗い」→「荒い」，副词表「勝って」→「かって」）并修正。本任务只需要做格式/去重的最终确认，不需要重新采集或做 JLPT 等级核实。

- [ ] **Step 1: 确认格式**

```bash
for f in data/raw-words-n2-adj-new.txt data/raw-words-n2-adverb.txt data/raw-words-n2-onomatope-new.txt data/raw-words-n2-compound.txt; do
  echo "=== $f ==="
  wc -l "$f"
  sort "$f" | uniq -d  # 应该为空，确认内部无重复
done
```

Expected: adj-new 173 行、adverb 75 行、onomatope-new 31 行、compound 125 行，四个文件内部均无重复。

- [ ] **Step 2: 确认与现有词库无重叠**

```bash
node -e "
const fs = require('fs');
function checkOverlap(newFile, existingCardsFile) {
  const existing = new Set(require(existingCardsFile).cards.map(c=>c.word));
  const words = fs.readFileSync(newFile,'utf8').split('\n').filter(Boolean);
  const overlap = words.filter(w => existing.has(w));
  console.log(newFile, 'vs', existingCardsFile, '-> overlap:', overlap.length, overlap);
}
checkOverlap('data/raw-words-n2-adj-new.txt', './data/cards-n2-adj.json');
checkOverlap('data/raw-words-n2-onomatope-new.txt', './data/cards-n2-onomatope.json');
"
```

Expected: 两处 overlap 都是 0（已经在整理阶段去重过）。

- [ ] **Step 3: 提交**

```bash
git add data/raw-words-n2-adj-new.txt data/raw-words-n2-adverb.txt data/raw-words-n2-onomatope-new.txt data/raw-words-n2-compound.txt
git commit -m "data: 保存用户提供的 N2 形容词/副词/拟声词/复合动词原始词表"
```

---

## Task 3: 生成四类数据（形容词追加/副词/拟声词追加/复合动词）

**Files:**
- Modify: `data/cards-n2-adj.json`（68→241）
- Create: `data/cards-n2-adverb.json`（75）
- Modify: `data/cards-n2-onomatope.json`（75→106）
- Create: `data/cards-n2-compound.json`（125）

**生成机制**（复用 N5/N4/N3 阶段已验证的模式）：
1. 把 4 个 `data/raw-words-n2-*.txt` 按 40-50 词一批切分成 chunk 文件，输出到 `.superpowers/sdd/chunks/`
2. 对每个 chunk 派发一个 subagent：读对应 Task 1 的 prompt 模板 + 自己的 chunk 文件，生成卡片，写入 `.superpowers/sdd/gen-out/{type}-{NN}.json`
3. **合并时区分追加类和全新类**：
   - 形容词/拟声词（追加类）：先读现有 `data/cards-n2-adj.json`/`cards-n2-onomatope.json` 的当前内容，新生成的卡片 id 从"现有最大 id + 1"开始连续编号，`cards` 数组是"现有卡片 + 新卡片"拼接，不是重新生成全部
   - 副词/复合动词（全新类）：id 从 1 开始，正常 merge
4. 跑 `npm run validate`

- [ ] **Step 1: 切分 chunk**

```bash
mkdir -p .superpowers/sdd/chunks .superpowers/sdd/gen-out
split -l 45 -d -a 2 data/raw-words-n2-adj-new.txt .superpowers/sdd/chunks/adj-
split -l 38 -d -a 2 data/raw-words-n2-adverb.txt .superpowers/sdd/chunks/adverb-
split -l 31 -d -a 2 data/raw-words-n2-onomatope-new.txt .superpowers/sdd/chunks/onomatope-
split -l 42 -d -a 2 data/raw-words-n2-compound.txt .superpowers/sdd/chunks/compound-
```

（形容词 173÷45≈4批，副词 75÷38≈2批，拟声词 31 词 1 批，复合动词 125÷42≈3批，共约 10 批，具体切分数量以实际 `split` 结果为准）

- [ ] **Step 2: 派发生成 subagent（model 用 sonnet）**

复合动词批次的派发指令要包含明确的 schema 提醒（type/transitivity 是动词 schema，不是形容词/副词那套无 type 的 schema），避免 subagent 套用错误的 schema。

- [ ] **Step 3: 合并（区分追加/全新）+ 校验**

```bash
npm run validate
```

Expected: `cards-n2-adj.json` 241 张、`cards-n2-onomatope.json` 106 张、`cards-n2-adverb.json` 75 张、`cards-n2-compound.json` 125 张，全部 `ok`。

- [ ] **Step 4: 复合动词的 type/transitivity 人工抽查**

这是新词性类别，风险最高的地方是 `type` 判断（复合动词的活用形有时和词根单独使用时不同）。抽查至少 15-20 条，逐一确认「〜ます」活用形式和标注的 `type` 一致。

- [ ] **Step 5: 跨等级/跨类别重复检查**

```bash
node -e "
const fs = require('fs');
const allFiles = require('fs').readdirSync('data').filter(f => f.startsWith('cards') && f.endsWith('.json'));
const seen = {};
for (const f of allFiles) {
  const d = JSON.parse(fs.readFileSync('data/'+f, 'utf8'));
  for (const c of d.cards) {
    if (!seen[c.word]) seen[c.word] = [];
    seen[c.word].push(f);
  }
}
// 只关心本次新增的4个文件相关的重复
const newFiles = new Set(['cards-n2-adj.json','cards-n2-adverb.json','cards-n2-onomatope.json','cards-n2-compound.json']);
for (const [word, files] of Object.entries(seen)) {
  const touchesNew = files.some(f => newFiles.has(f));
  if (touchesNew && files.length > 1) console.log(word, '->', files.join(', '));
}
"
```

人工过一遍输出，确认没有意外的跨等级重复词（复合动词是新类别，理论上不该和任何现有词冲突；形容词/拟声词追加的词已经去重过，但保险起见再跑一遍全库检查）。

- [ ] **Step 6: 提交**

```bash
git add data/cards-n2-adj.json data/cards-n2-adverb.json data/cards-n2-onomatope.json data/cards-n2-compound.json
git commit -m "data: N2 形容词/拟声词追加 + 新增副词/复合动词卡片数据"
```

---

## Task 4: 新页面（副词 + 复合动词）

**Files:**
- Create: `n2-adverb.html`
- Create: `n2-compound.html`

形容词、拟声词复用现有的 `n2-adj.html`/`n2-onomatope.html`（不用改，因为只是 `CARD_DATA_URL` 指向的数据文件内容变多了，页面本身不用动）。

- [ ] **Step 1: 确认当前版本号**

```bash
grep -o "app.js?v=[0-9]*\|styles.css?v=[0-9]*" n2-adj.html
```

- [ ] **Step 2: 创建 `n2-adverb.html`**（title "N2 副词速记"，`LEVEL_NAME = 'N2-ADVERB'`，`CARD_DATA_URL = 'data/cards-n2-adverb.json'`，结构照抄 `n2-adj.html`）

- [ ] **Step 3: 创建 `n2-compound.html`**（title "N2 复合动词速记"，`LEVEL_NAME = 'N2-COMPOUND'`，`CARD_DATA_URL = 'data/cards-n2-compound.json'`，结构照抄 `n2-adj.html`——复合动词走的还是 `SIMPLE_MODE` 自由刷卡+测验，不需要接入动词专属的分批学新体系）

- [ ] **Step 4: 验证**

起本地服务，确认 `n2-adverb.html`/`n2-compound.html` + 对应数据文件 HTTP 200；确认现有 `n2-adj.html`/`n2-onomatope.html` 正常显示新追加的卡片（刷到 173/31 张新卡片时内容正确）。

- [ ] **Step 5: 提交**

```bash
git add n2-adverb.html n2-compound.html
git commit -m "feat: 新增 N2 副词/复合动词学习页面"
```

---

## Task 5: 导航接入

**Files:**
- Modify: `word-type-picker.html`
- Modify: `index.html`

- [ ] **Step 1: 修改 `word-type-picker.html`**

当前：
```js
const HAS_ADVERB = ['n1', 'n3', 'n4', 'n5'].includes(level);
const HAS_NOUN = ['n1', 'n3', 'n4', 'n5'].includes(level);
const OPTIONS = [
  { label: '🈁 动词', href: `${level}.html`, desc: '完整学习体系：分批学新+早复习+一般复习' },
  { label: '🎨 形容词', href: `${level}-adj.html`, desc: '自由刷卡 + 测验' },
];
if (HAS_ADVERB) {
  OPTIONS.push({ label: '💬 副词', href: `${level}-adverb.html`, desc: '自由刷卡 + 测验' });
}
OPTIONS.push({ label: '🔊 拟声词', href: `${level}-onomatope.html`, desc: '自由刷卡 + 测验' });
if (HAS_NOUN) {
  OPTIONS.push({ label: '📦 名词', href: `${level}-noun.html`, desc: '自由刷卡 + 测验' });
}
```

改成（加入 N2 到 HAS_ADVERB，新增 HAS_COMPOUND 只对 N2 开放）：
```js
const HAS_ADVERB = ['n1', 'n2', 'n3', 'n4', 'n5'].includes(level);
const HAS_NOUN = ['n1', 'n3', 'n4', 'n5'].includes(level);
const HAS_COMPOUND = ['n2'].includes(level);
const OPTIONS = [
  { label: '🈁 动词', href: `${level}.html`, desc: '完整学习体系：分批学新+早复习+一般复习' },
  { label: '🎨 形容词', href: `${level}-adj.html`, desc: '自由刷卡 + 测验' },
];
if (HAS_ADVERB) {
  OPTIONS.push({ label: '💬 副词', href: `${level}-adverb.html`, desc: '自由刷卡 + 测验' });
}
OPTIONS.push({ label: '🔊 拟声词', href: `${level}-onomatope.html`, desc: '自由刷卡 + 测验' });
if (HAS_NOUN) {
  OPTIONS.push({ label: '📦 名词', href: `${level}-noun.html`, desc: '自由刷卡 + 测验' });
}
if (HAS_COMPOUND) {
  OPTIONS.push({ label: '🔀 复合动词', href: `${level}-compound.html`, desc: '自由刷卡 + 测验' });
}
```

更新附近注释反映新状态：N1/N3/N4/N5 有形容词/副词/拟声词/名词；N2 有形容词/副词/拟声词/**复合动词**（无名词）。

- [ ] **Step 2: 修改 `index.html` 的 N2 入口**

`index.html` 里 N2 入口已经指向 `word-type-picker.html?level=n2`（早前 N1/N2 阶段就做过），不需要改 `href`，只需要更新词量文案——从当前的 `200 词`（原来只统计动词）改成 N2 全部子库合计（动词200 + 形容词241 + 副词75 + 拟声词106 + 复合动词125，用 Task 3 实际产出的真实数字替换）。

- [ ] **Step 3: 验证**

起本地服务，`index.html` → N2 → 词性选择页 → 应该看到 5 个选项（动词/形容词/副词/拟声词/复合动词，没有名词）；N1/N3/N4/N5 应该还是各自的 5 个选项（动词/形容词/副词/拟声词/名词）没有回归。

- [ ] **Step 4: 提交**

```bash
git add word-type-picker.html index.html
git commit -m "feat: N2 导航接入副词/复合动词，词量文案更新"
```

---

## Task 6: 最终验证清单

- [ ] `npm test` 全量跑一遍，确认没有回归
- [ ] `npm run validate` 全部数据文件通过
- [ ] Task 3 Step 5 的跨等级重复检查脚本再跑一遍，确认没有意外重复
- [ ] N2 的形容词/拟声词页面刷到追加的新卡片，内容正常（不只是刷到原来 68/75 张就结束）
- [ ] N2 副词/复合动词新页面能正常访问、自由刷卡、测验
- [ ] 复合动词卡片的 type（活用形）人工抽查通过
- [ ] `index.html` → N2 → 词性选择页 → 5 个选项都能进对应页面（无名词选项）
- [ ] N1/N3/N4/N5 的词性选择页没有因为这次改动而回归

```bash
npm test
npm run validate
```

Expected: 两个命令都以退出码 0 结束。
