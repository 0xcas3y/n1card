# N2 形容词（追加批次）Card Batch Generation Prompt

改编自 `generate-batch-n3-adj.md`，用于给**已有 68 词的 N2 形容词库**追加新词。差异：①难度是 N2 等级（比 N3 更复杂，可用敬语/书面语，不能超 N1 词汇）；②词表由用户直接提供，已确认是真实 N2 词汇，不需要再做 JLPT 等级核实，但仍需做词性自查。

## Input

一份 N2 等级形容词列表（一行一个，调用方直接给出）。

## Output

JSON 对象 `{ "version": 1, "cards": [...] }`，schema 和字段约定与 `generate-batch-n3-adj.md` 完全一致：`id`/`word`/`kana`/`accent`/`type`（`"い形容詞"`|`"な形容詞"`）/`meanings`/`mnemonic`/`examples`。**`id` 起始偏移量由调用方指定**（这批是追加到已有 68 词的文件，起始 id 不是 1）。

**特别提醒**：只有真正能自然说「〜な＋名词」的词才标 `な形容詞`。

**难度差异**：例句可以用 N2 语法点（敬语、书面语、より复杂的修饰从句），词汇不超 N2 大纲。

## Quality checklist

- [ ] `accent` 只在有把握时填
- [ ] 例句只用 N2 及以下等级词汇和语法
- [ ] `kana` 字段纯平假名
- [ ] 每个 な形容词都过一遍「〜な＋名词」自然度检查
- [ ] 生成完之后人工抽查一部分词条

## Reference

参考 `data/prompts/generate-batch-n3-adj.md`，例句难度上调一级。
