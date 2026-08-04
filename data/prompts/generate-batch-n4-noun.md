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
