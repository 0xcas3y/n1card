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
