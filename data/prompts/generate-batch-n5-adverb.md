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
