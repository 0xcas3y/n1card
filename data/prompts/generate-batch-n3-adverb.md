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
