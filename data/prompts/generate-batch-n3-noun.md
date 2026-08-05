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
