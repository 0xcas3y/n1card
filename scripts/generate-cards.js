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
