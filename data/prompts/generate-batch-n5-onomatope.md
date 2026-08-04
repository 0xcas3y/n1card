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
