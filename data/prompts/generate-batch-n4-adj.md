# N4 形容词 Card Batch Generation Prompt

改编自 `generate-batch-n5-adj.md`，用于生成 N4 等级形容词批次。差异：难度上调到 N4。

## Input

一份 N4 等级常见形容词列表（一行一个，调用方直接给出）。

## Output

JSON 对象 `{ "version": 1, "cards": [...] }`，schema 和字段约定与 `generate-batch-n5-adj.md` 完全一致：`id`/`word`/`kana`/`accent`/`type`（`"い形容詞"`|`"な形容詞"`）/`meanings`/`mnemonic`/`examples`。

**特别提醒**：只有真正在标准词典里被归类为 な形容詞 的词才能写 `な形容詞`——像「たくさん」这种不能接「な」直接修饰名词的词（只能用「の」），不算な形容词，不要收进这个文件。判断标准：这个词能不能自然地说「〜な＋名词」？能就是な形容词，不能就不是。

**难度差异**：
- `examples`：**恰好 2** 个 `{ jp, cn }`，可以用 N4 语法点，词汇不超 N4 大纲

## Quality checklist

- [ ] `accent` 只在有把握时填
- [ ] 例句只用 N4 及以下等级词汇和语法
- [ ] `kana` 字段纯平假名
- [ ] 不写 `transitivity` 字段
- [ ] **每个 な形容词都过一遍「〜な＋名词」自然度检查，不自然就不该标 な形容詞**
- [ ] 生成完之后人工抽查一部分词条

## Reference

参考 `data/prompts/generate-batch-n5-adj.md`，例句难度上调一级。
