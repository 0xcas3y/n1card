import { validate } from './validate-cards.js';

export function buildBatchPrompt(promptTemplate, words, startId) {
  return [
    promptTemplate,
    '',
    `起始 id 偏移量：${startId}（第一个词的 id = ${startId}，之后依次 +1）`,
    '',
    '词表：',
    words.map((w, i) => `${startId + i}. ${w}`).join('\n'),
    '',
    '只返回符合 schema 的 JSON 对象，不要有其他文字说明。',
  ].join('\n');
}

export function parseCardBatchResponse(responseText) {
  const fenced = responseText.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced ? fenced[1] : responseText;
  const objMatch = candidate.match(/\{[\s\S]*\}/);
  if (!objMatch) {
    throw new Error(`parseCardBatchResponse: no JSON object found in response: ${responseText.slice(0, 200)}`);
  }
  return JSON.parse(objMatch[0]);
}

export function chunkWords(words, size) {
  const chunks = [];
  for (let i = 0; i < words.length; i += size) chunks.push(words.slice(i, i + size));
  return chunks;
}

export function mergeCardBatches(existing, newBatch) {
  const existingCards = existing?.cards ?? [];
  return { version: 1, cards: [...existingCards, ...newBatch.cards] };
}

export async function generateBatch(apiKey, promptTemplate, words, startId, fetchImpl = fetch) {
  if (words.length === 0) return { version: 1, cards: [] };
  const prompt = buildBatchPrompt(promptTemplate, words, startId);
  const response = await fetchImpl('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 8192,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  const data = await response.json();
  const text = data.content?.[0]?.text ?? '';
  return parseCardBatchResponse(text);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const fs = await import('node:fs/promises');
  const [, , wordListPath, promptPath, outputPath, batchSizeArg] = process.argv;
  if (!wordListPath || !promptPath || !outputPath) {
    console.error('用法: node scripts/generate-cards.js <word-list.txt> <prompt.md> <output.json> [batchSize=20]');
    process.exit(1);
  }
  const batchSize = parseInt(batchSizeArg, 10) || 20;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error('error: 环境变量 ANTHROPIC_API_KEY 未设置');
    process.exit(1);
  }

  const promptTemplate = await fs.readFile(promptPath, 'utf8');
  const words = (await fs.readFile(wordListPath, 'utf8'))
    .split('\n').map((s) => s.trim()).filter(Boolean);

  let existing = { version: 1, cards: [] };
  try {
    existing = JSON.parse(await fs.readFile(outputPath, 'utf8'));
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }
  let nextId = existing.cards.reduce((max, c) => Math.max(max, c.id), 0) + 1;

  const chunks = chunkWords(words, batchSize);
  console.log(`${words.length} 个词，分 ${chunks.length} 批，每批最多 ${batchSize} 个`);

  let result = existing;
  for (let i = 0; i < chunks.length; i++) {
    console.log(`批次 ${i + 1}/${chunks.length}（${chunks[i].length} 词，起始 id=${nextId}）...`);
    const batch = await generateBatch(apiKey, promptTemplate, chunks[i], nextId);
    const check = validate(batch);
    if (!check.ok) {
      console.error(`批次 ${i + 1} 校验失败，跳过写入：`);
      check.errors.forEach((e) => console.error('  - ' + e));
      continue;
    }
    result = mergeCardBatches(result, batch);
    nextId += chunks[i].length;
    await fs.writeFile(outputPath, JSON.stringify(result, null, 2) + '\n', 'utf8');
    console.log(`已写入 ${outputPath}（累计 ${result.cards.length} 词）`);
  }
}
