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
- `mnemonic` (string): **phrasal narrative** — split the kana reading into 2–4 chunks of known Japanese words whose readings concatenate to the target reading, then arrange those chunks into a meaningful Japanese mini-phrase that hooks back to the verb's meaning. End with a Chinese memory gloss in （）that bridges the phrase to the meaning.

  **Format:**
  ```
  chunk(kana) + chunk(kana) + chunk(kana) ⇒ <Japanese mini-phrase>（<Chinese memory hook>）
  ```

  **The Three Bars every mnemonic must clear:**
  1. **Sound fidelity** — chunks' readings concatenated = target kana. (One minor stretch is OK if flagged with ほぼ.)
  2. **Phrasal coherence** — chunks form a real or near-real Japanese phrase/sentence.
  3. **Meaning hook** — the phrase evokes an image or story that echoes what the verb MEANS. The Chinese gloss must connect phrase to meaning.

  **Gold example:**
  - **幼い (おさない)** → `お + 酒(さ) + ない ⇒ お酒ない（幼年不能喝酒）`
    - お / 酒(さ) / ない → concatenate → おさない ✓
    - お酒ない = "there's no sake" → real Japanese phrase ✓
    - No sake for children → links to "young/immature" ✓

  **More examples:**
  - `受け(うけ) + 玉(たま) + 割る(わる) ⇒ 受けた玉を割る（敬领后连玉都敢砸？要恭听！）`
  - `様(さま) + 酔う(よう) ⇒ 様子が酔う（状态如同醉酒迷失，就是彷徨游荡）`
  - `有り(あり) + 触れる(ふれる) ⇒ 有り触れる（到处都有都能触到，就是司空见惯）`
  - `意地(いじ) + 蹴る(ける) ⇒ 意地を蹴る（把意志踢飞，只剩自卑蜷缩）`
  - `ぐら(グラグラ擬音) + 付く(つく) ⇒ ぐら付く（摇晃声粘上就是晃动不稳）`
  - `暈(ぼ) + 焼く(やく) ⇒ 暈け焼く（朦胧地烧，就是发牢骚抱怨）`

  **BAD mnemonics to avoid:**
  - `然(さ) + 又(また) + げる ⇒ さまたげる` — sound chain only, no phrase, no meaning hook
  - `女 + 方 ⇒ 妨（挡路） + 害ける` — explains kanji structure, not reading
  - `ず + ら + す ⇒ ずらす` — no anchor words, pure syllables

- `examples`: **exactly 2** objects, each `{ jp, cn }`. Use N1-level real usage, not children's Japanese.

## Quality checklist
- [ ] Accent only when confident — nulls are fine
- [ ] Mnemonics clear all three bars: sound fidelity + phrasal coherence + meaning hook
- [ ] Chinese gloss in （） connects the Japanese phrase to the verb's meaning
- [ ] Examples sound like real N1-level Japanese
- [ ] `kana` field is pure hiragana (run `validate-cards.js` to check)

## Reference
See `data/cards.seed.json` for 承る / 妨げる / 賜る — the phrasal-narrative mnemonic style to match.
