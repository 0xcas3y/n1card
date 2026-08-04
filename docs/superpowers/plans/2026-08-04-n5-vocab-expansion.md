# N5 词库扩容（词性拆分 + 自动化生成脚本试点）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 N5 词库从现有的纯动词库（80 词）扩容到覆盖名词/形容词/副词/オノマトペ 4 个新词性子库，并搭建一个调 Claude API 的批量生成脚本，作为后续 N4/N3 复用的基础设施。

**Architecture:** 新建 `scripts/generate-cards.js`（纯函数 + CLI），复用 `scripts/validate-cards.js` 做格式校验；新词表来源于公开 JLPT N5 词汇资料；生成的卡片写入新的 `data/cards-n5-{noun,adj,adverb,onomatope}.json`；4 个新 HTML 页面复用现有 `n1-noun.html` 等页面的静态结构；导航复用现有 `word-type-picker.html` 的按 `level` 参数驱动模式。

**Tech Stack:** 纯前端静态站点（无构建步骤）、Node.js `--test` 测试、Anthropic Messages API（`fetch` 直连，无 SDK 依赖，与 `jlpt-mock/lib/api.js` 的既有模式一致）。

## Global Constraints

- Schema 和现有 `data/cards.json` 完全一致，**不修改** `scripts/validate-cards.js`（来自 spec §2.2）
- 拟声词 `word` 必须等于 `kana`（来自 spec §2.5，沿用既有约定）
- 例句难度必须匹配 N5 等级（简单句，不能出现 N1 词汇）（来自 spec §2.5）
- 生成后必须过 `scripts/validate-cards.js`，格式不过的批次不写入（来自 spec §2.6）
- 内容准确性（读音/词性/释义/例句）无法自动校验，只能人工抽查，不追求逐条审核（来自 spec §2.6/§4）
- 词性配额不预设固定比例，以实际能收集到的词表规模为准（来自 spec §2.3）
- 本计划范围仅 N5——N4/N3 复用同一套脚本/prompt 风格，属于后续独立计划（来自 spec §1 执行顺序）

---

## Task 1: 生成脚本的纯函数核心

**Files:**
- Create: `scripts/generate-cards.js`
- Test: `scripts/generate-cards.test.js`

**Interfaces:**
- Consumes: `validate` from `./validate-cards.js`（已存在，签名 `validate(data: {version, cards}) => {ok: boolean, errors: string[]}`）
- Produces：
  - `buildBatchPrompt(promptTemplate: string, words: string[], startId: number) => string`
  - `parseCardBatchResponse(responseText: string) => {version: 1, cards: object[]}`
  - `chunkWords(words: string[], size: number) => string[][]`
  - `mergeCardBatches(existing: {version, cards}, newBatch: {version, cards}) => {version, cards}`
  - `generateBatch(apiKey: string, promptTemplate: string, words: string[], startId: number, fetchImpl?: typeof fetch) => Promise<{version: 1, cards: object[]}>`

这些是 Task 2（CLI）会直接调用的函数名和签名，必须完全一致。

- [ ] **Step 1: 写失败的测试**

创建 `scripts/generate-cards.test.js`：

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildBatchPrompt, parseCardBatchResponse, chunkWords, mergeCardBatches, generateBatch } from './generate-cards.js';

test('buildBatchPrompt includes the template, every word, and its assigned id', () => {
  const prompt = buildBatchPrompt('TEMPLATE_TEXT', ['ある', 'いる'], 5);
  assert.ok(prompt.includes('TEMPLATE_TEXT'));
  assert.ok(prompt.includes('5. ある'));
  assert.ok(prompt.includes('6. いる'));
  assert.ok(prompt.includes('JSON'));
});

test('parseCardBatchResponse extracts a plain JSON object', () => {
  const text = '{"version":1,"cards":[{"id":1,"word":"ある"}]}';
  const result = parseCardBatchResponse(text);
  assert.deepEqual(result, { version: 1, cards: [{ id: 1, word: 'ある' }] });
});

test('parseCardBatchResponse extracts JSON wrapped in a markdown code fence', () => {
  const text = 'Here:\n```json\n{"version":1,"cards":[]}\n```\nDone.';
  const result = parseCardBatchResponse(text);
  assert.deepEqual(result, { version: 1, cards: [] });
});

