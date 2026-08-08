# N2 名词 Card Batch Generation Prompt

用于生成 N2 等级名词批次（N2 首次拥有独立名词库）。差异：①难度是 N2 等级；②词表由用户直接提供，每行格式是「日语词 (中文释义)」，用户已经给出了权威的中文释义参考，不需要重新翻译或猜测，`meanings` 字段应该以用户给出的释义为基础（可以润色成更完整的短语，但核心含义必须和用户给的一致，不要另起炉灶）；③不需要做 JLPT 等级核实（词表本身就是权威来源）。

## Input

一份 N2 等级常见名词列表，每行格式：`日语词 (中文释义)`，例如：
```
合図 (信号)
栄養 (营养)
```

## Output

JSON 对象 `{ "version": 1, "cards": [...] }`，schema 和字段约定与 `generate-batch-n4-noun.md` 完全一致：`id`/`word`/`kana`/`accent`/`meanings`/`mnemonic`/`examples`，不写 `type`/`transitivity`。

- `meanings`（string[]）：**以用户给出的释义为准**。如果这个词有多个常见义项，可以在用户给出的释义基础上补充 1-2 条，但用户给出的那条必须保留且是第一条。
- `mnemonic`：助记法风格不变（短语叙事体 / 朴素读音锚点 / 复合词词素分解）
- `examples`：**恰好 2** 个 `{ jp, cn }`，句子可以用 N2 语法点（敬语、书面语、复杂修饰从句），词汇不超 N2 大纲

## Quality checklist

- [ ] `meanings` 第一条准确反映用户给出的中文释义
- [ ] `kana` 字段纯平假名
- [ ] 不写 `type`/`transitivity` 字段
- [ ] 例句只用 N2 及以下等级词汇和语法
- [ ] 生成后自查一遍：这批词里有没有重复？有没有明显该属于形容词/副词但被塞进名词表的？

## Reference

参考 `data/prompts/generate-batch-n4-noun.md`，例句难度上调一级；释义来源方式参考 `data/prompts/generate-batch-n2-adj-append.md`（同样是用户直接提供词表、不做等级核实的模式）。
