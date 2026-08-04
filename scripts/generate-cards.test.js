import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildBatchPrompt, parseCardBatchResponse, chunkWords, mergeCardBatches, generateBatch } from './generate-cards.js';

test('buildBatchPrompt includes the template, every word, and its assigned id', () => {
  const prompt = buildBatchPrompt('TEMPLATE_TEXT', ['ある', 'いる'], 5);
  assert.ok(prompt.includes('TEMPLATE_TEXT'));
  assert.ok(prompt.includes('5. ある'));
  assert.ok(prompt.includes('6. いる'));
  assert.ok(prompt.includes('JSON'));
});

test('parseCardBatchResponse extracts a plain JSON object', () => {
  const text = '{"version":1,"cards":[{"id":1,"word":"ある"}]}';
  const result = parseCardBatchResponse(text);
  assert.deepEqual(result, { version: 1, cards: [{ id: 1, word: 'ある' }] });
});

test('parseCardBatchResponse extracts JSON wrapped in a markdown code fence', () => {
  const text = 'Here:\n```json\n{"version":1,"cards":[]}\n```\nDone.';
  const result = parseCardBatchResponse(text);
  assert.deepEqual(result, { version: 1, cards: [] });
});

test('parseCardBatchResponse throws a descriptive error when no JSON object is found', () => {
  assert.throws(() => parseCardBatchResponse('no json here'), /no JSON object found/);
});

test('chunkWords splits into groups of the given size, last group may be smaller', () => {
  const result = chunkWords(['a', 'b', 'c', 'd', 'e'], 2);
  assert.deepEqual(result, [['a', 'b'], ['c', 'd'], ['e']]);
});

test('chunkWords returns empty array for empty input', () => {
  assert.deepEqual(chunkWords([], 5), []);
});

test('mergeCardBatches concatenates cards onto the existing list', () => {
  const existing = { version: 1, cards: [{ id: 1, word: 'ある' }] };
  const newBatch = { version: 1, cards: [{ id: 2, word: 'いる' }] };
  const result = mergeCardBatches(existing, newBatch);
  assert.deepEqual(result, { version: 1, cards: [{ id: 1, word: 'ある' }, { id: 2, word: 'いる' }] });
});

test('mergeCardBatches treats a null existing value as an empty deck', () => {
  const result = mergeCardBatches(null, { version: 1, cards: [{ id: 1, word: 'ある' }] });
  assert.deepEqual(result, { version: 1, cards: [{ id: 1, word: 'ある' }] });
});

test('generateBatch returns an empty deck without calling fetchImpl when words is empty', async () => {
  let called = false;
  const fakeFetch = async () => { called = true; };
  const result = await generateBatch('fake-key', 'TEMPLATE', [], 1, fakeFetch);
  assert.deepEqual(result, { version: 1, cards: [] });
  assert.equal(called, false);
});

test('generateBatch posts to the Anthropic API with the right headers/model and parses the response', async () => {
  let capturedUrl, capturedOptions;
  const fakeFetch = async (url, options) => {
    capturedUrl = url;
    capturedOptions = options;
    return { json: async () => ({ content: [{ text: '{"version":1,"cards":[{"id":5,"word":"ある"}]}' }] }) };
  };
  const result = await generateBatch('fake-key', 'TEMPLATE', ['ある'], 5, fakeFetch);
  assert.equal(capturedUrl, 'https://api.anthropic.com/v1/messages');
  assert.equal(capturedOptions.headers['x-api-key'], 'fake-key');
  assert.equal(capturedOptions.headers['anthropic-version'], '2023-06-01');
  const body = JSON.parse(capturedOptions.body);
  assert.equal(body.model, 'claude-sonnet-4-6');
  assert.deepEqual(result, { version: 1, cards: [{ id: 5, word: 'ある' }] });
});