test('parseCardBatchResponse throws a descriptive error when no JSON object is found', () => {
  assert.throws(() => parseCardBatchResponse('no json here'), /no JSON object found/);
});

test('chunkWords splits into groups of the given size, last group may be smaller', () => {
  const result = chunkWords(['a', 'b', 'c', 'd', 'e'], 2);
  assert.deepEqual(result, [['a', 'b'], ['c', 'd'], ['e']]);
});

test('chunkWords returns empty array for empty input', () => {
  assert.deepEqual(chunkWords([], 5), []);
});

test('mergeCardBatches concatenates cards onto the existing list', () => {
  const existing = { version: 1, cards: [{ id: 1, word: 'ある' }] };
  const newBatch = { version: 1, cards: [{ id: 2, word: 'いる' }] };
  const result = mergeCardBatches(existing, newBatch);
  assert.deepEqual(result, { version: 1, cards: [{ id: 1, word: 'ある' }, { id: 2, word: 'いる' }] });
});

test('mergeCardBatches treats a null existing value as an empty deck', () => {
  const result = mergeCardBatches(null, { version: 1, cards: [{ id: 1, word: 'ある' }] });
  assert.deepEqual(result, { version: 1, cards: [{ id: 1, word: 'ある' }] });
});

test('generateBatch returns an empty deck without calling fetchImpl when words is empty', async () => {
  let called = false;
  const fakeFetch = async () => { called = true; };
  const result = await generateBatch('fake-key', 'TEMPLATE', [], 1, fakeFetch);
  assert.deepEqual(result, { version: 1, cards: [] });
  assert.equal(called, false);
});

