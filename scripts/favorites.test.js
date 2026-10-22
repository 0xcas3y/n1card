import { test } from 'node:test';
import assert from 'node:assert';
import { toggleFavorite, isFavorited } from '../favorites.js';

test('toggleFavorite: 第一次收藏 → 加进map，带上addedAt', () => {
  const next = toggleFavorite({}, 'n1:verb:5', 1000);
  assert.deepStrictEqual(next, { 'n1:verb:5': { addedAt: 1000 } });
});

test('toggleFavorite: 已收藏的再收藏一次 → 从map里移除(取消收藏)', () => {
  const start = { 'n1:verb:5': { addedAt: 1000 } };
  const next = toggleFavorite(start, 'n1:verb:5', 2000);
  assert.deepStrictEqual(next, {});
});

test('toggleFavorite: 不影响map里其他key', () => {
  const start = { 'n1:verb:5': { addedAt: 1000 }, 'n2:noun:9': { addedAt: 500 } };
  const next = toggleFavorite(start, 'n1:verb:5', 2000);
  assert.deepStrictEqual(next, { 'n2:noun:9': { addedAt: 500 } });
});

test('toggleFavorite: 不做原地修改，传入的原map保持不变', () => {
  const start = { 'n1:verb:5': { addedAt: 1000 } };
  toggleFavorite(start, 'n1:verb:5', 2000);
  assert.deepStrictEqual(start, { 'n1:verb:5': { addedAt: 1000 } });
});

test('isFavorited: 存在的compositeId → true', () => {
  assert.strictEqual(isFavorited({ 'n1:verb:5': { addedAt: 1000 } }, 'n1:verb:5'), true);
});

test('isFavorited: 不存在的compositeId → false', () => {
  assert.strictEqual(isFavorited({ 'n1:verb:5': { addedAt: 1000 } }, 'n2:noun:9'), false);
});
