# N4 オノマトペ Card Batch Generation Prompt

改编自 `generate-batch-n5-onomatope.md`，用于生成 N4 等级拟声拟态词批次。差异：难度上调到 N4，且 N4 阶段拟声词数量预期比 N5 多一些（N5 只找到 1 个能明确归为 N4 及以下等级的），但仍然可能是小类别，不强行凑数。

## Input

一份 N4 等级常见拟声拟态词列表（一行一个，调用方直接给出）。

## Output

JSON 对象 `{ "version": 1, "cards": [...] }`，schema 和字段约定与 `generate-batch-n5-onomatope.md` 完全一致：`id`/`word`（必须等于 `kana`）/`kana`/`accent`/`meanings`/`mnemonic`/`examples`，不写 `type`。

**难度差异**：例句可以用 N4 语法点，词汇不超 N4 大纲。

## Quality checklist

- [ ] `word` 和 `kana` 完全相同
- [ ] `kana` 纯平假名
- [ ] 不写 `type`/`transitivity` 字段
- [ ] 例句是 N4 等级句型
- [ ] **确认这个词不是已经在 N5 阶段收录过的同一个词**（拟声词/副词之间容易混淆，比如 N5 阶段的 ちょっと/もっと/ゆっくり 已经明确排除在拟声词外，N4 采词时同样要用「有没有真正的重复音节结构（giongo/gitaigo）」这条标准过滤，不要照抄 N5 已经判定过的边界词）

## Reference

参考 `data/prompts/generate-batch-n5-onomatope.md`，例句难度上调一级。
