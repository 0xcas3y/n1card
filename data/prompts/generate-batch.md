# N1 Verb Card Batch Generation Prompt

Use this prompt (or a subagent) to generate `cards.json` entries for a batch of N1 verbs.

## Input
A list of N1-level Japanese verbs (one per line).

## Output
JSON object `{ "version": 1, "cards": [...] }` where each card matches this schema:

- `id` (number): 1-based position in input list (caller specifies the starting id offset)
- `word` (string): verb as given (kanji/kana mix)
- `kana` (string): hiragana reading, U+3040-309F + 30FC only (no kanji, no katakana)
- `accent` (string|null): Tokyo accent number as string, e.g. "0", "3". Use null if uncertain — don't guess.
- `type` (string|null): "五段" | "一段" | "サ变" | "カ变"
- `meanings` (string[]): 1-4 concise Chinese meanings, 5-15 chars each
- `mnemonic` (string): **kanji decomposition** with ⇒ arrow, e.g. "受け + 玉 + 割る ⇒ 承る". Decompose the kanji characters, not the meaning. For pure-kana verbs use sound/imagery hook.
- `examples`: **exactly 2** objects, each `{ jp, cn }`. Use N1-level real usage, not children's Japanese.

## Quality checklist
- [ ] Accent only when confident — nulls are fine
- [ ] Mnemonics are kanji-decomposition style (⇒ arrow), not vague imagery
- [ ] Examples sound like real N1-level Japanese
- [ ] `kana` field is pure hiragana (run `validate-cards.js` to check)

## Reference
See `data/cards.seed.json` for 承る / 妨げる / 賜る — the tone / structure / mnemonic style to match.
