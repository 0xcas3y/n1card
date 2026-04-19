const HIRAGANA_RE = /^[\u3040-\u309F\u30FC]+$/;

export function validate(data) {
  const errors = [];
  if (data?.version !== 1) errors.push('root.version must be 1');
  if (!Array.isArray(data?.cards)) {
    errors.push('root.cards must be array');
    return { ok: false, errors };
  }

  const seenIds = new Set();
  data.cards.forEach((card, idx) => {
    const prefix = `cards[${idx}]`;
    if (typeof card.id !== 'number') errors.push(`${prefix}.id must be number`);
    else if (seenIds.has(card.id)) errors.push(`${prefix}.id=${card.id} duplicate`);
    else seenIds.add(card.id);

    if (typeof card.word !== 'string' || !card.word) errors.push(`${prefix}.word required`);
    if (typeof card.kana !== 'string' || !HIRAGANA_RE.test(card.kana))
      errors.push(`${prefix}.kana must be hiragana only`);

    if (!Array.isArray(card.meanings) || card.meanings.length === 0)
      errors.push(`${prefix}.meanings must be non-empty array`);
    else card.meanings.forEach((m, j) => {
      if (typeof m !== 'string' || !m.trim()) errors.push(`${prefix}.meanings[${j}] empty`);
    });

    if (typeof card.mnemonic !== 'string' || !card.mnemonic.trim())
      errors.push(`${prefix}.mnemonic required`);

    if (!Array.isArray(card.examples) || card.examples.length !== 2)
      errors.push(`${prefix}.examples must have exactly 2 items`);
    else card.examples.forEach((ex, j) => {
      if (typeof ex?.jp !== 'string' || !ex.jp.trim()) errors.push(`${prefix}.examples[${j}].jp empty`);
      if (typeof ex?.cn !== 'string' || !ex.cn.trim()) errors.push(`${prefix}.examples[${j}].cn empty`);
    });
  });

  return { ok: errors.length === 0, errors };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const fs = await import('node:fs/promises');
  const file = process.argv[2] || 'data/cards.json';
  try {
    const data = JSON.parse(await fs.readFile(file, 'utf8'));
    const r = validate(data);
    if (r.ok) {
      console.log(`ok: ${data.cards.length} cards valid`);
      process.exit(0);
    } else {
      console.error(`FAIL (${r.errors.length} errors):`);
      r.errors.forEach(e => console.error('  - ' + e));
      process.exit(1);
    }
  } catch (err) {
    if (err.code === 'ENOENT') console.error(`error: file not found: ${file}`);
    else if (err instanceof SyntaxError) console.error(`error: invalid JSON in ${file}: ${err.message}`);
    else console.error(`error: ${err.message}`);
    process.exit(1);
  }
}
