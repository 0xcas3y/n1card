# N2 拟声词（追加批次）Card Batch Generation Prompt

改编自 `generate-batch-n3-onomatope.md`，用于给**已有 75 词的 N2 拟声词库**追加新词。差异：词表由用户提供，无需等级核实；难度是 N2 等级。

## Input

一份 N2 等级拟声拟态词列表（一行一个，调用方直接给出）。

## Output

JSON 对象 `{ "version": 1, "cards": [...] }`，schema 和字段约定与 `generate-batch-n3-onomatope.md` 完全一致：`id`/`word`（必须等于 `kana`）/`kana`/`accent`/`meanings`/`mnemonic`/`examples`，不写 `type`。**`id` 起始偏移量由调用方指定**（追加到已有 75 词的文件）。

**难度差异**：例句可以用 N2 语法点。

## Quality checklist

- [ ] `word` 和 `kana` 完全相同
- [ ] `kana` 纯平假名
- [ ] 例句是 N2 等级句型
- [ ] **确认这个词不是已经在 N1/N3/N4/N5 阶段收录过的同一个词**（程序化去重检查）

## Reference

参考 `data/prompts/generate-batch-n3-onomatope.md`，例句难度上调一级。
