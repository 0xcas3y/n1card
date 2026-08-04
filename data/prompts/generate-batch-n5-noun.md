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
