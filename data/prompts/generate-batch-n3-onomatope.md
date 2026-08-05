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
