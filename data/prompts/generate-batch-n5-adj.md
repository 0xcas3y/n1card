# N5 形容词 Card Batch Generation Prompt

改编自 `generate-batch-adj.md`，用于生成 N5 等级形容词批次。差异：①词表必须由调用方提供；②难度下调到 N5 等级。

## Input

一份 N5 等级常见形容词列表（一行一个，调用方直接给出）。

## Output

JSON 对象 `{ "version": 1, "cards": [...] }`，schema 和字段约定与 `generate-batch-adj.md` 完全一致：`id`/`word`/`kana`/`accent`/`type`（`"い形容詞"`|`"な形容詞"`）/`meanings`/`mnemonic`/`examples`。

**唯一差异在难度**：
- `meanings`：简洁直白，不用生僻字
- `mnemonic`：短语叙事体风格不变，但词块要用 N5-N4 等级的基础词
- `examples`：**恰好 2** 个 `{ jp, cn }`，句子必须是 N5 等级的基础句型（简单形容词修饰/です・ます体），不能出现大纲以外的词汇

## Quality checklist

- [ ] `accent` 只在有把握时填，`null` 完全可以接受
- [ ] 例句只用 N5 等级词汇和基础句型
- [ ] `kana` 字段纯平假名（跑 `scripts/validate-cards.js` 校验）
- [ ] 不写 `transitivity` 字段
- [ ] 生成完之后人工抽查一部分词条的读音/词性/释义是否准确

## Reference

参考 `data/prompts/generate-batch-adj.md`（N1/N2 版）的助记法风格，例句难度对齐 `data/cards-n5.json` 现有动词条目。
