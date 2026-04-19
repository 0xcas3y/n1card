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
- `mnemonic` (string): **reading-chain** — break the kana reading into 2–4 familiar Japanese word chunks whose readings concatenate to the target reading. Format: `chunk1(kana1) + chunk2(kana2) ⇒ targetkana（kanji）`. For pure-kana verbs write the chunks directly. No Chinese text anywhere in the mnemonic.
  - Gold standard: `受け(うけ) + 玉(たま) + 割る(わる) ⇒ うけたまわる（承る）`
  - Pure-kana: `在り(あり) + 触れる(ふれる) ⇒ ありふれる`
  - Minor stretch (mark with ほぼ): `然(さ) + 又(また) + げる ⇒ さまたげる（妨げる）`
  - BAD (kanji decomp with Chinese gloss): `女 + 方 ⇒ 妨（挡路） + 害ける`
  - BAD (has Chinese annotations): `受け（うけ，接受）+ 玉（たま，珍贵）⇒ 承る`
- `examples`: **exactly 2** objects, each `{ jp, cn }`. Use N1-level real usage, not children's Japanese.

## Quality checklist
- [ ] Accent only when confident — nulls are fine
- [ ] Mnemonics are reading-chain style: kana chunks + ⇒ arrow, no Chinese text
- [ ] Examples sound like real N1-level Japanese
- [ ] `kana` field is pure hiragana (run `validate-cards.js` to check)

## Reference
See `data/cards.seed.json` for 承る / 妨げる / 賜る — the reading-chain mnemonic style to match.