test('generateBatch posts to the Anthropic API with the right headers/model and parses the response', async () => {
  let capturedUrl, capturedOptions;
  const fakeFetch = async (url, options) => {
    capturedUrl = url;
    capturedOptions = options;
    return { json: async () => ({ content: [{ text: '{"version":1,"cards":[{"id":5,"word":"ある"}]}' }] }) };
  };
  const result = await generateBatch('fake-key', 'TEMPLATE', ['ある'], 5, fakeFetch);
  assert.equal(capturedUrl, 'https://api.anthropic.com/v1/messages');
  assert.equal(capturedOptions.headers['x-api-key'], 'fake-key');
  assert.equal(capturedOptions.headers['anthropic-version'], '2023-06-01');
  const body = JSON.parse(capturedOptions.body);
  assert.equal(body.model, 'claude-sonnet-4-6');
  assert.deepEqual(result, { version: 1, cards: [{ id: 5, word: 'ある' }] });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `node --test scripts/generate-cards.test.js`
Expected: FAIL（`generate-cards.js` 不存在，报 module not found）

- [ ] **Step 3: 写最小实现**

创建 `scripts/generate-cards.js`：

```js
export function buildBatchPrompt(promptTemplate, words, startId) {
  return [
    promptTemplate,
    '',
    `起始 id 偏移量：${startId}（第一个词的 id = ${startId}，之后依次 +1）`,
    '',
    '词表：',
    words.map((w, i) => `${startId + i}. ${w}`).join('\n'),
    '',
    '只返回符合 schema 的 JSON 对象，不要有其他文字说明。',
  ].join('\n');
}

export function parseCardBatchResponse(responseText) {
  const fenced = responseText.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced ? fenced[1] : responseText;
  const objMatch = candidate.match(/\{[\s\S]*\}/);
  if (!objMatch) {
    throw new Error(`parseCardBatchResponse: no JSON object found in response: ${responseText.slice(0, 200)}`);
  }
  return JSON.parse(objMatch[0]);
}

export function chunkWords(words, size) {
  const chunks = [];
  for (let i = 0; i < words.length; i += size) chunks.push(words.slice(i, i + size));
  return chunks;
}

export function mergeCardBatches(existing, newBatch) {
  const existingCards = existing?.cards ?? [];
  return { version: 1, cards: [...existingCards, ...newBatch.cards] };
}

export async function generateBatch(apiKey, promptTemplate, words, startId, fetchImpl = fetch) {
  if (words.length === 0) return { version: 1, cards: [] };
  const prompt = buildBatchPrompt(promptTemplate, words, startId);
  const response = await fetchImpl('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 8192,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  const data = await response.json();
  const text = data.content?.[0]?.text ?? '';
  return parseCardBatchResponse(text);
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `node --test scripts/generate-cards.test.js`
Expected: PASS，全部 10 个测试通过

- [ ] **Step 5: 提交**

```bash
git add scripts/generate-cards.js scripts/generate-cards.test.js
git commit -m "feat: 新增卡片批量生成脚本的纯函数核心"
```

---

## Task 2: CLI 入口（读词表 → 分批调 API → 校验 → 写入）

**Files:**
- Modify: `scripts/generate-cards.js`（追加 CLI 部分，末尾）

**Interfaces:**
- Consumes: Task 1 的全部导出函数；`validate` from `./validate-cards.js`
- Produces: 命令行用法 `node scripts/generate-cards.js <word-list.txt> <prompt.md> <output.json> [batchSize=20]`，读取环境变量 `ANTHROPIC_API_KEY`

CLI 部分不接入自动化测试（不 mock 真实网络调用/文件系统副作用，和 `scripts/plan.test.js`/`scripts/recall.test.js` 只测纯函数的既有风格一致），靠 Task 6 的实际运行验证。

- [ ] **Step 1: 在 `scripts/generate-cards.js` 末尾追加 CLI 逻辑**

```js
import { validate } from './validate-cards.js';

if (import.meta.url === `file://${process.argv[1]}`) {
  const fs = await import('node:fs/promises');
  const [, , wordListPath, promptPath, outputPath, batchSizeArg] = process.argv;
  if (!wordListPath || !promptPath || !outputPath) {
    console.error('用法: node scripts/generate-cards.js <word-list.txt> <prompt.md> <output.json> [batchSize=20]');
    process.exit(1);
  }
  const batchSize = parseInt(batchSizeArg, 10) || 20;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error('error: 环境变量 ANTHROPIC_API_KEY 未设置');
    process.exit(1);
  }

  const promptTemplate = await fs.readFile(promptPath, 'utf8');
  const words = (await fs.readFile(wordListPath, 'utf8'))
    .split('\n').map((s) => s.trim()).filter(Boolean);

  let existing = { version: 1, cards: [] };
  try {
    existing = JSON.parse(await fs.readFile(outputPath, 'utf8'));
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }
  let nextId = existing.cards.reduce((max, c) => Math.max(max, c.id), 0) + 1;

  const chunks = chunkWords(words, batchSize);
  console.log(`${words.length} 个词，分 ${chunks.length} 批，每批最多 ${batchSize} 个`);

  let result = existing;
  for (let i = 0; i < chunks.length; i++) {
    console.log(`批次 ${i + 1}/${chunks.length}（${chunks[i].length} 词，起始 id=${nextId}）...`);
    const batch = await generateBatch(apiKey, promptTemplate, chunks[i], nextId);
    const check = validate(batch);
    if (!check.ok) {
      console.error(`批次 ${i + 1} 校验失败，跳过写入：`);
      check.errors.forEach((e) => console.error('  - ' + e));
      continue;
    }
    result = mergeCardBatches(result, batch);
    nextId += chunks[i].length;
    await fs.writeFile(outputPath, JSON.stringify(result, null, 2) + '\n', 'utf8');
    console.log(`已写入 ${outputPath}（累计 ${result.cards.length} 词）`);
  }
}
```

把文件顶部的 `import { validate } from './validate-cards.js';` 挪到文件最上面（和其他 import 放一起，不要留在中间）。

- [ ] **Step 2: 跑一遍现有测试，确认新增的 import 没有破坏 Task 1 的纯函数测试**

Run: `node --test scripts/generate-cards.test.js`
Expected: PASS，仍然是 10 个测试通过（CLI 部分被 `import.meta.url` 判断挡住，`--test` 运行时不会触发）

- [ ] **Step 3: 提交**

```bash
git add scripts/generate-cards.js
git commit -m "feat: 生成脚本新增 CLI 入口"
```

---

## Task 3: `npm run validate` 支持批量校验所有数据文件

**Files:**
- Modify: `package.json`

**Interfaces:** 无（纯 npm script 改动）

- [ ] **Step 1: 修改 `package.json` 的 `validate` 脚本**

把：
```json
    "validate": "node scripts/validate-cards.js data/cards.json"
```
改成：
```json
    "validate": "for f in data/cards*.json; do node scripts/validate-cards.js \"$f\" || exit 1; done"
```

- [ ] **Step 2: 运行确认现有数据文件全部通过**

Run: `npm run validate`
Expected: 逐个打印 `ok: N cards valid`，对现有全部 `data/cards*.json`（含 `cards.json`/`cards-n1-*.json`/`cards-n2-*.json`/`cards-n3.json`/`cards-n4.json`/`cards-n5.json`），退出码 0。注意 `cards.seed.json` 不匹配 `cards*.json` 之外的其他非卡片文件不会被误扫（`raw-words.txt`、`prompts/` 目录本来就不匹配 glob）。

- [ ] **Step 3: 提交**

```bash
git add package.json
git commit -m "chore: validate 脚本支持批量校验所有 data/cards*.json"
```

---

## Task 4: N5 专用生成 prompt（名词/形容词/副词/オノマトペ）

**Files:**
- Create: `data/prompts/generate-batch-n5-noun.md`
- Create: `data/prompts/generate-batch-n5-adj.md`
- Create: `data/prompts/generate-batch-n5-adverb.md`
- Create: `data/prompts/generate-batch-n5-onomatope.md`

这 4 个文件分别改编自现有的 `generate-batch-noun.md`/`generate-batch-adj.md`/`generate-batch-adverb.md`/`generate-batch-onomatope.md`，schema、`word`/`kana`/字段约定完全不变，只做两处调整：①明确要求调用方提供词表（不再"自行汇总"，因为词表由 Task 5 从公开来源采集，交给模型自由汇总会失控重复/失真）；②难度下调到 N5 等级。

- [ ] **Step 1: 创建 `data/prompts/generate-batch-n5-noun.md`**

```markdown
# N5 名词 Card Batch Generation Prompt

改编自 `generate-batch-noun.md`，用于生成 N5 等级名词批次。差异：①词表必须由调用方提供（不自行汇总，避免和 N5 动词库、其它词性批次重复）；②难度下调——例句只用 N5 语法（である/です・ます体基础句型、基础助词），不出现 N5 大纲以外的词汇。

## Input

一份 N5 等级常见名词列表（一行一个，调用方直接给出，可能带（する）标记表示可作サ变动词）。

## Output

JSON 对象 `{ "version": 1, "cards": [...] }`，schema 和字段约定与 `generate-batch-noun.md` 完全一致：`id`/`word`/`kana`/`accent`/`meanings`/`mnemonic`/`examples`，不写 `type`/`transitivity`。

**唯一差异在难度**：
- `meanings`：中文释义要简洁直白，不用生僻字
- `mnemonic`：助记法风格不变（短语叙事体：拆音节+短语+中文钩子，或朴素汉字读音锚点），但词块本身要是 N5-N4 等级的基础词，不要用生僻词块
- `examples`：**恰好 2** 个 `{ jp, cn }`，句子必须是 N5 等级的基础句型（简单主谓宾、基础て形/ます形），不能出现 N5 大纲以外的词汇或复杂从句

## Quality checklist

- [ ] 例句只用 N5 等级词汇和基础句型，读起来像初学者能看懂的日语
- [ ] 助记法词块本身也是简单词，不要为了凑短语引入生僻字
- [ ] `kana` 字段纯平假名（跑 `scripts/validate-cards.js` 校验）
- [ ] 不写 `type`/`transitivity` 字段
- [ ] 标了（する）的词，例句体现サ变动词用法

## Reference

参考 `data/prompts/generate-batch-noun.md`（N1/N2 版）的助记法风格，例句难度对齐 `data/cards-n5.json` 现有动词条目的例句风格。
```

- [ ] **Step 2: 创建 `data/prompts/generate-batch-n5-adj.md`**

```markdown
# N5 形容词 Card Batch Generation Prompt

改编自 `generate-batch-adj.md`，用于生成 N5 等级形容词批次。差异：①词表必须由调用方提供；②难度下调到 N5 等级。

## Input

一份 N5 等级常见形容词列表（一行一个，调用方直接给出）。

## Output

JSON 对象 `{ "version": 1, "cards": [...] }`，schema 和字段约定与 `generate-batch-adj.md` 完全一致：`id`/`word`/`kana`/`accent`/`type`（`"い形容詞"`|`"な形容詞"`）/`meanings`/`mnemonic`/`examples`。

**唯一差异在难度**：
- `meanings`：简洁直白，不用生僻字
- `mnemonic`：短语叙事体风格不变，但词块要用 N5-N4 等级的基础词
- `examples`：**恰好 2** 个 `{ jp, cn }`，句子必须是 N5 等级的基础句型（简单形容词修饰/です・ます体），不能出现大纲以外的词汇

## Quality checklist

- [ ] `accent` 只在有把握时填，`null` 完全可以接受
- [ ] 例句只用 N5 等级词汇和基础句型
- [ ] `kana` 字段纯平假名（跑 `scripts/validate-cards.js` 校验）
- [ ] 不写 `transitivity` 字段
- [ ] 生成完之后人工抽查一部分词条的读音/词性/释义是否准确

## Reference

参考 `data/prompts/generate-batch-adj.md`（N1/N2 版）的助记法风格，例句难度对齐 `data/cards-n5.json` 现有动词条目。
```

- [ ] **Step 3: 创建 `data/prompts/generate-batch-n5-adverb.md`**

```markdown
# N5 副词 Card Batch Generation Prompt

改编自 `generate-batch-adverb.md`，用于生成 N5 等级副词批次。差异：①词表必须由调用方提供（原版本就已要求，本条不变）；②难度下调到 N5 等级。

## Input

一份 N5 等级常见副词列表（一行一个，调用方直接给出）。

## Output

JSON 对象 `{ "version": 1, "cards": [...] }`，schema 和字段约定与 `generate-batch-adverb.md` 完全一致：`id`/`word`/`kana`/`accent`/`meanings`/`mnemonic`/`examples`，不写 `type`/`transitivity`。

**唯一差异在难度**：例句必须是 N5 等级基础句型，不能出现大纲以外的词汇；助记法词块同样要用简单词。

## Quality checklist

- [ ] 助记法过三关（音准+短语连贯+含义钩子）或朴素读音锚点，词块是简单词
- [ ] `kana` 字段纯平假名
- [ ] 不写 `type`/`transitivity` 字段
- [ ] 例句是 N5 等级的自然基础句型

## Reference

参考 `data/prompts/generate-batch-adverb.md`（N1/N2 版）。
```

- [ ] **Step 4: 创建 `data/prompts/generate-batch-n5-onomatope.md`**

```markdown
# N5 オノマトペ Card Batch Generation Prompt

改编自 `generate-batch-onomatope.md`，用于生成 N5 等级拟声拟态词批次。差异：①词表必须由调用方提供（原版本是自行汇总，这里改成调用方提供，因为 N5 等级的拟声词数量本来就少，交给模型自由汇总容易和真实大纲脱节）；②难度下调，例句用基础句型。

**注意**：N5 官方大纲里能明确归类为"拟声拟态词"的词条数量非常有限（远少于名词/形容词/副词），Task 5 采集词表时如果找到的合规词条不足 20-30 个也是正常的，不需要为了凑数硬拉高等级词汇进来。

## Input

一份 N5 等级常见拟声拟态词列表（一行一个，调用方直接给出）。

## Output

JSON 对象 `{ "version": 1, "cards": [...] }`，schema 和字段约定与 `generate-batch-onomatope.md` 完全一致：`id`/`word`（必须等于 `kana`）/`kana`/`accent`/`meanings`/`mnemonic`/`examples`，不写 `type`。

**唯一差异在难度**：例句用 N5 等级基础句型；意象联想描述用词也要简单直白。

## Quality checklist

- [ ] `word` 和 `kana` 完全相同
- [ ] `kana` 纯平假名
- [ ] 不写 `type`/`transitivity` 字段
- [ ] 例句是 N5 等级基础句型
- [ ] 生成完之后人工抽查

## Reference

参考 `data/prompts/generate-batch-onomatope.md`（N1/N2 版）。
```

- [ ] **Step 5: 提交**

```bash
git add data/prompts/generate-batch-n5-noun.md data/prompts/generate-batch-n5-adj.md data/prompts/generate-batch-n5-adverb.md data/prompts/generate-batch-n5-onomatope.md
git commit -m "docs: 新增 N5 名词/形容词/副词/拟声词生成 prompt"
```

---

## Task 5: 采集 N5 原始词表（名词/形容词/副词/オノマトペ）

**Files:**
- Create: `data/raw-words-n5-noun.txt`
- Create: `data/raw-words-n5-adj.txt`
- Create: `data/raw-words-n5-adverb.txt`
- Create: `data/raw-words-n5-onomatope.txt`

格式参考现有 `data/raw-words.txt`：一行一个词（有汉字写汉字，纯假名词就写假名），不加编号、不加释义。

**这个任务的实际执行者需要用 WebSearch/WebFetch 工具**（不是写代码），流程：

- [ ] **Step 1: 搜索公开权威的 JLPT N5 词汇表**

用 WebSearch 查找公开、可信的 N5 词汇表来源（例如知名的 JLPT 词表整理站点），交叉核对至少 2 个来源以避免单一来源的错漏——N5 是最基础、最标准化的等级，权威来源之间差异应该很小，如果某个词在多数来源里都缺失或存疑，宁可不收录。

- [ ] **Step 2: 按词性分类，去掉已在 `data/cards-n5.json` 里的动词**

`data/cards-n5.json` 现有 80 个动词条目，采集到的名词/形容词/副词/オノマトペ 词表不需要跟动词去重（词性不同不会撞），但同一词性内部要去重。

- [ ] **Step 3: 写入 4 个 `data/raw-words-n5-*.txt` 文件**

每个文件一行一词。名词/形容词预期能收集到大几十到一两百量级（N5 大纲总量~800，减去已有 80 动词后其余分布在 4 个词性里）；オノマトペ 预期数量很少（可能只有个位数到二三十个），这是正常的，不强行凑数（呼应 Task 4 里 onomatope prompt 的注意事项）。

- [ ] **Step 4: 记录实际采集到的数量**

在 commit message 里写清楚 4 个文件各自的词条数，方便后续核对最终 N5 总词量是否接近官方大纲的 ~800。

- [ ] **Step 5: 提交**

```bash
git add data/raw-words-n5-noun.txt data/raw-words-n5-adj.txt data/raw-words-n5-adverb.txt data/raw-words-n5-onomatope.txt
git commit -m "data: 采集 N5 名词/形容词/副词/拟声词原始词表"
```

---

## Task 6: 跑生成脚本产出 N5 四个新数据文件

**Files:**
- Create: `data/cards-n5-noun.json`
- Create: `data/cards-n5-adj.json`
- Create: `data/cards-n5-adverb.json`
- Create: `data/cards-n5-onomatope.json`

**前置条件**：需要一个可用的 `ANTHROPIC_API_KEY`。实现者如果没有在 shell 里 export 过，要先问用户要，不要在 commit 或任何日志里打印这个 key。

- [ ] **Step 1: 逐个词性跑生成脚本**

```bash
export ANTHROPIC_API_KEY="<用户提供的 key>"
node scripts/generate-cards.js data/raw-words-n5-noun.txt data/prompts/generate-batch-n5-noun.md data/cards-n5-noun.json 20
node scripts/generate-cards.js data/raw-words-n5-adj.txt data/prompts/generate-batch-n5-adj.md data/cards-n5-adj.json 20
node scripts/generate-cards.js data/raw-words-n5-adverb.txt data/prompts/generate-batch-n5-adverb.md data/cards-n5-adverb.json 20
node scripts/generate-cards.js data/raw-words-n5-onomatope.txt data/prompts/generate-batch-n5-onomatope.md data/cards-n5-onomatope.json 20
```

批大小从 20 开始（比 N1 当年 30-70 的人工批次更保守，因为是无人工实时纠偏的自动调用，出错了只需要重跑一小批而不是全部）。如果某一批因为 API 返回超长被截断导致 JSON 解析失败，把 `batchSize` 调小（比如 10）重跑那个词性。

- [ ] **Step 2: 跑一遍完整校验**

Run: `npm run validate`
Expected: 新增的 4 个文件和其余所有 `data/cards*.json` 全部 `ok`

- [ ] **Step 3: 人工抽查**

从每个新文件里随机抽 5-8 条，核对：读音是否正确、词义是否准确、例句是否符合 N5 难度（不能出现明显超纲词汇）、拟声词的 `word === kana` 是否成立。发现问题就手动修正 JSON 里对应条目（不用重跑整批）。

- [ ] **Step 4: 提交**

```bash
git add data/cards-n5-noun.json data/cards-n5-adj.json data/cards-n5-adverb.json data/cards-n5-onomatope.json
git commit -m "data: 新增 N5 名词/形容词/副词/拟声词卡片数据"
```

---

## Task 7: N5 四个新页面

**Files:**
- Create: `n5-noun.html`
- Create: `n5-adj.html`
- Create: `n5-adverb.html`
- Create: `n5-onomatope.html`

结构完全照抄现有 `n1-noun.html`（Task 依赖：`styles.css`/`app.js` 当前版本号 `v=49`，和站内其它页面保持一致，不用额外 bump，因为这次改动不涉及 `app.js`/`styles.css` 本身的逻辑变化）。

- [ ] **Step 1: 创建 `n5-noun.html`**

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
  <title>N5 名词速记</title>
  <link rel="stylesheet" href="styles.css?v=49">
</head>
<body>
  <div id="app">
    <header id="topbar"></header>
    <main id="cardstage"></main>
  </div>
  <script>
    window.LEVEL_NAME = 'N5-NOUN';
    window.CARD_DATA_URL = 'data/cards-n5-noun.json';
    window.SIMPLE_MODE = true;
  </script>
  <script type="module" src="app.js?v=49"></script>
</body>
</html>
```

- [ ] **Step 2: 创建 `n5-adj.html`**（同上结构，替换 3 处：`<title>N5 形容词速记</title>`、`LEVEL_NAME = 'N5-ADJ'`、`CARD_DATA_URL = 'data/cards-n5-adj.json'`）

- [ ] **Step 3: 创建 `n5-adverb.html`**（同上结构，替换：`<title>N5 副词速记</title>`、`LEVEL_NAME = 'N5-ADVERB'`、`CARD_DATA_URL = 'data/cards-n5-adverb.json'`）

- [ ] **Step 4: 创建 `n5-onomatope.html`**（同上结构，替换：`<title>N5 拟声词速记</title>`、`LEVEL_NAME = 'N5-ONOMATOPE'`、`CARD_DATA_URL = 'data/cards-n5-onomatope.json'`）

- [ ] **Step 5: 本地起服务手动验证**

```bash
npm run serve
```

打开 `http://localhost:8000/n5-noun.html`（以及 adj/adverb/onomatope 三个），确认能看到卡片、单击发音、双击翻面、滑动标记正常，且和 `n5.html`（动词）的"已掌握/待巩固"计数互不影响（这条是 `LEVEL_KEY` 隔离的既有机制，`2026-07-16` spec §4 已验证过同样的模式）。

- [ ] **Step 6: 提交**

```bash
git add n5-noun.html n5-adj.html n5-adverb.html n5-onomatope.html
git commit -m "feat: 新增 N5 名词/形容词/副词/拟声词学习页面"
```

---

## Task 8: 导航接入 —— word-type-picker.html + index.html

**Files:**
- Modify: `word-type-picker.html`
- Modify: `index.html`

**Interfaces:** 无新增函数，纯页面路由改动。

- [ ] **Step 1: 修改 `word-type-picker.html` 支持 N5 五选项**

当前文件（第 41、48-55 行）：

```js
const level = ['n1', 'n2'].includes(rawLevel) ? rawLevel : 'n1';
const LEVEL_LABEL = level.toUpperCase();
document.getElementById('picker-title').textContent = `📚 ${LEVEL_LABEL} 选择词性`;
const OPTIONS = [
  { label: '🈁 动词', href: `${level}.html`, desc: '完整学习体系：分批学新+早复习+一般复习' },
  { label: '🎨 形容词', href: `${level}-adj.html`, desc: '自由刷卡 + 测验' },
];
// 副词/拟声词/名词目前只有 N1 数据，等 N2 补上再放开
if (level === 'n1') {
  OPTIONS.push({ label: '💬 副词', href: `${level}-adverb.html`, desc: '自由刷卡 + 测验' });
}
OPTIONS.push({ label: '🔊 拟声词', href: `${level}-onomatope.html`, desc: '自由刷卡 + 测验' });
if (level === 'n1') {
  OPTIONS.push({ label: '📦 名词', href: `${level}-noun.html`, desc: '自由刷卡 + 测验' });
}
```

改成：

```js
const level = ['n1', 'n2', 'n3', 'n4', 'n5'].includes(rawLevel) ? rawLevel : 'n1';
const LEVEL_LABEL = level.toUpperCase();
document.getElementById('picker-title').textContent = `📚 ${LEVEL_LABEL} 选择词性`;
// 各词性子库目前的数据覆盖情况：N1 全部 4 种都有；N5 本次新增全部 4 种；
// N2 只有形容词/拟声词；N3/N4 还没有任何子库（下一轮扩容内容）
const HAS_ADVERB = ['n1', 'n5'].includes(level);
const HAS_NOUN = ['n1', 'n5'].includes(level);
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

注意：`n3`/`n4` 传进来时目前还没有 `-adj.html`/`-onomatope.html`，会点进不存在的页面 404——这是 spec 明确范围外的部分（本计划只做 N5），先只让 `index.html` 里 N5 一个入口指向这个选择页（下一步），N3/N4 的 `index.html` 入口保持原样直接指向 `n3.html`/`n4.html`，不经过这个选择页，不会触发这个问题。

- [ ] **Step 2: 修改 `index.html` 的 N5 入口**

第 99 行，从：
```html
      <a class="level-btn lv-n5" href="n5.html">
```
改成：
```html
      <a class="level-btn lv-n5" href="word-type-picker.html?level=n5">
```

- [ ] **Step 3: 更新 N5 入口的词量提示文案**

第 101 行，从：
```html
        <span class="meta"><span class="count">80 词</span>入门基础</span>
```
改成 Task 6 实际产出的总词量（动词 80 + 新增 4 个文件的实际 `cards.length` 之和，用 Task 6 跑完后的真实数字替换下面的 `<TOTAL>`）：
```html
        <span class="meta"><span class="count"><TOTAL> 词</span>入门基础</span>
```

- [ ] **Step 4: 本地验证**

```bash
npm run serve
```
打开 `http://localhost:8000/index.html`，点 N5 → 应该进入词性选择页，看到 5 个选项（动词/形容词/副词/拟声词/名词）；逐个点进去确认都能正常加载卡片。再点 N1 确认没有回归（还是 5 个选项，行为不变）；点 N2 确认还是 3 个选项（动词/形容词/拟声词，没有副词/名词——因为 N2 没数据，属于设计内的正常状态）。

- [ ] **Step 5: 提交**

```bash
git add word-type-picker.html index.html
git commit -m "feat: N5 首页入口接入词性选择页，含名词/形容词/副词/拟声词四个新词性"
```

---

## Task 9: 最终验证清单

对照 spec `2026-08-04-n3n4n5-vocab-expansion-design.md` §5.2 手动清单逐条确认：

- [ ] N5 词表来源确定，拿到了名词/形容词/副词/拟声词的原始词条列表（Task 5 产出）
- [ ] 生成脚本在 N5 上跑通，`npm run validate` 全部通过（Task 6）
- [ ] 人工抽查生成结果，没有系统性错误（Task 6 Step 3）
- [ ] N5 四个新页面能正常访问、自由刷卡、测验（Task 7 Step 5）
- [ ] `index.html` → N5 → 词性选择页 → 五个选项都能进对应页面（Task 8 Step 4）
- [ ] N1/N2 的词性选择页没有因为选项从 3 个改成 5 个而出问题（Task 8 Step 4）
- [ ] `npm test` 全量跑一遍确认没有回归

```bash
npm test
npm run validate
```

Expected: 两个命令都以退出码 0 结束。
